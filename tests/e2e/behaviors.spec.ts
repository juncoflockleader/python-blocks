import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; [key: string]: unknown };
const b = (type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}): B => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const n = (x: number) => b('py_number', { VALUE: String(x) });
const t = (x: string) => b('text', { TEXT: x });
const self = () => b('scene_self');
const ref = (id = 'player') => b('scene_sprite', { SPRITE_ID: id });
const a = (type: string, fields = {}, inputs: Record<string, B> = {}) => b(type, fields, { SPRITE: self(), ...inputs });
const print = (value: B | string) => b('text_print', {}, { TEXT: typeof value === 'string' ? t(value) : value });
const get = () => a('scene_data_get', {}, { KEY: t('count') });
const set = (value: B) => a('scene_data_set', {}, { KEY: t('count'), VALUE: value });
const wait = (seconds: number) => b('py_wait', {}, { SECONDS: n(seconds) });
const chain = (...items: B[]) => { items.slice(1).forEach((item, i) => { items[i].next = { block: item }; }); return items[0]; };
const clone = () => b('scene_go', {}, { SPRITE: b('scene_clone', {}, { SPRITE: ref() }), X: n(70), Y: n(0) });
const go = (id: string, x: number, y: number) => b('scene_go', {}, { SPRITE: ref(id), X: n(x), Y: n(y) });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, entries: [string, string | null, B][], configure?: (project: any) => void) {
  const p = JSON.parse(await readFile('tests/fixtures/scene/sequential.json', 'utf8')); p.languageVersion = 12;
  p.workspace.pythonScene.sprites[0].data = { count: 1 };
  p.workspace.procedures = entries.map(([event, owner], i) => ({ id: `h${i}`, name: `handler_${i}`, async: true, parameters: [{ id: `p${i}`, name: 'payload' }], handler: { event, order: i, ...(owner ? { sprite: owner } : {}) }, returnTypes: null }));
  p.workspace.blocks.blocks = entries.map(([, , body], i) => ({ ...b('py_handler', {}, { BODY: body }), x: 32 + i * 420, y: 32, extraState: { functionId: `h${i}`, signature: p.workspace.procedures[i] } }));
  configure?.(p); await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'behaviors.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await expect(page.locator('#run')).toBeEnabled();
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }
async function clickStage(page: Page, x: number, y: number) {
  const canvas = page.locator('#stage'); await canvas.scrollIntoViewIfNeeded(); const r = (await canvas.boundingBox())!;
  await page.mouse.click(r.x + (240 + x) / 480 * r.width, r.y + (160 - y) / 320 * r.height);
}

test('real Python clones have independent data and destroy cancels owned waits only', async ({ page }) => {
  await install(page, [
    ['start', null, clone()], ['clone', 'player', chain(set(n(9)), print('clone ready'))],
    ['key:a', 'player', chain(print(get()), set(b('math_arithmetic', { OP: 'ADD' }, { A: get(), B: n(1) })))],
    ['key:w', 'player', chain(print('waiting'), wait(.5), print(a('scene_get', { PROPERTY: 'id' })))],
    ['click', 'player', chain(a('scene_destroy'), print('unreachable'))],
    ['key:p', null, print(b('py_length', {}, { VALUE: b('scene_all') }))],
  ]);
  await run(page); await expect(page.locator('#output')).toHaveText('clone ready\n');
  await key(page, 'a'); await expect(page.locator('#output')).toHaveText('clone ready\n1\n9\n');
  await key(page, 'a'); await expect(page.locator('#output')).toContainText('2\n10\n');
  await key(page, 'w'); await expect(page.locator('#output')).toContainText('waiting\nwaiting\n');
  await clickStage(page, 70, 0); await expect(page.locator('#output')).toContainText('player\n');
  await key(page, 'p'); await expect(page.locator('#output')).toContainText('player\n2\n');
  expect(await page.locator('#output').textContent()).not.toMatch(/runtime_|unreachable/); await expect(page.locator('#status')).toHaveText('Event session running');
  expect((await saved(page)).workspace.pythonScene.sprites[0].data).toEqual({ count: 1 });
  await page.locator('#stop').click(); await run(page); await expect(page.locator('#output')).toHaveText('clone ready\n');
  await key(page, 'a'); await expect(page.locator('#output')).toHaveText('clone ready\n1\n9\n');
});

