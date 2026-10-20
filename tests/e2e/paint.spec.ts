import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { reveal } from './shell';
import { stagePixels } from './stage-pixels';

/** The Paint editor: a full-screen editor for costumes, backdrops and tiles.
 * Pictures are painted at 2× and Done writes every change as one Undo step. */
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const scene = async (page: Page) => (await saved(page)).workspace.pythonScene;
const pngSize = (data: string) => { const bytes = Buffer.from(data.split(',')[1], 'base64'); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; };
async function load(page: Page, file = 'tests/fixtures/scene/sequential.json') {
  await page.goto('/'); await page.locator('#project-file').setInputFiles(file);
  await expect.poll(async () => (await scene(page))?.sprites?.length ?? 0).toBeGreaterThan(0);
}
async function openPaint(page: Page, opener = '#tray-paint') {
  await (await reveal(page, opener)).click();
  await expect(page.locator('#paint-dialog')).toBeVisible(); await expect(page.locator('#paint-loading')).toBeHidden();
}
const doc = (page: Page) => page.locator('#paint-doc-slot canvas');
/** Where stage unit (x, y) of the picture is on screen. */
async function point(page: Page, x: number, y: number) {
  const box = (await page.locator('#paint-board').boundingBox())!, [w, h] = await doc(page).evaluate(c => [(c as HTMLCanvasElement).width / 2, (c as HTMLCanvasElement).height / 2]);
  return { x: box.x + (x + .5) / w * box.width, y: box.y + (y + .5) / h * box.height };
}
const tool = (page: Page, name: string) => page.locator(`.paint-tool[data-tool="${name}"]`).click();
async function drag(page: Page, name: string, from: [number, number], to: [number, number] = from) {
  await tool(page, name); const a = await point(page, ...from), b = await point(page, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
}
/** The picture's pixel at the middle of stage unit (x, y). */
const pixel = (page: Page, x: number, y: number) => doc(page).evaluate((c, p) => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(p.x * 2 + 1, p.y * 2 + 1, 1, 1).data), { x, y });
const swatch = (page: Page, color: string) => page.locator(`.paint-swatch[data-color="${color}"]`).click();
const custom = (page: Page, color: string) => page.locator('#paint-custom-input').fill(color);
/** Done, then wait for the autosave to hold the change. */
async function done(page: Page) {
  const before = JSON.stringify(await scene(page));
  await page.locator('#paint-done').click(); await expect(page.locator('#paint-dialog')).toBeHidden();
  await expect.poll(async () => JSON.stringify(await scene(page)) !== before).toBe(true);
}
async function install(page: Page, project: unknown) { await page.locator('#project-file').setInputFiles({ name: 'paint.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) }); }
type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; [key: string]: unknown };
const b = (type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}): B => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const ref = () => b('scene_sprite', { SPRITE_ID: 'player' });
const print = (value: B) => b('text_print', {}, { TEXT: value });
const chain = (...items: B[]) => { items.slice(1).forEach((b, i) => { items[i].next = { block: b }; }); return items[0]; };
function handlers(project: any, entries: [string, B][]) {
  project.workspace.procedures = entries.map(([event], i) => ({ id: `art${i}`, name: `art_handler_${i}`, async: true, parameters: [{ id: `data${i}`, name: 'payload' }], handler: { event, order: i }, returnTypes: null }));
  project.workspace.blocks.blocks = entries.map(([, body], i) => ({ ...b('py_handler', {}, { BODY: body }), x: 32 + i * 360, y: 32, extraState: { functionId: `art${i}`, signature: project.workspace.procedures[i] } }));
  return project;
}

test('paints a costume with Undo and Redo; Done saves it at 2× as one project Undo step', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await load(page); await openPaint(page);
  await expect(page.locator('#paint-owner')).toHaveText('Player'); await expect(page.locator('#paint-name')).toHaveValue('Bird');
  expect(await doc(page).evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([96, 80]); // the 48 × 40 bird at 2×
  await custom(page, '#ff2030'); await page.locator('#paint-size').fill('3');
  await drag(page, 'brush', [6, 5], [20, 5]); expect(await pixel(page, 12, 5)).toEqual([255, 32, 48, 255]);
  await page.locator('#paint-undo').click(); expect((await pixel(page, 12, 5))[3]).toBe(0);
  await page.locator('#paint-redo').click(); expect(await pixel(page, 12, 5)).toEqual([255, 32, 48, 255]);
  await page.locator('#paint-name').fill('Red bird'); await page.screenshot({ path: info.outputPath('paint-editor.png') }); await done(page);
  const after = await scene(page), asset = after.assets[0];
  expect(asset).toMatchObject({ name: 'Red bird', width: 48, height: 40, resolution: 2 }); expect(pngSize(asset.data)).toEqual([96, 80]);
  expect(after.sprites[0].costume).toBe(asset.id);
  // One project Undo puts the bird back and removes the new costume.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await scene(page)).sprites[0].costume).toBe('bird'); expect((await scene(page)).assets).toEqual([]);
  expect(errors).toEqual([]);
});

test('Pixel mode paints whole squares and keeps blocky art at 1×', async ({ page }) => {
  await load(page); await openPaint(page);
  await page.locator('#paint-new').click(); await page.locator('[data-new-size="32"]').click();
  await expect(page.locator('.paint-card')).toHaveCount(2); expect(await doc(page).evaluate(c => (c as HTMLCanvasElement).width)).toBe(64);
  await page.locator('#paint-pixel').click(); await expect(page.locator('#paint-pixel')).toHaveAttribute('aria-pressed', 'true'); await swatch(page, '#263f4b');
  await drag(page, 'brush', [2, 2], [12, 2]);
  expect(await doc(page).evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(4, 4, 2, 2).data))).toEqual([38, 63, 75, 255, 38, 63, 75, 255, 38, 63, 75, 255, 38, 63, 75, 255]);
  await drag(page, 'rect', [16, 16], [28, 28]); expect(await pixel(page, 20, 20)).toEqual([38, 63, 75, 255]);
  await done(page);
  const after = await scene(page), costume = after.assets.find((a: any) => a.width === 32);
  expect(costume.resolution).toBeUndefined(); expect(pngSize(costume.data)).toEqual([32, 32]);
  expect(after.sprites[0].costumes).toEqual(['bird', costume.id]); expect(after.sprites[0].costume).toBe(costume.id);
});

