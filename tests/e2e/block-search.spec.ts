import { test, expect, type Page } from '@playwright/test';
import { reveal } from './shell';
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
test('search adds the real block with defaults, supports keyboard and undo, and finds existing blocks', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); const before = await saved(page);
  await (await reveal(page, '#block-search-input')).fill('turn right');
  const result = page.getByRole('button', {name: /Add turn right.*\(Draw\)/});
  await expect(result).toBeVisible();
  await (await reveal(page, '#block-search-input')).press('ArrowDown'); await expect(result).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.length).toBe(before.workspace.blocks.blocks.length + 1);
  const block = (await saved(page)).workspace.blocks.blocks.find((b: any) => b.type === 'pen_turn');
  expect(block.inputs.DEGREES.shadow.fields.VALUE).toBe('90');
  await page.locator('#language-undo').click();
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.length).toBe(before.workspace.blocks.blocks.length);
  await (await reveal(page, '#block-search-scope')).selectOption('project');
  await page.getByRole('button', {name: /Find turn right/}).click();
  await expect(page.locator('.blocklyHighlighted')).toHaveCount(1);
  await (await reveal(page, '#block-search-input')).fill('nothing matches this'); await expect(page.locator('#block-search-status')).toContainText('No matching');
  await (await reveal(page, '#block-search-input')).press('Escape'); await expect(page.locator('#block-search-results')).toBeHidden();
  expect(errors).toEqual([]);
});
test('search follows selected sprites, project function names and exposes management tools', async ({page}) => {
  await page.goto('/'); await (await reveal(page, '#scene-example')).click();
  await (await reveal(page, '#scene-selection')).selectOption('friend');
  await (await reveal(page, '#block-search-input')).fill('glide');
  await expect(page.locator('#block-search-results')).toContainText('Friend');
  await (await reveal(page, '#block-search-input')).fill('manage functions');
  await page.getByRole('button', {name: /Open Manage functions/}).click();
  await expect(page.locator('#language-dialog')).toBeVisible();
});

test('dynamic function and variable names refresh on project replacement and searches do not author work', async ({page}) => {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/language/functions.json');
  const before = await saved(page);
  await (await reveal(page, '#block-search-input')).fill('difference');
  await expect(page.locator('#block-search-results')).toContainText('difference');
  expect(await saved(page)).toEqual(before);
  await page.getByRole('button', {name: /Add.*difference/}).first().click();
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.length).toBe(before.workspace.blocks.blocks.length + 1);
  await page.locator('#language-undo').click();
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.length).toBe(before.workspace.blocks.blocks.length);
  await (await reveal(page, '#example')).click(); await expect(page.locator('#block-search-status')).toContainText('No matching');
  await page.locator('#project-file').setInputFiles('tests/fixtures/events/handlers.json');
  await (await reveal(page, '#block-search-input')).fill('total'); await expect(page.locator('#block-search-results')).toContainText('total');
});

test('visible search defaults follow thumbnail selection without editing the scene', async ({page}) => {
  await page.goto('/'); await (await reveal(page, '#scene-example')).click();
  await (await reveal(page, '#block-search-input')).fill('glide'); await expect(page.locator('#block-search-results')).toContainText('Player');
  await (await reveal(page, '#scene-filter')).fill('friend'); await page.locator('#scene-cards button:visible').click();
  await expect(page.locator('#block-search-results')).toContainText('Friend');
});

test('narrow search results leave the workspace and Undo controls reachable', async ({page}, info) => {
  await page.setViewportSize({ width: 744, height: 1000 }); await page.goto('/');
  await (await reveal(page, '#block-search-input')).fill('move'); await expect(page.locator('#block-search-results button').first()).toBeVisible();
  await expect(page.locator('#language-undo')).toBeVisible();
  // The search overlay stays inside the blocks panel and leaves the corner tools and the page width alone.
  const bounds = await page.locator('.blocks-panel').evaluate(panel => {
    const box = panel.getBoundingClientRect(), search = panel.querySelector('#block-search')!.getBoundingClientRect(), tools = panel.querySelector('.workspace-tools')!.getBoundingClientRect();
    return {inside:search.top >= box.top && search.bottom <= box.bottom && search.right <= box.right,clear:search.bottom <= tools.top,width:document.documentElement.scrollWidth,viewport:window.innerWidth};
  });
  expect(bounds).toEqual({inside:true,clear:true,width:bounds.viewport,viewport:bounds.viewport});
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await expect(page.locator('#block-search')).toBeHidden(); await expect(page.locator('#block-search-toggle')).toBeFocused();
  await page.locator('.blocks-panel').screenshot({path:info.outputPath('search-narrow.png')});
});
