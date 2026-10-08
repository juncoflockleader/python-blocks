import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const projectKey = 'python-blocks.project.v1', pilotKey = 'python-blocks.learner-pilot.v1';
test('runs the pilot, retains unfinished text on reload, records observations and restores the original project', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const original = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), projectKey);
  await page.locator('#pilot-panel > summary').click(); await page.locator('#pilot-start').click();
  await expect(page.locator('#python')).toContainText('score = 0');
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('2\n4\n6\n', { timeout: 60_000 });
  await page.locator('#pilot-notes > summary').click(); await page.locator('#pilot-prediction').fill('Three numbers, increasing by two.');
  await page.locator('#pilot-outcome').selectOption('completed'); await page.locator('#pilot-timer').click();
  await page.locator('#python-edit').click(); await page.locator('#python-editor').fill('score = 1\nprint(');
  await page.reload(); await expect(page.locator('#python-editor')).toHaveValue('score = 1\nprint(');
  await page.locator('#pilot-panel > summary').click(); await page.locator('#pilot-notes > summary').click();
  await expect(page.locator('#pilot-prediction')).toHaveValue('Three numbers, increasing by two.');
  await expect(page.locator('#pilot-time')).toContainText('paused');
  await page.getByRole('button', { name: '4. Keep assets', exact: true }).click(); await page.locator('#pilot-sprites').click();
  await expect(page.locator('#python')).toContainText('Hello from Player!');
  const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), pilotKey);
  expect(JSON.parse(record.backups.beforeSprites).workspace.pythonBridge.draft.source).toBe('score = 1\nprint(');
  expect(record.record.notes[3].outcome).toBe('unobserved');
  await page.locator('#pilot-finish').click();
  const pending = page.waitForEvent('download'); await page.locator('#pilot-download').click();
  const notes = JSON.parse(readFileSync((await (await pending).path())!, 'utf8'));
  expect(notes.tasks).toHaveLength(6); expect(notes.tasks[0].outcome).toBe('completed'); expect(notes.endedAt).not.toBeNull();
  expect(notes).not.toHaveProperty('backups'); expect(notes.revision).not.toBe('unavailable');
  await page.getByText('Saved project checkpoints & session data', { exact: true }).click();
  page.once('dialog', d => d.accept()); await page.locator('#pilot-return').click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), projectKey)).toEqual(original);
  await expect(page.locator('#pilot-return')).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('#pilot-panel').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.locator('#pilot-panel').screenshot({ path: info.outputPath('pilot-mobile.png') });
  page.once('dialog', d => d.accept()); await page.locator('#pilot-clear').click();
  expect(await page.evaluate(key => localStorage.getItem(key), pilotKey)).toBeNull(); expect(errors).toEqual([]);
});

test('does not replace work when pilot backup cannot be saved, and preserves malformed data for recovery', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled(); const original = await page.locator('#python').textContent();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key.includes('learner-pilot')) throw new DOMException('Quota exceeded', 'QuotaExceededError'); set.call(this, key, value); };
  });
  await page.locator('#pilot-panel > summary').click(); await page.locator('#pilot-start').click();
  await expect(page.locator('#pilot-status')).toContainText('storage is full'); await expect(page.locator('#python')).toHaveText(original!);
  await page.reload(); await page.evaluate(key => localStorage.setItem(key, '{broken'), pilotKey); await page.reload();
  await page.locator('#pilot-panel > summary').click(); await expect(page.locator('#pilot-start')).toBeHidden();
  await expect(page.locator('#pilot-recovery')).toBeVisible();
  const pending = page.waitForEvent('download'); await page.locator('#pilot-recovery').click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe('{broken');
});

test('a stale pilot tab preserves local notes without moving them to another task', async ({ page }) => {
  await page.goto('/'); await page.locator('#pilot-panel > summary').click(); await page.locator('#pilot-start').click();
  await page.locator('#pilot-notes > summary').click(); await page.locator('#pilot-observation').fill('Observed on the first task.');
  const before = await page.evaluate(key => localStorage.getItem(key), pilotKey);
  await page.evaluate(key => { const s = JSON.parse(localStorage.getItem(key)!); s.record.setting = 'Changed in another tab'; localStorage.setItem(key, JSON.stringify(s)); }, pilotKey);
  await page.getByRole('button', { name: '2. Edit and compare', exact: true }).click();
  await expect(page.locator('#pilot-status')).toContainText('another tab'); await expect(page.locator('#pilot-task-title')).toHaveText('Predict');
  const pending = page.waitForEvent('download'); await page.locator('#pilot-download').click();
  const exported = JSON.parse(readFileSync((await (await pending).path())!, 'utf8'));
  expect(exported.tasks[0].observation).toBe('Observed on the first task.'); expect(exported.tasks[1].observation).toBe('');
  expect(await page.evaluate(key => localStorage.getItem(key), pilotKey)).not.toBe(before);
});
