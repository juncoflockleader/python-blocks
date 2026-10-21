import { test, expect, type Page } from '@playwright/test';
import { openTab } from './shell';

/** The Academy: the map of eight chapters, Unit 1.1 run in the lesson panel, a quiz
 * answered on the spot, a problem checked by a scripted player that taps and waits,
 * mastery's one try, and the progress record for grown-ups, exported and imported. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const KEY = 'python-blocks.academy.v1';
/** A progress record with the first `count` steps of Unit 1.1 done, so Continue opens the next one. */
const progress = (count: number) => {
  const now = Date.now();
  return { format: 'python-blocks-academy', version: 1, learner: { id: 'learner-1', name: 'Juniper' },
    units: { 'unit-1-1': { started: now - 600_000, updated: now - 60_000, steps: Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { done: true, at: now - 60_000, ms: 30_000, hints: 0 }])) } } };
};
async function continueAt(page: Page, count: number) {
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(progress(count))]);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#academy-open').click();
  await page.locator('#academy-continue-go').click(); await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-active')).toBeVisible();
  await page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});
}
const saved = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);

test('the map shows eight chapters, and Unit 1.1 starts in the lesson panel with its own sprites', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#academy-open').click();
  await expect(page.locator('.academy-chapter h3')).toHaveText(['Chapter 1 · Signals', 'Chapter 2 · Loops', 'Chapter 3 · Decisions', 'Chapter 4 · Functions', 'Chapter 5 · Collections', 'Chapter 6 · Recursion', 'Chapter 7 · Algorithms', 'Chapter 8 · Systems']);
  await expect(page.locator('#academy-unit-unit-1-1')).toBeEnabled();
  await expect(page.locator('.academy-unit-row:disabled').first()).toContainText('Soon');
  await expect(page.locator('#academy-unit h3')).toHaveText('Tap and it talks');
  await expect(page.locator('.academy-parts li')).toHaveText([/Play\s*0 of 1/, /Guide\s*0 of 4/, /Practice\s*0 of 9/, /Challenge\s*0 of 1/, /Mastery\s*0 of 3/]);
  await expect(page.locator('#academy-continue')).toBeHidden();
  await page.locator('#academy-name').fill('Juniper'); await page.locator('#academy-name').press('Tab');
  await page.locator('#academy-start').click();
  await expect(page.locator('#lesson-start-eyebrow')).toHaveText('Academy · Chapter 1 · Unit 1.1');
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-build-title')).toHaveText('1.1 · Tap and it talks');
  await expect(page.locator('#guide-progress')).toHaveText('Play 1 of 1 · Play it');
  // A unit never lowers the level the learner chose (these tests start at Pro).
  await expect(page.locator('#level-name')).toHaveText('Pro');
  await expect(page.locator('#scene-cards button')).toHaveText([/Fox/, /Robot/]);
  // Units are in the Academy, not among the lessons.
  await page.locator('#lessons-open').click();
  await expect(page.locator('#lessons-list')).not.toContainText('Tap and it talks');
  expect((await saved(page)).learner.name).toBe('Juniper');
});

test('a quiz is answered on the spot, and a wrong guess offers another version of the question', async ({ page }) => {
  await continueAt(page, 5);
  await expect(page.locator('#guide-progress')).toHaveText('Practice 1 of 9 · Guess');
  await expect(page.locator('#guide-predict-result')).toBeHidden();
  const question = await page.locator('#guide-question').textContent();
  // A wrong answer: why, and another version.
  const wrong = question!.includes('What does Fox say') ? 'Tap me!' : 'Bye!';
  await page.locator('.guide-choice', { hasText: wrong }).first().click().catch(async () => page.locator('.guide-choice').last().click());
  await expect(page.locator('#guide-predict-result')).toHaveText(/^Not quite\./);
  await expect(page.locator('#guide-next')).toBeDisabled();
  await page.locator('#guide-another').click();
  const next = (await page.locator('#guide-question').textContent())!;
  const right = next.includes('Robot. What does Robot say') ? 'Beep boop!' : next.includes('Robot. What does Fox say') ? 'Nothing' : 'Hello!';
  await page.locator('.guide-choice', { hasText: right }).first().click();
  await expect(page.locator('#guide-predict-result')).toHaveText(/^Yes!/);
  await expect(page.locator('#guide-next')).toBeEnabled();
  const step = (await saved(page)).units['unit-1-1'].steps[5];
  expect(step).toMatchObject({ done: true, tries: 2, right: 1 });
});