test('updates repeat without overlapping a slow handler and stop cleanly', async ({ page }) => {
  await install(page, [
    ['start', 'player', chain(print('fresh'), print(get()))],
    ['update', 'player', chain(set(b('math_arithmetic', { OP: 'ADD' }, { A: get(), B: n(1) })), wait(.2), print('tick'))],
    ['key:p', 'player', print(get())],
  ]);
  await run(page); await expect.poll(async () => (await page.locator('#output').textContent())!.split('tick').length).toBeGreaterThan(2);
  await key(page, 'p'); await expect.poll(async () => (await page.locator('#output').textContent())!.trim().split('\n').filter(line => /^\d+$/.test(line)).length).toBe(2);
  const lines = (await page.locator('#output').textContent())!.trim().split('\n'), count = Number(lines.filter(line => /^\d+$/.test(line)).at(-1)), ticks = lines.slice(0, lines.lastIndexOf(String(count))).filter(line => line === 'tick').length;
  expect(count).toBeGreaterThanOrEqual(ticks); expect(count).toBeLessThanOrEqual(ticks + 2);
  await page.locator('#stop').click(); const output = await page.locator('#output').textContent();
  await page.waitForTimeout(300); expect(await page.locator('#output').textContent()).toBe(output);
  await run(page); await expect(page.locator('#output')).toHaveText(/^fresh\n1\n/);
});

test('pixel contact and click targeting ignore transparent holes and honor ghost effects', async ({ page }) => {
  await page.goto('/');
  const assets = await page.evaluate(() => {
    const make = (id: string, width: number, hole = false) => {
      const c = document.createElement('canvas'); c.width = c.height = width; const ctx = c.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, width, width); if (hole) ctx.clearRect(6, 6, 8, 8);
      return { id, name: id, width, height: width, data: c.toDataURL('image/png') };
    }; return [make('ring', 20, true), make('dot', 4)];
  });
  await install(page, [
    ['overlap', 'player', print('enter')], ['separate', 'player', print('leave')],
    ['click', 'player', print('ring clicked')], ['click', 'friend', print('dot clicked')],
    ['key:m', null, go('friend', 9, 0)],
    ['key:h', null, b('scene_visibility', { ACTION: 'hide' }, { SPRITE: ref('friend') })],
    ['key:g', null, chain(b('scene_effect_set', { EFFECT: 'ghost' }, { SPRITE: ref(), VALUE: n(100) }), go('friend', 0, 0), b('scene_visibility', { ACTION: 'show' }, { SPRITE: ref('friend') }))],
    ['key:p', null, chain(print(b('scene_pixels', {}, { SPRITE: ref(), OTHER: ref('friend') })), print(b('scene_pixel_point', {}, { SPRITE: ref(), X: n(0), Y: n(0) })))],
  ], p => { p.workspace.pythonScene.assets = assets; p.workspace.pythonScene.sprites.forEach((s: any, i: number) => Object.assign(s, { x: 0, y: 0, direction: 0, costume: i ? 'dot' : 'ring', layer: i ? 0 : 2, size: 100 })); });
  await run(page); await key(page, 'p'); await expect(page.locator('#output')).toHaveText('False\nFalse\n');
  await clickStage(page, 0, 0); await expect(page.locator('#output')).toHaveText('False\nFalse\ndot clicked\n');
  await key(page, 'm'); await expect(page.locator('#output')).toContainText('enter\n');
  await key(page, 'p'); await expect(page.locator('#output')).toContainText('enter\nTrue\nFalse\n');
  await clickStage(page, 8, 0); await expect(page.locator('#output')).toContainText('ring clicked\n');
  await key(page, 'h'); await expect(page.locator('#output')).toContainText('leave\n');
  await key(page, 'g'); await key(page, 'p'); await expect(page.locator('#output')).toContainText('leave\nFalse\nFalse\n');
  await clickStage(page, 0, 0); await expect(page.locator('#output')).toContainText('leave\nFalse\nFalse\ndot clicked\n');
  await expect(page.locator('#status')).toHaveText('Event session running');
});

