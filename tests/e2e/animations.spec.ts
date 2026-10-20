import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { run } from './playable-support';
import { reveal } from './shell';

const project = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

/** A project with the library Fox, as the library adds it, then changed by `edit` and opened again. */
async function withFox(page: Page, edit: (p: any) => void) {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json');
  await expect(page.locator('#scene-cards button').first()).toBeVisible();
  await page.locator('#scene-stock').click(); await page.locator('[data-stock-id="fox"]').click(); await expect(page.locator('#stock-dialog')).not.toBeVisible();
  await expect.poll(async () => (await project(page)).workspace.pythonScene.sprites.some((s: any) => s.name.startsWith('Fox'))).toBe(true);
  const p = await project(page), fox = p.workspace.pythonScene.sprites.find((s: any) => s.name.startsWith('Fox'));
  expect(fox.animations.map((a: any) => a.name)).toEqual(['idle', 'walk', 'jump', 'happy']);
  expect(fox.autoAnimate).toEqual({ moving: 'walk', air: 'jump', still: 'idle', turn: true });
  fox.id = 'fox'; edit(p);
  await page.locator('#project-file').setInputFiles({ name: 'fox.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await expect(page.locator('#scene-cards button', { hasText: 'Fox' })).toBeVisible();
  return p;
}
const watch = (page: Page, id: string) => page.locator(`[data-watch-id="${id}"]`);

test('a library character walks, turns and idles by itself as the arrow keys move it', async ({ page }) => {
  await withFox(page, p => {
    const fox = p.workspace.pythonScene.sprites.find((s: any) => s.id === 'fox');
    fox.motion = { body: 'moving', controller: 'arrows', speedX: 160, speedY: 0 };
    p.workspace.pythonScene.watchers = [{ id: 'costume', sprite: 'fox', property: 'costume' }, { id: 'direction', sprite: 'fox', property: 'direction' }];
  });
  await run(page); await expect(watch(page, 'costume')).toContainText('idle');
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowLeft');
  await expect(watch(page, 'costume')).toContainText('walk'); await expect(watch(page, 'direction')).toContainText('180');
  await page.keyboard.up('ArrowLeft'); await expect(watch(page, 'costume')).toContainText('idle');
  await page.keyboard.down('ArrowRight'); await expect(watch(page, 'direction')).toContainText(/\b0\b/); await page.keyboard.up('ArrowRight');
});

test('the platformer’s explorer shows its jump pose in the air, with no walking script', async ({ page }) => {
  const p = JSON.parse(readFileSync('src/scene/game-example.json', 'utf8'));
  expect(JSON.stringify(p.workspace.blocks)).not.toContain('scene_next_costume');
  p.workspace.pythonScene.watchers = [{ id: 'costume', sprite: 'player', property: 'costume' }];
  await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'platformer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) });
  await run(page); await page.locator('#stage').focus();
  await page.keyboard.press('Space'); await expect(watch(page, 'costume')).toContainText('jump');
  await expect(watch(page, 'costume')).toContainText('idle', { timeout: 3000 });
});

test('Paint groups costumes into animations, and a new one is named, saved by Done and undone together', async ({ page }) => {
  await page.goto('/'); await (await reveal(page, '#scene-example')).click();
  await page.locator('#scene-cards button', { hasText: 'Player' }).click();
  await page.locator('#tray-paint').click();
  await expect(page.locator('.paint-row')).toHaveCount(4);
  await expect(page.locator('.paint-row .paint-row-name')).toHaveText(['idle', 'walk', 'jump', 'happy']);
  // The preview shows the chosen costume before Play is pressed.
  await expect(page.locator('#paint-preview')).toHaveAttribute('data-frame', /\d/);
  await page.locator('.paint-row', { hasText: 'walk' }).click(); await expect(page.locator('.paint-card')).toHaveCount(4);
  await page.locator('#paint-new-anim').click(); await expect(page.locator('.paint-row')).toHaveCount(5);
  await page.locator('#paint-anim-name').fill('frames'); await page.locator('#paint-anim-name').press('Enter');
  await expect(page.locator('#paint-toast')).toContainText('already an animation called “frames”');
  await page.locator('#paint-anim-name').fill('wave'); await page.locator('#paint-anim-name').press('Enter');
  await expect(page.locator('.paint-row[aria-pressed="true"] .paint-row-name')).toHaveText('wave');
  await page.locator('#paint-done').click(); await expect(page.locator('#paint-dialog')).not.toBeVisible();
  const player = (p: any) => p.workspace.pythonScene.sprites.find((s: any) => s.id === 'player');
  await expect.poll(async () => player(await project(page)).animations.map((a: any) => a.name)).toEqual(['idle', 'walk', 'jump', 'happy', 'wave']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => player(await project(page)).animations.map((a: any) => a.name)).toEqual(['idle', 'walk', 'jump', 'happy']);
});

test('the play animation block plays a named animation, shown in Python as play()', async ({ page }) => {
  await withFox(page, p => {
    p.workspace.procedures = [{ id: 'cheer', name: 'cheer', parameters: [{ id: 'cheer-payload', name: 'payload' }], handler: { event: 'key:Space', order: 0 }, returnTypes: null, async: true }];
    p.workspace.blocks = { languageVersion: 0, blocks: [{ type: 'py_handler', id: 'cheer-block', x: 20, y: 20, extraState: { functionId: 'cheer' }, inputs: { BODY: { block: { type: 'scene_animation_play', fields: { ANIMATION: 'happy' }, inputs: { SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: 'fox' } } } } } } } }] };
    p.workspace.pythonScene.watchers = [{ id: 'costume', sprite: 'fox', property: 'costume' }];
  });
  await (await reveal(page, '#tab-python')).click(); await expect(page.locator('#python')).toContainText('.play("happy")');
  await run(page); await expect(watch(page, 'costume')).toContainText('idle');
  await page.locator('#stage').focus(); await page.keyboard.press('Space');
  await expect(watch(page, 'costume')).toContainText('happy');
  await page.waitForTimeout(600); await expect(watch(page, 'costume')).toContainText('happy');   // a played animation outlasts idling
});

test('a Chick from the library flaps while it is in the air, and a Beetle steps as it walks', async ({ page }) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json');
  await expect(page.locator('#scene-cards button').first()).toBeVisible();
  for (const id of ['chick', 'beetle']) { await page.locator('#scene-stock').click(); await page.locator(`[data-stock-id="${id}"]`).click(); await expect(page.locator('#stock-dialog')).not.toBeVisible(); }
  await expect.poll(async () => (await project(page)).workspace.pythonScene.sprites.filter((s: any) => /^(Chick|Beetle)/.test(s.name)).length).toBe(2);
  const sprites = (await project(page)).workspace.pythonScene.sprites, chick = sprites.find((s: any) => s.name.startsWith('Chick')), beetle = sprites.find((s: any) => s.name.startsWith('Beetle'));
  expect(chick.animations.map((a: any) => a.name)).toEqual(['idle', 'flap', 'jump', 'happy']);
  expect(chick.costumes).toEqual(['stock-chick-flap-1', 'stock-chick-flap-2', 'stock-chick-flap-3', 'stock-chick-flap-4']);
  expect(chick.autoAnimate).toEqual({ moving: 'flap', air: 'flap', still: 'idle', turn: true });
  expect(beetle.autoAnimate).toEqual({ moving: 'walk', air: '', still: '', turn: true }); expect(beetle.rotationStyle).toBe('left-right');
});
