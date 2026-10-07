import { expect, test } from '@playwright/test';
import path from 'node:path';

test('signature editing keeps arguments bound, supports undo, and survives reload in Pyodide', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/functions.json'));
  await expect(page.locator('#python')).toContainText('difference(10, 3)');
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption('difference-function');
  await page.getByLabel('Function name', { exact: true }).fill('subtract_values');
  await page.getByLabel('Parameter 2 name').fill('amount');
  await page.getByRole('button', { name: 'Move parameter up', exact: true }).nth(1).click();
  await page.screenshot({ path: testInfo.outputPath('function-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Apply function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def subtract_values(amount, left)');
  await expect(page.locator('#python')).toContainText('subtract_values(3, 10)');
  await expect(page.locator('g[data-id="difference-return"]')).toContainText('amount (parameter)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('difference(10, 3)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('subtract_values(3, 10)');
  await page.reload();
  await expect(page.locator('#python')).toContainText('subtract_values(3, 10)');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('7\n');
  await page.screenshot({ path: testInfo.outputPath('scoped-functions.png'), fullPage: true });
});

test('the forms create functions and scoped variables and reject name conflicts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Function name', { exact: true }).fill('calculate');
  await page.getByRole('button', { name: 'Add parameter', exact: true }).click();
  await page.getByLabel('Parameter 1 name').fill('limit');
  await page.getByRole('button', { name: 'Apply function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def calculate(limit):');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).not.toContainText('def calculate');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def calculate(limit):');
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Variable name', { exact: true }).fill('limit');
  await page.getByLabel('Scope', { exact: true }).selectOption({ label: 'Local to calculate' });
  await page.getByRole('button', { name: 'Apply variable', exact: true }).click();
  await expect(page.locator('#language-error')).toContainText('already exists');
  await page.getByLabel('Variable name', { exact: true }).fill('count');
  await page.getByRole('button', { name: 'Apply variable', exact: true }).click();
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('count (local: calculate)');
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('limit (parameter: calculate)');
});

test('deleting a definition retains calls and undo repairs them', async ({ page }) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/functions.json'));
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption('difference-function');
  await page.getByRole('button', { name: 'Delete function', exact: true }).click();
  await expect(page.locator('#diagnostics')).toContainText('no active definition');
  await expect(page.locator('g[data-id="difference-call"]')).toBeVisible();
  await expect(page.locator('#run')).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('difference(10, 3)');
  await expect(page.locator('#run')).toBeEnabled();
});

test('duplicating a function remaps references and undo/redo preserves its new identity', async ({ page }) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/functions.json'));
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption('difference-function');
  await page.getByRole('button', { name: 'Duplicate function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def difference_copy(left, right):');
  await expect(page.locator('#run')).toBeEnabled();
  const copied = await page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.procedures.find((f: { name: string }) => f.name === 'difference_copy'));
  expect(copied.id).not.toBe('difference-function');
  expect(copied.parameters[0].id).not.toBe('left-param');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).not.toContainText('def difference_copy');
  await expect(page.locator('#python')).toContainText('difference(10, 3)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def difference_copy(left, right):');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.procedures.find((f: { name: string }) => f.name === 'difference_copy'));
  expect(restored).toEqual(copied);
  await page.getByRole('button', { name: 'Functions & variables' }).click();
  await page.getByLabel('Choose function').selectOption(copied.id);
  await page.getByLabel('Parameter 1 name').fill('copied_left');
  await page.getByRole('button', { name: 'Apply function', exact: true }).click();
  await expect(page.locator('#python')).toContainText('def difference_copy(copied_left, right):');
  await expect(page.locator('#python')).toContainText('return (copied_left) - (right)');
  await expect(page.locator('#python')).toContainText('def difference(left, right):');
  await page.reload();
  await expect(page.locator('#python')).toContainText('def difference_copy(copied_left, right):');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('7\n');
});

test('the standard block Duplicate command uses the same identity remapping', async ({ page }) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/functions.json'));
  await page.locator('g[data-id="difference-definition"] > g.blocklyLabelField').filter({ hasText: /^define$/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Duplicate/ }).click();
  await expect(page.locator('#python')).toContainText('def difference_copy(left, right):');
  await expect(page.locator('#run')).toBeEnabled();
});
