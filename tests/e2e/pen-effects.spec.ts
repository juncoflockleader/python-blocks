import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; [key: string]: unknown };
const b = (type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}): B => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const num = (n: number) => b('py_number', { VALUE: String(n) });
const txt = (s: string) => b('text', { TEXT: s });
const actor = (id: string, type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}) => b(type, fields, { SPRITE: b('scene_sprite', { SPRITE_ID: id }), ...inputs });
const chain = (...items: B[]) => { items.slice(1).forEach((item, i) => { items[i].next = { block: item }; }); return items[0]; };
const go = (id: string, x: number, y: number) => actor(id, 'scene_go', {}, { X: num(x), Y: num(y) });
const pen = (id: string, down: boolean) => actor(id, 'scene_pen_state', { ACTION: down ? 'pen_down' : 'pen_up' });
const effect = (id: string, name: string, value: number) => actor(id, 'scene_effect_set', { EFFECT: name }, { VALUE: num(value) });
const hide = (id: string) => actor(id, 'scene_visibility', { ACTION: 'hide' });
const print = (s: string) => b('text_print', {}, { TEXT: txt(s) });
const pixel = (page: Page, x: number, y: number) => page.locator('#stage').evaluate((c, p) => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), { x: x + 240, y: 160 - y });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, entries: [string, B][], configure?: (data: any) => void) {
  const data = JSON.parse(await readFile('tests/fixtures/scene/sequential.json', 'utf8')); data.languageVersion = 11; data.workspace.pythonScene.background = '#ffffff';
  data.workspace.procedures = entries.map(([event], i) => ({ id: `h${i}`, name: `handler_${i}`, parameters: [{ id: `p${i}`, name: 'payload' }], async: true, handler: { event, order: i }, returnTypes: null }));
  data.workspace.blocks.blocks = entries.map(([, body], i) => ({ ...b('py_handler', {}, { BODY: body }), x: 32 + i * 420, y: 32, extraState: { functionId: `h${i}`, signature: data.workspace.procedures[i] } }));
  configure?.(data); await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'pen-effects.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function key(page: Page, key: string) { await page.locator('#stage').focus(); await page.keyboard.press(key); }

test('independent sprite pens draw glides while hidden, clear together and start fresh', async ({ page }, info) => {
  await install(page, [
    ['key:d', chain(pen('player', true), hide('player'), actor('player', 'scene_glide', {}, { SECONDS: num(.15), X: num(100), Y: num(5) }), print('red ready'))],
    ['key:b', chain(go('friend', 5, -80), pen('friend', true), hide('friend'), go('friend', 5, 80), print('blue ready'))],
    ['key:c', chain(b('scene_pen_clear'), print('clear'))],
  ], p => {
    p.workspace.pythonScene.sprites[0].y = 5;
    p.workspace.pythonScene.sprites[0].pen = { down: false, color: '#ff0000', width: 8, opacity: 100 };
    p.workspace.pythonScene.sprites[1].pen = { down: false, color: '#0000ff', width: 8, opacity: 100 };
  });
  await run(page); await key(page, 'd'); await expect(page.locator('#output')).toContainText('red ready'); await expect.poll(() => pixel(page, -50, 5)).toEqual([255, 0, 0, 255]);
  await key(page, 'b'); await expect(page.locator('#output')).toContainText('blue ready'); await expect.poll(() => pixel(page, 5, 5)).toEqual([0, 0, 255, 255]);
  await page.screenshot({ path: info.outputPath('sprite-pen.png'), fullPage: true });
  await key(page, 'c'); await expect(page.locator('#output')).toContainText('clear'); await expect.poll(() => pixel(page, 5, 5)).toEqual([255, 255, 255, 255]);
  await expect(page.locator('#scene-live')).toContainText('x 100, y 5');
  await page.locator('#stop').click(); await run(page); await expect.poll(() => pixel(page, -50, 5)).toEqual([255, 255, 255, 255]);
  expect((await saved(page)).workspace.pythonScene.sprites[0].pen.down).toBe(false); await page.locator('#stop').click();
});

test('stamps preserve imported pixels, rotation, size and effects after hidden sprite destruction', async ({ page }) => {
  await page.goto('/');
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 8; c.height = 4; const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 4, 4); ctx.fillStyle = '#0000ff'; ctx.fillRect(4, 0, 4, 4); return c.toDataURL(); });
  await install(page, [['start', chain(
    hide('friend'), go('player', -100, 50), actor('player', 'scene_set', { PROPERTY: 'direction' }, { VALUE: num(90) }), actor('player', 'scene_set', { PROPERTY: 'size' }, { VALUE: num(200) }), hide('player'), actor('player', 'scene_stamp'),
    go('player', 0, 50), actor('player', 'scene_rotation', { STYLE: 'none' }), effect('player', 'color', 120), effect('player', 'ghost', 50), actor('player', 'scene_stamp'), actor('player', 'scene_effect_clear'), actor('player', 'scene_destroy'), print('stamped'),
  )]], p => { p.workspace.pythonScene.assets = [{ id: 'two_colors', name: 'Two colors', width: 8, height: 4, data }]; p.workspace.pythonScene.sprites[0].costume = 'two_colors'; });
  await run(page); await expect(page.locator('#output')).toHaveText('stamped\n');
  await expect.poll(() => pixel(page, -100, 54)).toEqual([255, 0, 0, 255]); expect(await pixel(page, -100, 46)).toEqual([0, 0, 255, 255]);
  expect(await pixel(page, -4, 50)).toEqual([127, 255, 127, 255]); expect(await pixel(page, 4, 50)).toEqual([255, 127, 127, 255]);
  await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '1'); await page.locator('#stop').click();
});

