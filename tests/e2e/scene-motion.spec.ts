import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

type B = { type: string; fields?: Record<string, string>; inputs?: Record<string, { block: B }>; next?: { block: B }; [key: string]: unknown };
const block = (type: string, fields: Record<string, string> = {}, inputs: Record<string, B> = {}): B => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([key, b]) => [key, { block: b }])) });
const text = (value: string) => block('text', { TEXT: value });
const ref = () => block('scene_sprite', { SPRITE_ID: 'player' });
const num = (n: number) => block('py_number', { VALUE: String(n) });
const print = (value: B) => block('text_print', {}, { TEXT: value });
const chain = (...items: B[]) => { items.slice(1).forEach((b, i) => { items[i].next = { block: b }; }); return items[0]; };
async function project(page: Page, handlers: [string, B][]) {
  const data = JSON.parse(await readFile('tests/fixtures/scene/sequential.json', 'utf8')); data.languageVersion = 9;
  data.workspace.procedures = handlers.map(([event], i) => ({ id: `h${i}`, name: `handler_${i}`, parameters: [{ id: `p${i}`, name: 'payload' }], async: true, handler: { event, order: i }, returnTypes: null }));
  data.workspace.blocks.blocks = handlers.map(([, body], i) => ({ ...block('py_handler', {}, { BODY: body }), id: `b${i}`, x: 32 + i * 400, y: 32, extraState: { functionId: `h${i}`, signature: data.workspace.procedures[i] } }));
  await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'story.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function point(page: Page, x: number, y: number) { await page.locator('#stage').scrollIntoViewIfNeeded(); const r = (await page.locator('#stage').boundingBox())!; return { x: r.x + (x + 240) / 480 * r.width, y: r.y + (160 - y) / 320 * r.height }; }

test('motion example combines independent bouncing, pointer following and dialogue', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.locator('#scene-motion-example').click(); await run(page);
  await expect(page.locator('#stage-dialogue')).toContainText('Hold the pointer');
  const target = await point(page, -50, 50); await page.mouse.move(target.x, target.y); await page.mouse.down();
  await expect(page.locator('#scene-live')).toContainText('x -50, y 50');
  await page.keyboard.press('Space'); await expect(page.locator('#output')).toHaveText('True\n');
  await page.mouse.up(); await page.keyboard.press('Space'); await expect(page.locator('#output')).toHaveText('True\nFalse\n');
  await page.locator('#scene-selection').selectOption('friend'); await expect.poll(async () => await page.locator('#scene-live').textContent()).not.toBe('Friend: x 70, y 0');
  await page.screenshot({ path: info.outputPath('motion-example.png'), fullPage: true });
  expect(errors).toEqual([]); await page.locator('#stop').click(); await page.locator('#scene-reset').click();
  await page.locator('#scene-selection').selectOption('player'); await expect(page.locator('#scene-x')).toHaveValue('-100'); await expect(page.locator('#stage-dialogue')).toBeEmpty();
  await page.reload(); await expect(page.locator('#scene-rotation')).toHaveValue('left-right');
});

test('pointer capture releases outside the stage and focus loss clears held state', async ({ page }) => {
  await project(page, [
    ['stage:press', print(text('press'))], ['stage:release', print(text('release'))],
    ['key:Space', print(block('scene_pointer', { PROPERTY: 'pointer_down' }))],
    ['probe', print(block('scene_pointer', { PROPERTY: 'pointer_down' }))],
  ]); await run(page);
  const center = await point(page, 0, 0); const r = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await expect(page.locator('#output')).toHaveText('press\n');
  await page.mouse.move(r.x + r.width + 8, center.y, { steps: 100 }); await page.mouse.up();
  await expect(page.locator('#output')).toHaveText('press\nrelease\n');
  await page.keyboard.press('Space'); await expect(page.locator('#output')).toHaveText('press\nrelease\nFalse\n');
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await expect(page.locator('#output')).toHaveText('press\nrelease\nFalse\npress\n');
  await page.keyboard.press('Tab'); await page.mouse.up();
  await page.locator('#event-name').fill('probe'); await page.locator('#event-send').click();
  await expect(page.locator('#output')).toHaveText('press\nrelease\nFalse\npress\nFalse\n');
  await expect(page.locator('#status')).toHaveText('Event session running'); await page.locator('#stop').click();
});

test('speech timers cannot erase newer dialogue and hidden or destroyed sprites have no bubbles', async ({ page }, info) => {
  const say = (message: string, style = 'say') => block('scene_say', { STYLE: style }, { SPRITE: ref(), TEXT: text(message) });
  await project(page, [
    ['key:a', chain(block('scene_say_for', { STYLE: 'say' }, { SPRITE: ref(), TEXT: text('First message'), SECONDS: num(1) }), print(text('old timer finished')))],
    ['key:b', say('A newer thought', 'think')],
    ['key:h', block('scene_visibility', { ACTION: 'hide' }, { SPRITE: ref() })],
    ['key:s', block('scene_visibility', { ACTION: 'show' }, { SPRITE: ref() })],
    ['key:d', block('scene_destroy', {}, { SPRITE: ref() })],
  ]); await run(page); await page.locator('#stage').focus(); await page.keyboard.press('a');
  await expect(page.locator('#stage-dialogue')).toHaveText('Player says: First message'); await page.keyboard.press('b');
  await expect(page.locator('#output')).toHaveText('old timer finished\n'); await expect(page.locator('#stage-dialogue')).toHaveText('Player thinks: A newer thought');
  await page.screenshot({ path: info.outputPath('thought-bubble.png'), fullPage: true });
  await page.keyboard.press('h'); await expect(page.locator('#stage-dialogue')).toBeEmpty();
  await page.keyboard.press('s'); await expect(page.locator('#stage-dialogue')).toContainText('newer thought');
  await page.keyboard.press('d'); await expect(page.locator('#stage-dialogue')).toBeEmpty(); await page.locator('#stop').click();
});

test('rotation styles preserve art orientation and survive Undo and reload', async ({ page }) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json');
  await page.locator('#scene-direction').fill('180'); await page.locator('#scene-rotation').selectOption('left-right'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  const pixel = (x: number) => page.locator('#stage').evaluate((canvas, x) => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(x, 159, 1, 1).data), x);
  await expect.poll(() => pixel(125)).toEqual([232, 185, 79, 255]);
  await page.locator('#scene-rotation').selectOption('none'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  await expect.poll(() => pixel(155)).toEqual([232, 185, 79, 255]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#scene-rotation')).toHaveValue('left-right');
  await page.reload(); await expect(page.locator('#scene-rotation')).toHaveValue('left-right'); await expect.poll(() => pixel(125)).toEqual([232, 185, 79, 255]);
});

test('long dialogue stays readable within a narrow stage and caption', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const message = 'M'.repeat(240);
  await project(page, [['key:a', block('scene_say', { STYLE: 'say' }, { SPRITE: ref(), TEXT: text(message) })]]);
  await run(page); await page.locator('#stage').focus(); await page.keyboard.press('a');
  await expect(page.locator('#stage-dialogue')).toHaveText(`Player says: ${message}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('dialogue-mobile.png'), fullPage: true }); await page.locator('#stop').click();
});
