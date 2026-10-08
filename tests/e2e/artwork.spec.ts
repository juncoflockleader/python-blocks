import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

async function saved(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!)); }
async function open(page: Page) { await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json'); await page.locator('#scene-art').click(); await expect(page.locator('#art-name')).toHaveValue('Bird'); }
async function point(page: Page, x: number, y: number) { const c = page.locator('#art-canvas'); await c.scrollIntoViewIfNeeded(); const r = (await c.boundingBox())!, size = await c.evaluate(c => ({ width: (c as HTMLCanvasElement).width, height: (c as HTMLCanvasElement).height })); return { x: r.x + (x + .5) / size.width * r.width, y: r.y + (y + .5) / size.height * r.height }; }
async function draw(page: Page, tool: string, x: number, y: number, ex = x, ey = y) {
  await page.locator('#art-tool').selectOption(tool); const start = await point(page, x, y), end = await point(page, ex, ey);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
}
async function pixel(page: Page, x: number, y: number) { return page.locator('#art-canvas').evaluate((c, p) => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), { x, y }); }
async function savedPixel(page: Page, name: string, x: number, y: number) {
  return page.evaluate(async ({ name, x, y }) => {
    const asset = JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.pythonScene.assets.find((a: any) => a.name === name);
    const image = new Image(); image.src = asset.data; await image.decode();
    const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }, { name, x, y });
}
async function paintFrame(page: Page, name: string, color: string) {
  await page.locator('#art-new').click(); await page.locator('#art-name').fill(name); await page.locator('#art-color').fill(color); await draw(page, 'rectangle', 12, 12, 50, 50); await page.locator('#art-save').click(); await expect(page.locator('#art-state')).toContainText('Artwork saved');
}
async function install(page: Page, project: unknown) { await page.locator('#project-file').setInputFiles({ name: 'art-story.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) }); }
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

test('paints original artwork with stroke Undo, persists pixels and manages stable asset identity', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await open(page);
  await paintFrame(page, 'Red actor', '#ff2030'); await expect.poll(async () => (await saved(page)).workspace.pythonScene.assets.length).toBe(1);
  const original = (await saved(page)).workspace.pythonScene.assets[0]; expect(original.name).toBe('Red actor');
  await page.locator('#art-color').fill('#2040ff'); await draw(page, 'brush', 20, 20, 30, 20); expect(await pixel(page, 25, 20)).toEqual([32, 64, 255, 255]);
  await page.locator('#art-undo').click(); expect(await pixel(page, 25, 20)).toEqual([255, 32, 48, 255]); await page.locator('#art-redo').click(); expect(await pixel(page, 25, 20)).toEqual([32, 64, 255, 255]);
  await page.locator('#art-name').fill('Red actor waving'); await page.locator('#art-save').click();
  await page.screenshot({ path: info.outputPath('paint-editor.png'), fullPage: true });
  await page.locator('#art-duplicate').click(); await expect(page.locator('#art-name')).toHaveValue('Red actor waving copy');
  await page.locator('#art-delete').click(); await page.locator('#art-project-undo').click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.assets.length).toBe(2);
  await page.locator('#art-close').click(); await page.reload(); await page.locator('#scene-art').click();
  await page.locator('#art-assets').selectOption(original.id); await expect(page.locator('#art-name')).toHaveValue('Red actor waving'); expect(await pixel(page, 25, 20)).toEqual([32, 64, 255, 255]);
  expect((await saved(page)).workspace.pythonScene.assets.find((a: any) => a.id === original.id).id).toBe(original.id); expect(errors).toEqual([]);
});

test('selection transforms, fill, erasing and canvas sizing operate on draft pixels', async ({ page }) => {
  await open(page); await page.locator('#art-new').click(); await page.locator('#art-color').fill('#123456'); await draw(page, 'rectangle', 5, 5, 15, 15);
  await page.locator('#art-color').fill('#f02030'); await draw(page, 'fill', 10, 10); expect(await pixel(page, 10, 10)).toEqual([240, 32, 48, 255]);
  await draw(page, 'select', 5, 5, 15, 15); await page.locator('#art-canvas').focus(); await page.keyboard.press('Shift+ArrowRight'); await page.locator('#art-deselect').click();
  expect(await pixel(page, 10, 10)).toEqual([0, 0, 0, 0]); expect(await pixel(page, 20, 10)).toEqual([240, 32, 48, 255]);
  await draw(page, 'eraser', 20, 10); expect(await pixel(page, 20, 10)).toEqual([0, 0, 0, 0]); await page.locator('#art-undo').click();
  await page.locator('#art-flip-x').click(); expect(await pixel(page, 43, 10)).toEqual([240, 32, 48, 255]); await page.locator('#art-rotate').click(); expect(await pixel(page, 53, 43)).toEqual([240, 32, 48, 255]);
  await page.locator('#art-width').fill('128'); await page.locator('#art-height').fill('128'); await page.locator('#art-scale').click(); expect(await pixel(page, 106, 86)).toEqual([240, 32, 48, 255]);
  await page.locator('#art-width').fill('64'); await page.locator('#art-height').fill('64'); await page.locator('#art-resize').click(); expect(await pixel(page, 53, 43)).toEqual([0, 0, 0, 0]);
  await page.locator('#art-save').click(); await expect(page.locator('#art-error')).toBeEmpty();
});

test('orders painted frames, previews them and plays the saved animation in real Python', async ({ page }, info) => {
  await open(page); await paintFrame(page, 'Frame red', '#ff0000'); await paintFrame(page, 'Frame blue', '#0000ff');
  await page.locator('#art-frames').selectOption('0'); await page.locator('#art-frame-remove').click(); // Remove the starting built-in bird.
  await page.locator('#art-frames').selectOption('1'); await page.locator('#art-frame-up').click();
  await page.locator('#art-seconds').fill('0.08'); await page.locator('#art-speed-save').click(); await page.locator('#art-play').click();
  await expect(page.locator('#art-play')).toHaveText('Stop preview'); await expect.poll(async () => page.locator('#art-preview').getAttribute('data-frame')).toBe('1');
  await page.screenshot({ path: info.outputPath('frame-editor.png'), fullPage: true }); await page.locator('#art-play').click();
  await page.locator('#art-close').click(); const project = await saved(page); const actor = project.workspace.pythonScene.sprites[0]; const redId = project.workspace.pythonScene.assets.find((a: any) => a.name === 'Frame red').id;
  expect(actor.frameSeconds).toBe(.08); expect(actor.costumes[1]).toBe(redId);
  await install(page, handlers(project, [['start', chain(b('scene_play_animation', {}, { SPRITE: ref() }), print(b('scene_get', { PROPERTY: 'costume_id' }, { SPRITE: ref() })))]]));
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText(redId + '\n', { timeout: 60_000 });
  await expect.poll(() => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(140, 160, 1, 1).data))).toEqual([255, 0, 0, 255]); await page.locator('#stop').click();
  const downloading = page.waitForEvent('download'); await page.locator('#export').click(); const files = unzipSync(await readFile((await (await downloading).path())!)); expect(JSON.parse(strFromU8(files['scene.json'])).sprites[0].costumes).toEqual(actor.costumes);
});

