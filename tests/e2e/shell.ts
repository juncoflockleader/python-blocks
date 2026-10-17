import { expect, type Locator, type Page } from '@playwright/test';

/** Helpers for the one-screen shell: the ⋯ menu, the right-column tabs, the
 * Examples dialog, the sprite More settings sheet and the corner block search. */
export type Tab = 'sprite' | 'python' | 'output' | 'help';
export type HelpSection = 'ideas' | 'builds' | 'more';
export async function openTab(page: Page, tab: Tab) {
  await closeSpriteSettings(page);
  const button = page.locator(`#tab-${tab}`);
  if (await button.getAttribute('aria-selected') !== 'true') await button.click();
  await expect(page.locator(`#panel-${tab}`)).toBeVisible();
}
/** The Help tab's Ideas, Builds and More sections; nudges and an active build step show above all of them. */
export async function openHelp(page: Page, section: HelpSection) {
  await openTab(page, 'help');
  const button = page.locator(`#help-nav-${section}`);
  if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
  await expect(page.locator(`#help-${section}`)).toBeVisible();
}
/** Choose an item from the ⋯ menu by element id (`#save`) or accessible name. */
export async function menu(page: Page, item: string) {
  if (await page.locator('#app-menu').isHidden()) await page.locator('#menu-button').click();
  const target = item.startsWith('#') ? page.locator(item) : page.locator('#app-menu').getByRole('button', { name: item, exact: true });
  await target.click();
}
/** The top bar has Examples on wider screens; narrow tablets reach it through the ⋯ menu. */
async function openExamples(page: Page) {
  if (await page.locator('#examples-open').isVisible()) await page.locator('#examples-open').click();
  else await menu(page, '#menu-examples');
}
export async function openExample(page: Page, id: string) {
  await openExamples(page);
  await page.locator(`#${id}`).click();
  await expect(page.locator('#examples-dialog')).toBeHidden();
}
export async function openSpriteSettings(page: Page) {
  if (await page.locator('#tab-sprite').getAttribute('aria-selected') !== 'true' && !await isOpen(page)) await openTab(page, 'sprite');
  if (!await isOpen(page)) await page.locator('#sprite-more').click();
  await expect(page.locator('#sprite-settings')).toBeVisible();
}
const isOpen = (page: Page) => page.locator('#sprite-settings').evaluate(dialog => (dialog as HTMLDialogElement).open);
export async function closeSpriteSettings(page: Page) {
  if (await isOpen(page)) await page.locator('#sprite-settings-done').click();
}
/** Fill a Sprite tab or sheet field and commit it the way a learner does (Enter or leaving the field). */
export async function setSpriteField(field: Locator, value: string) {
  await field.fill(value); await field.press('Enter');
}
export async function openSearch(page: Page) {
  if (await page.locator('#block-search').isHidden()) await page.locator('#block-search-toggle').click();
  await expect(page.locator('#block-search-input')).toBeVisible();
}

/** Open whatever holds an element (a tab, the ⋯ menu, the More settings sheet,
 * the Examples dialog or the block search), then return it for interaction. */
export async function reveal(page: Page, target: string | Locator): Promise<Locator> {
  const locator = typeof target === 'string' ? page.locator(target) : target;
  // Role-based locators cannot see controls in a closed menu or hidden tab, so look in each place in turn.
  if (typeof target !== 'string' && !await locator.count()) {
    const places = [() => page.locator('#menu-button').click(), ...(['sprite', 'python', 'output', 'help'] as const).map(tab => async () => { if (!await page.locator('#app-menu').isHidden()) await page.keyboard.press('Escape'); await openTab(page, tab); }), () => openSpriteSettings(page)];
    for (const open of places) { await open(); if (await locator.count()) return locator; }
    return locator;
  }
  const where = await locator.first().evaluate(element => {
    if (element.closest('#app-menu')) return 'menu';
    if (element.closest('#examples-dialog')) return 'examples';
    if (element.closest('#sprite-settings')) return 'settings';
    if (element.closest('#block-search')) return 'search';
    const section = element.closest<HTMLElement>('.help-section')?.dataset.section;
    if (section) return `help:${section}`;
    return element.closest('[role=tabpanel]')?.id.replace('panel-', 'tab:') ?? '';
  });
  if (where === 'menu' && await page.locator('#app-menu').isHidden()) await page.locator('#menu-button').click();
  if (where === 'examples' && await page.locator('#examples-dialog').isHidden()) await openExamples(page);
  if (where === 'settings') await openSpriteSettings(page);
  if (where === 'search') await openSearch(page);
  if (where.startsWith('help:')) { await closeSpriteSettings(page); await openHelp(page, where.slice(5) as HelpSection); }
  if (where.startsWith('tab:')) { await closeSpriteSettings(page); await openTab(page, where.slice(4) as Tab); }
  return locator;
}
