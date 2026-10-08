import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

async function open(page: Page, file: string) { await page.goto('/'); await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/events', file)); }
async function run(page: Page) { await page.getByRole('button', { name: 'Run code' }).click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function send(page: Page, event: string, payload = 'null') { await page.locator('#event-name').fill(event); await page.locator('#event-payload').fill(payload); await page.getByRole('button', { name: 'Send event', exact: true }).click(); }
async function manage(page: Page) { await page.getByRole('button', { name: 'Events', exact: true }).click(); }
async function saved(page: Page) {
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const download = await downloading; let content = ''; for await (const chunk of (await download.createReadStream())!) content += chunk; return JSON.parse(content);
}

test('saved event projects run async helpers, receive test input, and export their execution requirement', async ({ page }, testInfo) => {
  await open(page, 'handlers.json');
  await expect(page.locator('#python')).toContainText('async def double_value(value):');
  await expect(page.locator('#python')).toContainText('await double_value(21)');
  await page.reload(); await run(page);
  await expect(page.locator('#output')).toHaveText('first\nsecond\n42\n');
  await send(page, 'message', '{"value":7}');
  await expect(page.locator('#output')).toHaveText("first\nsecond\n42\n{'value': 7}\n1\n");
  await send(page, 'message', '{invalid'); await expect(page.locator('#event-input-status')).not.toHaveText('');
  await expect(page.locator('#status')).toHaveText('Event session running');
  const project = await saved(page); expect(project.languageVersion).toBe(19);
  expect(project.workspace.procedures.find((f: { id: string }) => f.id === 'helper').async).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('event-project.png'), fullPage: true });
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export Python' }).click();
  let source = ''; for await (const chunk of (await (await downloading).createReadStream())!) source += chunk;
  expect(source).toContain('then awaits the event session');
  await page.getByRole('button', { name: 'Stop', exact: false }).click();
  await expect(page.locator('#event-send')).toBeDisabled();
});

test('handler forms rename payloads, preserve copied scope, and undo deletion', async ({ page }, testInfo) => {
  await open(page, 'idle-handler.json');
  await page.getByRole('treeitem', { name: 'Events', exact: true }).click();
  await page.getByRole('option', { name: 'Manage handlers, button', exact: true }).click();
  await page.locator('#handler-select').selectOption('idle');
  await page.locator('#handler-name').fill('receive_input'); await page.locator('#handler-payload').fill('data');
  await page.getByRole('button', { name: 'Apply handler' }).click();
  await expect(page.locator('#python')).toContainText('async def receive_input(data):');
  await expect(page.locator('#python')).toContainText('print(data)');
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.locator('#variable-name').fill('count'); await page.locator('#variable-scope').selectOption('idle');
  await page.getByRole('button', { name: 'Apply variable' }).click();
  await manage(page); await page.locator('#handler-select').selectOption('idle');
  await page.screenshot({ path: testInfo.outputPath('handler-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Duplicate handler' }).click();
  await expect(page.locator('#python')).toContainText('async def receive_input_copy(data):');
  const project = await saved(page); const handlers = project.workspace.procedures;
  const original = handlers.find((h: { id: string }) => h.id === 'idle');
  const copy = handlers.find((h: { name: string }) => h.name === 'receive_input_copy');
  expect(copy.parameters[0].id).not.toBe(original.parameters[0].id); expect(copy.handler.order).toBe(1);
  expect(project.workspace.variables.some((v: { name: string; type: string }) => v.name === 'count' && v.type === `py:local:${copy.id}`)).toBe(true);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).not.toContainText('receive_input_copy');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.locator('#python')).toContainText('receive_input_copy');
  await manage(page); await page.locator('#handler-select').selectOption(copy.id); await page.getByRole('button', { name: 'Delete handler' }).click();
  await expect(page.locator('#python')).not.toContainText('receive_input_copy');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).toContainText('receive_input_copy');
  await page.reload(); await run(page); await send(page, 'message', '"hello"');
  await expect(page.locator('#output')).toHaveText('hello\nhello\n');
});

test('creating a handler validates input and is one persistent undo action', async ({ page }) => {
  await open(page, 'idle-handler.json'); await manage(page);
  await page.locator('#handler-select').selectOption('');
  await page.locator('#handler-name').fill('on_launch'); await page.locator('#handler-event').fill('');
  await page.getByRole('button', { name: 'Apply handler' }).click();
  await expect(page.locator('#events-error')).not.toHaveText('');
  await expect(page.locator('#python')).not.toContainText('on_launch');
  await page.locator('#handler-event').fill('start'); await page.locator('#handler-payload').fill('not a name');
  await page.getByRole('button', { name: 'Apply handler' }).click();
  await expect(page.locator('#events-error')).not.toHaveText('');
  await page.locator('#handler-payload').fill('data'); await page.getByRole('button', { name: 'Apply handler' }).click();
  await expect(page.locator('#python')).toContainText('async def on_launch(data):');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).not.toContainText('on_launch');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload();
  await expect(page.locator('#python')).toContainText('async def on_launch(data):');
  const project = await saved(page);
  expect(project.workspace.procedures).toHaveLength(2);
  expect(project.workspace.procedures.find((h: { name: string }) => h.name === 'on_launch')).toMatchObject({ async: true, handler: { event: 'start', order: 1 }, parameters: [{ name: 'data' }] });
  await run(page); await send(page, 'message', '7'); await expect(page.locator('#output')).toHaveText('7\n');
});