test('fill, a fading fill, shapes, text, pick and the selection bar all change the picture', async ({ page }) => {
  await load(page); await openPaint(page); await page.locator('#paint-new').click(); await page.locator('[data-new-size="64"]').click();
  await swatch(page, '#263f4b'); await page.locator('#paint-size').fill('2');
  await tool(page, 'rect'); await page.locator('#paint-outline').click(); await drag(page, 'rect', [4, 4], [30, 30]);
  expect(await pixel(page, 4, 16)).toEqual([38, 63, 75, 255]); expect((await pixel(page, 16, 16))[3]).toBe(0);
  await swatch(page, '#e8b94f'); await drag(page, 'fill', [16, 16]); expect(await pixel(page, 16, 16)).toEqual([232, 185, 79, 255]); expect((await pixel(page, 40, 40))[3]).toBe(0);
  // Down fades from the colour at the top to a lighter one at the bottom.
  await page.locator('[data-fill="down"]').click(); await swatch(page, '#478b94'); await drag(page, 'fill', [50, 10]);
  const top = await pixel(page, 50, 0), bottom = await pixel(page, 50, 63); expect(Math.abs(top[0] - 71)).toBeLessThan(4); expect(bottom[0]).toBeGreaterThan(top[0] + 80);
  await tool(page, 'pick'); const gold = await point(page, 16, 16); await page.mouse.click(gold.x, gold.y); await expect(page.locator('#paint-color-name')).toHaveText('Gold');
  // Text: tap, type, Enter.
  await swatch(page, '#263f4b'); await tool(page, 'text'); const spot = await point(page, 6, 40); await page.mouse.click(spot.x, spot.y);
  await expect(page.locator('#paint-text')).toBeVisible(); await page.keyboard.type('Hi'); await page.keyboard.press('Enter'); await expect(page.locator('#paint-text')).toBeHidden();
  expect(await doc(page).evaluate(c => { const d = (c as HTMLCanvasElement).getContext('2d')!.getImageData(12, 80, 30, 26).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128 && d[i] < 90) ink++; return ink; })).toBeGreaterThan(20);
  // Select part of the picture and flip it: a red dot on the left moves to the right.
  await swatch(page, '#d7794c'); await drag(page, 'brush', [6, 20]); const dot = await pixel(page, 6, 20); expect(dot[0]).toBe(215);
  await drag(page, 'select', [2, 2], [33, 33]); await expect(page.locator('#paint-selection-bar')).toBeVisible();
  await page.locator('[data-select="flip-x"]').click(); await page.locator('[data-select="done"]').click(); await expect(page.locator('#paint-selection-bar')).toBeHidden();
  expect((await pixel(page, 29, 20))[0]).toBe(215); expect((await pixel(page, 6, 20))[0]).not.toBe(215);
  // Undo puts the selection back where it was.
  await page.locator('#paint-undo').click(); expect((await pixel(page, 6, 20))[0]).toBe(215);
});

