import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const messages: string[] = []; errors.set(page, messages); page.on('pageerror', error => messages.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
async function open(page: Page, project?: unknown) {
  await page.goto('/');
  if (project) await page.locator('#project-file').setInputFiles({ name: 'draft-project.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  else await page.locator('#project-file').setInputFiles('tests/fixtures/language/large-integer.json');
  await expect(page.locator('#run')).toBeEnabled();
}
async function edit(page: Page, source?: string) {
  await page.locator('#python-edit').click(); await expect(page.locator('#python-editor')).toBeVisible();
  if (source !== undefined) await page.locator('#python-editor').fill(source);
}
async function apply(page: Page) {
  await page.locator('#python-apply').click(); await expect(page.locator('#python-state')).toContainText('Python applied', { timeout: 60_000 });
}
async function download(page: Page, button: string) {
  const pending = page.waitForEvent('download'); await page.locator(button).click();
  return readFileSync((await (await pending).path())!, 'utf8');
}

test('edits Python, applies one undoable change, runs, and saves/reopens an unfinished draft', async ({ page }) => {
  await open(page); const original = (await page.locator('#python').textContent())!;
  const source = '# my program\ncount = 2\nprint(count)\n'; await edit(page, source); await apply(page);
  await expect(page.locator('#python')).toHaveText('count = 2\nprint(count)\n');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 }); await expect(page.locator('#output')).toHaveText('2\n');
  await page.locator('#language-undo').click(); await expect(page.locator('#python')).toHaveText(original); await expect(page.locator('#python-editor')).toHaveValue(source);
  await page.locator('#language-redo').click(); await expect(page.locator('#python')).toHaveText('count = 2\nprint(count)\n');
  const unfinished = '# unfinished 雪🙂\nif count:\n    print('; await page.locator('#python-editor').fill(unfinished); await page.reload();
  await expect(page.locator('#python-editor')).toHaveValue(unfinished); await expect(page.locator('#run')).toContainText('Run Python');
  const file = await download(page, '#save'), project = JSON.parse(file); expect(project.formatVersion).toBe(2); expect(project.workspace.pythonBridge.draft.source).toBe(unfinished);
  await page.locator('#example').click(); await page.locator('#project-file').setInputFiles({ name: 'saved.json', mimeType: 'application/json', buffer: Buffer.from(file) });
  await expect(page.locator('#python-editor')).toHaveValue(unfinished); await expect(page.locator('#python')).toHaveText('count = 2\nprint(count)\n');
  const downloads: string[] = []; page.on('download', file => downloads.push(file.suggestedFilename()));
  for (const action of ['#run', '#export', '#export-playable']) {
    await page.locator(action).click(); await expect(page.locator('#python-diagnostics')).toContainText('Line', { timeout: 60_000 });
    await expect(page.locator('#python-cancel')).toBeHidden();
  }
  expect(downloads).toEqual([]); await expect(page.locator('#output')).toBeEmpty(); await expect(page.locator('#stop')).toBeDisabled();
});

test('keeps exact CRLF source and selects Unicode-aware diagnostics in the native textarea', async ({ page }) => {
  await open(page); await edit(page); const project = await saved(page);
  const source = '# 雪🙂\r\nitems += [1]\r\n'; project.workspace.pythonBridge.draft.source = source;
  await page.locator('#project-file').setInputFiles({ name: 'crlf.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await expect(page.locator('#python-editor')).toHaveValue(source.replaceAll('\r\n', '\n'));
  expect(await download(page, '#python-download')).toBe(source);
  await page.locator('#python-apply').click(); await expect(page.locator('#python-diagnostics')).toContainText('Line 2, column 1', { timeout: 60_000 });
  await page.locator('#python-diagnostics button').first().click(); await expect(page.locator('#python-editor')).toBeFocused();
  expect(await page.locator('#python-editor').evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toBe('items += [1]');
  expect((await saved(page)).workspace.pythonBridge.draft.source).toBe(source);
  await page.locator('#python-discard').click(); await expect(page.locator('#python-draft-view')).toBeHidden();
  await page.locator('#python-recovery summary').click(); expect(await download(page, '#python-recovery-download')).toBe(source);
  await page.locator('#python-recover').click(); await expect(page.locator('#python-editor')).toHaveValue(source.replaceAll('\r\n', '\n'));
});

test('preserves newer typing when Undo changes the blocks and offers explicit recovery from the conflict', async ({ page }) => {
  await open(page); await edit(page, 'print(2)\n'); await apply(page);
  await page.locator('#python-editor').fill('# later text\nprint(3)\n'); await page.locator('#language-undo').click();
  await expect(page.locator('#python-editor')).toHaveValue('# later text\nprint(3)\n'); await expect(page.locator('#python-state')).toContainText('Blocks or assets changed');
  await page.locator('#python-apply').click(); await expect(page.locator('#python-diagnostics')).toContainText('changed since');
  await page.locator('#python-use-blocks').click();
  await expect(page.locator('#python-editor')).toHaveValue(/9007199254740993/);
  expect((await saved(page)).workspace.pythonBridge.recovery.some((entry: any) => entry.source === '# later text\nprint(3)\n')).toBe(true);
});

test('a scene edit during parser startup rejects the candidate and preserves both authored changes', async ({ page }) => {
  await open(page, JSON.parse(readFileSync('src/scene/example.json', 'utf8'))); await edit(page);
  const source = (await page.locator('#python-editor').inputValue()).replace('Hello from Player!', 'Edited from Python!'); await page.locator('#python-editor').fill(source);
  let entered!: () => void, release!: () => void; const loading = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/pyodide/pyodide.asm.wasm', async route => { entered(); await held; await route.continue().catch(() => {}); });
  try {
    await page.locator('#python-apply').click(); await loading;
    await page.locator('#scene-x').fill('35'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
    release(); await page.unroute('**/pyodide/pyodide.asm.wasm');
    await expect(page.locator('#python-diagnostics')).toContainText('changed since', { timeout: 60_000 });
    await expect(page.locator('#python-editor')).toHaveValue(source); await expect(page.locator('#scene-x')).toHaveValue('35');
    await expect(page.locator('#python')).toContainText('Hello from Player!');
    const state = await saved(page); expect(state.workspace.pythonScene.sprites[0].x).toBe(35); expect(state.workspace.pythonBridge.draft.source).toBe(source);
  } finally { release(); await page.unroute('**/pyodide/pyodide.asm.wasm'); }
});

test('cancels parser startup, preserves the draft and applies a later edit with a fresh worker', async ({ page }) => {
  await open(page); await edit(page, 'print(2)\n');
  let entered!: () => void, release!: () => void; const loading = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/pyodide/pyodide.asm.wasm', async route => { entered(); await held; await route.continue().catch(() => {}); });
  try {
    await page.locator('#python-apply').click(); await loading; await page.locator('#python-cancel').click();
    await expect(page.locator('#python-apply')).toBeEnabled(); await expect(page.locator('#python-editor')).toHaveValue('print(2)\n');
    await expect(page.locator('#python')).toContainText('9007199254740993'); await page.locator('#python-editor').fill('print(3)\n');
  } finally { release(); await page.unroute('**/pyodide/pyodide.asm.wasm'); }
  await apply(page); await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('3\n', { timeout: 60_000 });
});

test('edits only program.py while inspecting pinned generated modules separately', async ({ page }) => {
  const project = JSON.parse(readFileSync('tests/fixtures/modules/consumer.json', 'utf8')); await open(page, project); await edit(page);
  const original = await page.locator('#python-editor').inputValue(); expect(original).toContain('tools.difference(10, 3)'); expect(original).not.toContain('def difference(');
  await page.locator('#python-editor').fill(original.replace('difference(10, 3)', 'difference(12, 3)'));
  await page.locator('#python-inspect').click(); await page.locator('#python-file').selectOption('_pb_module_0.py');
  await expect(page.locator('#python')).toContainText('def difference(left, right):'); await expect(page.locator('#python-editor')).toBeHidden();
  const moduleSource = await page.locator('#python').textContent(); await page.locator('#python-edit').click(); await apply(page);
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('9\n', { timeout: 60_000 });
  await page.locator('#python-inspect').click(); await expect(page.locator('#python')).toHaveText(moduleSource!);
  expect((await saved(page)).workspace.pythonModules).toEqual(project.workspace.pythonModules);
});

test('keeps keyboard focus usable and the editor within a narrow viewport', async ({ page }, info) => {
  await open(page); await edit(page, '# keyboard edit\nprint("Hello from Python")\n');
  await page.locator('#python-editor').press('Tab'); await expect(page.locator('#python-apply')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#python-editor')).toBeFocused();
  await page.keyboard.press('Control+Enter'); await expect(page.locator('#python-state')).toContainText('Python applied', { timeout: 60_000 });
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('.python-panel').scrollIntoViewIfNeeded();
  expect(await page.locator('.python-panel').evaluate(panel => panel.scrollWidth <= panel.clientWidth + 1)).toBe(true);
  await page.locator('.python-panel').screenshot({ path: info.outputPath('python-editor-mobile.png') });
  await page.locator('#python-blocks').click(); await expect(page.locator('#blockly')).toBeFocused();
  await expect(page.locator('#python-editor')).toHaveValue('# keyboard edit\nprint("Hello from Python")\n');
});

test('attributes a running program error to its accepted source while preserving a newer draft', async ({ page }) => {
  await open(page);
  const source = 'from playground import events\nasync def delayed(payload):\n    await events.wait(2)\n    print(1 / 0)\nevents.on("start", delayed)\n';
  await edit(page, source); await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  const acceptedSource = await page.locator('#python').textContent();
  await page.locator('#python-editor').fill('print(42)\n');
  await expect(page.locator('#output')).toContainText('ZeroDivisionError', { timeout: 5000 });
  await expect(page.locator('#output')).toContainText('Your current Python draft has unapplied changes.');
  await expect(page.locator('#python-editor')).toHaveValue('print(42)\n'); await expect(page.locator('#python')).toHaveText(acceptedSource!);
  await expect(page.locator('.blocklyHighlighted')).toHaveCount(1);
});
