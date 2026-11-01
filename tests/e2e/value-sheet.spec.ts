import { test, expect, devices, type Page } from '@playwright/test';
import { openExample, openTab } from './shell';

/** On an iPad, Blockly edits a number or words in a prompt instead of in place. The browser's own
 * "Change value:" box had buttons too small to hit; the value sheet (ui/value-sheet.ts) takes its place:
 * big, with − and + and a ± button for numbers (an iPad's number keyboard has no minus sign). */
const { defaultBrowserType: _browser, ...ipad } = devices['iPad Pro 11 landscape'];
test.use({ ...ipad });

const field = (page: Page, id: string) => page.locator(`#blockly g[data-id="${id}"] .blocklyEditableField`).first();

test('tapping a number opens a big sheet with − and +, a ± button, and a check on what was typed', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  await field(page, 'sky-defenders-68').tap();
  const sheet = page.locator('#value-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#value-sheet-title')).toHaveText('Change the number');
  await expect(page.locator('#value-sheet-context')).toHaveText('set lives to');
  await expect(page.locator('#value-sheet-input')).toHaveValue('3');
  await expect(page.locator('#value-sheet-input')).toHaveAttribute('inputmode', 'decimal');
  for (const id of ['#value-sheet-less', '#value-sheet-more', '#value-sheet-done', '#value-sheet-cancel']) {
    const box = (await page.locator(id).boundingBox())!; expect(box.height, id).toBeGreaterThanOrEqual(48); expect(box.width, id).toBeGreaterThanOrEqual(48);
  }
  await page.screenshot({ path: info.outputPath('value-sheet.png') });
  await page.locator('#value-sheet-more').tap(); await page.locator('#value-sheet-more').tap();
  await expect(page.locator('#value-sheet-input')).toHaveValue('5');
  await page.locator('#value-sheet-done').tap();
  await expect(sheet).toBeHidden();
  await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('_pb_game.set("lives", 5)');
  // ± makes it minus; words that are not a number keep the sheet open with a hint.
  await field(page, 'sky-defenders-68').tap();
  await page.locator('#value-sheet-sign').tap(); await expect(page.locator('#value-sheet-input')).toHaveValue('-5');
  await page.locator('#value-sheet-input').fill('lots'); await page.locator('#value-sheet-done').tap();
  await expect(page.locator('#value-sheet-error')).toHaveText('Use a number, such as 5, -3 or 0.5.'); await expect(sheet).toBeVisible();
  await page.locator('#value-sheet-cancel').tap(); await expect(sheet).toBeHidden();
  await expect(page.locator('#python')).toContainText('_pb_game.set("lives", 5)');
  expect(errors).toEqual([]);
});

test('tapping words opens a wide box for them, without number buttons', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openExample(page, 'sky-defenders');
  // The magic book's Show me brings the winning message into view.
  await openTab(page, 'magic');
  await page.getByRole('button', { name: 'Show me: Winning message' }).tap();
  await field(page, 'sky-defenders-211').tap();
  // Show me centred the words, under where Done appears: the tap's own click must not press Done.
  await page.waitForTimeout(400); await expect(page.locator('#value-sheet')).toBeVisible();
  await expect(page.locator('#value-sheet-title')).toHaveText('Change the words');
  await expect(page.locator('#value-sheet-input')).toHaveValue('You saved the planet!');
  for (const id of ['#value-sheet-less', '#value-sheet-more', '#value-sheet-sign']) await expect(page.locator(id)).toBeHidden();
  await page.locator('#value-sheet-input').fill('Earth is safe!'); await page.locator('#value-sheet-done').tap();
  await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('"Earth is safe!"');
});
