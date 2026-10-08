import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('src/scene/star-game-example.json', 'utf8'));
const b = (type: string, fields: Record<string, unknown> = {}, inputs: Record<string, any> = {}): any => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k,v]) => [k, { block: v }])) });
const n = (v: number) => b('py_number', { VALUE: String(v) });
const t = (v: string) => b('text', { TEXT: v });
const print = (v: any) => b('text_print', {}, { TEXT: typeof v === 'string' ? t(v) : v });
const chain = (...blocks: any[]) => { blocks.slice(1).forEach((next,i) => blocks[i].next = { block: next }); return blocks[0]; };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, handlers?: [string, any][], edit?: (p: any) => void) {
  await page.goto('/'); const p = structuredClone(fixture);
  if (handlers) {
    delete p.workspace.pythonScene.worlds; delete p.workspace.pythonScene.world;
    p.workspace.pythonScene.sprites = [p.workspace.pythonScene.sprites[0]]; p.workspace.pythonScene.sprites[0].motion = {}; p.workspace.pythonScene.sprites[0].x = 0;
    p.workspace.procedures = handlers.map(([event], i) => ({ id: 'h'+i, name: 'handler_'+i, async: true, parameters: [{ id: 'p'+i, name: 'payload' }], handler: { event, order: i } }));
    p.workspace.blocks.blocks = handlers.map(([,body],i) => ({ type: 'py_handler', id: 'hblock'+i, x: 40, y: 40+i*200, extraState: { functionId: 'h'+i }, inputs: { BODY: { block: body } } }));
  }
  edit?.(p);
  await page.locator('#project-file').setInputFiles({ name: 'game.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await expect.poll(async () => (await saved(page))?.workspace?.pythonScene).toEqual(p.workspace.pythonScene);
  await expect.poll(async () => ((await saved(page))?.workspace?.procedures ?? []).map((h: any) => h.id)).toEqual(p.workspace.procedures.map((h: any) => h.id));
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }
function walk(v: any, fn: (b: any) => void) { if (v && typeof v === 'object') { if (v.type) fn(v); Object.values(v).forEach(x => walk(x, fn)); } }

test('plays a scrolling game to a win with fixed HUD, effects and complete replay', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-star-game').click(); const before = await saved(page); await run(page);
  await expect(page.locator('#game-score')).toHaveText('Score 0'); await expect(page.locator('#game-lives')).toHaveText('Lives 3');
  await page.locator('#stage').scrollIntoViewIfNeeded(); const hud = (await page.locator('#game-hud').boundingBox())!;
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight');
  await expect(page.locator('#game-score')).toHaveText('Score 2', { timeout: 6000 });
  expect(Number(await page.locator('#stage').getAttribute('data-camera-x'))).toBeGreaterThan(250);
  const moved = (await page.locator('#game-hud').boundingBox())!; expect(moved.x).toBe(hud.x); expect(moved.y).toBe(hud.y);
  await page.screenshot({ path: info.outputPath('game-scrolling.png'), fullPage: true });
  await expect(page.locator('#game-result-title')).toHaveText('You win!', { timeout: 6000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#game-result-score')).toHaveText('Final score: 3'); await expect(page.locator('#game-lives')).toHaveText('Lives 1');
  await expect(page.locator('#status')).toHaveText('You win!'); await expect(page.locator('#stop')).toBeDisabled(); await expect(page.locator('#game-restart')).toBeFocused();
  const camera = await page.locator('#stage').getAttribute('data-camera-x'); await page.waitForTimeout(250); await expect(page.locator('#stage')).toHaveAttribute('data-camera-x', camera!);
  expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene);
  await page.screenshot({ path: info.outputPath('game-won.png'), fullPage: true });
  await page.keyboard.press('Enter'); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  await expect(page.locator('#game-result')).toBeHidden(); await expect(page.locator('#game-score')).toHaveText('Score 0'); await expect(page.locator('#game-lives')).toHaveText('Lives 3');
  await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '6'); await expect(page.locator('#stage')).toHaveAttribute('data-camera-x', '0'); await expect(page.locator('#stage')).toHaveAttribute('data-effect-count', '0');
});

test('loses on zero lives and restarts via a narrow-screen result', async ({ page }, info) => {
  await install(page, undefined, p => walk(p.workspace.blocks, x => { if (x.type === 'game_set' && x.fields.FIELD === 'lives') x.inputs.VALUE.block.fields.VALUE = '1'; }));
  await run(page); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight');
  await expect(page.locator('#game-result-title')).toHaveText('Game over', { timeout: 6000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#game-result-message')).toContainText('No lives left'); await expect(page.locator('#game-lives')).toHaveText('Lives 0');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#game-restart').scrollIntoViewIfNeeded();
  expect(await page.locator('#game-result').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await expect(page.locator('#stage')).toHaveAttribute('data-effect-count', '0');
  // Capture the responsive layout after resize/observer paint frames complete.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: info.outputPath('game-lost-mobile.png') });
  await page.locator('#game-restart').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); await expect(page.locator('#game-lives')).toHaveText('Lives 1');
});

test('countdown loss cancels sleeping activities and replay gets a new timer', async ({ page }) => {
  await install(page, [
    ['start', chain(b('game_countdown', { ACTION: 'lose' }, { SECONDS: n(1) }), b('py_wait', {}, { SECONDS: n(2) }), print('must not continue'))],
  ]);
  await run(page); await expect(page.locator('#game-result-message')).toContainText('Time’s up', { timeout: 5000 });
  await expect(page.locator('#game-countdown')).toHaveText('Time 0'); await page.waitForTimeout(1200); await expect(page.locator('#output')).not.toContainText('must not continue');
  await page.locator('#game-restart').click(); await expect(page.locator('#game-countdown')).toHaveText('Time 1', { timeout: 60_000 });
  await page.locator('#stop').click(); await page.waitForTimeout(1100); await expect(page.locator('#game-result')).toBeHidden(); await expect(page.locator('#game-countdown')).toHaveText('Time 1');
});

test('custom countdown and life events, HUD visibility, bursts, stop and reset work together', async ({ page }) => {
  await install(page, [
    ['start', chain(b('game_lives_rule', { ACTION: 'event' }), b('game_set', { FIELD: 'lives' }, { VALUE: n(1) }), b('game_countdown', { ACTION: 'event' }, { SECONDS: n(.2) }), b('game_message', {}, { TEXT: t('<b>Plain text</b>') }))],
    ['game:countdown', chain(print('timer event'), b('game_change', { FIELD: 'score' }, { VALUE: n(5) }))],
    ['key:l', b('game_change', { FIELD: 'lives' }, { VALUE: n(-1) })],
    ['game:lives_zero', print('zero lives event')],
    ['key:h', b('game_show', { FIELD: 'score', SHOW: 'FALSE' })],
    ['key:e', b('game_effect', { KIND: 'rings' }, { SPRITE: b('scene_sprite', { SPRITE_ID: 'player' }), SECONDS: n(5) })],
    ['key:c', b('game_effect_clear')],
  ]);
  await run(page); await expect(page.locator('#output')).toContainText('timer event'); await expect(page.locator('#game-score')).toHaveText('Score 5');
  await key(page, 'l'); await expect(page.locator('#output')).toContainText('zero lives event'); await expect(page.locator('#game-result')).toBeHidden();
  await expect(page.locator('#game-message')).toHaveText('<b>Plain text</b>'); await expect(page.locator('#game-message b')).toHaveCount(0);
  await key(page, 'h'); await expect(page.locator('#game-score')).toBeHidden(); await key(page, 'e'); await expect(page.locator('#stage')).toHaveAttribute('data-effect-count', '1');
  await key(page, 'c'); await expect(page.locator('#stage')).toHaveAttribute('data-effect-count', '0'); await key(page, 'e'); await page.locator('#stop').click(); await expect(page.locator('#stage')).toHaveAttribute('data-effect-count', '0');
  await page.locator('#scene-reset').click(); await expect(page.locator('#game-hud')).toBeHidden();
});

test('startup finishes cleanly and supports long result text without HTML or horizontal overflow', async ({ page }, info) => {
  const message = '<script>not code</script> ' + 'Collected stars! '.repeat(12);
  await install(page, [], p => { p.workspace.blocks.blocks = [{ type: 'py_program', inputs: { BODY: { block: chain(b('game_set', { FIELD: 'score' }, { VALUE: n(999999999) }), b('game_finish', { WON: 'TRUE' }, { TEXT: t(message) }), print('must not print')) } } }]; });
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('You win!', { timeout: 60_000 }); await expect(page.locator('#output')).not.toContainText('must not print');
  await expect(page.locator('#game-result-message')).toHaveText(message); await expect(page.locator('#game-result-message script')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('#game-restart').scrollIntoViewIfNeeded(); await expect(page.locator('#game-restart')).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.locator('.game-result-card').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true); await page.screenshot({ path: info.outputPath('long-game-result-mobile.png') });
});

test('game validation errors identify the learner block and retain the scene', async ({ page }) => {
  await install(page, [['start', { ...b('game_set', { FIELD: 'score' }, { VALUE: n(1.5) }), id: 'bad-score' }]]);
  await page.locator('#run').click(); await expect(page.locator('#output')).toContainText('Score and lives need whole Python integers', { timeout: 60_000 });
  await expect(page.locator('#status')).toHaveText('Let’s try again'); await expect(page.locator('.blocklyHighlighted')).toHaveCount(1); await expect(page.locator('#game-result')).toBeHidden(); await expect(page.locator('#run')).toBeEnabled();
});


test('replay uses the captured program while Run uses the current edited blocks', async ({ page }) => {
  await install(page, [['start', b('game_set', { FIELD: 'score' }, { VALUE: n(7) })], ['key:w', b('game_finish', { WON: 'TRUE' }, { TEXT: t('Done!') })]]);
  await run(page); await expect(page.locator('#game-score')).toHaveText('Score 7');
  await page.getByRole('button', { name: 'Edit text: 7', exact: true }).dblclick();
  await page.locator('.blocklyHtmlInput').fill('42'); await page.locator('.blocklyHtmlInput').press('Enter');
  await expect(page.locator('#python')).toContainText('_pb_game.set("score", 42)'); await key(page, 'w');
  await expect(page.locator('#game-result-score')).toHaveText('Final score: 7'); await page.locator('#game-restart').click();
  await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); await expect(page.locator('#game-score')).toHaveText('Score 7');
  await page.locator('#stop').click(); await run(page); await expect(page.locator('#game-score')).toHaveText('Score 42');
});
