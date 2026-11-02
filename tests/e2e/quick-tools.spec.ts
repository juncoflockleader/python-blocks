import { test, expect, type Locator, type Page } from '@playwright/test';

/** Quick tools (src/ui/quick-tools.ts): a floating panel over the workspace with the editing actions a
 * learner reaches for most and their favourite blocks. It moves by its grip, minimizes to one button that
 * moves too, keeps clear of the palette, the script tabs, the corner tools and the stage, and comes back
 * where the learner left it. Blocks are found by their type's class: their labels differ by platform. */
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const items: string[] = []; errors.set(page, items); page.on('pageerror', e => items.push(e.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

const panel = (page: Page) => page.locator('#quick-tools');
const box = async (locator: Locator) => (await locator.boundingBox())!;
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.quick-tools.v1') ?? 'null'));
const project = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.blocks.blocks as any[]);
/** How many blocks of a type the saved project has, anywhere in its scripts. */
async function count(page: Page, type: string) {
  let found = 0;
  const walk = (block: any) => {
    if (!block) return;
    if (block.type === type) found++;
    for (const input of Object.values(block.inputs ?? {}) as any[]) walk(input.block);
    walk(block.next?.block);
  };
  (await project(page)).forEach(walk);
  return found;
}
/** A block in the workspace, not the palette. */
const block = (page: Page, type: string) => page.locator(`#blockly svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas g.${type}`);
/** A script's first block, at the top level of the workspace. */
const topBlock = (page: Page, type: string) => page.locator(`#blockly svg.blocklySvg > g.blocklyWorkspace > g.blocklyBlockCanvas > g.${type}`);
/** Select a block by its symbol at its left end, away from its number fields. */
async function select(page: Page, target: Locator) { const at = await box(target); await page.mouse.click(at.x + 14, at.y + 12); }
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const at = await box(handle), x = at.x + at.width / 2, y = at.y + at.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.mouse.up();
}
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(2);
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

const scrollbar = (page: Page) => box(page.locator('#blockly .blocklyScrollbarVertical.blocklyMainWorkspaceScrollbar'));
/** The panel is over the workspace: right of the palette, below the script tabs, above the corner tools, and
 * left of the workspace's scrollbar (which is drawn above it) and the stage column. Nothing covers it. */
