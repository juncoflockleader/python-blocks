import { test, expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { menu, openExample, openSearch, openSpriteSettings, openTab, setSpriteField } from './shell';

// These tests start like a new browser: no stored level, so the Starter palette.
test.use({ storageState: { cookies: [], origins: [] } });
const sprites = JSON.parse(readFileSync('src/scene/example.json', 'utf8'));
const b = (type: string, fields: Record<string, unknown> = {}, inputs: Record<string, any> = {}): any => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, { block: v }])) });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const project = (blocks: any[], scene?: unknown) => ({ format: 'python-blocks', formatVersion: 1, languageVersion: 8, workspace: { blocks: { languageVersion: 0, blocks }, ...(scene ? { pythonScene: scene } : {}) } });
async function load(page: Page, value: unknown, name = 'project.json') {
  await page.locator('#project-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
const categories = (page: Page) => page.locator('.blocklyToolboxCategoryLabel').allTextContents();
/** Drag a palette block so its top-left lands at a target point (Blockly snaps nearby connections).
 * The grab point is on the block's left edge, below a hat's rounded cap. */
async function dragFromPalette(page: Page, category: string, block: Locator, target: { x: number; y: number }) {
  const item = page.getByRole('treeitem', { name: category, exact: true });
  if (await item.getAttribute('aria-selected') !== 'true') await item.click(); // a second click would close the flyout
  const box = (await block.boundingBox())!, grab = { x: 6, y: Math.min(box.height / 2, 40) };
  await page.mouse.move(box.x + grab.x, box.y + grab.y); await page.mouse.down();
  await page.mouse.move(target.x + grab.x, target.y + grab.y, { steps: 12 }); await page.mouse.up();
}
const flyoutBlock = (page: Page, text: RegExp) => page.locator('.blocklyToolboxFlyout g.blocklyDraggable').filter({ has: page.locator('text.blocklyText', { hasText: text }) }).first();
async function noPageScroll(page: Page) {
  expect(await page.evaluate(() => [document.documentElement.scrollHeight <= innerHeight, document.documentElement.scrollWidth <= innerWidth, scrollY])).toEqual([true, true, 0]);
}
async function inView(page: Page, locator: Locator) {
  const box = (await locator.boundingBox())!, size = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + Math.min(box.height, 40)).toBeLessThanOrEqual(size.height);
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
}

test.describe('iPad landscape', () => {
  test.use({ viewport: { width: 1024, height: 700 } });
  test('a learner drags repeat and move, runs, and sees output and an error without scrolling the page', async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
    await noPageScroll(page);
    expect(await categories(page)).toEqual(['Events', 'Motion', 'Looks', 'Sounds', 'Control', 'Draw', 'Variables', 'Game']);
    for (const selector of ['#run', '#stop', '#stage', '#tab-output', '#blockly']) await inView(page, page.locator(selector));
    await load(page, project([{ ...b('py_program'), x: 420, y: 40 }]), 'start.json');
    await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.length).toBe(1);
    const label = (await page.locator('#blockly text.blocklyText', { hasText: /^Program$/ }).boundingBox())!;
    await dragFromPalette(page, 'Control', flyoutBlock(page, /^repeat$/), { x: label.x + 10, y: label.y + label.height + 8 });
    await expect.poll(async () => (await saved(page)).workspace.blocks.blocks[0].inputs?.BODY?.block?.type).toBe('controls_repeat_ext');
    const repeat = (await page.locator('#blockly .blocklyDraggable:not(.blocklyFlyout *) text.blocklyText', { hasText: /^repeat$/ }).first().boundingBox())!;
    await dragFromPalette(page, 'Draw', flyoutBlock(page, /^move$/), { x: repeat.x + 14, y: repeat.y + repeat.height + 10 });
    await expect.poll(async () => (await saved(page)).workspace.blocks.blocks[0].inputs.BODY.block.inputs?.DO?.block?.type).toBe('pen_move');
    await openTab(page, 'python'); await expect(page.locator('#python')).toContainText(/for _\w* in range\(10\):\n\s+pen\.move\(100\)/);
    await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
    // A program that prints and then fails: the Output tab opens on its own and both are visible.
    await load(page, project([{ ...b('py_program', {}, { BODY: { ...b('text_print', {}, { TEXT: b('text', { TEXT: 'Hello from Python' }) }), next: { block: b('text_print', {}, { TEXT: b('py_convert', { TYPE: 'int' }, { VALUE: b('text', { TEXT: 'seven' }) }) }) } } }), x: 40, y: 40 }]), 'fails.json');
    await page.locator('#level-keep').click(); // it uses Builder's Text and Numbers blocks
    await openTab(page, 'sprite');
    await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Let’s try again', { timeout: 60_000 });
    await expect(page.locator('#tab-output')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#output')).toContainText('Hello from Python'); await expect(page.locator('#output')).toContainText('ValueError');
    await inView(page, page.locator('#output')); await noPageScroll(page);
    expect(errors).toEqual([]);
  });

  test('an error while the learner is typing in another tab leaves a badge on the stage', async ({ page }) => {
    await page.goto('/');
    await load(page, project([{ ...b('py_program', {}, { BODY: b('text_print', {}, { TEXT: b('py_convert', { TYPE: 'int' }, { VALUE: b('text', { TEXT: 'x' }) }) }) }), x: 40, y: 40 }]), 'fails.json');
    await page.locator('#level-keep').click();
    await openTab(page, 'sprite'); await page.locator('#run').click(); await page.locator('#scene-filter').focus();
    await expect(page.locator('#status')).toHaveText('Let’s try again', { timeout: 60_000 });
    await expect(page.locator('#tab-sprite')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#stage-badge')).toHaveText('Let’s try again · tap to see'); await expect(page.locator('#tab-output .tab-dot')).toBeVisible();
    await page.locator('#stage-badge').click(); await expect(page.locator('#panel-output')).toBeVisible(); await expect(page.locator('#stage-badge')).toBeHidden();
    await expect(page.locator('#tab-output .tab-dot')).toBeHidden();
    // Without typing, the next failure simply opens the Output tab.
    await openTab(page, 'help'); await page.locator('#run').click();
    await expect(page.locator('#tab-output')).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 }); await expect(page.locator('#stage-badge')).toBeHidden();
  });

  test('hat blocks create real handlers, and one Undo removes them', async ({ page }) => {
    await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
    await page.getByRole('treeitem', { name: 'Events', exact: true }).click();
    await expect(page.locator('.blocklyToolboxFlyout')).toContainText('game starts');
    await expect(page.locator('.blocklyToolboxFlyout')).not.toContainText('clicked'); // sprite hats need a sprite
    const canvas = (await page.locator('#blockly').boundingBox())!;
    await dragFromPalette(page, 'Events', flyoutBlock(page, /^key\spressed$/), { x: canvas.x + 380, y: canvas.y + 300 });
    await expect.poll(async () => (await saved(page)).workspace.procedures?.[0]).toMatchObject({ name: 'on_space_key', async: true, parameters: [{ name: 'payload' }], handler: { event: 'key:Space', order: 0 } });
    expect((await saved(page)).workspace.blocks.blocks.map((block: any) => block.type)).toEqual(['py_program', 'py_handler']);
    await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('async def on_space_key(payload):');
    await expect(page.locator('#python')).toContainText('events.on("key:Space", on_space_key)');
    await expect(page.locator('#blockly')).toContainText('space key pressed');
    // A second drop gets its own identity, name and delivery position.
    await dragFromPalette(page, 'Events', flyoutBlock(page, /^key\spressed$/), { x: canvas.x + 380, y: canvas.y + 420 });
    await expect.poll(async () => (await saved(page)).workspace.procedures?.map((p: any) => [p.name, p.handler.order])).toEqual([['on_space_key', 0], ['on_space_key_2', 1]]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await saved(page)).workspace.procedures?.length ?? 0).toBe(1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await saved(page)).workspace.procedures?.length ?? 0).toBe(0);
    expect((await saved(page)).workspace.blocks.blocks.map((block: any) => block.type)).toEqual(['py_program']);
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await expect.poll(async () => (await saved(page)).workspace.procedures?.[0]?.handler?.event).toBe('key:Space');
  });

  test('sprite hats target the selected sprite; overlap starts with a check for the other sprite', async ({ page }) => {
    await page.goto('/'); await load(page, sprites, 'sprites.json');
    await page.locator('#level-keep').click();
    await page.locator('#scene-cards button', { hasText: 'Player' }).click();
    const canvas = (await page.locator('#blockly').boundingBox())!;
    await dragFromPalette(page, 'Events', flyoutBlock(page, /^overlaps$/), { x: canvas.x + 380, y: canvas.y + 470 });
    await expect.poll(async () => (await saved(page)).workspace.procedures?.find((p: any) => p.handler.event === 'overlap')).toMatchObject({ name: 'on_player_overlap', handler: { sprite: 'player' } });
    const id = (await saved(page)).workspace.procedures.find((p: any) => p.handler.event === 'overlap').id;
    const handler = (await saved(page)).workspace.blocks.blocks.find((block: any) => block.type === 'py_handler' && block.extraState.functionId === id);
    expect(handler.inputs.BODY.block).toMatchObject({ type: 'controls_if', inputs: { IF0: { block: { type: 'scene_overlaps', inputs: { SPRITE: { block: { type: 'scene_self' } }, OTHER: { block: { type: 'scene_sprite', fields: { SPRITE_ID: 'friend' } } } } } } } });
    await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('_pb_scene.on("player", "overlap", on_player_overlap)');
  });
});

