import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const fixture = (name: string) => path.resolve('tests/fixtures/function-values', name);
async function open(page: Page, name = 'references.json') { await page.goto('/'); await page.locator('#project-file').setInputFiles(fixture(name)); }
async function run(page: Page) { await page.getByRole('button', { name: 'Run code' }).click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 }); }

test('function references rename and reorder with definitions while dynamic calls retain positional arguments', async ({ page }, testInfo) => {
  await open(page); await expect(page.locator('#python')).toContainText('(difference)(10, 3)');
  await page.getByRole('treeitem', { name: 'Functions', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText(/function\s*difference/);
  await page.getByRole('treeitem', { name: 'Function values', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('call function value');
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption('difference-function');
  await page.getByLabel('Function name', { exact: true }).fill('subtract_values');
  await page.getByRole('button', { name: 'Move parameter up', exact: true }).nth(1).click();
  await page.getByRole('button', { name: 'Apply function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def subtract_values(right, left):');
  await expect(page.locator('#python')).toContainText('(subtract_values)(10, 3)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).toContainText('(difference)(10, 3)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload(); await run(page);
  await expect(page.locator('#output')).toHaveText('-7\n');
  await page.screenshot({ path: testInfo.outputPath('function-values.png'), fullPage: true });
});

test('dynamic argument editing preserves removed shadows, maps arity errors, and supports undo and reload', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('g[data-id="dynamic-call"] .blocklyMutatorIcon').click();
  await page.screenshot({ path: testInfo.outputPath('dynamic-arguments.png'), fullPage: true });
  const container = page.locator('.blocklyBubbleCanvas path[aria-label="Begin stack, positional arguments"]').locator('..');
  await container.locator('g.blocklyDraggable').last().click(); await page.keyboard.press('Delete');
  await expect(page.locator('#python')).toContainText('(difference)(10)');
  await page.locator('g[data-id="dynamic-call"] .blocklyMutatorIcon').click();
  await expect(page.locator('g[data-id="right-argument"]')).toBeAttached();
  await expect(page.locator('g[data-id="difference-reference"]')).toBeAttached();
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('TypeError', { timeout: 60_000 });
  await expect(page.locator('g[data-id="difference-output"] .blocklyWarningIcon')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.reload();
  await expect(page.locator('#python')).toContainText('(difference)(10, 3)'); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('definition deletion leaves references unresolved and undo repairs them', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption('difference-function'); await page.getByRole('button', { name: 'Delete function', exact: true }).click();
  await expect(page.locator('#diagnostics')).toContainText('no active definition'); await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('g[data-id="difference-reference"]')).toBeAttached();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('function-reference duplication preserves its target without creating argument sockets', async ({ page }) => {
  await open(page);
  await page.locator('g[data-id="difference-reference"] > g.blocklyLabelField').filter({ hasText: /^difference$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Duplicate/ }).click();
  await expect(page.locator('#diagnostics')).toContainText('draft');
  await page.reload();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
  const copy = state.workspace.blocks.blocks.find((b: { type: string }) => b.type === 'py_function_ref');
  expect(copy.extraState.functionId).toBe('difference-function'); expect(copy.inputs).toBeUndefined();
  await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('higher-order functions pass and return functions in real Pyodide after save and reload', async ({ page }) => {
  await open(page, 'higher-order.json'); await expect(page.locator('#python')).toContainText('return difference');
  await expect(page.locator('#python')).toContainText('(operation)(left, right)'); await page.reload();
  await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('imported function values return private helpers and keep pinned identity through namespace edits and removal', async ({ page }) => {
  await open(page, 'module-consumer.json'); await expect(page.locator('#python')).toContainText('(tools.choose_operation)()');
  await page.getByRole('treeitem', { name: 'Modules', exact: true }).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText(/function\s*tools\.choose_operation/);
  await page.getByRole('button', { name: 'Modules', exact: true }).click(); await page.locator('#module-alias').fill('helpers');
  await page.getByRole('button', { name: 'Rename namespace', exact: true }).click(); await page.locator('#modules-close').click();
  await expect(page.locator('#python')).toContainText('(helpers.choose_operation)()'); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
  await page.getByRole('button', { name: 'Modules', exact: true }).click(); await page.getByRole('button', { name: 'Remove import', exact: true }).click(); await page.locator('#modules-close').click();
  await expect(page.locator('#run')).toBeDisabled(); await expect(page.locator('g[data-id="module-reference"]')).toContainText('helpers.choose_operation');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});

test('rejected function-value metadata preserves the project and subsequent Undo recording', async ({ page }) => {
  await open(page);
  const bad = JSON.parse(await readFile(fixture('references.json'), 'utf8'));
  bad.workspace.blocks.blocks[1].inputs.BODY.block.inputs.TEXT.block.extraState.argumentCount = -1;
  await page.locator('#project-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.locator('#save-state')).toContainText('between 0 and 100');
  await expect(page.locator('#python')).toContainText('(difference)(10, 3)');
  await page.getByRole('button', { name: 'Functions & variables' }).click(); await page.getByLabel('Choose function').selectOption('difference-function');
  await page.getByLabel('Function name', { exact: true }).fill('renamed'); await page.getByRole('button', { name: 'Apply function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('(renamed)(10, 3)'); await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('(difference)(10, 3)'); await run(page); await expect(page.locator('#output')).toHaveText('7\n');
});
