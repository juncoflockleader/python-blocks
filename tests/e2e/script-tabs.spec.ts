import { test, expect, type Page } from '@playwright/test';
import { openExample, openSearch, openTab } from './shell';

/** Script tabs (scripts/tab-strip.ts): a big project's scripts sorted into named tabs above the
 * workspace, and the magic book (Magic tab), where Wren the Wizard reads the project's notes as a guide
 * to the numbers worth changing. Tested on an iPad-sized screen. */
test.use({ viewport: { width: 1024, height: 700 } });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
/** The ids of the top-level scripts on screen (the scripts of the other tabs are hidden). */
const onScreen = (page: Page) => page.evaluate(() => [...document.querySelectorAll<SVGGElement>('#blockly .blocklyBlockCanvas > g[data-id]')]
  .filter(g => !g.closest('.blocklyFlyout') && getComputedStyle(g).display !== 'none').map(g => g.getAttribute('data-id')).sort());
const tabNames = (page: Page) => page.locator('#script-tab-list .script-tab .script-tab-name').allTextContents();
const tab = (page: Page, name: string) => page.locator('#script-tab-list .script-tab', { hasText: name });
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 30, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 14 }); await page.mouse.up();
}
const hat = (page: Page, id: string) => page.locator(`#blockly g[data-id="${id}"] > .blocklyPath`).first();

test('a big example opens in tabs, one part on screen at a time, and Find blocks opens the right tab', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  await expect.poll(() => tabNames(page)).toEqual(['Settings', 'Game rules', 'Cannon & laser', 'Aliens', 'Bombs & lives']);
  await expect(tab(page, 'Settings')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Aliens').locator('.script-tab-count')).toHaveText('2');
  await expect.poll(() => onScreen(page)).toEqual(['settings_program_block']);
  await tab(page, 'Aliens').click();
  await expect.poll(() => onScreen(page)).toEqual(['make_aliens_function_block', 'on_alien_overlap_handler_block']);
  // Every script still runs: Python lists them all.
  await openTab(page, 'python');
  for (const name of ['def make_aliens', 'async def on_bomb_overlap', 'async def on_space_key']) await expect(page.locator('#python')).toContainText(name);
  // Going to a block opens its tab.
  await openSearch(page); await page.locator('#block-search-scope').selectOption('project');
  await page.locator('#block-search-input').fill('on_bomb_update');
  await page.locator('#block-search-results li', { hasText: 'on_bomb_update' }).first().click();
  await expect(tab(page, 'Bombs & lives')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => onScreen(page)).toEqual(['on_bomb_overlap_handler_block', 'on_bomb_update_handler_block']);
  expect(errors).toEqual([]);
});

test('make a tab, drop a script on it, undo and redo, and find it all again after a reload', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles('content/builds/jump-quest-game.json');
  await expect(page.locator('#project-title')).toHaveText('jump-quest-game');
  if (await page.locator('#level-dialog').isVisible()) await page.locator('#level-keep').click();
  await expect.poll(() => tabNames(page)).toEqual(['Main']);
  const scripts = await onScreen(page);
  expect(scripts.length).toBeGreaterThan(2);
  await page.locator('#script-tab-add').click();
  await page.locator('#name-sheet-input').fill('Jumping'); await page.locator('#name-sheet-confirm').click();
  await expect(tab(page, 'Jumping')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab(page, 'Jumping').locator('.script-tab-icon')).toHaveCount(1); // a picture guessed from the name
  await expect(page.locator('#script-tabs-empty')).toBeVisible();
  await expect.poll(() => onScreen(page)).toEqual([]);
  // Back in Main, drag the start script onto the new tab's name.
  await tab(page, 'Main').click();
  await expect(page.locator('#script-tabs-empty')).toBeHidden();
  const from = (await hat(page, 'on_start_handler_block').boundingBox())!, target = (await tab(page, 'Jumping').boundingBox())!;
  // The strip lies beside the palette, which keeps the panel's full height, and is outside the palette's
  // delete area (Blockly deletes a block dropped anywhere left of the palette's edge).
  const palette = (await page.locator('#blockly .blocklyToolbox').boundingBox())!, strip = (await page.locator('#script-tabs').boundingBox())!;
  expect(strip.x).toBeGreaterThanOrEqual(palette.x + palette.width - 1);
  expect(palette.y).toBeLessThanOrEqual(strip.y + 1);
  await dragTo(page, { x: from.x + 30, y: from.y + 10 }, { x: target.x + target.width / 2, y: target.y + target.height / 2 });
  await expect.poll(() => onScreen(page)).toEqual(scripts.filter(id => id !== 'on_start_handler_block'));
  await expect(tab(page, 'Jumping').locator('.script-tab-count')).toHaveText('1');
  await expect.poll(async () => (await saved(page)).workspace.scriptTabs?.scripts.on_start_handler_block).toMatch(/^tab-/);
  // Undo puts it back; Redo moves it again and opens the tab it went to.
  await page.locator('#language-undo').click();
  await expect.poll(() => onScreen(page)).toEqual(scripts);
  await page.locator('#language-redo').click();
  await expect(tab(page, 'Jumping')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => onScreen(page)).toEqual(['on_start_handler_block']);
  // The tabs are saved with the project.
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await expect.poll(() => tabNames(page)).toEqual(['Main', 'Jumping']);
  await tab(page, 'Jumping').click();
  await expect.poll(() => onScreen(page)).toEqual(['on_start_handler_block']);
});

