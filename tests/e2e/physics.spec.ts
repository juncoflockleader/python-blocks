import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';

type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; [key: string]: unknown };
const b = (type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}): B => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const n = (x: number) => b('py_number', { VALUE: String(x) });
const t = (x: string) => b('text', { TEXT: x });
const ref = (id = 'player') => b('scene_sprite', { SPRITE_ID: id });
const self = () => b('scene_self');
const a = (type: string, fields = {}, inputs: Record<string, B> = {}) => b(type, fields, { SPRITE: self(), ...inputs });
const print = (value: B | string) => b('text_print', {}, { TEXT: typeof value === 'string' ? t(value) : value });
const chain = (...items: B[]) => { items.slice(1).forEach((item, i) => { items[i].next = { block: item }; }); return items[0]; };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, configure?: (p: any) => void, entries: [string, string | null, B][] = []) {
  const p = JSON.parse(await readFile('tests/fixtures/scene/sequential.json', 'utf8')); p.languageVersion = 13;
  p.workspace.procedures = entries.map(([event, kind], i) => ({ id: `h${i}`, name: `handler_${i}`, async: true, parameters: [{ id: `p${i}`, name: 'payload' }], handler: { event, order: i, ...(kind ? { kind } : {}) }, returnTypes: null }));
  p.workspace.blocks.blocks = entries.length ? entries.map(([, , body], i) => ({ ...b('py_handler', {}, { BODY: body }), x: 32 + i * 420, y: 32, extraState: { functionId: `h${i}`, signature: p.workspace.procedures[i] } })) : [b('py_program')];
  configure?.(p); await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) }); await expect(page.locator('#run')).toBeEnabled();
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }
async function position(page: Page) {
  const match = (await page.locator('#scene-live').textContent())!.match(/x (-?[\d.]+), y (-?[\d.]+)/)!; return { x: Number(match[1]), y: Number(match[2]) };
}

test('game presets run without a handler, survive Undo and export, and fit narrow screens', async ({ page }, info) => {
  await install(page); await page.locator('#scene-motion summary').click(); await page.locator('#motion-preset').selectOption('bouncing'); await page.locator('#motion-use-preset').click();
  await page.locator('#motion-vx').fill('170'); await page.getByRole('button', { name: 'Apply game settings', exact: true }).click(); await expect(page.locator('#python')).toContainText('_pb_scene.enable_motion()');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#motion-body')).toHaveValue('off');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.locator('#motion-vx')).toHaveValue('170'); await page.reload();
  await run(page); await expect.poll(async () => (await position(page)).x).toBeGreaterThan(-70);
  await page.locator('#stop').click(); const stopped = await position(page); await page.waitForTimeout(100); expect(await position(page)).toEqual(stopped);
  await page.locator('#scene-reset').click(); expect(await position(page)).toEqual({ x: -100, y: 0 });
  const download = page.waitForEvent('download'); await page.locator('#export').click(); const files = unzipSync(await readFile((await (await download).path())!)); expect(JSON.parse(strFromU8(files['scene.json'])).sprites[0].motion.vx).toBe(170);
  await page.locator('#scene-motion summary').click(); await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#scene-motion').scrollIntoViewIfNeeded();
  expect(await page.locator('#scene-motion').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); await page.screenshot({ path: info.outputPath('game-settings-mobile.png'), fullPage: true });
  const original = await saved(page), invalid = structuredClone(original); invalid.workspace.pythonScene.sprites[0].motion.vx = 2001;
  await page.locator('#project-file').setInputFiles({ name: 'bad-motion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) }); await expect(page.locator('#save-state')).toContainText('Sprite motion needs'); expect((await saved(page)).workspace.pythonScene).toEqual(original.workspace.pythonScene);
});

test('controller focus, opposing buttons and gravity work with the stage floor', async ({ page }) => {
  await install(page, p => Object.assign(p.workspace.pythonScene.sprites[0], { y: -140, motion: { body: 'moving', ay: -600, edges: 'stop', controller: 'arrows', speedX: 120, speedY: 0 } }));
  await run(page); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect.poll(async () => (await position(page)).x).toBeGreaterThan(-65);
  await page.keyboard.down('ArrowLeft'); await expect(page.locator('#scene-live')).toContainText('vx 0'); await page.keyboard.up('ArrowLeft'); await expect(page.locator('#scene-live')).toContainText('vx 120');
  await page.locator('#event-name').focus(); await expect(page.locator('#scene-live')).toContainText('vx 0'); const paused = await position(page); await page.waitForTimeout(120); expect(await position(page)).toEqual(paused); await page.keyboard.up('ArrowRight');
  expect((await position(page)).y).toBe(-140); await page.locator('#stop').click(); await run(page); await expect(page.locator('#scene-live')).toContainText('vx 0');
});

test('a maximum-speed body hits a one-pixel wall, emits its normal, and bounces', async ({ page }) => {
  await page.goto('/'); const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1; c.height = 200; const ctx = c.getContext('2d')!; ctx.fillRect(0, 0, 1, 200); return c.toDataURL(); });
  const payload = (key: string) => b('py_item_get', {}, { COLLECTION: b('py_get', { SYMBOL: 'param:p0' }), KEY: t(key) });
  await install(page, p => {
    p.workspace.pythonScene.assets = [{ id: 'thin', name: 'Thin wall', width: 1, height: 200, data: png }];
    Object.assign(p.workspace.pythonScene.sprites[0], { x: 0, y: 0, costume: 'box', size: 5, kind: 'runner', motion: { body: 'moving', vx: 2000, response: 'slide' } });
    Object.assign(p.workspace.pythonScene.sprites[1], { x: 15, y: 0, costume: 'thin', motion: { body: 'wall' } });
  }, [['collision', 'runner', chain(print(payload('other')), print(payload('normal_x')))], ['key:b', 'runner', chain(a('scene_motion_response', { MODE: 'bounce' }), a('scene_motion_set', { PROPERTY: 'vx' }, { VALUE: n(2000) }))]]);
  await run(page); await expect(page.locator('#output')).toHaveText('friend\n-1\n'); await expect.poll(async () => (await position(page)).x).toBe(13.4);
  await key(page, 'b'); await expect.poll(async () => (await position(page)).x).toBeLessThan(0); await expect(page.locator('#scene-live')).toContainText('vx -2000');
});

