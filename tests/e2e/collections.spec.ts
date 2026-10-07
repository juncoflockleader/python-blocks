import { expect, test } from '@playwright/test';
import path from 'node:path';

test('native lists, dictionaries, aliases, function mutation, and key iteration run in Pyodide', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language/collections.json'));
  await expect(page.locator('#python')).toContainText('def add_value(values):');
  await expect(page.locator('#python')).toContainText('.append(3)');
  await expect(page.locator('#python')).not.toContainText('global');
  await page.reload();
  await expect(page.locator('#python')).toContainText('"numbers": items');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('3\n[1, 2, 3]\n3\nnumbers\nlabel\n99\nTrue\n');
  await page.getByRole('treeitem', { name: 'Collections', exact: true }).click();
  await expect(page.locator('.blocklyToolboxFlyout')).toContainText('dictionary');
  await page.screenshot({ path: testInfo.outputPath('collections.png'), fullPage: true });
});

for (const [file, exception] of [['list-index-error.json', 'IndexError'], ['dictionary-key-error.json', 'KeyError']]) test(`${exception} identifies its collection statement`, async ({ page }) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language', file));
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText(exception, { timeout: 60_000 });
  await expect(page.locator('g[data-id="collection-error"] .blocklyWarningIcon')).toBeVisible();
});

test('dictionary pair editing preserves removed values and undo restores the program', async ({ page }, testInfo) => {
  await page.goto('/');
  const literal = { type: 'py_dict', id: 'editable-dictionary', extraState: { itemCount: 2 }, inputs: Object.fromEntries(['first', 'second'].flatMap((name, index) => [
    [`KEY${index}`, { block: { type: 'text', id: `key-${index}`, fields: { TEXT: name } } }],
    [`VALUE${index}`, { shadow: { type: 'py_number', id: `value-${index}`, fields: { VALUE: String(index + 1) } } }],
  ])) };
  const state = { format: 'python-blocks', formatVersion: 1, languageVersion: 3, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'py_program', inputs: { BODY: { block: { type: 'text_print', inputs: { TEXT: { block: literal } } } } } }] } } };
  await page.locator('#project-file').setInputFiles({ name: 'dictionary.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.locator('#python')).toContainText('"second": 2');
  await page.locator('g[data-id="editable-dictionary"] .blocklyMutatorIcon').click();
  await page.screenshot({ path: testInfo.outputPath('dictionary-editor.png'), fullPage: true });
  const container = page.locator('.blocklyBubbleCanvas path[aria-label="Begin stack, dictionary pairs"]').locator('..');
  await container.locator('g.blocklyDraggable').last().click();
  await page.keyboard.press('Delete');
  await expect(page.locator('#python')).not.toContainText('"second": 2');
  await page.locator('g[data-id="editable-dictionary"] .blocklyMutatorIcon').click();
  await expect(page.locator('g[data-id="value-1"]')).toBeAttached();
  await expect(page.locator('#diagnostics')).toContainText('loose block is a draft');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('"first": 1, "second": 2');
  await expect(page.locator('#run')).toBeEnabled();
});

test('list item editing preserves removed values and undo restores the program', async ({ page }) => {
  await page.goto('/');
  const literal = { type: 'lists_create_with', id: 'editable-list', extraState: { itemCount: 2 }, inputs: Object.fromEntries([0, 1].map(index => [
    `ADD${index}`, { shadow: { type: 'py_number', id: `item-${index}`, fields: { VALUE: String(index + 1) } } },
  ])) };
  const state = { format: 'python-blocks', formatVersion: 1, languageVersion: 3, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'py_program', inputs: { BODY: { block: { type: 'text_print', inputs: { TEXT: { block: literal } } } } } }] } } };
  await page.locator('#project-file').setInputFiles({ name: 'list.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.locator('#python')).toContainText('[1, 2]');
  await page.locator('g[data-id="editable-list"] .blocklyMutatorIcon').click();
  const container = page.locator('.blocklyBubbleCanvas path[aria-label="Begin stack, list"]').locator('..');
  await container.locator('g.blocklyDraggable').last().click(); await page.keyboard.press('Delete');
  await expect(page.locator('#python')).toContainText('[1]');
  await page.locator('g[data-id="editable-list"] .blocklyMutatorIcon').click();
  await expect(page.locator('g[data-id="item-1"]')).toBeAttached();
  await expect(page.locator('#diagnostics')).toContainText('loose block is a draft');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('#python')).toContainText('[1, 2]');
  await expect(page.locator('#run')).toBeEnabled();
});
