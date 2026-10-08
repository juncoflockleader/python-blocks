import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('src/scene/world-example.json', 'utf8'));
const b = (type: string, fields: Record<string, unknown> = {}, inputs: Record<string, any> = {}): any => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const n = (v: number) => b('py_number', { VALUE: String(v) });
const t = (v: string) => b('text', { TEXT: v });
const print = (v: any) => b('text_print', {}, { TEXT: typeof v === 'string' ? t(v) : v });
const ref = () => b('scene_sprite', { SPRITE_ID: 'player' });
const chain = (...blocks: any[]) => { blocks.slice(1).forEach((next, i) => blocks[i].next = { block: next }); return blocks[0]; };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, edit?: (p: any) => void, handlers?: [string, string | null, any][]) {
  await page.goto('/'); const project = structuredClone(fixture); edit?.(project);
  if (handlers) {
    project.workspace.procedures = handlers.map(([event, sprite], i) => ({ id: 'h' + i, name: 'handler_' + i, async: true, parameters: [{ id: 'p' + i, name: 'payload' }], handler: { event, order: i, ...(sprite ? { sprite } : {}) } }));
    project.workspace.blocks.blocks = handlers.map(([, , body], i) => ({ type: 'py_handler', id: 'hblock' + i, x: 40, y: 40 + i * 200, extraState: { functionId: 'h' + i }, inputs: { BODY: { block: body } } }));
  }
  await page.locator('#project-file').setInputFiles({ name: 'world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) }); await expect.poll(async () => (await saved(page))?.workspace?.pythonScene).toEqual(project.workspace.pythonScene);
  await expect.poll(async () => (await saved(page))?.workspace?.procedures?.map((h: any) => h.id)).toEqual(project.workspace.procedures.map((h: any) => h.id));
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
const position = async (page: Page) => { const [, x, y] = (await page.locator('#scene-live').innerText()).match(/x (-?[\d.]+), y (-?[\d.]+)/)!; return { x: Number(x), y: Number(y) }; };
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }

// Inspector tests interact with the shipped editor, including keyboard painting.
test('authors named maps, paints and fills with Undo, resizes and persists at a narrow width', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-worlds').click(); await page.locator('#world-new').click();
  await page.locator('#world-name').fill('Test garden'); await page.locator('#world-columns').fill('40'); await page.locator('#world-rows').fill('10'); await page.locator('#world-size').selectOption('32'); await page.getByRole('button', { name: 'Apply world settings' }).click();
  await page.locator('#world-costume').selectOption('star'); await page.locator('#world-solid').check(); await page.locator('#world-map').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.worlds[0].map.tiles.slice(0, 3)).toEqual(['star', 'star', null]);
  await page.locator('#world-undo').click(); await expect.poll(async () => (await saved(page)).workspace.pythonScene.worlds[0].map.tiles[1]).toBeNull();
  await page.locator('#world-redo').click(); await page.locator('#world-tool').selectOption('fill'); await page.locator('#world-costume').selectOption('ball'); await page.locator('#world-map').focus(); await page.keyboard.press('Enter');
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.worlds[0].map.tiles.slice(0, 2)).toEqual(['ball', 'ball']);
  await page.locator('#world-columns').fill('1'); await page.getByRole('button', { name: 'Apply world settings' }).click(); await page.locator('#world-undo').click(); await expect(page.locator('#world-columns')).toHaveValue('40');
  await page.locator('#world-tool').selectOption('rectangle'); await page.locator('#world-map').scrollIntoViewIfNeeded();
  const mapBox = (await page.locator('#world-map').boundingBox())!;
  await page.mouse.move(mapBox.x + mapBox.width * 2.5 / 40, mapBox.y + mapBox.height * 1.5 / 10); await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 4.5 / 40, mapBox.y + mapBox.height * 2.5 / 10); await page.mouse.up();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.worlds[0].map.tiles.slice(82, 85)).toEqual(['ball', 'ball', 'ball']);
  await page.locator('#world-undo').click(); await expect.poll(async () => (await saved(page)).workspace.pythonScene.worlds[0].map.tiles[82]).toBeNull();
  await page.locator('#world-copy').click(); await expect(page.locator('#world-select option')).toHaveCount(3); await page.locator('#world-name').fill('Copy garden'); await page.getByRole('button', { name: 'Apply world settings' }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: info.outputPath('world-editor-mobile.png'), fullPage: true });
  await page.locator('#world-map').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('world-map-mobile.png') });
  await page.locator('#world-zoom').selectOption('32'); await expect.poll(async () => page.locator('#world-map').evaluate(c => c.clientWidth)).toBeGreaterThan(1000);
  expect(await page.locator('#world-dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await page.locator('#world-close').click(); await page.reload(); await page.locator('#scene-worlds').click(); await expect(page.locator('#world-name')).toHaveValue('Copy garden');
  const project = await saved(page); expect(project.workspace.pythonScene.worlds[0].map.tiles[0]).toBe('ball'); expect(project.workspace.pythonScene.worlds[1].map.walls[0]).toBe(true);
});