test('paints a backdrop, switches it with events and restores the authored backdrop on restart', async ({ page }, info) => {
  await open(page); await page.locator('#art-kind').selectOption('backdrop'); await expect(page.locator('#art-name')).toHaveValue('Meadow');
  await page.locator('#art-new').click(); await page.locator('#art-name').fill('My purple sky'); await page.locator('#art-color').fill('#553388'); await draw(page, 'fill', 30, 30); await page.locator('#art-save').click(); await page.locator('#art-close').click();
  await expect(page.locator('#scene-backdrop option:checked')).toHaveText('My purple sky'); await expect.poll(async () => (await saved(page)).workspace.pythonScene.backdrops.length).toBe(1);
  const project = await saved(page), id = project.workspace.pythonScene.backdrop;
  await install(page, handlers(project, [
    ['key:Space', b('scene_backdrop_set', {}, { BACKDROP: b('scene_backdrop', { BACKDROP_ID: 'backdrop_night' }) })],
    ['backdrop:change', print(b('scene_backdrop_get', { PROPERTY: 'backdrop_name' }))],
  ]));
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', id);
  await page.locator('#stage').focus(); await page.keyboard.press('Space'); await expect(page.locator('#output')).toHaveText('Night\n'); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_night');
  await page.screenshot({ path: info.outputPath('backdrop-story.png'), fullPage: true }); await page.locator('#stop').click(); await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running'); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', id); await page.locator('#stop').click();
  await page.reload(); await expect(page.locator('#scene-backdrop option:checked')).toHaveText('My purple sky');
  await expect.poll(() => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(10, 10, 1, 1).data))).toEqual([85, 51, 136, 255]);
});

