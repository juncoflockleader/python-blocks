import { test, expect, type Page } from '@playwright/test';
import { openHelp, openTab } from './shell';

// The lessons, walked through with only what a learner has: the start sheet,
// the hint ladder ("Show me how" last), idea cards, typing numbers into blocks,
// predictions, Run code and playing the game.
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
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/You did it|Done/, { timeout: 60_000 }); await page.locator('#guide-next').click();
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
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 2 · Guess first');
  await showMeHow(page); await expect(page.locator('#guide-hint-text')).toContainText('added the blocks');
  await run(page); await page.locator('#stop').click();
  await openTab(page, 'help'); await expect(page.locator('#guide-predict-result')).toContainText('Pick your guess first');
  await page.locator('#guide-choices button', { hasText: 'Up and to the right' }).click();
  await run(page); await openTab(page, 'help');
  await expect(page.locator('#guide-predict-result')).toContainText('You guessed it!'); await shot('3-predict');
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
  await showMeHow(page); await expect(page.locator('#guide-hint-text')).toContainText('swapped in blocks that work');
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
  await expect(page.locator('#guide-progress')).toHaveText('Step 2 of 2 · Play it');
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
  await expect(page.locator('#lesson-finish-next')).toHaveText('Next: Flappy Flight'); await shot('6-finish');
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

async function openLesson(page: Page, id: string, title: string, chapters: number, first: string) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openHelp(page, 'builds'); await page.locator(`#guide-start-${id}`).click();
  await expect(page.locator('#lesson-start-title')).toHaveText(title);
  await expect(page.locator('#lesson-start-chapters li')).toHaveCount(chapters);
  await expect(page.locator('#lesson-start-learn li')).toHaveCount(4);
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-build-title')).toHaveText(first);
}
/** Choose an answer, then run and see it confirmed. */
async function predict(page: Page, answer: string) {
  await openTab(page, 'help'); await page.locator('#guide-choices button', { hasText: answer }).click();
  await run(page); await openTab(page, 'help');
  await expect(page.locator('#guide-predict-result')).toContainText('You guessed it!');
  await page.locator('#stop').click();
}
async function finishLesson(page: Page, title: string, nextTitle: string, chapters: number) {
  await openTab(page, 'help'); await expect(page.locator('#guide-next')).toHaveText('Finish'); await next(page);
  await expect(page.locator('#lesson-finish')).toBeVisible();
  await expect(page.locator('#lesson-finish-title')).toHaveText(`You built ${title}`);
  await expect(page.locator('#lesson-finish-learn li')).toHaveCount(chapters);
  await expect(page.locator('#lesson-finish-next')).toHaveText(`Next: ${nextTitle}`);
}
/** Flap through the pipes the way a player would: watch the bird and the next
 * gap on the stage, and tap space whenever the bird sinks below the gap. */