test('Check my answer plays the game: a tap and a wait, what Fox said, and ✓ once the block is snapped in', async ({ page }) => {
  await continueAt(page, 6);
  await expect(page.locator('#guide-step-title')).toHaveText('Snap it in');
  await expect(page.locator('#guide-try')).toBeHidden();
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText(/0 of 1 checks pass/, { timeout: 60_000 });
  await expect(page.locator('#guide-results-list li')).toHaveText(/✗\s*Tap Fox: Fox says Hi!\s*Fox said nothing\./);
  await expect(page.locator('#guide-next')).toBeDisabled();
  // Show me how snaps it in; Start over puts the problem back as it was.
  await page.locator('#guide-hint').click(); await page.locator('#guide-hint').click();
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText('It works! Every check passes.', { timeout: 60_000 });
  await expect(page.locator('#guide-results-list li')).toHaveText(/✓\s*Tap Fox: Fox says Hi!/);
  await expect(page.locator('#guide-next')).toBeEnabled();
  expect((await saved(page)).units['unit-1-1'].steps[6]).toMatchObject({ done: true, tries: 2, right: 1, hints: 2 });
  // Start over puts the problem back as it was: the block is loose again, so the check fails again.
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.locator('#guide-results')).toBeHidden();
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText(/0 of 1 checks pass/, { timeout: 60_000 });
});

test('mastery is one try without hints, and the finish sheet says how it went', async ({ page }) => {
  await continueAt(page, 15);
  await expect(page.locator('#guide-progress')).toHaveText('Mastery 1 of 3');
  await expect(page.locator('#guide-hint')).toBeHidden();
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText(/That was your one try/, { timeout: 60_000 });
  await expect(page.locator('#guide-check-answer')).toBeDisabled();
  await page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});
  await page.locator('#guide-next').click();
  await page.locator('.guide-choice').first().click();
  await expect(page.locator('#guide-another')).toBeHidden();
  await page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});
  await page.locator('#guide-next').click();
  await page.locator('#guide-check-answer').click();
  await expect(page.locator('#guide-results-title')).toHaveText(/one try/, { timeout: 60_000 });
  await page.locator('.pop .pop-close').click({ timeout: 1000 }).catch(() => {});
  await page.locator('#guide-next').click();
  await expect(page.locator('#lesson-finish-title')).toHaveText('You finished Tap and it talks');
  await expect(page.locator('#lesson-finish-text')).toContainText(/Mastery: [01] of 3 right\. Practice a little more/);
  const unit = (await saved(page)).units['unit-1-1'];
  expect(unit.finished).toBeGreaterThan(0);
  expect([15, 16, 17].map(i => unit.steps[i].tries)).toEqual([1, 1, 1]);
});

test('grown-ups see time, steps, mastery and hints per unit, and the progress file exports and imports', async ({ page }) => {
  await continueAt(page, 9);
  await page.locator('#academy-open').click();
  await expect(page.locator('#academy-continue')).toContainText('Continue · 1.1 Tap and it talks');
  await expect(page.locator('.academy-parts li')).toHaveText([/Play\s*1 of 1/, /Guide\s*4 of 4/, /Practice\s*4 of 9/, /Challenge\s*0 of 1/, /Mastery\s*0 of 3/]);
  await page.locator('#academy-grownups').click();
  await expect(page.locator('#academy-map')).toBeHidden();
  await expect(page.locator('.academy-table tbody tr')).toHaveText([/1\.1 Tap and it talks\s*9 of 18\s*Not yet\s*0\s*5 min/]);
  await expect(page.locator('.academy-card').first()).toContainText('5 min');
  const download = page.waitForEvent('download');
  await page.locator('#academy-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('academy-progress-Juniper.json');
  // Importing another learner's file replaces this browser's record; anything else is refused.
  await page.locator('#academy-import').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"not": "progress"}') });
  await expect(page.locator('#academy-parents [role=status]')).toHaveText('That file is not an Academy progress file.');
  const other = { ...progress(2), learner: { id: 'learner-2', name: 'Sam' } };
  await page.locator('#academy-import').setInputFiles({ name: 'sam.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) });
  await expect(page.locator('#academy-parents [role=status]')).toHaveText('Progress for Sam is loaded.');
  await expect(page.locator('#academy-name')).toHaveValue('Sam');
  await expect(page.locator('.academy-table tbody tr')).toHaveText([/2 of 18/]);
  expect((await saved(page)).learner.name).toBe('Sam');
});

test('Run code in a unit uses the lesson stage, and a guide panel shows the cast until the program runs', async ({ page }) => {
  await continueAt(page, 1);
  await expect(page.locator('#guide-step-title')).toHaveText('Sprites wait for a signal');
  expect(await page.evaluate(() => document.documentElement.dataset.lessonStage)).toBe('small');
  await expect(page.locator('#puzzle-picture')).toBeAttached();
  await page.locator('.guide-choice', { hasText: 'Nothing happens' }).click();
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(/Event session running/, { timeout: 60_000 });
  await expect(page.locator('#puzzle-picture')).toHaveCount(0);
  await openTab(page, 'help');
  await expect(page.locator('#guide-predict-result')).toHaveText(/^You guessed it!/);
});