test('camera overview and local sprite placement survive save and reload', async ({ page }, info) => {
  await install(page); await page.locator('#scene-worlds').click(); await page.locator('#world-tool').selectOption('view');
  await page.locator('#world-map').scrollIntoViewIfNeeded(); const box = (await page.locator('#world-map').boundingBox())!; await page.mouse.click(box.x + box.width * 28.5 / 40, box.y + box.height * 5.5 / 10); await page.locator('#world-close').click();
  await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-camera-x'))).toBe(672);
  await page.locator('#scene-add').click(); await page.locator('#scene-name').fill('Far beacon'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  await expect(page.locator('#scene-world')).toHaveValue('meadow'); await expect(page.locator('#scene-x')).toHaveValue('672');
  await page.locator('#stage').scrollIntoViewIfNeeded(); const stage = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2); await page.mouse.down(); await page.mouse.move(stage.x + stage.width * .6, stage.y + stage.height / 2); await page.mouse.up();
  await expect(page.locator('#scene-x')).toHaveValue('720'); await page.screenshot({ path: info.outputPath('world-placement.png'), fullPage: true });
  await page.reload(); await page.locator('#scene-selection').selectOption({ label: 'Far beacon · Meadow passage' }); await expect(page.locator('#scene-x')).toHaveValue('720');
  const project = await saved(page); expect(project.workspace.pythonScene.worlds[0].camera.follow).toBeNull(); expect(project.workspace.pythonScene.sprites.at(-1).world).toBe('meadow');
});

test('the editable adventure opens a tile gate, scrolls, enters a second world and restarts cleanly', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-world-example').click(); await run(page); await expect(page.locator('#stage')).toHaveAttribute('data-world', 'meadow');
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect(page.locator('#output')).toContainText('Gate opened!', { timeout: 5000 });
  await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-camera-x'))).toBeGreaterThan(250);
  await page.screenshot({ path: info.outputPath('scrolling-meadow.png'), fullPage: true });
  await expect(page.locator('#stage')).toHaveAttribute('data-world', 'cavern', { timeout: 8000 }); await expect(page.locator('#output')).toContainText('Journey complete!', { timeout: 5000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#stage-dialogue')).toContainText('Both worlds explored!'); await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '2'); await page.screenshot({ path: info.outputPath('worlds-complete.png'), fullPage: true });
  const authored = await saved(page); expect(authored.workspace.pythonScene.world).toBe('meadow'); expect(authored.workspace.pythonScene.worlds[0].map.walls[5 * 40 + 14]).toBe(true);
  await key(page, 'r'); await expect.poll(async () => (await position(page)).x).toBe(-128); await expect(page.locator('#scene-live')).toContainText('vx 0'); await expect(page.locator('#stage-dialogue')).toBeEmpty();
  await page.locator('#stop').click(); await run(page); await expect(page.locator('#stage')).toHaveAttribute('data-world', 'meadow'); await expect(page.locator('#output')).not.toContainText('Gate opened!');
});

test('world coordinates reach pointer and pixel-click handlers and runtime tile edits render in place', async ({ page }) => {
  await install(page, p => { p.workspace.pythonScene.sprites[0].x = 600; p.workspace.pythonScene.sprites[0].y = 0; p.workspace.pythonScene.sprites[0].motion = {}; }, [
    ['click', 'player', print('world sprite clicked')],
    ['stage:click', null, chain(print(b('scene_pointer', { PROPERTY: 'pointer_x' })), print(b('scene_pointer', { PROPERTY: 'pointer_y' })))],
    ['key:t', null, b('scene_tile_set', {}, { COLUMN: n(20), ROW: n(5), COSTUME: b('scene_costume', { COSTUME_ID: 'box' }), ENABLED: b('logic_boolean', { BOOL: 'FALSE' }) })],
  ]);
  await run(page); await expect(page.locator('#stage')).toHaveAttribute('data-camera-x', '600');
  await page.locator('#stage').scrollIntoViewIfNeeded(); const stage = (await page.locator('#stage').boundingBox())!; await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2);
  await expect(page.locator('#output')).toContainText('world sprite clicked'); await expect(page.locator('#output')).toContainText('600\n0');
  const pixel = () => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(56, 176, 1, 1).data));
  const before = await pixel(); await key(page, 't'); await expect.poll(pixel).not.toEqual(before); expect((await saved(page)).workspace.pythonScene.worlds[0].map.tiles[220]).toBeNull();
  await page.locator('#stop').click(); await run(page); await expect.poll(pixel).toEqual(before);
});