test('frames: copies, reordering, deleting and the speed are saved with the sprite, and the animation plays', async ({ page }, info) => {
  await load(page); await openPaint(page);
  for (const [name, color] of [['Red bird', '#ff0000'], ['Blue bird', '#0000ff']]) {
    await page.locator('#paint-new').click(); await page.locator('[data-new="copy"]').click();
    await custom(page, color); await drag(page, 'fill', [21, 22]); await page.locator('#paint-name').fill(name);
  }
  await expect(page.locator('.paint-card')).toHaveCount(3); expect(await pixel(page, 21, 22)).toEqual([0, 0, 255, 255]);
  // Blue before red, then remove the plain bird.
  await page.locator('#paint-options').click(); await page.locator('[data-card="earlier"]').click();
  await expect(page.locator('.paint-card[aria-selected=true]')).toHaveAttribute('data-index', '1');
  await page.locator('.paint-card[data-index="0"]').click({ button: 'right' }); await page.locator('[data-card="delete"]').click();
  await expect(page.locator('.paint-card')).toHaveCount(2); await expect(page.locator('#paint-name')).toHaveValue('Blue bird');
  await page.locator('#paint-fps').fill('12'); await expect(page.locator('#paint-fps-label')).toHaveText('12 frames a second');
  await page.locator('#paint-play').click(); await expect.poll(() => page.locator('#paint-preview').getAttribute('data-frame')).toBe('1');
  await page.locator('#paint-play').click(); await page.screenshot({ path: info.outputPath('paint-frames.png') });
  await done(page);
  const project = await saved(page), actor = project.workspace.pythonScene.sprites[0];
  const ids = Object.fromEntries(project.workspace.pythonScene.assets.map((a: any) => [a.name, a.id]));
  expect(actor.costumes).toEqual([ids['Blue bird'], ids['Red bird']]); expect(actor.frameSeconds).toBe(.08);
  await install(page, handlers(project, [['start', chain(b('scene_play_animation', {}, { SPRITE: ref() }), print(b('scene_get', { PROPERTY: 'costume_id' }, { SPRITE: ref() })))]]));
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText(ids['Red bird'] + '\n', { timeout: 60_000 });
  await expect.poll(() => page.locator('#stage').evaluate(stagePixels, [140, 160, 1, 1])).toEqual([255, 0, 0, 255]); await page.locator('#stop').click();
  const downloading = page.waitForEvent('download'); await (await reveal(page, '#export')).click();
  const files = unzipSync(await readFile((await (await downloading).path())!)); expect(JSON.parse(strFromU8(files['scene.json'])).sprites[0].costumes).toEqual(actor.costumes);
});

test('nothing is refused: switching costumes after painting keeps every change until Done', async ({ page }) => {
  await load(page); await openPaint(page);
  await page.locator('#paint-new').click(); await page.locator('[data-new="copy"]').click(); await swatch(page, '#9c83ba'); await drag(page, 'brush', [4, 4], [12, 4]);
  await page.locator('.paint-card[data-index="0"]').click(); await expect(page.locator('#paint-name')).toHaveValue('Bird');
  await swatch(page, '#e8b94f'); await drag(page, 'brush', [4, 34], [12, 34]);
  await page.locator('.paint-card[data-index="1"]').click(); expect(await pixel(page, 8, 4)).toEqual([156, 131, 186, 255]);
  await page.locator('#paint-new').click(); await expect(page.locator('#paint-sheet')).toBeVisible(); await page.locator('#paint-sheet-close').click();
  await page.keyboard.press('Escape'); await expect(page.locator('#paint-dialog')).toBeHidden(); // Escape is Done
  await expect.poll(async () => (await scene(page)).assets.length).toBe(2);
});

