import { test, expect, type Page } from '@playwright/test';
import { openTab } from './shell';

/** Room for a lesson in Blocks view: while the learner builds, the stage is a small
 * window beside the sprites and the step fits under it without scrolling; the step
 * shows one moment at a time (build, guess, what happened); Run code gives the game
 * the full stage, and going back to the blocks makes it small again. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function start(page: Page, id: string) {
  await page.goto('/'); await page.locator('#level-select').selectOption('builder'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#lessons-open').click(); await page.locator(`#lessons-start-${id}`).click(); await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-active')).toBeVisible();
  await page.locator('.coach-pop .pop-close').click().catch(() => {});
}
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const size = (page: Page) => page.evaluate(() => document.documentElement.dataset.lessonStage);
/** The whole step is in view: its card ends above the bottom of the panel. */
async function fits(page: Page) {
  const card = await box(page, '#guide-active'), panel = await box(page, '.tab-panels');
  expect(card.y).toBeGreaterThanOrEqual(panel.y - 1);
  expect(card.y + card.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
}

test('while building, the stage is small beside the sprites and the whole step fits under it', async ({ page }) => {
  await start(page, 'flappy-flight');
  expect(await size(page)).toBe('small');
  const stage = await box(page, '#stage'), column = await box(page, '.right-column'), tray = await box(page, '#sprite-tray');
  expect(stage.width).toBeLessThan(column.width * 0.6);
  expect(tray.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1); expect(tray.y).toBeLessThan(stage.y + stage.height);
  await expect(page.locator('#stage-toolbar')).toBeHidden();
  // The sprites can still be picked, and Paint and Sounds are still there, as icons.
  await expect(page.locator('#scene-cards button', { hasText: 'Pipe' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paint', exact: true })).toBeVisible();
  // Build: the goal and the list; the guess waits until the blocks are in. The step's tools sit by its title.
  await expect(page.locator('#guide-predict')).toBeHidden();
  await expect(page.locator('#guide-checklist li:not(.guide-folded)')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Read to me' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Why does it work?' })).toBeVisible();
  await expect(page.locator('.guide-actions').filter({ has: page.locator('#guide-next') }).getByRole('button')).toHaveText(['Back', 'Give me a hint', 'Next step']);
  await expect(page.locator('#guide-active .guide-head #guide-stop')).toHaveText('Leave lesson');
  await fits(page);
  // Guess: the blocks are in, so the finished items fold into one line and the guesses sit two by two.
  for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
  await expect(page.locator('.guide-summary')).toHaveText('Your blocks are in. Now guess!');
  await expect(page.locator('#guide-checklist li:not(.guide-folded):not(.guide-summary)')).toHaveCount(2);
  await expect(page.locator('#guide-predict')).toBeVisible();
  const [first, second] = await page.locator('.guide-choice').evaluateAll(choices => choices.slice(0, 2).map(c => c.getBoundingClientRect().top));
  expect(Math.abs(first - second)).toBeLessThan(2);
  await fits(page);
  // What happened: only the guess (here also the answer) stays, under one "All done!" line.
  await page.locator('.guide-choice', { hasText: 'Fall faster and faster' }).click();
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(/Event session running/, { timeout: 60_000 });
  await openTab(page, 'help');
  await expect(page.locator('.guide-summary')).toHaveText('All done!');
  await expect(page.locator('.guide-choice:visible')).toHaveCount(1);
  await expect(page.locator('#guide-predict-result')).toContainText('You guessed it!');
  await expect(page.locator('#guide-hints')).toBeHidden();
  const result = await box(page, '#guide-predict-result'), next = await box(page, '#guide-next'), panel = await box(page, '.tab-panels');
  expect(result.y).toBeGreaterThanOrEqual(panel.y - 1); expect(next.y + next.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
});

test('Run code gives the game the full stage, the blocks make it small again, and its button keeps it big', async ({ page }) => {
  await start(page, 'flappy-flight');
  for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
  await page.locator('.guide-choice', { hasText: 'Fall faster and faster' }).click();
  await page.locator('#run').click();
  await expect.poll(() => size(page)).toBe('big');
  const stage = await box(page, '#stage'), column = await box(page, '.right-column');
  expect(stage.width).toBeGreaterThan(column.width - 4);
  await expect(page.locator('#stage-toolbar')).toBeVisible();
  // Back to the blocks: the stage steps back while the game keeps running.
  await page.locator('.cheer-pop .pop-close').click().catch(() => {});
  const canvas = await box(page, '#blockly');
  await page.mouse.click(canvas.x + canvas.width - 80, canvas.y + 60);
  await expect.poll(() => size(page)).toBe('small');
  await expect(page.locator('#status')).toHaveText(/Event session running/);
  // The button on the stage makes it big, and it stays big while the learner builds.
  await page.getByRole('button', { name: 'Make the stage bigger' }).click();
  expect(await size(page)).toBe('big');
  await page.mouse.click(canvas.x + canvas.width - 80, canvas.y + 60);
  expect(await size(page)).toBe('big');
  await page.getByRole('button', { name: 'Make the stage smaller' }).click();
  expect(await size(page)).toBe('small');
  // Leaving the lesson gives free play its usual stage.
  await page.locator('#stop').click();
  await page.locator('#guide-stop').click();
  expect(await size(page)).toBeUndefined();
  await expect(page.locator('#stage-size')).toBeHidden();
  expect((await box(page, '#stage')).width).toBeGreaterThan(column.width - 4);
});

test('a puzzle keeps its picture small, and Stage view keeps its own large stage', async ({ page }) => {
  await start(page, 'code-puzzles');
  expect(await size(page)).toBe('small');
  await expect(page.locator('#stage-size')).toBeHidden();
  await page.locator('#guide-hint').click(); await page.locator('#guide-hint').click(); await page.locator('#guide-hint').click();
  await page.locator('#run').click(); await expect(page.locator('#run')).toBeEnabled({ timeout: 60_000 });
  expect(await size(page)).toBe('small');
  await openTab(page, 'help'); await fits(page);
  // Stage view is unchanged by a lesson: the large stage, the lesson beside it.
  await page.locator('#view-stage').click();
  const stage = await box(page, '#stage');
  expect(stage.width).toBeGreaterThan(500);
  await expect(page.locator('#stage-size')).toBeHidden();
  await page.locator('#view-blocks').click();
  expect(await size(page)).toBe('small');
});

for (const [width, height] of [[1080, 700], [1366, 768], [1024, 768]]) {
  test(`at ${width} × ${height} a step fits while building`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await start(page, 'flappy-flight');
    await fits(page);
    for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
    await expect(page.locator('#guide-predict')).toBeVisible();
    await fits(page);
  });
}
