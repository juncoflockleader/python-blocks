import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTab } from './shell';

/** Stage view: a large stage between a tools rail and the sprite column, an
 * editing view that pans and zooms around worlds bigger than one screen, a
 * minimap, and add-screen buttons. The view is never saved and never moves the game camera. */
const fixture = JSON.parse(readFileSync('src/scene/example.json', 'utf8'));
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const shown = (page: Page) => page.locator('#stage').evaluate(canvas => ({ x: Number(canvas.dataset.cameraX), y: Number(canvas.dataset.cameraY), zoom: Number(canvas.dataset.zoom) }));
const world = async (page: Page) => { const scene = (await saved(page)).workspace.pythonScene; const w = scene.worlds?.find((w: { id: string }) => w.id === scene.world); return w ? [w.map.columns, w.map.rows] : null; };
async function install(page: Page) {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles({ name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect.poll(async () => (await saved(page))?.workspace?.pythonScene?.sprites?.map((s: { id: string }) => s.id)).toEqual(['player', 'friend']);
}
async function stageView(page: Page) {
  await page.locator('#view-stage').click();
  await expect(page.locator('html')).toHaveAttribute('data-view', 'stage');
}
/** Where a world point is on screen, for the view shown now. */
async function client(page: Page, x: number, y: number) {
  const box = (await page.locator('#stage').boundingBox())!, view = await shown(page), k = box.width / 480;
  return { x: box.x + (240 + (x - view.x) * view.zoom) * k, y: box.y + (160 - (y - view.y) * view.zoom) * k };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
}

test('Stage view makes the stage the main area, keeps the sprite column and is remembered', async ({ page }) => {
  await install(page);
  const small = (await page.locator('#stage').boundingBox())!;
  await stageView(page);
  await expect(page.locator('#stage-main .stage-panel')).toHaveCount(1);
  // The workspace stays laid out (Blockly keeps measuring) but is invisible, inert and never covers the stage.
  await expect(page.locator('.blocks-panel')).toHaveCSS('opacity', '0');
  expect(await page.locator('.blocks-panel').evaluate(panel => (panel as HTMLElement).inert)).toBe(true);
  const box = (await page.locator('#stage').boundingBox())!;
  for (const [x, y] of [[.05, .1], [.1, .5], [.5, .5]]) expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.stage-wrap') !== null, [box.x + box.width * x, box.y + box.height * y])).toBe(true);
  await expect(page.locator('#stage-rail')).toBeVisible();
  await expect(page.locator('#view-stage')).toHaveAttribute('aria-pressed', 'true');
  const large = (await page.locator('#stage').boundingBox())!;
  expect(large.width).toBeGreaterThan(small.width * 1.4);
  expect(large.width / large.height).toBeCloseTo(1.5, 1);
  await openTab(page, 'sprite'); await expect(page.locator('#scene-cards button')).toHaveCount(2);
  // The choice is remembered per browser.
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-view', 'stage');
  await page.locator('#view-blocks').click(); await expect(page.locator('html')).toHaveAttribute('data-view', 'blocks');
  await expect(page.locator('.right-column > .stage-panel')).toHaveCount(1);
  await expect(page.locator('.blocks-panel')).toHaveCSS('opacity', '1'); expect(await page.locator('.blocks-panel').evaluate(panel => (panel as HTMLElement).inert)).toBe(false);
  expect((await page.locator('#blockly .blocklySvg').boundingBox())!.width).toBeGreaterThan(300);
  // Narrow windows keep Blocks view; the switch is hidden.
  await page.locator('#view-stage').click(); await page.setViewportSize({ width: 820, height: 1000 });
  await expect(page.locator('html')).toHaveAttribute('data-view', 'blocks'); await expect(page.locator('#view-switch')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 }); await expect(page.locator('html')).toHaveAttribute('data-view', 'stage');
});

test('adding screens grows the stage into a world that pans, zooms and has a map, with Undo', async ({ page }) => {
  await install(page); await stageView(page);
  expect(await shown(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await expect(page.locator('#stage-map')).toBeHidden(); await expect(page.locator('#stage-map-show')).toBeHidden();
  await page.locator('#stage-add-right').click();
  await expect.poll(() => world(page)).toEqual([60, 20]);
  await expect(page.locator('#stage-map')).toBeVisible(); await expect(page.locator('#stage-map-title')).toHaveText('Map · 2 × 1 screens');
  expect(await shown(page)).toEqual({ x: 480, y: 0, zoom: 1 }); // the new screen comes into view
  // Dragging empty space looks around; the start view comes back with Home.
  const box = (await page.locator('#stage').boundingBox())!;
  await drag(page, { x: box.x + box.width / 2, y: box.y + 30 }, { x: box.x + box.width * .9, y: box.y + 30 });
  expect((await shown(page)).x).toBeCloseTo(288, -1);
  await page.locator('#stage').press('Home'); expect(await shown(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  // Zoom out, fit the world (everything in view, so no map), back to 100%.
  await page.locator('#stage-zoom-out').click(); expect((await shown(page)).zoom).toBeCloseTo(0.8);
  await page.locator('#stage-fit').click();
  expect(await shown(page)).toMatchObject({ x: 240, y: 0 }); expect((await shown(page)).zoom).toBeCloseTo(0.47);
  await expect(page.locator('#stage-map')).toBeHidden(); await expect(page.locator('#stage-zoom-fit')).toHaveText('47%');
  await page.locator('#stage-zoom-fit').click(); expect((await shown(page)).zoom).toBe(1);
  // The map: tapping its right half shows the second screen.
  const map = (await page.locator('#stage-map-canvas').boundingBox())!;
  await page.mouse.click(map.x + map.width * .75, map.y + map.height / 2);
  expect((await shown(page)).x).toBeCloseTo(480, -1);
  // Keyboard: arrows look around, F fits.
  await page.locator('#stage').focus(); await page.keyboard.press('ArrowLeft');
  expect((await shown(page)).x).toBeLessThan(480);
  await page.keyboard.press('f'); expect((await shown(page)).zoom).toBeLessThan(.5);
  // The world size steppers say the same; Undo goes back to the one-screen stage.
  await openTab(page, 'sprite'); await expect(page.locator('#world-wide')).toHaveText('2'); await expect(page.locator('#world-tall')).toHaveText('1');
  await page.locator('#world-tall-more').click(); await expect.poll(() => world(page)).toEqual([60, 40]);
  await expect(page.locator('#stage-map-title')).toHaveText('Map · 2 × 2 screens');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect.poll(() => world(page)).toEqual([60, 20]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect.poll(() => world(page)).toBeNull();
  expect(await shown(page)).toEqual({ x: 0, y: 0, zoom: 1 });
});

test('sprites still drag in the zoomed view; removing a screen moves its sprites onto the rest', async ({ page }) => {
  await install(page); await stageView(page);
  await page.locator('#stage-add-right').click(); await expect.poll(() => world(page)).toEqual([60, 20]);
  await page.locator('#stage').press('Home'); await page.locator('#stage-zoom-out').click();
  // Drag Player (at −100, 0) 50 world units to the right: the zoomed view maps the pointer back to the world.
  const start = await client(page, -100, 0), view = await shown(page), k = (await page.locator('#stage').boundingBox())!.width / 480;
  await drag(page, start, { x: start.x + 50 * view.zoom * k, y: start.y });
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites[0].x).toBeCloseTo(-50, -1);
  expect(await shown(page)).toEqual(view); // dragging a sprite does not pan
  // Put Friend on screen 2, then remove that screen: Friend moves onto screen 1.
  await page.locator('#scene-cards button').nth(1).click(); await page.locator('#scene-x').fill('600'); await page.locator('#scene-x').press('Enter');
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites[1].x).toBe(600);
  // The off-screen chip points to the selected sprite when it is out of view.
  await page.locator('#stage').press('Home');
  await expect(page.locator('#stage-offscreen')).toBeVisible(); await expect(page.locator('#stage-offscreen')).toContainText('Friend →');
  await page.locator('#stage-offscreen').click(); expect((await shown(page)).x).toBeGreaterThan(300);
  await page.locator('#world-wide-less').click(); await expect.poll(() => world(page)).toEqual([30, 20]);
  expect((await saved(page)).workspace.pythonScene.sprites[1].x).toBe(216);
  await expect(page.locator('#world-wide-less')).toBeDisabled();
});

test('the game shows its own camera while it runs; the editing view comes back after Reset', async ({ page }) => {
  await install(page); await stageView(page);
  await page.locator('#stage-add-right').click(); await expect.poll(() => world(page)).toEqual([60, 20]);
  await page.locator('#stage-zoom-out').click(); const editing = await shown(page);
  await page.locator('#run').click(); await expect(page.locator('#stop')).toBeEnabled({ timeout: 60_000 });
  expect((await shown(page)).zoom).toBe(1);
  await expect(page.locator('#stage-zoom-in')).toBeDisabled(); await expect(page.locator('#stage-fit')).toBeDisabled(); await expect(page.locator('#stage-add-right')).toBeHidden();
  await expect(page.locator('#stage-map-note')).toHaveText('Follows the camera while playing');
  await page.locator('#stop').click(); await page.locator('#scene-reset').click();
  expect(await shown(page)).toEqual(editing);
  // The view is an editing aid only: it is not saved with the project.
  expect(JSON.stringify((await saved(page)).workspace.pythonScene)).not.toContain('zoom');
});

test('the small stage in Blocks view pans too and opens the map from a button; Go to script opens Blocks view', async ({ page }) => {
  await install(page); await stageView(page);
  await page.locator('#stage-add-down').click(); await expect.poll(() => world(page)).toEqual([30, 40]);
  await page.locator('#view-blocks').click();
  await expect(page.locator('#stage-map')).toBeHidden(); await expect(page.locator('#stage-map-show')).toBeVisible();
  await expect(page.locator('#stage-zoom-out')).toBeHidden(); await expect(page.locator('#stage-zoom-fit')).toBeVisible();
  await page.locator('#stage-map-show').click(); await expect(page.locator('#stage-map')).toBeVisible();
  await expect(page.locator('#stage-map-title')).toHaveText('Map · 1 × 2 screens');
  // Keyboard users choose a screen on the map with the arrow keys.
  await page.locator('#stage').press('Home'); expect(await shown(page)).toEqual({ x: 0, y: 0, zoom: 1 });
  await page.locator('#stage-map-screens [data-screen="0"]').focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  expect(await shown(page)).toMatchObject({ x: 0, y: -320 });
  await stageView(page); await openTab(page, 'sprite');
  await page.locator('#scene-script-find').click();
  await expect(page.locator('html')).toHaveAttribute('data-view', 'blocks');
  await expect(page.locator('.blocklySelected')).toHaveCount(1);
});

test('a single big world is a Builder tool: Starter hides the world size tools', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } }), page = await context.newPage();
  await install(page);
  // The example uses Builder blocks; keep Starter.
  await page.locator('#level-keep').click(); await expect(page.locator('#level-dialog')).toBeHidden();
  await stageView(page);
  await expect(page.locator('#stage-add-right')).toBeHidden(); await openTab(page, 'sprite'); await expect(page.locator('.world-screens')).toBeHidden();
  await page.locator('#level-select').selectOption('builder');
  await expect(page.locator('#stage-add-right')).toBeVisible(); await expect(page.locator('.world-screens')).toBeVisible();
  await context.close();
});
