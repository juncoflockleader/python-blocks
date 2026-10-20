import { test, expect, type Page } from '@playwright/test';

/** Finding a block: in the picker every block has a caption above it, a number
 * bubble and its keyword; a lesson's block pictures carry the same number; and
 * Pro has a search box at the top of the palette. */
test.use({ viewport: { width: 1180, height: 820 } });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const captions = (page: Page) => page.locator('.blocklyToolboxFlyout g.block-caption');
/** Each caption as "number|keyword", read from its bubble and its words. */
const read = (page: Page) => captions(page).evaluateAll(groups => groups.map(g => `${g.querySelector('.block-caption-number')?.textContent}|${g.querySelector('.blocklyFlyoutLabelText')?.textContent}`));

test('every block in a category has a numbered caption with its keyword', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('builder');
  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click();
  await expect(captions(page).first()).toBeVisible();
  const physics = await read(page);
  expect(physics[0]).toBe('1|set speed or gravity');
  expect(physics).toContain('6|at stage edge');
  // Numbered 1, 2, 3 … with one caption per block, each drawn as a bubble left of its words.
  expect(physics.map(c => Number(c.split('|')[0]))).toEqual(physics.map((_, i) => i + 1));
  expect(await page.locator('.blocklyToolboxFlyout .blocklyDraggable[data-id]').count()).toBeGreaterThanOrEqual(physics.length);
  const bubble = (await captions(page).first().locator('.block-caption-bubble').boundingBox())!, words = (await captions(page).first().locator('.blocklyFlyoutLabelText').boundingBox())!;
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(words.x + 1);
  // Repeat blocks say which repeat they are.
  await page.getByRole('treeitem', { name: 'Control', exact: true }).click();
  await expect.poll(() => read(page)).toEqual(expect.arrayContaining(['1|repeat times', '2|repeat forever', '3|repeat until']));
  // A variable's blocks are captioned with its name.
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click();
  await page.getByRole('option', { name: 'Make a variable, button', exact: true }).click();
  await page.locator('#name-sheet-input').fill('speed'); await page.locator('#name-sheet-input').press('Enter');
  await page.getByRole('treeitem', { name: 'Variables', exact: true }).click();
  await expect.poll(() => read(page)).toEqual(['1|speed', '2|set speed']);
  // No search box below Pro.
  await expect(page.locator('#palette-search')).toBeHidden();
});

test('a lesson block picture shows the number its block has in the picker', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('builder'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#lessons-open').click(); await page.locator('#lessons-start-flappy-flight').click();
  await page.locator('#lesson-start-go').click();
  await expect(page.locator('#guide-step-title')).toHaveText('Make the bird fall');
  const gravity = page.locator('#guide-checklist .block-ref', { hasText: 'ay to −900' }), edge = page.locator('#guide-checklist .block-ref', { hasText: 'at stage edge' });
  await expect(gravity.locator('.block-ref-number')).toHaveText('1');
  await expect(page.locator('#guide-checklist .block-ref-hat .block-ref-number')).toHaveText(/^\d+$/);
  const number = await edge.locator('.block-ref-number').textContent();
  // The number sits before the block's words, and the picture still reads as the block.
  await expect(gravity).toHaveText(/^1/);
  await expect(edge.locator('.block-ref-number')).toHaveAttribute('title', `Number ${number} in Motion`);
  await page.locator('.coach-pop .pop-close').click();
  await page.getByRole('treeitem', { name: 'Motion', exact: true }).click();
  await expect.poll(() => read(page)).toContain(`${number}|at stage edge`);
  await page.getByRole('treeitem', { name: 'Events', exact: true }).click();
  const hat = await page.locator('#guide-checklist .block-ref-hat .block-ref-number').textContent();
  await expect.poll(() => read(page)).toContain(`${hat}|when game starts`);
  // Pro keeps that block in Physics, not Motion: the picture follows it there.
  await page.locator('#level-select').selectOption('pro');
  await expect(edge.locator('.block-ref-number')).toHaveAttribute('title', /^Number \d+ in Physics$/);
  const moved = await edge.locator('.block-ref-number').textContent();
  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click();
  await expect.poll(() => read(page)).toContain(`${moved}|at stage edge`);
});

test('Pro finds a block by its words and drags it from the results', async ({ page }) => {
  await page.goto('/'); await page.locator('#level-select').selectOption('pro');
  const search = page.locator('#palette-search');
  await expect(search).toBeVisible();
  const box = (await search.boundingBox())!, toolbox = (await page.locator('.blocklyToolbox').boundingBox())!;
  expect(box.y).toBeLessThan(toolbox.y + 20);
  await search.fill('jump');
  // Blocks named for the words come first, each with its category and its number there.
  await expect.poll(async () => (await read(page))[0]).toMatch(/^\d+\|Physics · jump if grounded/);
  await expect.poll(() => read(page)).toEqual(expect.arrayContaining([expect.stringMatching(/\|Looks · play an animation once$/)]));
  await expect(page.getByRole('treeitem', { name: 'Physics', exact: true })).toHaveAttribute('aria-selected', 'false');
  // The physics caption's number is the one the Physics category shows.
  const number = (await read(page))[0].split('|')[0];
  await search.fill('gravity');
  await expect.poll(() => read(page)).toContain('1|Physics · set speed or gravity');
  await search.fill('jump');
  await expect.poll(async () => (await read(page))[0]).toMatch(/Physics · jump/);
  // Drag the found block onto the editor.
  const block = page.locator('.blocklyToolboxFlyout .blocklyDraggable[data-id]').first(), from = (await block.boundingBox())!, canvas = (await page.locator('#blockly').boundingBox())!;
  await page.mouse.move(from.x + 10, from.y + 10); await page.mouse.down(); await page.mouse.move(canvas.x + 420, canvas.y + 360, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks.some((b: { type: string }) => b.type === 'scene_jump')).toBe(true);
  // Nothing found says so; Escape clears the box; choosing a category leaves the search.
  await search.fill('zzqx'); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('No blocks match “zzqx”');
  await search.press('Escape'); await expect(search).toHaveValue(''); await expect(page.locator('.blocklyToolboxFlyout')).toBeHidden();
  await search.fill('wait');
  await page.getByRole('treeitem', { name: 'Physics', exact: true }).click(); await expect(search).toHaveValue('');
  await expect.poll(() => read(page)).toContain(`${number}|jump if grounded at speed`);
  // Below Pro the box goes away.
  await page.locator('#level-select').selectOption('builder'); await expect(search).toBeHidden();
});