async function clear(page: Page) {
  const at = await box(panel(page)), palette = await box(page.locator('.blocklyToolbox')), tabs = await box(page.locator('#script-tabs'));
  const corner = await box(page.locator('#workspace-tools')), blocks = await box(page.locator('.blocks-panel')), column = await box(page.locator('.right-column'));
  expect(at.x).toBeGreaterThanOrEqual(palette.x + palette.width);
  expect(at.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
  expect(at.y + at.height).toBeLessThanOrEqual(corner.y);
  expect(at.x + at.width).toBeLessThanOrEqual(Math.min((await scrollbar(page)).x, blocks.x + blocks.width, column.x));
  const covered = await panel(page).evaluate(root => [...root.querySelectorAll<HTMLElement>('button')].filter(button => button.offsetParent).filter(button => {
    // The middle of each edge (corners are rounded), just inside.
    const b = button.getBoundingClientRect(), x = (b.left + b.right) / 2, y = (b.top + b.bottom) / 2;
    return [[b.left + 3, y], [b.right - 3, y], [x, b.top + 3], [x, b.bottom - 3]].some(([px, py]) => !button.contains(document.elementFromPoint(px, py)));
  }).map(button => button.id || button.textContent));
  expect(covered).toEqual([]);
  return at;
}
/** Every control a finger needs is at least 44 px each way, and no words are cut off. */
async function fingerSized(page: Page) {
  for (const button of await panel(page).locator('button:visible').all()) {
    const at = await box(button);
    expect(at.width, await button.getAttribute('id') ?? await button.textContent() ?? '').toBeGreaterThanOrEqual(44);
    expect(at.height).toBeGreaterThanOrEqual(44);
  }
  const clipped = await panel(page).evaluate(root => [...root.querySelectorAll<HTMLElement>('.quick-tools-grip, h3, p')].filter(node => node.offsetParent && node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
  expect(clipped).toEqual([]);
}

test('Quick tools open in the corner above the zoom buttons, clear of the palette, the tabs and the stage', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await expect(panel(page)).toBeVisible();
  await expect(page.locator('#quick-tools-body')).toBeVisible(); await expect(page.locator('#quick-tools-restore')).toBeHidden();
  const at = await clear(page), corner = await box(page.locator('#workspace-tools'));
  near(at.x + at.width, (await scrollbar(page)).x - 10); near(at.y + at.height, corner.y - 10);
  await fingerSized(page);
  // Each action shows its icon; its name stays for assistive technology.
  for (const [id, icon] of [['quick-undo', 'undo'], ['quick-redo', 'redo'], ['quick-duplicate', 'copy'], ['quick-delete', 'trash'], ['quick-tidy', 'sliders'], ['quick-find', 'search'], ['quick-tools-minimize', 'minus'], ['quick-favourite-add', 'star']]) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('data-ui-icon', icon);
  }
  // A name still means one button: Undo, Redo and Find blocks are also in the top bar and the workspace corner.
  for (const name of ['Undo', 'Redo', 'Find blocks']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `${name} (Quick tools)`, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeDisabled();
  await expect(page.locator('#quick-favourites-empty')).toBeVisible();
});

test('the grip drags Quick tools, which stay over the workspace and come back after a reload', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const start = await box(panel(page));
  await drag(page, page.locator('#quick-tools-grip'), -300, -250);
  const moved = await box(panel(page));
  near(moved.x, start.x - 300); near(moved.y, start.y - 250);
  expect(await stored(page)).toMatchObject({ minimized: false });
  // Dragged far past the palette and the script tabs, it stops beside them.
  await drag(page, page.locator('#quick-tools-grip'), -2000, -2000);
  const palette = await box(page.locator('.blocklyToolbox')), tabs = await box(page.locator('#script-tabs'));
  const corner = await clear(page);
  near(corner.x, palette.x + palette.width + 10); near(corner.y, tabs.y + tabs.height + 10);
  // The arrow keys move it too, a little at a time or (with Shift) further.
  await page.locator('#quick-tools-grip').focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowDown');
  const nudged = await box(panel(page));
  near(nudged.x, corner.x + 16); near(nudged.y, corner.y + 64);
  // A tap on the grip is not a drag: the panel stays put.
  await page.locator('#quick-tools-grip').click();
  near((await box(panel(page))).x, nudged.x);
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  const back = await box(panel(page));
  near(back.x, nudged.x); near(back.y, nudged.y);
});

test('Quick tools minimize to one button that moves too, and open again where they were', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const open = await box(panel(page));
  await page.locator('#quick-tools-minimize').click();
  const restore = page.locator('#quick-tools-restore');
  await expect(restore).toBeVisible(); await expect(restore).toBeFocused();
  await expect(page.locator('#quick-tools-body')).toBeHidden(); await expect(page.locator('#quick-tools-grip')).toBeHidden();
  await expect(restore).toHaveAttribute('data-ui-icon', 'toolbox'); await expect(restore).toHaveAttribute('aria-expanded', 'false');
  // In the corner, the button keeps to the corner the panel was in.
  const small = await box(restore);
  expect(small.width).toBeGreaterThanOrEqual(44); expect(small.height).toBeGreaterThanOrEqual(44);
  near(small.x + small.width, open.x + open.width); near(small.y + small.height, open.y + open.height);
  await clear(page);
  expect(await stored(page)).toMatchObject({ minimized: true });
  // Dragging the button moves it and does not open the panel.
  await drag(page, restore, -250, -200);
  const moved = await box(restore);
  near(moved.x, small.x - 250); near(moved.y, small.y - 200);
  await expect(page.locator('#quick-tools-body')).toBeHidden();
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await expect(restore).toBeVisible(); await expect(page.locator('#quick-tools-body')).toBeHidden();
  near((await box(restore)).x, moved.x);
  // A tap opens it, still over the workspace, with the minimize button ready.
  await restore.click();
  await expect(page.locator('#quick-tools-body')).toBeVisible(); await expect(page.locator('#quick-tools-minimize')).toBeFocused();
  await clear(page);
  expect(await stored(page)).toMatchObject({ minimized: false });
});

