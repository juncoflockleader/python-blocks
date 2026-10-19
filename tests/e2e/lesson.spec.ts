import { test, expect, type Page } from '@playwright/test';
import { openHelp, openTab } from './shell';

// The Brick Breaker lesson, walked through with only what a learner has: the
// start sheet, the hint ladder ("Show me how" last), idea cards, typing numbers
// into blocks, predictions, Run code and playing the game.
test.use({ viewport: { width: 1024, height: 700 } });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const handlers = async (page: Page) => ((await saved(page)).workspace.procedures ?? []).length;

async function startLesson(page: Page) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openHelp(page, 'builds'); await page.locator('#guide-start-brick-breaker').click();
  await expect(page.locator('#lesson-start')).toBeVisible();
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#lesson-start')).toBeHidden();
  await expect(page.locator('#guide-build-title')).toHaveText('1 · Paddle');
}
/** Climb the hint ladder to its last rung, "Show me how". */
async function showMeHow(page: Page) {
  await openTab(page, 'help');
  for (let rung = 0; rung < 3; rung++) {
    const button = page.locator('#guide-hint');
    if ((await button.textContent()) === 'Show me how') { await button.click(); return; }
    await button.click();
  }
  throw new Error('No "Show me how" on this step');
}
async function insertIdea(page: Page, recipe: string) {
  await page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-insert`).click();
  await expect(page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-status`)).toContainText('Added');
}
async function next(page: Page, chapter?: string) {
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/, { timeout: 60_000 }); await page.locator('#guide-next').click();
  if (chapter) await expect(page.locator('#guide-build-title')).toHaveText(chapter);
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function typeInto(page: Page, field: string, nth: number, value: string) {
  const target = page.getByRole('button', { name: `Edit text: ${field}`, exact: true }).nth(nth);
  await target.scrollIntoViewIfNeeded(); await target.click();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(value); await page.keyboard.press('Enter');
}

