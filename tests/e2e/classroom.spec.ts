import { test, expect, type Page } from '@playwright/test';

/** Classrooms: Unit 1.1 in the narrowed editor. A step shows only its own blocks in one list, the
 * editor's other tools are put away, one button says what to do next, the blocks a step makes are
 * locked, and leaving gives the whole editor back. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const KEY = 'python-blocks.academy.v1';
const progress = (count: number, unit = 'unit-1-1') => {
  const now = Date.now();
  return { format: 'python-blocks-academy', version: 1, learner: { id: 'learner-1', name: 'Juniper' },
    units: { [unit]: { started: now - 600_000, updated: now - 60_000, steps: Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { done: true, at: now - 60_000, ms: 30_000, hints: 0 }])) } } };
};
/** Open Unit 1.1 at the step after the first `count`, as Continue on the map does. */
async function continueAt(page: Page, count: number, unit = 'unit-1-1') {
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(progress(count, unit))]);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#academy-open').click();
  await page.locator('#academy-continue-go').click(); await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-active')).toBeVisible();
  await page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});
}
const room = (page: Page) => page.evaluate(() => document.documentElement.dataset.classroom);
/** The buttons in the lesson's one row, as the learner sees them. */
const moves = (page: Page) => page.locator('#guide-active .guide-actions button:visible');
const AWAY = ['#level-control', '#examples-open', '#lessons-open', '#menu-button', '#view-switch', '.blocklyToolbox', '#block-search-toggle', '#script-tabs', '.tab-bar', '#sprite-tray', '#help-ideas'];
const listed = (page: Page) => page.locator('.blocklyFlyout .blocklyBlockCanvas > g.blocklyBlock');
const scripts = (page: Page, type: string) => page.locator(`.blocklyMainBackground ~ .blocklyBlockCanvas > g.${type}`);

