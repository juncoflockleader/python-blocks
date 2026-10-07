import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const fixture = (name: string) => path.resolve('tests/fixtures/lambdas', name);
async function open(page: Page, name = 'parameters.json') { await page.goto('/'); await page.locator('#project-file').setInputFiles(fixture(name)); }
async function run(page: Page) { await page.getByRole('button', { name: 'Run code' }).click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 }); }
async function edit(page: Page) {
  await page.locator('g[data-id="lambda-expression"] > g.blocklyLabelField').filter({ hasText: /^lambda$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Edit lambda parameters', exact: true }).click();
}
async function manage(page: Page) { await page.getByRole('treeitem', { name: 'Function values', exact: true }).click(); await page.getByRole('option', { name: 'Manage lambdas, button', exact: true }).click(); }
async function saved(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!)); }

test('lambda parameter forms preserve body bindings across rename, reorder, undo, and reload', async ({ page }, testInfo) => {
  await open(page); await edit(page);
  await page.getByLabel('Lambda parameter 2 name').fill('amount'); await page.getByRole('button', { name: 'Move lambda parameter up', exact: true }).nth(1).click();
  await page.screenshot({ path: testInfo.outputPath('lambda-parameters.png'), fullPage: true });
  await page.getByRole('button', { name: 'Apply lambda', exact: true }).click();
  await expect(page.locator('#python')).toContainText('lambda amount, left: (left) - (amount)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).toContainText('lambda left, right:');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('-7\n');
  await page.screenshot({ path: testInfo.outputPath('lambda-program.png'), fullPage: true });
});

test('removing a used parameter preserves the read and Undo restores its exact identity', async ({ page }) => {
  await open(page); await edit(page); await page.getByRole('button', { name: 'Remove lambda parameter', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Apply lambda', exact: true }).click(); await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('g[data-id="read-lambda-right"]')).toContainText('right (unavailable here)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('lambda duplication creates independent parameters and survives Undo and reload', async ({ page }) => {
  await open(page);
  await page.locator('g[data-id="lambda-expression"] > g.blocklyLabelField').filter({ hasText: /^lambda$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Duplicate/ }).click(); await expect(page.locator('#diagnostics')).toContainText('draft');
  const duplicate = (await saved(page)).workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_lambda');
  expect(duplicate.extraState.id).not.toBe('lambda-scope'); expect(duplicate.extraState.parameters[0].id).not.toBe('lambda-left');
  const read = duplicate.inputs.BODY.block.inputs.A.block.fields.SYMBOL;
  expect(typeof read === 'string' ? read : read.id).toBe(`lambda:${JSON.stringify([duplicate.extraState.id, duplicate.extraState.parameters[0].id])}`);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#diagnostics')).not.toContainText('draft');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload();
  const restored = (await saved(page)).workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_lambda'); expect(restored.extraState).toEqual(duplicate.extraState);
  await manage(page); await page.getByRole('combobox', { name: 'Choose lambda', exact: true }).selectOption(restored.id);
  await page.getByLabel('Lambda parameter 1 name').fill('copied_left'); await page.getByRole('button', { name: 'Apply lambda', exact: true }).click();
  await expect(page.locator('g[data-id="lambda-expression"]')).not.toContainText('copied_left'); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('the manager creates a lambda as one Undo action and validates parameter names', async ({ page }) => {
  await open(page); await manage(page); await page.getByRole('combobox', { name: 'Choose lambda', exact: true }).selectOption('');
  await page.getByLabel('Lambda parameter 1 name').fill('for'); await page.getByRole('button', { name: 'Apply lambda', exact: true }).click();
  await expect(page.locator('#lambda-error')).toContainText('reserved'); await page.getByLabel('Lambda parameter 1 name').fill('number');
  await page.getByRole('button', { name: 'Apply lambda', exact: true }).click(); await expect(page.locator('#diagnostics')).toContainText('draft');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#diagnostics')).not.toContainText('draft');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload();
  const lambda = (await saved(page)).workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_lambda'); expect(lambda.extraState.parameters[0].name).toBe('number');
});

test('repeated lambda creation from the toolbox allocates fresh scope and parameter identities', async ({ page }) => {
  await page.goto('/');
  for (let index = 0; index < 2; index++) {
    await page.getByRole('treeitem', { name: 'Function values', exact: true }).click();
    const template = page.locator('.blocklyToolboxFlyout g.blocklyDraggable').filter({ has: page.locator('g.blocklyLabelField').filter({ hasText: /^lambda$/ }) }).first();
    const bounds = await template.boundingBox(); expect(bounds).not.toBeNull();
    const canvas = await page.locator('#blockly').boundingBox(); expect(canvas).not.toBeNull();
    await page.mouse.move(bounds!.x + 25, bounds!.y + 15); await page.mouse.down();
    await page.mouse.move(canvas!.x + canvas!.width - 130, canvas!.y + 100 + index * 130, { steps: 12 }); await page.mouse.up();
    await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.filter((b: { type: string }) => b.type === 'py_lambda').length).toBe(index + 1);
  }
  const lambdas = (await saved(page)).workspace.blocks.blocks.filter((b: { type: string }) => b.type === 'py_lambda');
  expect(lambdas[0].extraState.id).not.toBe(lambdas[1].extraState.id); expect(lambdas[0].extraState.parameters[0].id).not.toBe(lambdas[1].extraState.parameters[0].id);
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
});

test('named and anonymous functions share the planned higher-order example', async ({ page }) => {
  await open(page, 'higher-order.json'); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('6\n4\n');
});

test('capture diagnostics preserve unavailable reads and prohibit running the project', async ({ page }) => {
  await open(page, 'capture.json'); await expect(page.locator('#diagnostics')).toContainText('A lambda can read only its own parameters'); await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('g[data-id="capture-read"]')).toContainText('score (unavailable here)'); await page.reload(); await expect(page.locator('#run')).toBeDisabled();
});

test('a lambda failure highlights its defining statement and retains the lambda frame', async ({ page }) => {
  await open(page, 'error.json'); await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('ZeroDivisionError', { timeout: 60_000 });
  await expect(page.locator('g[data-id="lambda-return"] .blocklyWarningIcon')).toBeVisible(); await expect(page.locator('#traceback')).toContainText('<lambda>');
});

test('saved module lambdas preserve scope and execute in Pyodide after reload', async ({ page }) => {
  await open(page, 'module-consumer.json'); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
  await page.getByRole('button', { name: 'Modules', exact: true }).click(); await page.getByRole('button', { name: 'Inspect module', exact: true }).click();
  await expect(page.locator('#module-inspector-blocks')).toContainText('left (parameter)'); await expect(page.locator('#module-inspector-source')).toContainText('lambda left, right:');
});

test('duplicate lambda scope metadata is rejected without replacing the project or disabling Undo', async ({ page }) => {
  await open(page); const bad = JSON.parse(await readFile(fixture('parameters.json'), 'utf8'));
  const duplicate = structuredClone(bad.workspace.blocks.blocks[0].inputs.BODY.block.inputs.VALUE.block); delete duplicate.id; bad.workspace.blocks.blocks.push(duplicate);
  await page.locator('#project-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('#save-state')).toContainText('distinct identities'); await edit(page);
  await page.getByLabel('Lambda parameter 1 name').fill('renamed'); await page.getByRole('button', { name: 'Apply lambda', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});
