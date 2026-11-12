import { test, expect, type Page } from '@playwright/test';

/** The chapter path: the Academy's front door. A chapter is one path of stops with the stop to do
 * next marked, one Continue button that goes straight into it, and Back to map from the unit. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const KEY = 'python-blocks.academy.v1';
/** A progress record with these steps done, per unit. */
const progress = (done: Record<string, number[]>) => {
  const now = Date.now();
  return { format: 'python-blocks-academy', version: 1, learner: { id: 'learner-1', name: 'Juniper' },
    units: Object.fromEntries(Object.entries(done).map(([unit, steps]) => [unit, { started: now - 600_000, updated: now - 60_000, steps: Object.fromEntries(steps.map(i => [i, { done: true, at: now - 60_000, ms: 30_000, hints: 0 }])) }])) };
};
const upTo = (count: number) => Array.from({ length: count }, (_, i) => i);
async function openPath(page: Page, done: Record<string, number[]> | null = null) {
  if (done) await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(progress(done))]);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#academy-open').click();
  await expect(page.locator('#chapter-path')).toBeVisible();
}
const stops = (page: Page) => page.locator('.path-stop-button');
const states = (page: Page) => stops(page).evaluateAll(buttons => buttons.map(button => (button as HTMLElement).dataset.state));
const room = (page: Page) => page.evaluate(() => document.documentElement.dataset.classroom);
const closeTip = (page: Page) => page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});

test('the Academy opens on the chapter path: a new learner starts at the Story, goes straight in, and comes back to the map', async ({ page }) => {
  await openPath(page);
  await expect(page.locator('#path-chapter-number')).toHaveText('Chapter 1');
  await expect(page.locator('#path-chapter-title')).toHaveText('Signals');
  // Chapter 1 is 19 stops; the first is the one to do, and the rest are locked.
  await expect(stops(page)).toHaveCount(19);
  expect(await states(page)).toEqual(['now', ...Array(18).fill('locked')]);
  await expect(stops(page).nth(0)).toHaveAccessibleName('1.1 Story: next');
  await expect(stops(page).nth(1)).toBeDisabled();
  await expect(page.locator('.path-unit')).toHaveText(['1.1 · Tap and it talks', '1.2 · Keys move things', '1.3 · Where is x, y?', '1.4 · Greeting card']);
  await expect(page.locator('#path-bubble')).toHaveText('Hi! Start here.');
  await expect(page.locator('#path-count')).toHaveText('Stop 1 of 19 in this chapter');
  await expect(page.locator('#path-next-title')).toHaveText('Story');
  await expect(page.locator('#path-next-text')).toHaveText('1.1 · Tap and it talks · Watch, guess and try it');
  await expect(page.locator('#path-go')).toHaveText('Start');
  await expect(page.locator('#path-coins')).toBeHidden();
  // Every chapter and unit, and the view for grown-ups, are one button away.
  await page.locator('#path-chapters').click();
  await expect(page.locator('.academy-chapter h3').first()).toHaveText('Chapter 1 · Signals');
  await page.locator('#academy-close').click();
  await expect(page.locator('#chapter-path')).toBeVisible();
  // Start goes straight into the stop: no start sheet to read first.
  await page.locator('#path-go').click();
  await expect(page.locator('#chapter-path')).toBeHidden();
  await expect(page.locator('#lesson-start')).toBeHidden();
  await expect(page.locator('#guide-step-title')).toHaveText('Play first');
  expect(await room(page)).toBe('watch');
  await expect(page.locator('#guide-stop')).toHaveText('Back to map');
  // Back to map: the path again, and under it the project from before the unit.
  await page.locator('#guide-stop').click();
  await expect(page.locator('#chapter-path')).toBeVisible();
  expect(await room(page)).toBeUndefined();
  expect(await page.evaluate(() => [localStorage.getItem('python-blocks.guide.v1'), localStorage.getItem('python-blocks.guide.kept.v1')])).toEqual([null, null]);
  await page.locator('#path-close').click();
  await expect(page.locator('#chapter-path')).toBeHidden();
  await expect(page.locator('#project-title')).toHaveText('My first drawing');
  await expect(page.locator('#lessons-open')).toBeVisible();
  await expect(page.locator('.blocklyNotDeletable')).toHaveCount(0);
});