test('move a script with its menu, rename and reorder a tab, and delete one without losing a script', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  await tab(page, 'Cannon & laser').click();
  const box = (await hat(page, 'on_space_key_handler_block').boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 10, { button: 'right' });
  await page.locator('.blocklyContextMenu').getByText('Move script to another tab').click();
  await expect(page.locator('#script-move-dialog')).toBeVisible();
  await page.locator('#script-move-list button', { hasText: 'Aliens' }).click();
  await expect.poll(() => onScreen(page)).toEqual(['on_laser_update_handler_block']);
  await expect(tab(page, 'Aliens').locator('.script-tab-count')).toHaveText('3');
  // Rename, give it a picture and move it to the front.
  await page.locator('#script-tab-edit').click();
  await page.locator('#script-tab-name').fill('Laser');
  await page.locator('.script-tab-icon-choice[data-icon="star"]').click();
  await page.locator('#script-tab-left').click();
  await page.locator('#script-tab-done').click();
  await expect.poll(() => tabNames(page)).toEqual(['Settings', 'Laser', 'Game rules', 'Aliens', 'Bombs & lives']);
  // Deleting asks first, and its scripts move to the first tab left.
  await page.locator('#script-tab-edit').click();
  await page.locator('#script-tab-delete').click();
  await expect(page.locator('#script-tab-delete-note')).toContainText('Its script moves to Settings. Nothing is deleted from your program.');
  await page.locator('#script-tab-delete').click();
  await expect.poll(() => tabNames(page)).toEqual(['Settings', 'Game rules', 'Aliens', 'Bombs & lives']);
  await expect.poll(() => onScreen(page)).toEqual(['on_laser_update_handler_block', 'settings_program_block']);
  await page.locator('#language-undo').click();
  await expect.poll(() => tabNames(page)).toEqual(['Settings', 'Laser', 'Game rules', 'Aliens', 'Bombs & lives']);
});

test('hidden scripts stay put: Clean up and new scripts in one tab never nudge another tab', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  const where = async () => Object.fromEntries((await saved(page)).workspace.blocks.blocks.map((b: { id: string; x: number; y: number }) => [b.id, [b.x, b.y]]));
  const before = await where();
  await tab(page, 'Aliens').click();
  const canvas = (await page.locator('#blockly .blocklySvg').first().boundingBox())!;
  await page.mouse.click(canvas.x + canvas.width - 40, canvas.y + 120, { button: 'right' }); // below the strip
  await page.locator('.blocklyContextMenu').getByText(/Clean up Blocks/i).click();
  await expect.poll(async () => (await where()).make_aliens_function_block).not.toEqual(before.make_aliens_function_block);
  const after = await where();
  for (const id of ['on_start_handler_block', 'on_space_key_handler_block', 'on_laser_update_handler_block', 'on_bomb_update_handler_block', 'on_bomb_overlap_handler_block']) expect(after[id], id).toEqual(before[id]);
});