test('levels filter the palette and menus, persist, and prompt once for a project that needs more', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#level-select')).toHaveValue('starter');
  expect(await categories(page)).toHaveLength(8);
  await page.locator('#menu-button').click();
  for (const hidden of ['#export-playable', '#debug-start', '#language-manage', '#menu-pilot']) await expect(page.locator(hidden)).toBeHidden();
  await expect(page.locator('#save')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('#app-menu')).toBeHidden();
  await page.locator('#level-select').selectOption('builder');
  expect(await categories(page)).toEqual(['Events', 'Motion', 'Looks', 'Sounds', 'Control', 'Logic', 'Numbers', 'Text', 'Draw', 'Variables', 'Functions', 'Game', 'Sensing & input', 'Physics']);
  await page.locator('#menu-button').click(); await expect(page.locator('#language-manage')).toBeVisible(); await expect(page.locator('#debug-start')).toBeHidden(); await expect(page.locator('#modules-manage')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.locator('#level-select').selectOption('pro'); expect(await categories(page)).toHaveLength(21);
  await page.reload(); await expect(page.locator('#level-select')).toHaveValue('pro'); expect(await categories(page)).toHaveLength(21);
  await page.locator('#level-select').selectOption('starter');
  // Block search only offers blocks the current palette shows.
  await openSearch(page); await page.locator('#block-search-input').fill('lambda'); await expect(page.locator('#block-search-status')).toHaveText(/No matching blocks/);
  // A shared project that uses higher-level tools asks once; its blocks always stay on the workspace.
  await openExample(page, 'scene-world-example');
  await expect(page.locator('#level-dialog')).toBeVisible(); await expect(page.locator('#level-reason')).toContainText('Worlds');
  await expect(page.locator('#level-switch')).toHaveText('Switch to Pro'); await page.locator('#level-switch').click();
  await expect(page.locator('#level-select')).toHaveValue('pro'); expect(await categories(page)).toHaveLength(21);
  await page.locator('#level-select').selectOption('starter'); await expect(page.locator('#level-dialog')).toBeHidden();
  await page.reload(); await expect(page.locator('#run')).toBeEnabled(); await expect(page.locator('#level-dialog')).toBeHidden();
  expect((await saved(page)).workspace.blocks.blocks.length).toBeGreaterThan(1);
});