test('saved sprite data supports types, rename, Undo, reload and malformed import recovery', async ({ page }, info) => {
  await install(page, [['start', 'player', print(get())]]);
  await page.locator('#scene-data summary').click(); await page.locator('#data-entry').selectOption('count'); await page.locator('#data-value').fill('7'); await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#data-value')).toHaveValue('1');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await expect(page.locator('#data-value')).toHaveValue('7');
  for (const [name, type, value] of [['note', 'text', 'hello'], ['ready', 'boolean', 'true'], ['items', 'list', '[1, 2]'], ['settings', 'dictionary', '{"speed": 3}'], ['empty', 'none', '']]) {
    await page.locator('#data-entry').selectOption(''); await page.locator('#data-name').fill(name); await page.locator('#data-type').selectOption(type); if (type !== 'none') await page.locator('#data-value').fill(value); await page.getByRole('button', { name: 'Save entry', exact: true }).click(); await expect(page.locator('#data-error')).toBeEmpty();
  }
  await page.locator('#data-entry').selectOption('note'); await page.locator('#data-name').fill('greeting'); await page.getByRole('button', { name: 'Save entry', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites[0].data).toEqual({ count: 7, greeting: 'hello', ready: true, items: [1, 2], settings: { speed: 3 }, empty: null });
  await page.reload(); await page.locator('#scene-data summary').click(); await page.locator('#data-entry').selectOption('greeting'); await expect(page.locator('#data-value')).toHaveValue('hello');
  await page.locator('#data-type').selectOption('boolean'); await page.locator('#data-value').fill('"true"'); await page.getByRole('button', { name: 'Save entry', exact: true }).click(); await expect(page.locator('#data-error')).toContainText('does not match');
  const before = await saved(page), invalid = structuredClone(before); invalid.workspace.pythonScene.sprites[0].data = { huge: 'x'.repeat(20000) };
  await page.locator('#project-file').setInputFiles({ name: 'bad-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(page.locator('#save-state')).toContainText('Sprite starting data'); expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#scene-data').scrollIntoViewIfNeeded(); expect(await page.locator('#scene-data').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('sprite-data-mobile.png'), fullPage: true });
});

test('the behavior editor attaches to the selected sprite and preserves identity through rename and Undo', async ({ page }, info) => {
  await install(page, [['start', null, print('ready')]]); await page.locator('#scene-data summary').click(); await page.locator('#data-behavior').click();
  await expect(page.locator('#handler-sprite')).toHaveValue('player'); await page.locator('#handler-name').fill('move_each_update'); await page.locator('#handler-input-source').selectOption('update');
  await page.screenshot({ path: info.outputPath('sprite-behavior-editor.png'), fullPage: true });
  await page.locator('#handler-apply').click(); await expect(page.locator('#python')).toContainText('_pb_scene.on("player", "update", move_each_update)');
  await page.locator('#scene-name').fill('My bird'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click(); await page.locator('#events-manage').click();
  await expect(page.locator('#handler-order')).toContainText('My bird'); await page.locator('#events-close').click();
  await page.locator('#scene-delete').click(); await expect(page.locator('#diagnostics')).toContainText('missing authored sprite'); await expect(page.locator('#run')).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#run')).toBeEnabled();
  await page.reload(); await expect(page.locator('#python')).toContainText('_pb_scene.on("player", "update", move_each_update)');
});

test('behavior errors point to the failing data block after an await', async ({ page }) => {
  const missing = a('scene_data_get', {}, { KEY: t('missing') }), statement = print(missing); statement.id = 'missing-sprite-data';
  await install(page, [['start', 'player', chain(wait(.03), statement)]]); await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('KeyError', { timeout: 60_000 }); await expect(page.locator('#traceback')).toContainText('handler_0');
  await expect(page.locator('g[data-id="missing-sprite-data"]')).toHaveClass(/blocklyHighlighted/);
  await expect(page.locator('#stop')).toBeDisabled();
});

test('behavior example runs independent clones and restores authored state on reset', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/'); await page.locator('#scene-behavior-example').click(); await run(page);
  await expect(page.locator('#output')).toContainText('Space adds a bird'); await expect(page.locator('#scene-live')).not.toContainText('x -100, y 0');
  await key(page, 'Space'); await page.screenshot({ path: info.outputPath('behavior-example.png'), fullPage: true });
  await page.locator('#stop').click(); await page.locator('#scene-reset').click(); await expect(page.locator('#scene-live')).toContainText('x -100, y 0');
  expect((await saved(page)).workspace.pythonScene.sprites).toHaveLength(1); expect(errors).toEqual([]);
});