test('stops that are done can be played again, the next one is marked, and the Bonus is open beside it', async ({ page }) => {
  await openPath(page, { 'unit-1-1': upTo(14) });
  expect((await states(page)).slice(0, 7)).toEqual(['done', 'done', 'done', 'done', 'open', 'now', 'locked']);
  await expect(page.locator('#path-count')).toHaveText('Stop 6 of 19 in this chapter');
  await expect(page.locator('#path-next-title')).toHaveText('Star check');
  await expect(page.locator('#path-go')).toHaveText('Continue');
  await expect(page.locator('#path-learner')).toContainText('Juniper');
  await expect(page.locator('.path-dot-done')).toHaveCount(4);
  // The Bonus can be done now or skipped.
  await stops(page).nth(4).click();
  await expect(page.locator('#guide-step-title')).toHaveText('Your own talking card');
  await closeTip(page);
  // From inside the unit the map is still there; a stop that is done opens at its first step.
  await page.locator('#academy-open').click();
  await stops(page).nth(0).click();
  await expect(page.locator('#chapter-path')).toBeHidden();
  await expect(page.locator('#guide-step-title')).toHaveText('Play first');
  // The stop that is open already just comes back.
  await page.locator('#academy-open').click();
  await stops(page).nth(0).click();
  await expect(page.locator('#guide-step-title')).toHaveText('Play first');
  await page.locator('#academy-open').click();
  await page.locator('#path-go').click();
  await expect(page.locator('#guide-step-title')).toHaveText('Show what you know: tap to talk');
});

test('the path goes on to the next unit, which opens from it and comes back to it', async ({ page }) => {
  await openPath(page, { 'unit-1-1': [...upTo(14), 15, 16, 17] });
  // The skipped Bonus stays open; the next needed stop is Unit 1.2's Story.
  expect((await states(page)).slice(4, 8)).toEqual(['open', 'done', 'now', 'locked']);
  await expect(page.locator('#path-next-text')).toHaveText('1.2 · Keys move things · Watch, guess and try it');
  await expect(page.locator('#path-bubble')).toHaveText('A new story. Come and see!');
  await page.locator('#path-go').click();
  await expect(page.locator('#lesson-start')).toBeHidden();
  await expect(page.locator('#guide-build-title')).toHaveText('1.2 · Keys move things');
  await expect(page.locator('#guide-stop')).toHaveText('Back to map');
  // A reload in the middle of the unit changes nothing: it still goes back to the map.
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#guide-build-title')).toHaveText('1.2 · Keys move things');
  await expect(page.locator('#guide-stop')).toHaveText('Back to map');
  await page.locator('#guide-stop').click();
  await expect(page.locator('#chapter-path')).toBeVisible();
  await expect(page.locator('#path-go')).toBeFocused();
});

test('a finished chapter says so, and every stop can be played again', async ({ page }) => {
  await openPath(page, { 'unit-1-1': upTo(18), 'unit-1-2': upTo(18), 'unit-1-3': upTo(18), 'unit-1-4': upTo(7) });
  expect(await states(page)).toEqual(Array(19).fill('done'));
  await expect(page.locator('#path-count')).toHaveText('All 16 stops done');
  await expect(page.locator('.path-next')).toHaveText(/Well done\s*Chapter finished\s*Tap any stop to play it again\./);
  await expect(page.locator('#path-go')).toBeHidden();
  await expect(page.locator('#path-bubble')).toHaveText('You finished the chapter!');
  await expect(stops(page).nth(18)).toHaveAccessibleName('1.4 Big project: done, play it again');
});

for (const [width, height] of [[1024, 700], [1366, 768], [820, 1180]] as const) {
  test(`the path fits at ${width} × ${height}: the stop to do next is in view, with Continue under it`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openPath(page, { 'unit-1-1': upTo(18), 'unit-1-2': upTo(14) });
    const inView = async (selector: string) => { const box = (await page.locator(selector).boundingBox())!; return box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height; };
    for (const selector of ['.path-bar', '.path-foot', '#path-go', '#path-close', '#path-chapters', '.path-stop-now .path-node', '#path-bubble']) expect(await inView(selector), selector).toBe(true);
    // The page itself never scrolls; the path does, sideways.
    expect(await page.evaluate(() => { const scroll = document.getElementById('path-scroll')!; return [document.documentElement.scrollWidth <= innerWidth, scroll.scrollLeft > 0, scroll.scrollHeight <= scroll.clientHeight + 1]; })).toEqual([true, true, true]);
  });
}