test('retains drafts across closing and protects them from project changes and asset navigation', async ({ page }) => {
  await open(page); await page.locator('#art-new').click(); await draw(page, 'rectangle', 5, 5, 15, 15); await page.locator('#art-assets').selectOption('star');
  await expect(page.locator('#art-error')).toContainText('Save artwork or discard'); await page.locator('#art-close').click();
  await page.locator('#scene-x').fill('30'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click(); await page.locator('#scene-art').click();
  expect(await pixel(page, 10, 10)).toEqual([71, 139, 148, 255]); await page.locator('#art-save').click(); await expect(page.locator('#art-error')).toContainText('project changed');
  await page.locator('#art-save-copy').click(); await expect(page.locator('#art-error')).toBeEmpty(); await expect(page.locator('#art-state')).toContainText('Artwork saved');
});

test('artwork tools fit a narrow viewport and retain original drawing pixels', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page); await paintFrame(page, 'Tiny friend', '#20abef');
  expect(await page.locator('#art-dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#art-canvas').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('artwork-mobile.png'), fullPage: true });
  expect(await pixel(page, 25, 25)).toEqual([32, 171, 239, 255]);
});

test('imports backdrops and rejects malformed image projects without replacing artwork', async ({ page }) => {
  await open(page); await page.locator('#art-kind').selectOption('backdrop'); await expect(page.locator('#art-name')).toHaveValue('Meadow');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 960; c.height = 640; const ctx = c.getContext('2d')!; ctx.fillStyle = '#225577'; ctx.fillRect(0, 0, c.width, c.height); return c.toDataURL('image/png').slice(22); });
  await page.locator('#art-file').setInputFiles({ name: 'Ocean.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await expect(page.locator('#art-width')).toHaveValue('480'); await expect(page.locator('#art-height')).toHaveValue('320');
  await page.locator('#art-save').click(); await page.locator('#art-close').click(); await expect(page.locator('#scene-backdrop option:checked')).toHaveText('Ocean.png');
  const before = await saved(page), invalid = structuredClone(before), bytes = Buffer.alloc(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.writeUInt32BE(480, 16); bytes.writeUInt32BE(320, 20);
  invalid.workspace.pythonScene.backdrops[0].data = 'data:image/png;base64,' + bytes.toString('base64'); await install(page, invalid); await expect(page.locator('#save-state')).toContainText('not a readable PNG');
  expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene); await page.reload(); await expect(page.locator('#scene-backdrop option:checked')).toHaveText('Ocean.png');
});

test('previous-frame overlay remains a preview and never changes saved pixels', async ({ page }) => {
  await open(page); await paintFrame(page, 'Behind red', '#ff0000'); await paintFrame(page, 'Front blue', '#0000ff');
  await draw(page, 'eraser', 25, 25); await page.locator('#art-save').click();
  await expect.poll(() => savedPixel(page, 'Front blue', 25, 25)).toEqual([0, 0, 0, 0]);
  expect(await pixel(page, 25, 25)).toEqual([0, 0, 0, 0]); await page.locator('#art-onion').check();
  await expect.poll(() => pixel(page, 25, 25)).toEqual([255, 0, 0, 64]); await page.locator('#art-save').click();
  await page.locator('#art-onion').uncheck(); expect(await pixel(page, 25, 25)).toEqual([0, 0, 0, 0]);
  await page.locator('#art-close').click(); await page.reload(); await page.locator('#scene-art').click();
  expect(await pixel(page, 25, 25)).toEqual([0, 0, 0, 0]); expect(await pixel(page, 20, 20)).toEqual([0, 0, 255, 255]);
});

test('the story example exposes backdrop events and editable frame sequences', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-story-example').click(); await page.locator('#scene-art').click(); await expect(page.locator('#art-frames option')).toHaveCount(4); await page.locator('#art-close').click();
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_meadow'); await page.locator('#stage').focus(); await page.keyboard.press('Space'); await expect(page.locator('#stage-dialogue')).toContainText('Friend thinks: Night');
  await page.screenshot({ path: info.outputPath('story-example.png'), fullPage: true }); await page.locator('#stop').click();
});

test('backdrop changes in Program startup reach handlers registered afterward', async ({ page }) => {
  await open(page); await page.locator('#art-close').click();
  const project = handlers(await saved(page), [['backdrop:change', print(b('scene_backdrop_get', { PROPERTY: 'backdrop_name' }))]]);
  project.workspace.blocks.blocks.push(b('py_program', {}, { BODY: b('scene_backdrop_set', {}, { BACKDROP: b('scene_backdrop', { BACKDROP_ID: 'backdrop_night' }) }) }));
  await install(page, project); await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('Night\n', { timeout: 60_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_night'); await page.locator('#stop').click();
});
