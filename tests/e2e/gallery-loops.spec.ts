import { test, expect, type Locator } from '@playwright/test';
import { reveal } from './shell';

/** Gallery and lesson cards show their still, and play their recorded loop
 * while hovered or focused, or while on screen on a touch screen. */
const time = (card: Locator) => card.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);

test('an example card plays its loop while hovered or focused, and fetches nothing before', async ({ page }) => {
  await page.goto('/'); await (await reveal(page, '#examples-open')).click();
  const card = page.locator('#examples-dialog [data-example="scene-star-game"]');
  await expect(card.locator('img')).toHaveJSProperty('complete', true);
  await expect(card.locator('video')).toHaveCount(0);
  await card.hover(); await expect(card).toHaveAttribute('data-playing', 'true');
  expect(await card.locator('video').evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(/gallery\/scene-star-game\.(webm|mp4)$/);
  await expect.poll(() => time(card)).toBeGreaterThan(0.3);
  await page.mouse.move(1, 1); await expect(card).not.toHaveAttribute('data-playing');
  expect(await card.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  // Keyboard focus plays it too, and leaving the card stops it.
  await page.locator('#scene-star-game-play').focus(); await expect(card).toHaveAttribute('data-playing', 'true');
  await page.locator('#examples-search').focus(); await expect(card).not.toHaveAttribute('data-playing');
});

test('nothing plays when the reader asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await (await reveal(page, '#lessons-open')).click();
  const card = page.locator('#lessons-dialog .lesson-card').first();
  await card.hover(); await page.locator('#lessons-start-brick-breaker').focus(); await page.waitForTimeout(400);
  await expect(card.locator('video')).toHaveCount(0); await expect(card).not.toHaveAttribute('data-playing');
  await expect(card.locator('img')).toHaveJSProperty('complete', true);
});

test.describe('on a tablet, with no hover', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1180, height: 820 } }); // an iPad, landscape
  test('lesson cards play while they are on screen', async ({ page }) => {
    await page.goto('/'); expect(await page.evaluate(() => matchMedia('(hover: none)').matches)).toBe(true);
    await (await reveal(page, '#lessons-open')).click();
    const cards = page.locator('#lessons-dialog .lesson-card'), first = cards.first(), last = cards.last();
    await expect(first).toHaveAttribute('data-playing', 'true'); await expect(last).not.toHaveAttribute('data-playing');
    await last.scrollIntoViewIfNeeded(); await expect(last).toHaveAttribute('data-playing', 'true');
    await expect(first).not.toHaveAttribute('data-playing');
    await page.locator('#lessons-close').click(); await expect(last).not.toHaveAttribute('data-playing');
  });
});
