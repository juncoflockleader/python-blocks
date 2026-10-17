import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildConverterHarness, prepare, convert, install } from './bridge-support';
import { reveal } from './shell';
test.beforeAll(buildConverterHarness);
async function code(page: Page, source: string) { await prepare(page); await install(page, await convert(page, source)); }
async function debug(page: Page) { await (await reveal(page, '#debug-start')).click(); await expect(page.locator('#status')).toHaveText('Paused', {timeout:60000}); }
async function step(page: Page, expected: string, action = 'into') {
  await page.locator('#debug-' + action).click();
  await expect(page.locator('#debug-location')).toContainText(expected);
  await expect(page.locator('#status')).toHaveText('Paused');
}

test('real Python stops before assignments and repeats loop lines, then resumes and completes', async ({page}) => {
  await code(page, 'total = 0\nfor i in range(2):\n    total = total + i\nprint(total)\n');
  await debug(page); await expect(page.locator('#debug-source .debug-current-line')).toContainText('total = 0');
  await expect(page.locator('#output')).toBeEmpty();
  await expect(page.locator('.blocklyHighlighted')).toHaveCount(1);
  await step(page, 'program.py:2'); await expect(page.locator('#debug-locals')).toContainText('total0');
  await step(page, 'program.py:3'); await step(page, 'program.py:2'); await step(page, 'program.py:3');
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#status')).toHaveText('Finished');
  await expect(page.locator('#output')).toHaveText('1\n'); await expect(page.locator('#debug-start')).toBeEnabled();
});
test('step into and out inspect function parameters and caller values; step over skips the call', async ({page}, info) => {
  await code(page, 'def double(value):\n    answer = value * 2\n    return answer\n\nresult = double(4)\nprint(result)\n');
  await debug(page); await step(page, 'program.py:6');
  await step(page, '· double'); await expect(page.locator('#debug-locals')).toContainText('value4');
  await expect(page.locator('#debug-frame option')).toHaveCount(2);
  await page.locator('.debug-panel').screenshot({path:info.outputPath('debugger-desktop.png')});
  await (await reveal(page, '#debug-frame')).selectOption('1'); await expect(page.locator('#debug-location')).toContainText('program.py:6');
  await (await reveal(page, '#debug-frame')).selectOption('0');
  await step(page, 'program.py:7', 'out'); await expect(page.locator('#debug-locals')).toContainText('result8');
  await page.locator('#stop').click(); await expect(page.locator('#debug-into')).toBeDisabled();
  await debug(page); await step(page, 'program.py:6'); await step(page, 'program.py:7', 'over');
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#output')).toHaveText('8\n');
});
test('pause interrupts a synchronous infinite loop and Stop releases it for a normal fresh run', async ({page}) => {
  await code(page, 'count = 0\nwhile True:\n    count = count + 1\n');
  await debug(page); await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#debug-pause')).toBeEnabled();
  await (await reveal(page, '#debug-pause')).click(); await expect(page.locator('#status')).toHaveText('Paused');
  await expect(page.locator('#debug-locals')).toContainText('count');
  await page.locator('#stop').click(); await expect(page.locator('#status')).toHaveText('Stopped');
  await (await reveal(page, '#example')).click(); await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', {timeout:60000});
});
test('idle event sessions can pause and resume input; edits retain the captured source', async ({page}) => {
  await code(page, 'from playground import events\n\nasync def receive(payload):\n    print(payload)\n\nevents.on("message", receive)\n');
  await debug(page); await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#status')).toHaveText('Event session running');
  await (await reveal(page, '#debug-pause')).click(); await expect(page.locator('#status')).toHaveText('Paused');
  await expect(page.locator('#debug-location')).toContainText('between event handlers'); await expect(page.locator('#event-send')).toBeDisabled();
  await (await reveal(page, '#debug-into')).click(); await expect(page.locator('#event-send')).toBeEnabled();
  await (await reveal(page, '#event-payload')).fill('"hello"'); await (await reveal(page, '#event-send')).click();
  await expect(page.locator('#status')).toHaveText('Paused'); await expect(page.locator('#debug-locals')).toContainText("payload'hello'");
  await expect(page.locator('#output')).toBeEmpty();
  await (await reveal(page, '#block-search-input')).fill('turn right'); await page.getByRole('button', {name: /Add turn right.*\(Draw\)/}).click();
  await expect(page.locator('#debug-stale')).toBeVisible(); await expect(page.locator('.blocklyHighlighted')).toHaveCount(0);
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#output')).toHaveText('hello\n'); await page.locator('#stop').click();
});

