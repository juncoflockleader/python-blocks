import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Opening a project spreads out scripts that would sit on top of each other (project/spread.ts),
 * by their size as drawn, so no example or lesson game opens with one script hiding another. */
const gallery = JSON.parse(readFileSync('content/gallery.json', 'utf8')) as { id: string; project: string }[];

/** Pairs of top-level scripts whose boxes overlap, as drawn in the workspace. */
const overlaps = (page: Page) => page.evaluate(() => {
  const boxes = [...document.querySelectorAll<SVGGElement>('#blockly .blocklyBlockCanvas > g[data-id]')].filter(g => !g.closest('.blocklyFlyout')).map(g => {
    const at = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') ?? ''), box = g.getBBox();
    return { id: g.getAttribute('data-id'), x: Number(at?.[1] ?? 0) + box.x, y: Number(at?.[2] ?? 0) + box.y, w: box.width, h: box.height };
  });
  const pairs: string[] = [];
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
    if (Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)) pairs.push(`${a.id} × ${b.id}`);
  }
  return pairs;
});

test('no script of an example or a lesson game opens on top of another', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  for (const entry of gallery) {
    const title = entry.project.split('/').pop()!.replace(/\.json$/, '');
    await page.locator('#project-file').setInputFiles(entry.project);
    await expect(page.locator('#project-title')).toHaveText(title);
    if (await page.locator('#level-dialog').isVisible()) await page.locator('#level-keep').click();
    expect(await overlaps(page), entry.id).toEqual([]);
  }
});