test('switching worlds cancels sleeping local behaviors and initializes newly active local sprites', async ({ page }) => {
  await install(page, p => { p.workspace.pythonScene.sprites[0].motion = {}; }, [
    ['start', 'meadow_flag', chain(print('local starts'), b('py_wait', {}, { SECONDS: n(1) }), print('old world must not finish'))],
    ['created', 'cave_flag', print('cave created')],
    ['key:n', null, b('scene_world_set', {}, { WORLD: b('scene_world', { WORLD_ID: 'cavern' }) })],
  ]);
  await run(page); await expect(page.locator('#output')).toContainText('local starts'); await key(page, 'n'); await expect(page.locator('#output')).toContainText('cave created'); await page.waitForTimeout(1100);
  expect(await page.locator('#output').innerText()).not.toContain('old world must not finish'); await expect(page.locator('#status')).toHaveText('Event session running'); await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '2');
});

test('malformed worlds preserve the project and tile runtime errors identify their block', async ({ page }) => {
  await install(page); const project = await saved(page), invalid = structuredClone(project); invalid.workspace.pythonScene.worlds[0].map.tiles.pop();
  await page.locator('#project-file').setInputFiles({ name: 'bad-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) }); await expect(page.locator('#save-state')).toContainText('Worlds need'); expect((await saved(page)).workspace).toEqual(project.workspace);
  const bad = b('scene_tile_set', {}, { COLUMN: n(64), ROW: n(0), COSTUME: b('scene_costume', { COSTUME_ID: 'box' }), ENABLED: b('logic_boolean', { BOOL: 'TRUE' }) }); bad.id = 'bad-tile';
  await install(page, undefined, [['start', null, bad]]); await page.locator('#run').click(); await expect(page.locator('#output')).toContainText('outside this world', { timeout: 60_000 }); await expect(page.locator('g[data-id="bad-tile"]')).toHaveClass(/blocklyHighlighted/);
});

test('world pen marks remain anchored while panning and clear when the world restarts', async ({ page }) => {
  const actor = (type: string, fields = {}, inputs = {}) => b(type, fields, { SPRITE: ref(), ...inputs });
  await install(page, p => { Object.assign(p.workspace.pythonScene.sprites[0], { x: 500, y: 0, motion: {} }); p.workspace.pythonScene.worlds[0].camera.follow = null; }, [
    ['start', null, chain(actor('scene_pen_color', {}, { COLOR: t('#ff0000') }), actor('scene_pen_set', { PROPERTY: 'width' }, { VALUE: n(6) }), actor('scene_pen_state', { ACTION: 'pen_down' }), actor('scene_go', {}, { X: n(600), Y: n(0) }), actor('scene_pen_state', { ACTION: 'pen_up' }), print('ink ready'))],
    ['key:c', null, b('scene_camera_go', {}, { X: n(500), Y: n(0) })], ['key:b', null, b('scene_camera_go', {}, { X: n(0), Y: n(0) })], ['key:r', null, b('scene_world_restart')],
  ]);
  await run(page); await expect(page.locator('#output')).toContainText('ink ready');
  const pixel = () => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(280, 160, 1, 1).data));
  const original = await pixel(); await key(page, 'c'); await expect.poll(pixel).toEqual([255, 0, 0, 255]);
  await key(page, 'b'); await expect.poll(pixel).toEqual(original); await key(page, 'c'); await expect.poll(pixel).toEqual([255, 0, 0, 255]);
  await key(page, 'r'); await key(page, 'c'); await expect.poll(pixel).not.toEqual([255, 0, 0, 255]);
});