test('all seven sprite effects change real pixels and clear restores the source', async ({ page }) => {
  const values: [string, number][] = [['color', 120], ['brightness', -50], ['ghost', 65], ['whirl', 180], ['fisheye', 100], ['pixelate', 12], ['mosaic', 2]];
  const entries: [string, B][] = [['start', hide('friend')], ...values.map(([name, value], i): [string, B] => [`key:${i}`, chain(actor('player', 'scene_effect_clear'), effect('player', name, value), print(name))]), ['key:c', actor('player', 'scene_effect_clear')]];
  await install(page, entries, p => { p.workspace.pythonScene.sprites[0].size = 200; }); await run(page);
  const pixels = () => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(90, 115, 100, 90).data));
  const before = await pixels();
  for (let i = 0; i < 7; i++) { await key(page, String(i)); await expect.poll(pixels).not.toEqual(before); await key(page, 'c'); await expect.poll(pixels).toEqual(before); }
  await expect(page.locator('#output')).toHaveText('color\nbrightness\nghost\nwhirl\nfisheye\npixelate\nmosaic\n'); await page.locator('#stop').click();
});

test('stage effects leave sprite ink intact and clear removes legacy turtle marks too', async ({ page }) => {
  await install(page, [
    ['start', chain(hide('player'), hide('friend'), b('pen_color', { COLOR: '#e47d4b' }), b('pen_move', {}, { STEPS: num(100) }), go('player', -100, 5), pen('player', true), go('player', 100, 5), print('drawn'))],
    ['key:b', b('scene_stage_effect_set', { EFFECT: 'brightness' }, { VALUE: num(-100) })],
    ['key:c', b('scene_pen_clear')], ['key:r', b('scene_stage_effect_clear')],
  ], p => { p.workspace.pythonScene.sprites[0].pen = { down: false, color: '#ff0000', width: 2, opacity: 100 }; });
  await run(page); await expect(page.locator('#output')).toHaveText('drawn\n'); expect(await pixel(page, 50, 0)).toEqual([228, 125, 75, 255]);
  await key(page, 'b'); await expect.poll(() => pixel(page, -50, 40)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 50, 5)).toEqual([255, 0, 0, 255]);
  await key(page, 'c'); await expect.poll(() => pixel(page, 50, 0)).toEqual([0, 0, 0, 255]); expect(await pixel(page, 50, 5)).toEqual([0, 0, 0, 255]);
  await key(page, 'r'); await expect.poll(() => pixel(page, 50, 5)).toEqual([255, 255, 255, 255]); await page.locator('#stop').click();
});

test('initial appearance edits support Undo, reload, export and malformed-project recovery', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json'); await page.locator('#scene-appearance summary').click();
  await page.locator('#appearance-down').check(); await page.locator('#appearance-color').fill('#123456'); await page.locator('#appearance-width').fill('12'); await page.locator('#appearance-opacity').fill('75'); await page.locator('#appearance-effect-whirl').fill('90'); await page.getByRole('button', { name: 'Apply appearance', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites[0].pen?.width).toBe(12);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#appearance-width')).toHaveValue('3');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.locator('#appearance-width')).toHaveValue('12');
  await page.locator('#appearance-target').selectOption('stage'); await page.locator('#appearance-effect-ghost').fill('50'); await page.getByRole('button', { name: 'Apply appearance', exact: true }).click();
  await page.reload(); await page.locator('#scene-appearance summary').click(); await expect(page.locator('#appearance-width')).toHaveValue('12'); await expect(page.locator('#appearance-effect-whirl')).toHaveValue('90');
  await page.locator('#appearance-target').selectOption('stage'); await expect(page.locator('#appearance-effect-ghost')).toHaveValue('50');
  const download = page.waitForEvent('download'); await page.locator('#export').click(); const files = unzipSync(await readFile((await (await download).path())!)); expect(JSON.parse(strFromU8(files['scene.json'])).effects.ghost).toBe(50);
  const before = await saved(page), invalid = structuredClone(before); invalid.workspace.pythonScene.sprites[0].pen.width = 0;
  await page.locator('#project-file').setInputFiles({ name: 'bad-pen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.locator('#save-state')).toContainText('valid numeric properties'); expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#scene-appearance').scrollIntoViewIfNeeded();
  expect(await page.locator('#scene-appearance').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('appearance-mobile.png'), fullPage: true });
});

test('drawing example creates independent trails and colored stamps then erases with Space', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/'); await page.locator('#scene-drawing-example').click(); await run(page);
  await expect(page.locator('#scene-live')).toContainText('hidden'); await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-ink-count'))).toBeGreaterThan(490);
  await page.locator('#scene-selection').selectOption('friend'); await expect(page.locator('#scene-live')).toContainText('x 100, y 0');
  await page.screenshot({ path: info.outputPath('drawing-example.png'), fullPage: true });
  await key(page, 'Space'); await expect(page.locator('#status')).toHaveText('Event session running'); expect(errors).toEqual([]);
  await page.locator('#stop').click(); await page.locator('#scene-reset').click(); await expect(page.locator('#stage')).toHaveAttribute('data-ink-count', '0');
});