test('a build step shows its three blocks in one list, puts the other tools away, and offers one next move', async ({ page }) => {
  await continueAt(page, 4);
  await expect(page.locator('#guide-step-title')).toHaveText('A key is a signal too');
  expect(await room(page)).toBe('blocks');
  for (const selector of AWAY) await expect(page.locator(selector), selector).toBeHidden();
  for (const selector of ['#run', '#academy-open', '#stage', '#zoom-in', '#guide-stop']) await expect(page.locator(selector), selector).toBeVisible();
  // Your blocks: the step's three blocks and no others, each under its number.
  await expect(page.locator('.blocklyFlyout .classroom-blocks-title')).toBeVisible();
  await expect(listed(page)).toHaveCount(3);
  await expect(page.locator('.blocklyFlyout .blocklyBlockCanvas > g.py_event_hat')).toHaveCount(2);
  await expect(page.locator('.blocklyFlyout .blocklyBlockCanvas > g.scene_say_for')).toHaveCount(1);
  await expect(page.locator('.blocklyFlyout .block-caption-number')).toHaveText(['1', '2', '3']);
  // The step's words point at the same numbers.
  await expect(page.locator('#guide-checklist .block-ref-number')).toHaveText(['1', '3']);
  // The guide beside the stage: the goal, the stop, and its five steps with this one open.
  await expect(page.locator('#classroom-title')).toHaveText('A key is a signal too');
  await expect(page.locator('#classroom-stop')).toHaveText('Story');
  await expect(page.locator('.classroom-dot')).toHaveCount(5);
  await expect(page.locator('.classroom-dot-done')).toHaveCount(4);
  await expect(page.locator('.classroom-dot-now')).toHaveText('5');
  // One row of buttons, one next move: nothing to press yet but help.
  await expect(moves(page)).toHaveText(['Back', 'I’m stuck', 'Next step']);
  await expect(page.locator('#guide-next')).toBeDisabled();
  // Help to the end puts the blocks in, beside the list that stays open; the next move is to run them.
  for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
  await expect(scripts(page, 'py_handler')).toHaveCount(1);
  await expect(listed(page)).toHaveCount(3);
  await expect(moves(page)).toHaveText(['Back', 'All help shown', 'Run code']);
  await page.locator('#guide-run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running/, { timeout: 60_000 });
  await expect(page.locator('#guide-next')).toBeEnabled();
  await expect(moves(page).last()).toHaveText('Next step');
  // The script is shown from its "when" block, clear of the list.
  const script = (await scripts(page, 'py_handler').boundingBox())!, list = (await page.locator('.blocklyFlyout').boundingBox())!;
  expect(script.x).toBeGreaterThanOrEqual(list.x + list.width);
});

test('a block dragged out of the list becomes the learner’s, and the list stays open', async ({ page }) => {
  await continueAt(page, 7);
  await expect(page.locator('#guide-step-title')).toHaveText('Make Robot talk');
  await expect(listed(page)).toHaveCount(3);
  // The "when clicked" block is for the sprite the step is about.
  await expect(listed(page).first()).toContainText('Robot');
  const hat = (await listed(page).first().boundingBox())!, list = (await page.locator('.blocklyFlyout').boundingBox())!;
  await page.mouse.move(hat.x + 14, hat.y + 14); await page.mouse.down();
  await page.mouse.move(list.x + list.width + 120, hat.y + 60, { steps: 12 }); await page.mouse.up();
  await expect(scripts(page, 'py_handler')).toHaveCount(1);
  await expect(listed(page)).toHaveCount(3);
  // A checked problem's next move is Check my answer; it says what the checker saw.
  await expect(moves(page)).toHaveText(['Back', 'I’m stuck', 'Check my answer']);
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText(/0 of 1 checks pass/, { timeout: 60_000 });
  await expect(page.locator('#guide-results-list li')).toContainText('Robot said nothing.');
  await expect(moves(page).last()).toHaveText('Check my answer');
  // A page reload puts the work back, and the list is again the step's three blocks, for the step's sprite.
  await page.reload(); await expect(page.locator('#guide-active')).toBeVisible();
  await expect(scripts(page, 'py_handler')).toHaveCount(1);
  await expect(listed(page)).toHaveCount(3);
  await expect(listed(page).first()).toContainText('Robot');
  // Tapping another sprite on the stage does not change whose blocks the list makes: the step is about Robot.
  const stage = (await page.locator('#stage').boundingBox())!;
  await page.mouse.click(stage.x + stage.width * 0.23, stage.y + stage.height * 0.6);
  await page.waitForTimeout(400);
  await expect(listed(page).first()).toContainText('Robot');
});

test('blocks a step makes are locked, loose ones are not, and leaving the classroom gives the editor back', async ({ page }) => {
  await continueAt(page, 6);
  await expect(page.locator('#guide-step-title')).toHaveText('Snap it in');
  // Nothing to build with here: the blocks are on the workspace, so there is no list.
  expect(await room(page)).toBe('watch');
  await expect(page.locator('.blocklyFlyout')).toBeHidden();
  const hat = scripts(page, 'py_handler'), say = scripts(page, 'scene_say_for');
  await expect(hat).toHaveCount(1); await expect(say).toHaveCount(1);
  await expect(hat).toHaveClass(/blocklyNotDeletable/);
  // Delete does nothing to the "when" block the step made; the loose block is the learner's to lose.
  const at = (await hat.boundingBox())!;
  await page.mouse.click(at.x + 12, at.y + 12); await page.keyboard.press('Delete');
  await expect(hat).toHaveCount(1);
  // It cannot be dragged off either: a drag that starts on it slides the whole workspace, so it stays where it was beside the loose block.
  const apart = async () => { const a = (await hat.boundingBox())!, b = (await say.boundingBox())!; return [Math.round(b.x - a.x), Math.round(b.y - a.y)]; };
  const before = await apart();
  await page.mouse.move(at.x + 12, at.y + 12); await page.mouse.down(); await page.mouse.move(at.x + 60, at.y + 40, { steps: 8 }); await page.mouse.up();
  expect(await apart()).toEqual(before);
  const loose = (await say.boundingBox())!;
  await page.mouse.click(loose.x + 8, loose.y + 8); await page.keyboard.press('Delete');
  await expect(say).toHaveCount(0);
  // Start over brings the problem back as it was, and Undo cannot take away what the step made.
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(say).toHaveCount(1); await expect(hat).toHaveClass(/blocklyNotDeletable/);
  await page.locator('#top-history button').first().click();
  await expect(hat).toHaveCount(1); await expect(say).toHaveCount(1);
  // Leaving: the whole editor is back, and the blocks left behind are free.
  await page.locator('#guide-stop').click();
  expect(await room(page)).toBeUndefined();
  for (const selector of ['#level-control', '#examples-open', '#lessons-open', '#menu-button', '.blocklyToolbox', '.tab-bar', '#sprite-tray']) await expect(page.locator(selector), selector).toBeVisible();
  await expect(page.locator('#classroom-guide')).toBeHidden();
  await expect(hat).not.toHaveClass(/blocklyNotDeletable/);
  await page.locator('#tab-sprite').click();
  await expect(page.locator('#panel-sprite')).toBeVisible();
});

test('the Bonus stop brings the sprites back, and the list follows the sprite picked', async ({ page }) => {
  await continueAt(page, 14);
  await expect(page.locator('#guide-step-title')).toHaveText('Your own talking card');
  await expect(page.locator('#classroom-stop')).toHaveText('Bonus');
  await expect(page.locator('#sprite-tray')).toBeVisible();
  await expect(listed(page)).toHaveCount(5);
  await expect(listed(page).first()).toContainText('Fox');
  await page.locator('#scene-cards button', { hasText: 'Robot' }).click();
  await expect(listed(page).first()).toContainText('Robot');
  // A challenge is done when the learner says so: Next step is there from the start.
  await expect(moves(page).last()).toHaveText('Next step');
  await expect(page.locator('#guide-next')).toBeEnabled();
});

test('a guess step has no blocks to choose from: guess, then Run code, then Next step', async ({ page }) => {
  await continueAt(page, 1);
  expect(await room(page)).toBe('watch');
  await expect(page.locator('.blocklyFlyout')).toBeHidden();
  await expect(scripts(page, 'py_handler')).toHaveClass(/blocklyNotDeletable/);
  await expect(moves(page)).toHaveText(['Back', 'Next step']);
  await expect(page.locator('#guide-next')).toBeDisabled();
  await page.locator('.guide-choice', { hasText: 'Nothing happens' }).click();
  await expect(moves(page)).toHaveText(['Back', 'Run code']);
  await page.locator('#guide-run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running/, { timeout: 60_000 });
  await expect(moves(page)).toHaveText(['Back', 'Next step']);
  await expect(page.locator('#guide-next')).toBeEnabled();
  // The lesson stays in front while the game runs: output never takes its place.
  await expect(page.locator('#guide-predict-result')).toBeVisible();
});

for (const [width, height] of [[1080, 700], [1024, 768], [1366, 768]]) {
  test(`at ${width} × ${height} the list, the workspace, the step and its next move all fit`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await continueAt(page, 7);
    const list = (await page.locator('.blocklyFlyout').boundingBox())!, blocks = (await page.locator('#blockly').boundingBox())!;
    // Room to build beside the list.
    expect(blocks.width - list.width).toBeGreaterThan(260);
    // The longest row of buttons (a second hint, and Check my answer) stays inside the lesson's column, above the bottom edge.
    await page.locator('#guide-hint').click();
    await expect(moves(page)).toHaveText(['Back', 'Another hint', 'Check my answer']);
    const column = (await page.locator('.right-column').boundingBox())!;
    for (const button of await moves(page).all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(column.x); expect(box.x + box.width).toBeLessThanOrEqual(column.x + column.width);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
    }
    const next = (await page.locator('#guide-check-answer').boundingBox())!, words = (await page.locator('#guide-step').boundingBox())!, stage = (await page.locator('#stage').boundingBox())!;
    expect(words.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    expect(words.y + words.height).toBeLessThanOrEqual(next.y);
    // The whole list is in view, so no block has to be found by scrolling.
    const last = (await listed(page).last().boundingBox())!;
    expect(last.y + last.height).toBeLessThanOrEqual(height);
  });
}