test('Make a variable and Make a function ask for a name and insert a block', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('builder');
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click();
  await page.getByRole('option', { name: 'Make a variable, button', exact: true }).click();
  await expect(page.locator('#name-sheet')).toBeVisible(); await expect(page.locator('#name-sheet-input')).toHaveValue('score');
  await page.locator('#name-sheet-input').fill('2fast'); await page.locator('#name-sheet-input').press('Enter');
  await expect(page.locator('#name-sheet-error')).toContainText('Python identifier');
  await page.locator('#name-sheet-input').fill('speed'); await page.locator('#name-sheet-input').press('Enter');
  await expect(page.locator('#name-sheet')).toBeHidden();
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.some((block: any) => block.type === 'py_set')).toBe(true);
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('speed');
  await page.getByRole('treeitem', { name: 'Functions', exact: true }).click();
  await page.getByRole('option', { name: 'Make a function, button', exact: true }).click();
  await page.locator('#name-sheet-input').fill('jump_twice'); await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.procedures?.map((p: any) => p.name)).toEqual(['jump_twice']);
  await page.getByRole('treeitem', { name: 'Functions', exact: true }).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('jump_twice');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.procedures?.length ?? 0).toBe(0);
});

test('sprite fields commit on change with Undo; More settings holds the rest', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('pro'); await load(page, sprites, 'sprites.json');
  await expect(page.locator('#scene-cards button')).toHaveCount(2);
  await page.locator('#scene-cards button', { hasText: 'Friend' }).click(); await expect(page.locator('#scene-name')).toHaveValue('Friend');
  await setSpriteField(page.locator('#scene-x'), '42');
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites.find((s: any) => s.id === 'friend').x).toBe(42);
  await page.locator('#scene-visible').uncheck();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites.find((s: any) => s.id === 'friend').visible).toBe(false);
  await setSpriteField(page.locator('#scene-size'), '999'); await expect(page.locator('#scene-error')).toContainText('from 5 to 400'); await expect(page.locator('#scene-size')).not.toHaveValue('999');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites.find((s: any) => s.id === 'friend').visible).toBe(true);
  await openSpriteSettings(page); await page.locator('#scene-rotation').selectOption('left-right');
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sprites.find((s: any) => s.id === 'friend').rotationStyle).toBe('left-right');
  for (const section of ['#scene-appearance', '#scene-data', '#scene-motion', '#watch-settings']) await expect(page.locator(section)).toBeVisible();
  await page.locator('#sprite-settings-done').click(); await page.locator('#level-select').selectOption('starter');
  await openSpriteSettings(page); await expect(page.locator('#scene-motion')).toBeHidden(); await expect(page.locator('#watch-settings')).toBeHidden(); await expect(page.locator('#scene-world')).toBeHidden();
});

