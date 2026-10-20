import { test, expect, type Page } from '@playwright/test';
import { openTab } from './shell';

/** The help a young reader gets in a lesson: a goal per step, blocks shown as
 * pictures, word cards, the coach pointing at where to look, tips for a loose
 * block and for keys, a cheer when a step is done, and a clip of what the step makes. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function startFlappy(page: Page) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#lessons-open').click(); await page.locator('#lessons-start-flappy-flight').click();
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-step-title')).toHaveText('Make the bird fall');
}

test('a step shows its goal, blocks as pictures, word cards and the coach pointing at the palette', async ({ page }) => {
  await startFlappy(page);
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 2 · Guess first');
  // The coach points at Physics, and tapping Physics follows the tip.
  const coach = page.locator('.coach-pop');
  await expect(coach).toContainText('Gravity is in Physics');
  const category = page.getByRole('treeitem', { name: 'Physics', exact: true }), physics = (await category.boundingBox())!, bubble = (await coach.boundingBox())!;
  expect(bubble.x).toBeGreaterThan(physics.x + physics.width - 2);
  await category.click(); await expect(coach).toHaveCount(0);
  // Blocks to find are drawn in their category's colour, with its symbol.
  const blocks = page.locator('#guide-checklist .block-ref');
  await expect(blocks).toHaveCount(3);
  // Each shows its number in the picker first (block-picker.spec checks the numbers).
  await expect(blocks.first()).toHaveText(/^\d+set sprite Bird ay to −900$/);
  expect(await blocks.first().evaluate(b => getComputedStyle(b).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(page.locator('#guide-checklist .block-ref-hat')).toHaveText(/^\d+when game starts$/);
  // The guess comes after what to do, with its question.
  await expect(page.locator('#guide-question')).toHaveText('Guess: What will the bird do?');
  expect(await page.locator('#guide-checklist').evaluate((list, guess) => !!(list.compareDocumentPosition(guess!) & Node.DOCUMENT_POSITION_FOLLOWING), await page.locator('#guide-predict').elementHandle())).toBe(true);
  // A word card: a picture and a short explanation, closed with Escape.
  await page.locator('#guide-step .word-ref', { hasText: 'gravity' }).click();
  const card = page.locator('.word-card');
  await expect(card).toContainText('ay: gravity'); await expect(card).toContainText('faster and faster');
  expect(await card.locator('canvas').evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) ink++; return ink; })).toBeGreaterThan(1000);
  await page.keyboard.press('Escape'); await expect(card).toHaveCount(0);
  await expect(page.locator('#guide-step .word-ref', { hasText: 'gravity' })).toBeFocused();
  // Why waits behind a button, so the card stays short.
  await expect(page.locator('#guide-why')).toBeHidden();
  await page.locator('#guide-why-toggle').click(); await expect(page.locator('#guide-why')).toContainText('falls faster and faster');
  await expect(page.locator('#guide-read')).toBeVisible();
});

test('a done step cheers and offers Next, a guessed step offers its clip, and a key step says to tap the game first', async ({ page }) => {
  await startFlappy(page);
  // Show me how adds the blocks; then guess and run.
  for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
  await page.locator('#guide-choices button', { hasText: 'Fall faster and faster' }).click();
  await expect(page.locator('#guide-watch')).toBeHidden(); await expect(page.locator('#guide-clip')).toHaveCount(0);   // the clip would give the answer away
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(/Event session running/, { timeout: 60_000 });
  await openTab(page, 'help');
  const cheer = page.locator('.cheer-pop');
  await expect(cheer).toBeVisible(); await expect(cheer.locator('strong')).toHaveText(/You did it!|Awesome!|It works!|Nice one!|Super!|Great job!/);
  // After the run, Watch plays the clip over the stage; a tap on it brings the stage back.
  await cheer.locator('.pop-close').click();
  await page.locator('#guide-watch').click();
  const clip = page.locator('.stage-surface #guide-clip');
  await expect(clip.locator('video source').first()).toHaveAttribute('src', /lessons\/flappy-flight-1\.mp4$/);
  await expect(clip.locator('figcaption')).toHaveText('Watch: what really happens');
  await expect.poll(() => clip.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.2);
  await clip.click(); await expect(clip).toHaveCount(0);
  await page.locator('#guide-next').click();
  await page.locator('#stop').click();
  await expect(page.locator('#guide-step-title')).toHaveText('Flap!');
  // A new step scrolls the Lesson panel to its card, never the editor around it.
  expect(await page.locator('#shell').evaluate(e => e.scrollTop)).toBe(0);
  const card = (await page.locator('#guide-active').boundingBox())!, panel = (await page.locator('.tab-panels').boundingBox())!;
  expect(card.y).toBeGreaterThanOrEqual(panel.y - 1); expect(card.y).toBeLessThan(panel.y + 40);
  expect((await page.locator('.top-bar').boundingBox())!.y).toBe(0);
  await expect(page.locator('.stage-surface #guide-clip video')).toHaveCount(1);   // a build step plays its clip on the stage as it opens
  for (let i = 0; i < 3; i++) await page.locator('#guide-hint').click();
  await page.locator('#run').click();
  await expect(page.locator('#guide-clip')).toHaveCount(0);   // the learner's own game takes the stage
  const tip = page.locator('.coach-pop', { hasText: 'Tap the game first' });
  await expect(tip).toBeVisible(); await expect(tip.locator('kbd')).toHaveText('space');
  await page.locator('#stage').click(); await expect(tip).toHaveCount(0);
  // The cheer waited for the tip, and comes once the game has been tapped.
  await expect(page.locator('.cheer-pop')).toBeVisible({ timeout: 5000 });
});

test('a block left loose gets a tip to snap it in', async ({ page }) => {
  await startFlappy(page);
  await page.locator('.coach-pop .pop-close').click();
  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click();
  const block = page.locator('.blocklyToolboxFlyout g.blocklyDraggable').first(), box = (await block.boundingBox())!, canvas = (await page.locator('#blockly').boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 10); await page.mouse.down(); await page.mouse.move(canvas.x + 380, canvas.y + 260, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.coach-pop')).toContainText('This block is loose', { timeout: 8000 });
});
