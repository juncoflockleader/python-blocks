import { test, expect, type Page } from '@playwright/test';
import { stagePixels } from './stage-pixels';

/** The stage draws at the screen's resolution (whole steps, 1× to 4×) while every
 * script, sensing rule and saved position keeps the 480 × 320 stage coordinates;
 * library art goes into projects at 2×. Measured as on an iPad Air in landscape. */
test.use({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const pngSize = (data: string) => { const bytes = Buffer.from(data.split(',')[1], 'base64'); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };

test('the stage follows its displayed size on a 2× screen, and library art is a reference drawn at its stage size', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const stage = page.locator('#stage'), backing = () => stage.evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height]);
  // Blocks view: about 440 CSS px on a 2× screen, so 2 device pixels per stage pixel.
  await expect(stage).toHaveAttribute('data-scale', '2'); expect(await backing()).toEqual([960, 640]);
  // Stage view: about 770 CSS px, so 3.
  await page.locator('#view-stage').click(); await expect(stage).toHaveAttribute('data-scale', '3'); expect(await backing()).toEqual([1440, 960]);
  // A library character is saved as references to its eight poses, not pictures.
  await page.locator('#scene-stock').click(); await page.locator('[data-stock-id=fox]').click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene?.assets?.length ?? 0).toBe(8);
  const fox = (await saved(page)).workspace.pythonScene.assets[0];
  expect(fox).toEqual({ id: 'stock-fox-idle-1', name: 'Fox idle 1', width: 64, height: 64, stock: 'cast/fox-idle-1@1' });
  // It is drawn at its stage size: orange at the stage centre, background 40 units to the side of its edge.
  await expect.poll(async () => { const [r, g, b] = await stage.evaluate(stagePixels, [240, 160, 1, 1]); return r > 180 && g < 160 && b < 120; }).toBe(true);
  const [r, g, b] = await stage.evaluate(stagePixels, [240 + 72, 160, 1, 1]); expect(r > 230 && g > 230 && b > 220).toBe(true);
  // Sensing uses the stage size too: the pointer over the fox's face hits it.
  const box = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 4 }); await page.mouse.up();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites[0].x).toBeGreaterThan(30);
});

test('pen marks are drawn into a finer pen layer and stay sharp in Large stage', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const stage = page.locator('#stage');
  const ink = async () => { const data = await stage.evaluate(stagePixels, [0, 0, 480, 320]); let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 120 && data[i + 1] > 100) count++; return count; };
  // The starter drawing's pen square, read back in stage coordinates.
  await page.locator('#run').click(); await expect.poll(ink, { timeout: 60_000 }).toBeGreaterThan(300);
  // Large stage is about 1,000 CSS px: 4 device pixels per stage pixel, and the pen square is still there.
  await page.locator('#play-expand').click(); await expect(stage).toHaveAttribute('data-scale', '4');
  expect(await stage.evaluate(c => (c as HTMLCanvasElement).width)).toBe(1920); expect(await ink()).toBeGreaterThan(300);
});