test('Python sits beside the blocks on wide screens and follows the selected block', async ({ page }) => {
  await page.goto('/'); await openTab(page, 'python');
  await page.locator('#python-side-toggle').click(); await expect(page.locator('#python-side #python')).toBeVisible();
  const blocks = (await page.locator('.blocks-panel').boundingBox())!, python = (await page.locator('#python-side').boundingBox())!;
  expect(python.x).toBeGreaterThanOrEqual(blocks.x + blocks.width - 1);
  await page.locator('#blockly text.blocklyText', { hasText: /^move$/ }).click();
  await expect(page.locator('#python mark.python-active')).toHaveText(/pen\.move\(100\)/);
  // An iPad in landscape (1080 px) still fits all three columns; narrower windows fall back to the tab.
  await page.setViewportSize({ width: 1080, height: 700 }); await expect(page.locator('#python-side #python')).toBeVisible();
  const narrowBlocks = (await page.locator('.blocks-panel').boundingBox())!, narrowStage = (await page.locator('#stage').boundingBox())!;
  expect(narrowBlocks.width).toBeGreaterThan(380); expect(narrowStage.width).toBeGreaterThan(300);
  await page.setViewportSize({ width: 1000, height: 760 }); await expect(page.locator('#python-side')).toBeHidden();
  await expect(page.locator('#python-side-toggle')).toBeDisabled(); await expect(page.locator('#panel-python #python')).toBeVisible();
});