function flap(page: Page, pipes: number) {
  return page.evaluate(goal => new Promise<boolean>(resolve => {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage')!, ctx = canvas.getContext('2d')!, scale = canvas.width / 480;
    const birdX = Math.round(90 * scale), started = performance.now(); let last = 0;
    const yellow = (d: Uint8ClampedArray, i: number) => d[i] > 225 && d[i + 1] > 150 && d[i + 2] < 140 && d[i + 3] > 200;
    const green = (d: Uint8ClampedArray, i: number) => d[i + 1] > d[i] + 40 && d[i + 1] > d[i + 2] + 30 && d[i + 3] > 200 && d[i] < 160;
    const press = () => { canvas.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ' })), 40); };
    const tick = () => {
      const column = ctx.getImageData(birdX, 0, 1, canvas.height).data; let top = -1, bottom = -1;
      for (let y = 0; y < canvas.height; y++) if (yellow(column, y * 4)) { if (top < 0) top = y; bottom = y; }
      let gap = canvas.height * 0.45;
      for (let x = birdX - 30 * scale; x < canvas.width; x += 3 * scale) {
        const col = ctx.getImageData(Math.round(x), 0, 1, Math.round(272 * scale)).data, rows: boolean[] = [];
        for (let y = 0; y < 272 * scale; y++) rows.push(green(col, y * 4));
        if (rows.filter(Boolean).length < 40 * scale) continue;
        let best = [0, 0], start = -1;
        for (let y = 0; y <= rows.length; y++) { if (y < rows.length && !rows[y]) { if (start < 0) start = y; } else if (start >= 0) { if (y - start > best[1] - best[0]) best = [start, y]; start = -1; } }
        gap = (best[0] + best[1]) / 2; break;
      }
      if (top >= 0 && (top + bottom) / 2 > gap + 10 * scale && performance.now() - last > 170) { press(); last = performance.now(); }
      const reached = document.querySelector('#guide-goal-count')?.textContent === `${goal} of ${goal}`;
      if (reached || !document.querySelector<HTMLElement>('#game-result')!.hidden || performance.now() - started > 40_000) resolve(reached);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), pipes);
}

test('Flappy Flight: gravity, a planted loop to fix, a score to predict, clone data, and flying through the pipes', async ({ page }) => {
  test.setTimeout(300_000);
  await openLesson(page, 'flappy-flight', 'Flappy Flight', 4, '1 · Fall and flap');
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 2 · Guess first');
  // 1. Predict the fall, then the lesson adds gravity.
  await showMeHow(page); await predict(page, 'Fall faster and faster');
  await next(page);
  // 2. Flap on space.
  await showMeHow(page); await run(page); await page.locator('#stop').click();
  await next(page, '2 · Pipes');
  // 3. Fix it: every gap is at the same height until Pipe moves first.
  await expect(page.locator('#guide-planted')).toContainText('there is a bug');
  await showMeHow(page); await expect(page.locator('#guide-hint-text')).toContainText('swapped in blocks that work');
  await run(page); await page.locator('#stop').click();
  await next(page);
  // 4. Crash into a pipe or the ground.
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(2);
  await next(page, '3 · Score');
  // 5. The lesson writes a score script; predict it before running.
  await expect(page.locator('#guide-planted')).toContainText('Read them before you run them');
  await predict(page, 'Go up again and again');
  await next(page);
  // 6. Each pipe remembers that it scored.
  await showMeHow(page); await run(page); await page.locator('#stop').click();
  await next(page);
  // 7. Play-test: fly through three pipes.
  await expect(page.locator('#guide-goal-count')).toHaveText('0 of 3');
  let passed = false;
  for (let attempt = 0; attempt < 3 && !passed; attempt++) {
    await run(page); passed = await flap(page, 3);
    if (await page.locator('#stop').isEnabled()) await page.locator('#stop').click();
  }
  expect(passed).toBe(true);
  await next(page, '4 · Win or lose');
  // 8. Win at ten with the idea card.
  await showMeHow(page); await insertIdea(page, 'win-screen'); await typeInto(page, '5', 0, '10');
  await next(page);
  // 9. Play to the end: a bird that never flaps hits the ground.
  await run(page); await expect(page.locator('#status')).toHaveText(/Game over/, { timeout: 30_000 });
  await finishLesson(page, 'Flappy Flight', 'Jump quest', 4);
});

test('Super Hopper: run, jump, coins, pits, beetles and the flag in a five-screen world', async ({ page }) => {
  test.setTimeout(300_000);
  await openLesson(page, 'super-hopper', 'Super Hopper', 6, '1 · Run');
  // 1. Gravity: the grass is solid.
  await showMeHow(page); await predict(page, 'Fall and land on the grass');
  await next(page);
  // 2. Run with the arrow keys; the camera follows.
  await showMeHow(page); await run(page);
  await page.locator('#stage').click({ position: { x: 20, y: 20 } }); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowRight');
  await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-camera-x'))).toBeGreaterThan(0);
  await page.locator('#stop').click();
  await next(page);
  // 3. Face the way you walk.
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(2);
  await next(page, '2 · Jump');
  // 4. Jump only from the ground.
  await showMeHow(page); await predict(page, 'Nothing: it jumps only from the ground');
  await next(page, '3 · Coins');
  // 5. Fix it: the lesson placed the coins; make them collectible.
  await expect(page.locator('#guide-planted')).toBeVisible();
  await expect.poll(() => handlers(page)).toBe(6);
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(3);
  await next(page);
  // 6. Play-test: the first five coins are on the grass ahead.
  await run(page); await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1700); await page.keyboard.up('ArrowRight');
  await openTab(page, 'help'); await expect(page.locator('#guide-goal-count')).toHaveText('5 of 5', { timeout: 10_000 });
  await page.locator('#stop').click();
  await next(page, '4 · Pits');
  // 7. Lives and falling in a pit.
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(3);
  await next(page, '5 · Beetles');
  // 8. Beetles patrol, and a clone patrols too.
  await showMeHow(page); await predict(page, 'Turn around and walk back');
  await next(page);
  // 9. Stomp or ouch.
  await showMeHow(page); await expect(page.locator('#guide-checklist li.guide-ticked')).toHaveCount(4);
  await next(page, '6 · The flag');
  // 10. The flag, from the idea card.
  await showMeHow(page); await insertIdea(page, 'reach-goal');
  await next(page);
  // 11. Play to the end: walking straight into the first pit three times ends the game.
  await run(page); await page.locator('#stage').click({ position: { x: 20, y: 20 } });
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('#status')).toHaveText(/Game over/, { timeout: 40_000 });
  await page.keyboard.up('ArrowRight');
  await finishLesson(page, 'Super Hopper', 'Maze run', 6);
});
