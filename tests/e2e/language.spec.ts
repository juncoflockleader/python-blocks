import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

async function openFixture(page: Page, name: string) {
  await page.locator('#project-file').setInputFiles(path.resolve('tests/fixtures/language', name));
}
test('saved project reloads and exports a complete block project', async ({ page }) => {
  await page.goto('/'); await openFixture(page, 'large-integer.json');
  await expect(page.locator('#python')).toContainText('9007199254740993');
  await page.reload(); await expect(page.locator('#python')).toContainText('9007199254740993');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('9007199254740993\n');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  const file = await downloading; let content = '';
  for await (const chunk of (await file.createReadStream())!) content += chunk;
  const saved = JSON.parse(content);
  expect(saved.format).toBe('python-blocks'); expect(saved.languageVersion).toBe(19);
  expect(content).toContain('print-large-integer');
});

test('runtime errors preserve Python frames and identify their block', async ({ page }, testInfo) => {
  await page.goto('/'); await openFixture(page, 'division-error.json');
  await expect(page.locator('#python')).toContainText('/');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('ZeroDivisionError', { timeout: 60_000 });
  await page.getByText('Python error details', { exact: true }).click();
  await expect(page.locator('#traceback')).toContainText('program.py');
  await expect(page.locator('g[data-id="division-error"] .blocklyWarningIcon')).toBeVisible();
  await expect(page.locator('#run')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('mapped-error.png'), fullPage: true });
});

test('missing inputs cannot execute stale previously valid source', async ({ page }) => {
  await page.goto('/'); await openFixture(page, 'large-integer.json');
  await expect(page.locator('#run')).toBeEnabled();
  await openFixture(page, 'missing-input.json');
  await expect(page.locator('#diagnostics')).toContainText('Connect a value to TEXT');
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.locator('#python')).not.toContainText('9007199254740993');
});

test('fractional repeat counts produce Python errors instead of silent conversion', async ({ page }) => {
  await page.goto('/'); await openFixture(page, 'fractional-repeat.json');
  await expect(page.locator('#python')).toContainText('range(2.5)');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#output')).toContainText('TypeError', { timeout: 60_000 });
});

test('mixed-type comparisons survive rendered editing and use native Python behavior', async ({ page }) => {
  await page.goto('/');
  const comparison = { type: 'logic_compare', id: 'mixed-comparison', fields: { OP: 'EQ' }, inputs: {
    A: { block: { type: 'py_number', fields: { VALUE: '1' } } },
    B: { block: { type: 'text', fields: { TEXT: '1' } } },
  } };
  const state = { format: 'python-blocks', formatVersion: 1, languageVersion: 3, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'py_program', inputs: { BODY: { block: { type: 'text_print', inputs: { TEXT: { block: comparison } } } } } }] } } };
  await page.locator('#project-file').setInputFiles({ name: 'comparison.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(state)) });
  await expect(page.locator('#python')).toContainText('1 == "1"');
  await page.reload();
  await expect(page.locator('#python')).toContainText('1 == "1"');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('False\n');
});

test('Stop terminates an executing infinite loop and a fresh run succeeds', async ({ page }) => {
  await page.goto('/'); await openFixture(page, 'infinite-loop.json');
  await expect(page.locator('#python')).toContainText('while True');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Running Python…', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Stop', exact: false }).click();
  await expect(page.locator('#status')).toHaveText('Stopped');
  await openFixture(page, 'large-integer.json');
  await expect(page.locator('#python')).toContainText('9007199254740993');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('9007199254740993\n');
});

test('invalid stored projects are retained for recovery', async ({ page }) => {
  const raw = JSON.stringify({ format: 'python-blocks', formatVersion: 900 });
  await page.addInitScript(value => localStorage.setItem('python-blocks.project.v1', value), raw);
  await page.goto('/');
  await expect(page.locator('#save-state')).toContainText('Autosave is paused');
  await expect(page.getByRole('button', { name: 'Download recovery file' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('python-blocks.project.v1'))).toBe(raw);
});

test('legacy multi-stack imports require an ordering review', async ({ page }) => {
  await page.goto('/');
  const before = await page.locator('#python').textContent();
  const legacy = { blocks: { blocks: [1, 2].map(n => ({ type: 'text_print', inputs: { TEXT: { block: { type: 'math_number', fields: { NUM: n } } } } })) } };
  const file = { name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) };
  await page.locator('#project-file').setInputFiles(file);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.locator('#python').textContent()).toBe(before);
  await page.locator('#project-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Move down', exact: true }).first().click();
  await page.getByRole('button', { name: 'Use this order' }).click();
  await expect(page.locator('#python')).toHaveText('print(2)\nprint(1)\n');
});
