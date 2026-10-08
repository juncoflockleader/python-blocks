import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

const fixture = (name: string) => path.resolve('tests/fixtures/modules', name);
async function open(page: Page, name: string) { await page.goto('/'); await page.locator('#project-file').setInputFiles(fixture(name)); }
async function manage(page: Page) { await page.getByRole('button', { name: 'Modules', exact: true }).click(); }
async function close(page: Page) { await page.locator('#modules-close').click(); }
async function run(page: Page) { await page.getByRole('button', { name: 'Run code' }).click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 }); }
async function download(page: Page, button: string) {
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: button, exact: true }).click(); const result = await promise;
  const chunks: Buffer[] = []; for await (const chunk of (await result.createReadStream())!) chunks.push(Buffer.from(chunk));
  return { name: result.suggestedFilename(), data: Buffer.concat(chunks) };
}

test('exports local definitions, imports into a different project, and preserves namespace edits and source files', async ({ page }, testInfo) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/functions.json'));
  await manage(page); await page.locator('#module-name').fill('arithmetic'); await page.locator('#module-export-functions input').check();
  const exported = await download(page, 'Export module'); const bundle = JSON.parse(exported.data.toString());
  await close(page); await page.reload(); await manage(page);
  await expect(page.locator('#module-name')).toHaveValue('arithmetic'); await expect(page.locator('#module-export-functions input')).toBeChecked();
  const revision = JSON.parse((await download(page, 'Export module')).data.toString()); expect(revision.entry.moduleId).toBe(bundle.entry.moduleId); expect(revision.entry.revision).not.toBe(bundle.entry.revision);
  await close(page);
  const consumer = JSON.parse(await readFile(fixture('missing-module.json'), 'utf8'));
  Object.assign(consumer.workspace.blocks.blocks[0].inputs.BODY.block.inputs.TEXT.block.extraState, bundle.entry);
  await page.locator('#project-file').setInputFiles({ name: 'consumer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(consumer)) });
  await expect(page.locator('#diagnostics')).toContainText('Restore this pinned module');
  await page.getByRole('treeitem', { name: 'Modules', exact: true }).click();
  await page.getByRole('option', { name: 'Manage modules, button', exact: true }).click();
  await page.locator('#module-file').setInputFiles({ name: exported.name, mimeType: 'application/json', buffer: exported.data });
  await expect(page.locator('#module-preview')).toContainText('difference(left, right)'); await page.locator('#module-import-alias').fill('tools');
  await page.getByRole('button', { name: 'Import module', exact: true }).click(); await expect(page.locator('#modules-status')).toContainText('Imported tools');
  await page.getByRole('button', { name: 'Inspect module', exact: true }).click();
  await expect(page.locator('#module-inspector-source')).toContainText('def difference(left, right):');
  await expect(page.locator('#module-inspector-blocks')).toContainText('return');
  await page.screenshot({ path: testInfo.outputPath('module-inspector.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await page.locator('#module-alias').fill('helpers'); await page.getByRole('button', { name: 'Rename namespace', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('module-manager.png'), fullPage: true }); await close(page);
  await expect(page.locator('#python')).toContainText('helpers.difference(10, 3)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).toContainText('tools.difference(10, 3)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
  const source = await download(page, 'Export Python'); expect(source.name).toBe('python-sources.zip');
  const files = unzipSync(source.data); expect(strFromU8(files['program.py'])).toContain('helpers.difference(10, 3)');
  const moduleFile = Object.keys(files).find(name => name.startsWith('_pb_module_'))!;
  expect(strFromU8(files[moduleFile])).toContain('return (left) - (right)'); expect(strFromU8(files['README.txt'])).toContain('does not include the playground runtime');
  await manage(page); const reexported = JSON.parse((await download(page, 'Export saved copy')).data.toString()); expect(reexported).toEqual(bundle);
});

test('removing a module retains calls and Undo restores the pinned copy across reload', async ({ page }) => {
  await open(page, 'consumer.json'); await manage(page); await page.getByRole('button', { name: 'Remove import', exact: true }).click(); await close(page);
  await expect(page.locator('#diagnostics')).toContainText('Restore this pinned module'); await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('g[data-id="difference-call"]')).toContainText('tools.difference');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
  const project = JSON.parse((await download(page, 'Save project')).data.toString()); expect(project.languageVersion).toBe(19); expect(project.workspace.pythonModules.imports[0].id).toBe('arithmetic-import');
});

test('rejects incompatible pins and missing dependencies without changing the project', async ({ page }) => {
  await open(page, 'consumer.json'); const before = await page.locator('#python').textContent(); await manage(page);
  const bundle = JSON.parse(await readFile(fixture('arithmetic.module.json'), 'utf8')); bundle.definitions[0].name = 'changed_contents';
  await page.locator('#module-file').setInputFiles({ name: 'conflict.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.locator('#module-import')).toBeEnabled(); await page.locator('#module-import-alias').fill('new_name'); await page.getByRole('button', { name: 'Import module', exact: true }).click();
  await expect(page.locator('#modules-error')).toContainText('Conflicting contents'); expect(await page.locator('#python').textContent()).toBe(before);
  bundle.definitions[0].dependencies.push({ moduleId: 'absent', revision: 'absent', id: 'absent', alias: 'absent' });
  await page.locator('#module-file').setInputFiles({ name: 'missing.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) });
  await expect(page.locator('#modules-error')).toContainText('Missing pinned module'); await expect(page.locator('#module-import')).toBeDisabled(); await close(page);
  await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('module failures identify the saved module and the local call statement', async ({ page }) => {
  await open(page, 'module-error.json'); await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('ZeroDivisionError', { timeout: 60_000 });
  await expect(page.locator('#output')).toContainText('In module “arithmetic”');
  await expect(page.locator('g[data-id="difference-output"] .blocklyWarningIcon')).toBeVisible();
  await expect(page.locator('#traceback')).toContainText('_pb_module_0.py');
});

test('awaits imported helpers in real event sessions and restarts with fresh module state', async ({ page }) => {
  await open(page, 'async-consumer.json'); await expect(page.locator('#python')).toContainText('await timing.double_value(21)');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Run code' }).click(); await expect(page.locator('#output')).toHaveText('first\n42\n', { timeout: 60_000 });
    await expect(page.locator('#status')).toHaveText('Event session running'); await page.getByRole('button', { name: 'Stop', exact: false }).click();
  }
});

test('loads transitive modules with colliding function identities and retains every Python file', async ({ page }) => {
  await open(page, 'transitive-consumer.json'); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
  const files = unzipSync((await download(page, 'Export Python')).data);
  expect(Object.keys(files).filter(name => name.startsWith('_pb_module_'))).toHaveLength(2);
  expect(strFromU8(files['_pb_module_0.py'])).toContain('support.difference(left, right)');
  await manage(page); await page.getByRole('button', { name: 'Inspect module', exact: true }).click();
  await expect(page.locator('#module-inspector-select option')).toHaveCount(2);
  await page.locator('#module-inspector-select').selectOption({ label: 'arithmetic · revision' });
  await expect(page.locator('#module-inspector-source')).toContainText('return (left) - (right)');
});

test('rendered module call duplication keeps pinned targets and arguments through Undo and reload', async ({ page }) => {
  await open(page, 'consumer.json');
  await page.locator('g[data-id="difference-call"] > g.blocklyLabelField').filter({ hasText: 'tools.difference' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Duplicate/ }).click();
  let project = JSON.parse((await download(page, 'Save project')).data.toString());
  let copied = project.workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_module_call_value');
  expect(copied.extraState).toMatchObject({ importId: 'arithmetic-import', moduleId: 'arithmetic-module', revision: 'revision-1' });
  expect(copied.inputs['ARG_left-param'].block.fields.VALUE).toBe('10');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#diagnostics')).not.toContainText('draft');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload();
  project = JSON.parse((await download(page, 'Save project')).data.toString());
  copied = project.workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_module_call_value');
  expect(copied.extraState.importId).toBe('arithmetic-import');
  await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});
