import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { iconArt, iconMarkup, type IconName } from '../../src/ui/icon-art';

const fixture = JSON.parse(readFileSync('content/builds/brick-breaker-game.json', 'utf8'));

test('every icon drawing is centred on its grid, and palette discs centre their symbol', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  // Play is centred on its triangle's weight, by design.
  const drawings = (Object.keys(iconArt) as IconName[]).filter(name => name !== 'play').map(name => [name, iconMarkup(name)]);
  const offCentre = await page.evaluate(drawings => {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '240'); svg.setAttribute('height', '240'); document.body.append(svg);
    const off: string[] = [];
    for (const [name, markup] of drawings) {
      const g = document.createElementNS(ns, 'g'); g.innerHTML = markup; svg.replaceChildren(g);
      const box = g.getBBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (Math.abs(x - 12) > 0.3 || Math.abs(y - 12) > 0.3) off.push(`${name} (${x.toFixed(2)}, ${y.toFixed(2)})`);
    }
    svg.remove(); return off;
  }, drawings);
  expect(offCentre).toEqual([]);
  // Blockly writes display: inline-block on the icon span; the disc must still centre its symbol.
  for (const id of ['events', 'motion', 'sounds', 'loops']) {
    await expect(page.locator(`#category-${id} .blocklyToolboxCategoryIcon`)).toHaveCSS('display', 'flex');
    await expect(page.locator(`#category-${id} .blocklyToolboxCategoryIcon`)).toHaveCSS('justify-content', 'center');
  }
});

test('command and event blocks carry their family symbol; value blocks stay compact', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#scene-cards button')).toHaveCount(3);
  const sources = await page.locator('.blocklyBlockCanvas image').evaluateAll(images => images.map(image => decodeURIComponent(image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '')));
  const count = (drawing: string) => sources.filter(src => src.includes(drawing)).length;
  // Handlers show their event kind: two "game starts" flags, two overlaps, one update.
  expect(count(iconArt.flag)).toBe(2);
  expect(count(iconArt.touch)).toBe(2);
  expect(count(iconArt.restart)).toBe(1);
  // Commands show their family or a specific symbol: the brick wall's loops, destroy's bin.
  expect(count(iconArt.loop)).toBeGreaterThanOrEqual(2);
  expect(count(iconArt.trash)).toBe(1);
  // Value blocks (numbers, sprite references, comparisons) have none.
  expect(sources.length).toBeLessThan(await page.locator('.blocklyBlockCanvas .blocklyDraggable').count());
  // The symbol is decoration only and is never saved.
  expect(await page.evaluate(() => localStorage.getItem('python-blocks.project.v1') ?? '')).not.toContain('PB_ICON');
});

test('the sprite tray leads with Sprites, a filled button with a character symbol', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const button = page.getByRole('button', { name: 'Add sprites' });
  await expect(button).toHaveText('Sprites');
  await expect(button).toHaveAttribute('data-ui-icon', 'spriteAdd');
  await button.click();
  await expect(page.locator('#stock-dialog')).toBeVisible();
});
