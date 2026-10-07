import { expect, test } from '@playwright/test';

test('blocks generate Python and real Python draws a square', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#python')).toContainText('pen.move(100)');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-command-count', '8');
  const pixel = await page.locator('#stage').evaluate(canvas => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(290, 160, 1, 1).data));
  expect(pixel).toEqual([38, 124, 112, 255]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('playground.png'), fullPage: true });
});

test('Stop cancels startup and a subsequent run succeeds', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Run code' }).click();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#status')).toHaveText('Stopped');
  await page.getByRole('button', { name: 'Run code' }).click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
});

test('exports Python source with its dependency requirement', async ({ page }) => {
  await page.goto('/');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Python' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('my-drawing.py');
  const stream = await download.createReadStream();
  let content = '';
  for await (const chunk of stream!) content += chunk;
  expect(content).toContain('Requires playground.py and its browser host');
  expect(content).toContain('pen.move(100)');
});