test('handler delivery order is editable, undoable, and persistent', async ({ page }) => {
  await open(page, 'handlers.json'); await manage(page);
  await page.getByRole('button', { name: 'Move handler down', exact: true }).first().click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  let source = (await page.locator('#python').textContent())!;
  expect(source.indexOf('events.on("start", second_start)')).toBeLessThan(source.indexOf('events.on("start", first_start)'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => { const s = (await page.locator('#python').textContent())!; return s.indexOf('events.on("start", first_start)') < s.indexOf('events.on("start", second_start)'); }).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload(); await run(page);
  await expect(page.locator('#output')).toHaveText('second\nfirst\n42\n');
});

test('async function edits show context errors and undo restores awaited calls', async ({ page }) => {
  await open(page, 'handlers.json');
  await page.getByRole('button', { name: 'Functions & variables' }).click(); await page.locator('#function-select').selectOption('helper');
  await expect(page.locator('#function-async')).toBeChecked(); await page.locator('#function-async').uncheck();
  await page.getByRole('button', { name: 'Apply function' }).click();
  await expect(page.locator('#diagnostics')).toContainText('explicitly marked async'); await expect(page.locator('#run')).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('await double_value(21)'); await expect(page.locator('#run')).toBeEnabled();
  await page.getByRole('button', { name: 'Functions & variables' }).click(); await page.locator('#function-select').selectOption('helper');
  await page.locator('#function-name').fill('twice'); await page.getByRole('button', { name: 'Apply function' }).click();
  await expect(page.locator('#python')).toContainText('await twice(21)'); await page.reload(); await run(page);
  await expect(page.locator('#output')).toHaveText('first\nsecond\n42\n');
});

for (const edited of [false, true]) test(`handler errors ${edited ? 'retain their earlier revision after editing' : 'identify the failing statement'}`, async ({ page }) => {
  await open(page, 'handler-error.json'); await run(page);
  if (edited) {
    await manage(page); await page.locator('#handler-select').selectOption('broken'); await page.locator('#handler-name').fill('renamed_handler');
    await page.getByRole('button', { name: 'Apply handler' }).click(); await expect(page.locator('#python')).toContainText('renamed_handler');
  }
  await send(page, 'fail'); await expect(page.locator('#output')).toContainText('ZeroDivisionError');
  if (edited) { await expect(page.locator('#output')).toContainText('earlier version'); await expect(page.locator('g[data-id="event-failure"] .blocklyWarningIcon')).not.toBeVisible(); }
  else await expect(page.locator('g[data-id="event-failure"] .blocklyWarningIcon')).toBeVisible();
  await expect(page.locator('#event-send')).toBeDisabled(); await expect(page.locator('#run')).toBeEnabled();
});

test('queue overload reports its send block and ends the event session', async ({ page }) => {
  await open(page, 'queue-overload.json'); await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('EventOverloadError', { timeout: 60_000 });
  await expect(page.locator('g[data-id="event-queue-failure"] .blocklyWarningIcon')).toBeVisible();
  await expect(page.locator('#event-send')).toBeDisabled();
});

test('delayed task overload identifies the originating send block', async ({ page }) => {
  await open(page, 'task-overload.json'); await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('EventOverloadError', { timeout: 60_000 });
  await expect(page.locator('#traceback')).toContainText('Event queued at');
  await expect(page.locator('g[data-id="event-task-origin"] .blocklyWarningIcon')).toBeVisible();
  await expect(page.locator('#event-send')).toBeDisabled();
});

test('event Stop and watchdog both end blocked handlers and allow fresh runs', async ({ page }) => {
  await open(page, 'infinite-handler.json'); await run(page);
  await page.getByRole('button', { name: 'Stop', exact: false }).click(); await expect(page.locator('#status')).toHaveText('Stopped');
  await run(page); await expect(page.locator('#output')).toContainText('stopped responding', { timeout: 10_000 });
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/events/idle-handler.json')); await run(page);
  await send(page, 'message', '"fresh"'); await expect(page.locator('#output')).toHaveText('fresh\n');
});

test('an idle editor event project stays live beyond the sequential deadline', async ({ page }) => {
  await open(page, 'idle-handler.json'); await run(page); await page.waitForTimeout(11_000);
  await expect(page.locator('#status')).toHaveText('Event session running'); await send(page, 'message', '7');
  await expect(page.locator('#output')).toHaveText('7\n');
  await page.getByRole('button', { name: 'Stop', exact: false }).click(); await expect(page.locator('#event-send')).toBeDisabled();
});