test('the editing actions work on the selected block as its long-press menu does, and Undo and Redo follow', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const moves = await count(page, 'pen_move'), tops = (await project(page)).length;
  await select(page, block(page, 'pen_move').first());
  await expect(page.locator('#quick-duplicate')).toBeEnabled(); await expect(page.locator('#quick-delete')).toBeEnabled();
  // Duplicate makes a loose copy beside the block, which stays selected for the next tap.
  await page.locator('#quick-duplicate').click();
  await expect.poll(() => count(page, 'pen_move')).toBe(moves + 1);
  expect((await project(page)).length).toBe(tops + 1);
  await page.locator('#quick-delete').click();
  await expect.poll(() => count(page, 'pen_move')).toBe(moves);
  expect((await project(page)).length).toBe(tops);
  await expect(page.locator('#quick-undo')).toBeEnabled();
  await page.locator('#quick-undo').click(); await expect.poll(() => count(page, 'pen_move')).toBe(moves + 1);
  await page.locator('#quick-redo').click(); await expect.poll(() => count(page, 'pen_move')).toBe(moves);
  await page.locator('#quick-undo').click(); await expect.poll(() => count(page, 'pen_move')).toBe(moves + 1);
  // Tidy up lines the scripts up in a column; Undo puts them back.
  await expect(page.locator('#quick-tidy')).toBeEnabled();
  const before = (await project(page)).map(b => [b.x, b.y]);
  await page.locator('#quick-tidy').click();
  await expect(page.locator('#quick-tools-status')).toContainText('tidied');
  await expect.poll(async () => new Set((await project(page)).map(b => b.x)).size).toBe(1);
  await page.locator('#quick-undo').click();
  await expect.poll(async () => (await project(page)).map(b => [b.x, b.y])).toEqual(before);
  // Find blocks opens the block search, and closes it again.
  await page.locator('#quick-find').click();
  await expect(page.locator('#block-search-input')).toBeFocused(); await expect(page.locator('#quick-find')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#quick-find').click();
  await expect(page.locator('#block-search')).toBeHidden(); await expect(page.locator('#quick-find')).toHaveAttribute('aria-expanded', 'false');
});

