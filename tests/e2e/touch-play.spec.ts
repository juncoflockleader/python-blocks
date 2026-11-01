import { test, expect, type Page } from '@playwright/test';
import { openExample } from './shell';

/** On a touch screen a game that listens for keys plays in the Large stage with a controller sized for
 * thumbs: in landscape the arrows stand in a cross left of the stage and A and B to its right, and fast
 * taps on it never select text, open a callout or zoom. */
test.use({ viewport: { width: 1024, height: 700 }, hasTouch: true, isMobile: true });

async function playSkyDefenders(page: Page) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  await page.locator('#play-expand').click();
  await page.locator('#play-run').click();
  await expect(page.locator('#play-status')).toHaveText('Event session running', { timeout: 60_000 });
  if (await page.locator('#touch-pad').isHidden()) await page.locator('#touch-toggle').click();
  await expect(page.locator('#touch-pad')).toBeVisible();
}
const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test('landscape: a cross of arrows left of the stage, big round A and B to its right', async ({ page }, info) => {
  await playSkyDefenders(page);
  const stage = await box(page, '#play-dialog #stage');
  const up = await box(page, '[data-control="ArrowUp"]'), left = await box(page, '[data-control="ArrowLeft"]'), right = await box(page, '[data-control="ArrowRight"]'), down = await box(page, '[data-control="ArrowDown"]');
  const a = await box(page, '[data-control="a"]'), b = await box(page, '[data-control="b"]');
  for (const button of [up, left, right, down]) { expect(button.width).toBeGreaterThanOrEqual(55); expect(button.height).toBeGreaterThanOrEqual(55); expect(button.x + button.width).toBeLessThanOrEqual(stage.x + 1); }
  for (const button of [a, b]) { expect(button.width).toBeGreaterThanOrEqual(70); expect(button.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1); }
  // A cross: up over down, left and right on the middle row.
  expect(up.x).toBeCloseTo(down.x, 0); expect(up.y).toBeLessThan(left.y); expect(down.y).toBeGreaterThan(left.y); expect(left.y).toBeCloseTo(right.y, 0);
  await page.screenshot({ path: info.outputPath('touch-landscape.png') });
  // The arrows still press keys while held.
  await page.mouse.move(right.x + right.width / 2, right.y + right.height / 2); await page.mouse.down();
  await expect(page.locator('[data-control="ArrowRight"]')).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await expect(page.locator('[data-control="ArrowRight"]')).toHaveAttribute('aria-pressed', 'false');
});

test('fast taps never start a text selection, a callout or a zoom', async ({ page }) => {
  await playSkyDefenders(page);
  const prevented = await page.evaluate(() => ['selectstart', 'dblclick', 'contextmenu'].map(type => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    document.querySelector('.touch-directions')!.dispatchEvent(event);
    return event.defaultPrevented;
  }));
  expect(prevented).toEqual([true, true, true]);
  const styles = await page.locator('[data-control="a"]').evaluate(button => { const style = getComputedStyle(button); return [style.userSelect, style.touchAction]; });
  expect(styles).toEqual(['none', 'none']);
  expect(await page.locator('#play-dialog .stage-wrap').evaluate(e => getComputedStyle(e).userSelect)).toBe('none');
});

test('upright: the controller sits under the stage, larger than in the editor', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await playSkyDefenders(page);
  const stage = await box(page, '#play-dialog #stage'), up = await box(page, '[data-control="ArrowUp"]'), a = await box(page, '[data-control="a"]');
  expect(up.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1); expect(a.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  expect(up.width).toBeGreaterThanOrEqual(55);
});