test('Builder and Pro palettes fit a tablet in two columns, and a cue shows when categories overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 }); await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#level-select').selectOption('pro');
  const rows = await page.locator('.blocklyToolboxCategory').evaluateAll(items => items.map(item => item.getBoundingClientRect()));
  expect(rows).toHaveLength(21);
  expect(new Set(rows.map(row => Math.round(row.left))).size).toBe(2);
  const toolbox = (await page.locator('.blocklyToolbox').boundingBox())!;
  expect(Math.max(...rows.map(row => row.bottom))).toBeLessThanOrEqual(toolbox.y + toolbox.height + 1);
  await expect(page.locator('#palette-more')).toBeHidden();
  // The flyout opens beside the wider palette, not under it.
  await page.getByRole('treeitem', { name: 'Loops', exact: true }).click();
  const flyout = (await page.locator('.blocklyToolboxFlyout').boundingBox())!;
  expect(flyout.x).toBeGreaterThanOrEqual(toolbox.x + toolbox.width - 1);
  // Portrait keeps one column; the cue appears for the rows below the fold and scrolls to them.
  await page.setViewportSize({ width: 810, height: 1000 });
  await expect(page.locator('#palette-more')).toBeVisible();
  await page.locator('#palette-more').click();
  await expect.poll(() => page.locator('.blocklyToolbox').evaluate(element => element.scrollTop)).toBeGreaterThan(50);
});

test('tablet portrait stacks the stage above the workspace; phones get play-only', async ({ page }) => {
  await page.setViewportSize({ width: 810, height: 1000 }); await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const stage = (await page.locator('#stage').boundingBox())!, blocks = (await page.locator('#blockly').boundingBox())!;
  expect(stage.y + stage.height).toBeLessThanOrEqual(blocks.y + 1); await noPageScroll(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.phone-message')).toBeVisible(); await expect(page.locator('#blockly')).toBeHidden();
  await page.locator('#phone-play').click(); await expect(page.locator('#play-dialog')).toBeVisible(); await expect(page.locator('#play-dialog #stage')).toBeVisible();
  await page.locator('#play-close').click(); await expect(page.locator('#play-dialog')).toBeHidden();
});

test('the menu and examples dialog are keyboard friendly and every shell control is touch sized', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('pro');
  await page.locator('#menu-button').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#save')).toBeFocused(); await page.keyboard.press('Escape'); await expect(page.locator('#menu-button')).toBeFocused();
  await menu(page, 'Learner pilot'); await expect(page.locator('#panel-help')).toBeVisible(); await expect(page.locator('#pilot-panel')).toHaveAttribute('open', '');
  await page.locator('#tab-help').focus(); await page.keyboard.press('ArrowLeft'); await expect(page.locator('#tab-output')).toBeFocused(); await expect(page.locator('#panel-output')).toBeVisible();
  const small = await page.evaluate(() => [...document.querySelectorAll('.top-bar button, .workspace-tools button, .stage-toolbar button, .sprite-tray button, .tab-bar button, .blocklyToolboxCategory, #panel-sprite input:not([type=checkbox]), #panel-sprite select, .help-nav-button')]
    .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.width < 43.5 || r.height < (e.classList.contains('help-nav-button') ? 39.5 : 43.5)); }).map(e => e.id || e.textContent));
  expect(small).toEqual([]);
  await openExample(page, 'scene-star-game'); await expect(page.locator('#project-title')).toHaveText('Star game');
  await expect(page.locator('#scene-cards button')).not.toHaveCount(0);
});