test('favourite blocks: keep the selected block or one from its menu, add one with a tap, and remove them', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const add = page.locator('#quick-favourite-add'), favourites = page.locator('.quick-favourite');
  await expect(add).toBeDisabled(); await expect(page.locator('#quick-favourites')).toBeHidden();
  await select(page, block(page, 'pen_turn').first());
  await add.click();
  await expect(favourites).toHaveCount(1); await expect(favourites.first()).toHaveAttribute('aria-label', /^Add turn right/);
  await expect(add).toBeDisabled();
  const kept = (await stored(page)).favourites;
  expect(kept.map((s: any) => s.type)).toEqual(['pen_turn']); expect(JSON.stringify(kept)).not.toContain('"id"');
  await fingerSized(page);
  // A tap adds a copy where the learner can see it, not under the panel.
  const turns = await count(page, 'pen_turn');
  await favourites.first().click();
  await expect.poll(() => count(page, 'pen_turn')).toBe(turns + 1);
  await expect(page.locator('#quick-tools-status')).toContainText('Undo removes it');
  const added = await box(topBlock(page, 'pen_turn').first());
  expect(overlap(added, await box(panel(page)))).toBe(false);
  // The long-press (right-click) menu keeps a block too, from the workspace or the palette, and offers to take it back.
  await block(page, 'pen_move').first().click({ button: 'right', position: { x: 14, y: 12 } });
  await page.getByRole('menuitem', { name: 'Add to favourite blocks' }).click();
  await expect(favourites).toHaveCount(2); await expect(favourites.nth(1)).toHaveAttribute('aria-label', /^Add move/);
  await block(page, 'pen_move').first().click({ button: 'right', position: { x: 14, y: 12 } });
  await expect(page.getByRole('menuitem', { name: 'Remove from favourite blocks' })).toBeVisible();
  await page.keyboard.press('Escape');
  // Remove favourites: each favourite then removes itself with a tap.
  await page.locator('#quick-favourites-edit').click();
  await expect(page.locator('#quick-favourites-edit')).toHaveAttribute('aria-pressed', 'true');
  await expect(favourites.first()).toHaveAttribute('aria-label', /^Remove turn right/);
  await favourites.first().click();
  await expect(favourites).toHaveCount(1); await expect(favourites.first()).toHaveAttribute('aria-label', /^Remove move/);
  // Tapping the toggle again ends it; from the keyboard, Escape does.
  await page.locator('#quick-favourites-edit').click();
  await expect(page.locator('#quick-favourites-edit')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#quick-favourites-edit').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#quick-favourites-edit')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('#quick-favourites-edit')).toHaveAttribute('aria-pressed', 'false'); await expect(page.locator('#quick-favourites-edit')).toBeFocused();
  expect(await count(page, 'pen_turn')).toBe(turns + 1);
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await expect(favourites).toHaveCount(1); await expect(favourites.first()).toHaveAttribute('aria-label', /^Add move/);
});

test.describe('on an iPad', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  test('a finger selects a block, uses a tool on it, drags the panel and minimizes it', async ({ page }) => {
    await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
    await clear(page); await fingerSized(page);
    // A tap on a tool keeps the block the finger chose.
    const moves = await count(page, 'pen_move'), at = await box(block(page, 'pen_move').first());
    await page.touchscreen.tap(at.x + 14, at.y + 12);
    const duplicate = await box(page.locator('#quick-duplicate'));
    await page.touchscreen.tap(duplicate.x + duplicate.width / 2, duplicate.y + duplicate.height / 2);
    await expect.poll(() => count(page, 'pen_move')).toBe(moves + 1);
    // A finger drags the grip.
    const start = await box(panel(page)), grip = await box(page.locator('#quick-tools-grip'));
    const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 15, y: y - step * 20, id: 1 }] });
    // The finger stops before it lifts. Lifted mid-move, Chrome on Linux flings, and the tap that stops a fling is no click.
    await page.waitForTimeout(150); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 120, y: y - 160, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const moved = await box(panel(page));
    near(moved.x, start.x - 120); near(moved.y, start.y - 160);
    await clear(page);
    await page.locator('#quick-tools-minimize').tap();
    await expect(page.locator('#quick-tools-restore')).toBeVisible();
    await page.locator('#quick-tools-restore').tap();
    await expect(page.locator('#quick-tools-body')).toBeVisible();
  });
});

test.describe('at 1080 × 700', () => {
  // The narrowest iPad in landscape; Linux's wider fonts must still fit.
  test.use({ viewport: { width: 1080, height: 700 } });
  test('Quick tools fit over the workspace with room to build, and nothing in them is cut off', async ({ page }) => {
    await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
    const at = await clear(page), blocks = await box(page.locator('.blocks-panel'));
    await fingerSized(page);
    // The panel leaves most of the workspace free.
    expect(at.width * at.height).toBeLessThan(blocks.width * blocks.height * 0.25);
    for (const button of await panel(page).locator('button:visible').all()) {
      const inside = await box(button);
      expect(inside.x + inside.width).toBeLessThanOrEqual(at.x + at.width);
    }
  });
});