test('More: canvas size says its limit by the control, and flips, turns and centres the picture', async ({ page }) => {
  await load(page); await openPaint(page);
  await page.locator('#paint-more').click(); await page.locator('[data-more="size"]').click(); await expect(page.locator('#paint-size-box')).toBeVisible();
  await expect(page.locator('#paint-width')).toHaveText('48');
  while (await page.locator('#paint-wider').isEnabled()) await page.locator('#paint-wider').click();
  await expect(page.locator('#paint-width')).toHaveText('256'); await expect(page.locator('#paint-toast')).toContainText('fit within 256 × 256');
  const toast = (await page.locator('#paint-toast').boundingBox())!, wider = (await page.locator('#paint-wider').boundingBox())!;
  expect(Math.abs(toast.y - (wider.y + wider.height))).toBeLessThan(80);
  await page.locator('#paint-size-apply').click(); expect(await doc(page).evaluate(c => (c as HTMLCanvasElement).width)).toBe(512);
  // The bird sits in the middle of the wider canvas; flip and Centre keep it there.
  // The bird's beak was at (40, 19); the wider canvas keeps the bird in the middle, so it is now at (144, 19).
  const beak = await pixel(page, 144, 19); expect(beak[3]).toBe(255);
  await page.locator('#paint-more').click(); await page.locator('[data-more="flip-x"]').click(); expect(await pixel(page, 144, 19)).not.toEqual(beak); expect(await pixel(page, 111, 19)).toEqual(beak);
  await page.locator('#paint-more').click(); await page.locator('[data-more="centre"]').click();
  await page.locator('#paint-more').click(); await page.locator('[data-more="turn"]').click(); expect(await doc(page).evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([80, 512]);
  await page.locator('#paint-undo').click(); expect(await doc(page).evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([512, 80]);
});

test('paints a backdrop that becomes the starting backdrop, switched by events and restored on restart', async ({ page }, info) => {
  await load(page); await openPaint(page, '#scene-paint-backdrop');
  await expect(page.locator('#paint-strip-title')).toHaveText('Backdrops'); await expect(page.locator('.paint-card')).toHaveCount(3); // Meadow, Night and a new one
  await page.locator('#paint-name').fill('My purple sky'); await custom(page, '#553388'); await drag(page, 'fill', [30, 30]); await done(page);
  await expect(page.locator('#scene-backdrop option:checked')).toHaveText('My purple sky');
  const project = await saved(page), id = project.workspace.pythonScene.backdrop; expect(project.workspace.pythonScene.backdrops).toHaveLength(1);
  await install(page, handlers(project, [
    ['key:Space', b('scene_backdrop_set', {}, { BACKDROP: b('scene_backdrop', { BACKDROP_ID: 'backdrop_night' }) })],
    ['backdrop:change', print(b('scene_backdrop_get', { PROPERTY: 'backdrop_name' }))],
  ]));
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', id);
  await page.locator('#stage').focus(); await page.keyboard.press('Space'); await expect(page.locator('#output')).toHaveText('Night\n'); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_night');
  await page.screenshot({ path: info.outputPath('backdrop-story.png') }); await page.locator('#stop').click(); await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Event session running'); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', id); await page.locator('#stop').click();
  await page.reload(); await expect(page.locator('#scene-backdrop option:checked')).toHaveText('My purple sky');
  await expect.poll(() => page.locator('#stage').evaluate(stagePixels, [10, 10, 1, 1])).toEqual([85, 51, 136, 255]);
});

test('the library and a picture become new costumes', async ({ page }) => {
  await load(page); await openPaint(page);
  await page.locator('#paint-new').click(); await page.locator('#paint-dialog [data-new="library"]').click(); await expect(page.locator('#stock-dialog')).toBeVisible();
  await page.locator('[data-stock-id="fox"]').click(); await expect(page.locator('#stock-dialog')).toBeHidden();
  await expect(page.locator('.paint-card')).toHaveCount(2); await expect(page.locator('#paint-name')).toHaveValue('Fox'); expect(await doc(page).evaluate(c => (c as HTMLCanvasElement).width)).toBe(128);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 300; const ctx = c.getContext('2d')!; ctx.fillStyle = '#225577'; ctx.fillRect(0, 0, 600, 300); return c.toDataURL('image/png').slice(22); });
  await page.locator('#paint-new').click(); await page.locator('#paint-file').setInputFiles({ name: 'Ocean.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('.paint-card')).toHaveCount(3); await expect(page.locator('#paint-name')).toHaveValue('Ocean');
  expect(await doc(page).evaluate(c => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([512, 256]); // fitted to 256 × 128
  await done(page);
  const after = await scene(page); expect(after.assets.map((a: any) => [a.name, a.width, a.height])).toEqual([['Fox', 64, 64], ['Ocean', 256, 128]]);
  expect(after.sprites[0].costumes).toHaveLength(3);
});

test('tiles open from the world editor in Pixel mode and stay 1× when they stay blocky', async ({ page }) => {
  await page.goto('/'); await (await reveal(page, '#scene-world-example')).click();
  const grass = (await scene(page)).assets.find((a: any) => a.name === 'Grass tile');
  await (await reveal(page, '#scene-worlds')).click(); await page.locator('#world-costume').selectOption(grass.id); await page.locator('#world-paint-tile').click();
  await expect(page.locator('#paint-dialog')).toBeVisible(); await expect(page.locator('#paint-loading')).toBeHidden();
  await expect(page.locator('#paint-strip-title')).toHaveText('Tiles'); await expect(page.locator('#paint-pixel')).toHaveAttribute('aria-pressed', 'true');
  expect(await doc(page).evaluate(c => (c as HTMLCanvasElement).width)).toBe(16);
  await swatch(page, '#d88da4'); await drag(page, 'brush', [3, 3]); await done(page);
  await expect(page.locator('#world-dialog')).toBeVisible();
  const tile = (await scene(page)).assets.find((a: any) => a.id === grass.id); expect(tile.resolution).toBeUndefined(); expect(pngSize(tile.data)).toEqual([8, 8]); expect(tile.data).not.toBe(grass.data);
});

test('the story example shows its four frames', async ({ page }) => {
  await page.goto('/'); await (await reveal(page, '#scene-story-example')).click(); await openPaint(page);
  await expect(page.locator('.paint-card')).toHaveCount(4); await page.keyboard.press('Escape'); await expect(page.locator('#paint-dialog')).toBeHidden();
});

test('backdrop changes in Program startup reach handlers registered afterward', async ({ page }) => {
  await load(page);
  const project = handlers(await saved(page), [['backdrop:change', print(b('scene_backdrop_get', { PROPERTY: 'backdrop_name' }))]]);
  project.workspace.blocks.blocks.push(b('py_program', {}, { BODY: b('scene_backdrop_set', {}, { BACKDROP: b('scene_backdrop', { BACKDROP_ID: 'backdrop_night' }) }) }));
  await install(page, project); await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Night\n', { timeout: 60_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_night'); await page.locator('#stop').click();
});

test('a project with unreadable artwork is refused without replacing the saved one', async ({ page }) => {
  await load(page); await openPaint(page, '#scene-paint-backdrop'); await page.locator('#paint-name').fill('Ocean'); await custom(page, '#225577'); await drag(page, 'fill', [10, 10]); await done(page);
  const before = await saved(page), invalid = structuredClone(before), bytes = Buffer.alloc(24); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]); bytes.writeUInt32BE(480, 16); bytes.writeUInt32BE(320, 20);
  invalid.workspace.pythonScene.backdrops[0].data = 'data:image/png;base64,' + bytes.toString('base64'); delete invalid.workspace.pythonScene.backdrops[0].resolution;
  await install(page, invalid); await expect(page.locator('#save-state')).toContainText('not a readable PNG');
  expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene); await page.reload(); await expect(page.locator('#scene-backdrop option:checked')).toHaveText('Ocean');
});

test.describe('iPad in landscape', () => {
  test.use({ viewport: { width: 1024, height: 700 }, hasTouch: true });
  test('the editor fits without scrolling, every control is a 44 px target, and touch paints', async ({ page, context }, info) => {
    await load(page); await page.locator('#tray-paint').tap(); await expect(page.locator('#paint-loading')).toBeHidden();
    expect(await page.locator('#paint-dialog').evaluate(d => d.scrollHeight <= d.clientHeight && d.scrollWidth <= d.clientWidth)).toBe(true);
    const small = await page.locator('#paint-dialog').evaluate(d => [...d.querySelectorAll<HTMLElement>('button, input, select')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && (r.width < 43.5 || r.height < 43.5); }).map(e => e.id || e.getAttribute('aria-label') || e.textContent?.trim()));
    expect(small).toEqual([]);
    await page.locator('.paint-swatch[data-color="#9c83ba"]').tap();
    const a = await point(page, 4, 4), z = await point(page, 20, 6), cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: z.x, y: z.y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(await pixel(page, 12, 5)).toEqual([156, 131, 186, 255]);
    await page.screenshot({ path: info.outputPath('paint-ipad.png') });
  });
});