test('the magic book: notes become a guide to the numbers, ready to change', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  await expect(page.locator('#tab-magic .tab-dot')).toBeVisible();
  await openTab(page, 'magic');
  await expect(page.locator('#magic-says')).toContainText('found its magic numbers');
  await expect(page.locator('.magic-tab-heading')).toHaveText(['Settings', 'Game rules']);
  const lives = page.locator('.magic-entry', { hasText: 'Lives at the start' });
  await expect(lives.locator('label')).toHaveText('set LIVES to');
  await expect(lives.locator('input')).toHaveValue('3');
  await lives.getByRole('button', { name: 'More: set LIVES to' }).click();
  await expect(lives.locator('input')).toHaveValue('4');
  const laser = page.locator('.magic-entry', { hasText: 'Laser speed and direction' });
  await laser.locator('input').fill('-20'); await laser.locator('input').press('Enter');
  await laser.locator('input').fill('fast'); await laser.locator('input').press('Tab');
  await expect(laser.locator('.magic-error')).toHaveText('Use a number, such as 5, -3 or 0.5.');
  await expect(laser.locator('input')).toHaveValue('-20');
  // A look is a costume to pick: the laser now shoots stars, set in one place.
  await page.locator('.magic-entry', { hasText: 'Laser look' }).locator('select').selectOption('star');
  await openTab(page, 'python');
  await expect(page.locator('#python')).toContainText('LIVES = 4');
  await expect(page.locator('#python')).toContainText('LASER_SPEED = -20');
  await expect(page.locator('#python')).toContainText('LASER_LOOK = "star"');
  await expect(page.locator('#python')).toContainText('_pb_game.set("lives", LIVES)');
  // Show me opens the block's tab and selects it.
  await openTab(page, 'magic');
  await page.locator('.magic-entry', { hasText: 'Alien march timing' }).getByRole('button', { name: 'Show me: Alien march timing' }).click();
  await expect(tab(page, 'Game rules')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#blockly .blocklySelected')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('Rock Blaster opens on its Settings too: one setting changes both arrows, and the shot shoots stars', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'rock-blaster');
  await expect.poll(() => tabNames(page)).toEqual(['Settings', 'Game & waves', 'Ship', 'Shots', 'Rocks']);
  await expect(tab(page, 'Settings')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => onScreen(page)).toEqual(['settings_program_block']);
  await openTab(page, 'magic');
  await expect(page.locator('.magic-tab-heading')).toHaveText(['Settings', 'Shots']);
  const turning = page.locator('.magic-entry', { hasText: 'Turning speed' });
  await expect(turning.locator('label')).toHaveText('set TURN_SPEED to');
  await turning.locator('input').fill('10'); await turning.locator('input').press('Enter');
  await page.locator('.magic-entry', { hasText: 'Shot look' }).locator('select').selectOption('star');
  await openTab(page, 'python');
  await expect(page.locator('#python')).toContainText('TURN_SPEED = 10');
  await expect(page.locator('#python')).toContainText('SHOT_LOOK = "star"');
  for (const line of ['.turn(-(TURN_SPEED))', '.turn(TURN_SPEED)', '.costume(SHOT_LOOK)']) await expect(page.locator('#python')).toContainText(line);
  expect(errors).toEqual([]);
});

test('a game without notes still has a book: Wren spots its numbers, and one becomes a note', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles('content/builds/jump-quest-game.json');
  if (await page.locator('#level-dialog').isVisible()) await page.locator('#level-keep').click();
  await openTab(page, 'magic');
  await expect(page.locator('#magic-says')).toContainText('no notes yet');
  const jump = page.locator('.magic-spotted', { hasText: 'Jump strength' });
  await expect(jump.locator('label')).toHaveText('jump if grounded at speed');
  await jump.getByRole('button', { name: 'Make this a note' }).click();
  await expect(page.locator('.magic-section-notes .magic-entry', { hasText: 'Jump strength' })).toHaveCount(1);
  await expect.poll(async () => JSON.stringify((await saved(page)).workspace.blocks)).toContain('Jump strength');
  // An empty project: the book explains how to write a note.
  await page.locator('#project-file').setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'python-blocks', formatVersion: 1, languageVersion: 23, workspace: { blocks: { languageVersion: 0, blocks: [] } } })) });
  await expect(page.locator('#magic-says')).toContainText('can’t find any magic numbers yet');
  await expect(page.locator('#magic-how')).toHaveAttribute('open', '');
});