test('kind handlers configure fresh projectiles and lifetime cancels their waiting activities', async ({ page }) => {
  const fire = b('scene_fire', {}, { SPRITE: ref(), COSTUME: b('scene_costume', { COSTUME_ID: 'ball' }), VX: n(0), VY: n(0), SECONDS: n(.2) });
  await install(page, undefined, [
    ['key:f', null, fire], ['created', 'projectile', chain(print('shot created'), a('scene_set', { PROPERTY: 'size' }, { VALUE: n(20) }), b('py_wait', {}, { SECONDS: n(.5) }), print('must be cancelled'))],
    ['key:p', null, print(b('py_length', {}, { VALUE: b('scene_of_kind', {}, { KIND: t('projectile') }) }))],
  ]);
  await run(page); await key(page, 'f'); await expect(page.locator('#output')).toHaveText('shot created\n'); await page.waitForTimeout(300); await key(page, 'p'); await expect(page.locator('#output')).toHaveText('shot created\n0\n');
  await page.waitForTimeout(250); expect(await page.locator('#output').textContent()).not.toContain('must be cancelled'); await expect(page.locator('#status')).toHaveText('Event session running');
  await page.locator('#stop').click(); await run(page); await key(page, 'p'); await expect(page.locator('#output')).toHaveText('0\n');
});

test('kind handler forms persist metadata and reject conflicting or invalid imports', async ({ page }, info) => {
  await install(page); await page.locator('#events-manage').click(); await page.locator('#handler-name').fill('new_shot'); await page.locator('#handler-sprite').selectOption(':kind');
  await page.locator('#handler-kind').fill('projectile'); await page.locator('#handler-input-source').selectOption('created'); await page.screenshot({ path: info.outputPath('kind-handler-editor.png'), fullPage: true });
  await page.locator('#handler-apply').click(); await expect(page.locator('#python')).toContainText('_pb_scene.on_kind("projectile", "created", new_shot)');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#python')).not.toContainText('new_shot'); await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload();
  await expect(page.locator('#python')).toContainText('_pb_scene.on_kind("projectile", "created", new_shot)');
  const original = await saved(page), invalid = structuredClone(original); invalid.workspace.procedures[0].handler.sprite = 'player';
  await page.locator('#project-file').setInputFiles({ name: 'bad-kind.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) }); await expect(page.locator('#save-state')).toContainText('kind behavior'); expect((await saved(page)).workspace).toEqual(original.workspace);
});

test('invalid motion reports its block and an old project still runs after recovery', async ({ page }) => {
  const bad = a('scene_motion_set', { PROPERTY: 'vx' }, { VALUE: n(2001) }); bad.id = 'bad-velocity';
  await install(page, p => { p.workspace.pythonScene.sprites[0].kind = 'player'; }, [['start', 'player', bad]]); await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('vx needs finite numbers', { timeout: 60_000 }); await expect(page.locator('g[data-id="bad-velocity"]')).toHaveClass(/blocklyHighlighted/);
  await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json'); await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
});

test('the editable platformer can shoot its target and jump all the way to the goal', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-game-example').click(); await run(page); await expect(page.locator('#output')).toContainText('Arrow keys move');
  await key(page, 'f'); await expect(page.locator('#output')).toContainText('Target hit!');
  async function jumpTo(x: number, floorY: number) {
    await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await page.keyboard.press('Space');
    await expect.poll(async () => (await position(page)).x, { intervals: [20], timeout: 3000 }).toBeGreaterThan(x);
    await page.keyboard.up('ArrowRight'); await expect.poll(async () => Math.abs((await position(page)).y - floorY), { intervals: [30], timeout: 3000 }).toBeLessThan(.2);
  }
  await jumpTo(-90, -63); await jumpTo(20, -5);
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect.poll(async () => (await position(page)).x, { intervals: [20] }).toBeGreaterThan(55); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowRight'); await page.keyboard.press('Space'); await expect(page.locator('#output')).toContainText('Course complete!', { timeout: 5000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#stage-dialogue')).toContainText('You reached the star!'); await page.screenshot({ path: info.outputPath('platformer-complete.png'), fullPage: true });
  const finished = await position(page); await page.waitForTimeout(100); expect(await position(page)).toEqual(finished);
  await page.locator('#stop').click(); await run(page); await expect(page.locator('#output')).not.toContainText('Course complete!'); await key(page, 'f'); await expect(page.locator('#output')).toContainText('Target hit!');
});