test('Brick Breaker: the start sheet keeps the project, and the lesson can be built from start to finish', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: info.outputPath(`${name}.png`) });
  test.setTimeout(240_000);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const before = await saved(page);
  await openHelp(page, 'builds'); await page.locator('#guide-start-brick-breaker').click();
  await expect(page.locator('#lesson-start-title')).toHaveText('Brick Breaker');
  await expect(page.locator('#lesson-start-chapters li')).toHaveCount(6);
  await expect(page.locator('#lesson-start-learn li')).toHaveCount(4);
  await expect(page.locator('#lesson-start-note')).toContainText('is kept');
  await expect(page.locator('#lesson-start-preview')).toHaveJSProperty('complete', true); await shot('1-start');
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#tab-help')).toHaveText('Lesson');
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 2');
  await expect(page.locator('#guide-checklist li')).toHaveCount(3);

  // 1. Hints first, then the idea card; the learner still types the 0.
  await page.locator('#guide-hint').click(); await expect(page.locator('#guide-hint-text')).toContainText('control sprite');
  await page.locator('#guide-hint').click(); await expect(page.locator('#guide-hint')).toHaveText('Show me how');
  await page.locator('#guide-hint').click(); await insertIdea(page, 'arrow-keys');
  await openTab(page, 'help'); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(2); await expect(page.locator('#guide-next')).toBeDisabled();
  await shot('2-step');
  await typeInto(page, '180', 1, '0');
  await next(page);
  // 2. The idea already stops the paddle at the edges; the step still needs a run.
  await openTab(page, 'help'); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(1);
  await run(page); await page.locator('#stop').click();
  await next(page, '2 · Ball');

  // 3. Predict: a run before choosing does not count.
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 2 · Predict');
  await showMeHow(page); await expect(page.locator('#guide-hint-text')).toContainText('added the blocks');
  await run(page); await page.locator('#stop').click();
  await openTab(page, 'help'); await expect(page.locator('#guide-predict-result')).toContainText('Choose what you think will happen first');
  await page.locator('#guide-choices button', { hasText: 'Up and to the right' }).click();
  await run(page); await openTab(page, 'help');
  await expect(page.locator('#guide-predict-result')).toContainText('You predicted it.'); await shot('3-predict');
  await page.locator('#stop').click();
  await next(page);
  // 4. Bounce off the walls.
  await showMeHow(page); await run(page); await page.locator('#stop').click();
  await next(page, '3 · Bounce back');
  // 5. Paddle sends the ball up.
  await showMeHow(page); await run(page); await page.locator('#stop').click();
  await next(page, '4 · Brick wall');

  // 6. Fix it: the lesson writes a broken loop once, even across a reload.
  await expect(page.locator('#guide-planted')).toBeVisible(); await run(page); await shot('4-fix'); await page.locator('#stop').click();
  await expect.poll(() => handlers(page)).toBe(5);
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await openTab(page, 'help'); await expect(page.locator('#guide-build-title')).toHaveText('4 · Brick wall');
  await expect.poll(() => handlers(page)).toBe(5);
  await showMeHow(page); await expect(page.locator('#guide-hint-text')).toContainText('swapped in a working script');
  await expect.poll(() => handlers(page)).toBe(5);
  await run(page); await page.locator('#stop').click();
  await next(page);
  // 7. Rows: the working wall replaces the row, not adds to it.
  await showMeHow(page); await expect.poll(() => handlers(page)).toBe(5);
  await run(page); await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '27'); await page.locator('#stop').click();
  await next(page, '5 · Breaking bricks');

  // 8. One script for every brick; destroy goes last.
  await expect(page.locator('#guide-checklist li')).toHaveCount(4);
  await showMeHow(page);
  await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(4);
  await next(page);
  // 9. Play-test: the bottom still bounces, so the ball keeps breaking bricks.
  await expect(page.locator('#guide-progress')).toHaveText('Step 2 of 2 · Play-test');
  await expect(page.locator('#guide-goal-count')).toHaveText('0 of 5');
  await run(page); await openTab(page, 'help');
  await expect(page.locator('#guide-goal-count')).toHaveText('5 of 5', { timeout: 60_000 }); await shot('5-play');
  await page.locator('#stop').click();
  await next(page, '6 · Win or lose');

  // 10. Lives and a miss.
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(3);
  await next(page);
  // 11. Predict the brick count, then win at it with the idea card.
  await page.locator('#guide-choices button', { hasText: /^24$/ }).click();
  await showMeHow(page); await insertIdea(page, 'win-screen');
  await typeInto(page, '5', 0, '24');
  await next(page);
  // 12. Play to the end: an unmoving paddle loses its three lives.
  await run(page);
  await expect(page.locator('#status')).toHaveText(/You win!|Game over|Let’s try again/, { timeout: 90_000 });
  await openTab(page, 'help'); await expect(page.locator('#guide-next')).toHaveText('Finish'); await page.locator('#guide-next').click();

  await expect(page.locator('#lesson-finish')).toBeVisible();
  await expect(page.locator('#lesson-finish-title')).toHaveText('You built Brick Breaker');
  await expect(page.locator('#lesson-finish-remix li')).toHaveCount(3);
  await expect(page.locator('#lesson-finish-learn li')).toHaveCount(6);
  await expect(page.locator('#lesson-finish-next')).toHaveText('Next: Jump quest'); await shot('6-finish');
  // The project from before the lesson comes back.
  await page.locator('#lesson-finish-return').click();
  await expect(page.locator('#lesson-finish')).toBeHidden();
  await expect(page.locator('#tab-help')).toHaveText('Help');
  await expect.poll(async () => (await saved(page)).workspace.blocks).toEqual(before.workspace.blocks);
  await expect(page.locator('#guide-kept')).toBeHidden();
});

test('a lesson can be declined, and leaving it restores the Help tab', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const before = await saved(page);
  await openHelp(page, 'builds'); await page.locator('#guide-start-brick-breaker').click();
  await page.locator('#lesson-start-cancel').click();
  await expect(page.locator('#lesson-start')).toBeHidden();
  expect((await saved(page)).workspace.blocks).toEqual(before.workspace.blocks);
  await startLesson(page);
  await page.locator('#guide-stop').click();
  await expect(page.locator('#tab-help')).toHaveText('Help');
  await expect(page.locator('#guide-kept')).toBeVisible();
  await page.locator('#guide-kept-return').click();
  await expect.poll(async () => (await saved(page)).workspace.blocks).toEqual(before.workspace.blocks);
});
