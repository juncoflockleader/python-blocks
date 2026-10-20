import { test, expect, type Page } from '@playwright/test';
import { openTab } from './shell';

/** Code Puzzles: a lesson of small programming problems. Each program reads its
 * input with the read blocks and prints its answer; Check my answer runs it on
 * every test in a worker of its own. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function start(page: Page) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#lessons-open').click();
  await expect(page.locator('[data-lesson="code-puzzles"]')).toContainText('3 chapters · 8 puzzles');
  await page.locator('#lessons-start-code-puzzles').click(); await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-progress')).toHaveText('Puzzle 1 of 8');
}
async function showMeHow(page: Page) {
  await openTab(page, 'help');
  while (await page.locator('#guide-hint').textContent() !== 'Show me how') await page.locator('#guide-hint').click();
  await page.locator('#guide-hint').click();
}
const check = async (page: Page) => { await openTab(page, 'help'); await page.locator('#guide-check-answer').click(); };

test('all eight puzzles are solved by their answers, checked on every test', async ({ page }) => {
  test.setTimeout(240_000);
  await start(page);
  const titles = ['Say hello', 'Coin bags', 'Taller tower', 'Staircase', 'Countdown', 'Buzzing bees', 'High score', 'Gem pairs'];
  for (const [index, title] of titles.entries()) {
    await expect(page.locator('#guide-step-title')).toHaveText(title);
    await expect(page.locator('#puzzle-picture')).toBeVisible();
    await showMeHow(page); await check(page);
    await expect(page.locator('#guide-results-title')).toHaveText(/^All \d tests pass!$/, { timeout: 60_000 });
    await expect(page.locator('#guide-results-list .puzzle-fail')).toHaveCount(0);
    await expect(page.locator('#guide-check')).toHaveText(/You did it/);
    await page.locator('#guide-next').click();
    if (index < titles.length - 1) await expect(page.locator('#guide-progress')).toHaveText(`Puzzle ${index + 2} of 8`);
  }
  await expect(page.locator('#lesson-finish-title')).toHaveText('You built Code Puzzles');
  await expect(page.locator('#puzzle-picture')).toHaveCount(0);
});

test('a failing check shows the input, what was printed and the answer wanted, with a tip', async ({ page }) => {
  await start(page);
  // An empty program prints nothing: every test fails, and the first one says why.
  await check(page);
  await expect(page.locator('#guide-results-title')).toHaveText('0 of 4 tests pass', { timeout: 60_000 });
  const first = page.locator('#guide-results-list .puzzle-fail').first();
  await expect(first.locator('details')).toHaveAttribute('open', '');
  await expect(first).toContainText('Ana'); await expect(first).toContainText('Hello, Ana!');
  await expect(first.locator('.puzzle-tip')).toContainText('did not print anything');
  await expect(page.locator('#guide-check')).not.toHaveText(/You did it/);
});

test('Try it and Run code read the Try it input; reading past its end says so', async ({ page }) => {
  await start(page);
  await showMeHow(page); await check(page);
  await expect(page.locator('#guide-results-title')).toHaveText('All 4 tests pass!', { timeout: 60_000 });
  await page.locator('#guide-next').click(); await expect(page.locator('#guide-step-title')).toHaveText('Coin bags');
  await showMeHow(page);
  await expect(page.locator('#guide-examples')).toContainText('3');
  await page.locator('#guide-try').click();
  await expect(page.locator('#guide-try-output')).toHaveText('8', { timeout: 60_000 });
  await expect(page.locator('#guide-try-verdict')).toHaveText('✓ That is the answer wanted.');
  await page.locator('#guide-try-input').fill('3');
  await page.locator('#guide-try').click();
  await expect(page.locator('#guide-try-verdict')).toHaveText('Your program read more lines than its input has. Each read block reads the next line.', { timeout: 60_000 });
  await page.locator('#guide-try-input').fill('10\n20');
  await page.locator('#guide-try').click();
  await expect(page.locator('#guide-try-output')).toHaveText('30', { timeout: 60_000 });
  await expect(page.locator('#guide-try-verdict')).toHaveText('That is what your program printed for your input.');
  // Run code reads the same input, and the Python tab shows real Python.
  await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('30', { timeout: 60_000 });
  await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('a = int(input())');
});