test('paused time does not consume event waits or sprite timer time', async ({page}) => {
  const project = JSON.parse(readFileSync('src/scene/input-example.json','utf8'));
  project.workspace.procedures = [{id:'timer-handler',name:'report',async:true,parameters:[{id:'payload',name:'payload'}],handler:{event:'start',order:0}}];
  const body = {type:'py_wait',inputs:{SECONDS:{block:{type:'py_number',fields:{VALUE:'1'}}}},next:{block:{type:'text_print',inputs:{TEXT:{block:{type:'input_timer'}}}}}};
  project.workspace.blocks.blocks = [{type:'py_handler',extraState:{functionId:'timer-handler'},inputs:{BODY:{block:body}}}];
  await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'timer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.locator('#python')).toContainText('print(_pb_inputs.timer)');
  await debug(page); await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#status')).toHaveText('Event session running');
  await (await reveal(page, '#debug-pause')).click(); await expect(page.locator('#status')).toHaveText('Paused');
  await page.waitForTimeout(1500); await expect(page.locator('#output')).toBeEmpty();
  await (await reveal(page, '#debug-resume')).click(); await page.waitForTimeout(150); await expect(page.locator('#output')).toBeEmpty();
  await expect(page.locator('#output')).not.toBeEmpty();
  expect(Number((await page.locator('#output').textContent())!.trim())).toBeLessThan(1.5);
  await page.locator('#stop').click();
});

test('imported module steps expose its source and parameters and errors keep source-linked diagnostics', async ({page}) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/modules/module-error.json');
  await debug(page);
  for (let i=0; i<12; i++) {
    if ((await page.locator('#debug-location').textContent())!.includes('· difference')) break;
    const old = await page.locator('#debug-location').textContent();
    await (await reveal(page, '#debug-into')).click();
    await expect(page.locator('#debug-location')).not.toHaveText(old!);
  }
  await expect(page.locator('#debug-location')).toContainText('_pb_module_0.py');
  await expect(page.locator('#debug-locals')).toContainText('left10');
  await expect(page.locator('#debug-frame option')).toHaveCount(2);
  await (await reveal(page, '#debug-resume')).click();
  await expect(page.locator('#output')).toContainText('ZeroDivisionError');
  await expect(page.locator('#output')).toContainText('In module');
  await expect(page.locator('.blocklyHighlighted')).toHaveCount(1);
  await expect(page.locator('#debug-start')).toBeEnabled();
});

test('keyboard controls and source/value views fit narrow screens', async ({page}, info) => {
  await page.setViewportSize({ width: 744, height: 1000 });
  await code(page, 'label = "a long string that should remain readable"\nprint(label)\n');
  await debug(page); await (await reveal(page, '#debug-into')).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#debug-locals')).toContainText('a long string');
  await page.locator('#debug-resume').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.debug-panel').screenshot({path:info.outputPath('debugger-narrow.png')});
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#status')).toHaveText('Finished');
});

test('pausing music suspends actual playback and resuming or stopping releases it', async ({page}) => {
  await page.goto('/'); await (await reveal(page, '#sound-example')).click(); await debug(page);
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#status')).toHaveText('Event session running');
  await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1');
  await (await reveal(page, '#debug-pause')).click(); await expect(page.locator('#audio-status')).toContainText('suspended');
  await page.waitForTimeout(1200); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1');
  await (await reveal(page, '#debug-resume')).click(); await expect(page.locator('#audio-status')).toContainText('running');
  await (await reveal(page, '#debug-stop')).click(); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0');
  await expect(page.locator('#status')).toHaveText('Stopped');
});

test('an editor without isolation explains unavailable debugging and still runs normally', async ({page}) => {
  await page.route('**/', async route => {
    const response = await route.fetch(), headers = {...response.headers()};
    delete headers['cross-origin-embedder-policy']; delete headers['cross-origin-opener-policy'];
    await route.fulfill({response,headers});
  });
  await page.goto('/'); await expect(page.locator('#debug-start')).toBeDisabled();
  await expect(page.locator('#debug-start')).toHaveAttribute('title', /hosting setup/);
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', {timeout:60000});
});
