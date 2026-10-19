import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { blockIcons, menu, openHelp, openTab, reveal } from './shell';

// A new browser: Starter level, where Ideas is the default search scope.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1024, height: 700 } });
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function stageFixture(page: Page) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles('tests/fixtures/recipes/stage.json');
  await expect(page.locator('#scene-cards button')).toHaveCount(2);
}
const live = async (page: Page) => { const text = await page.locator('#scene-live').textContent() ?? ''; const [, x, y] = /x (-?[\d.]+), y (-?[\d.]+)/.exec(text) ?? []; return { x: Number(x), y: Number(y) }; };

test('typing “chase” shows a preview and inserts a working chase in one step', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await stageFixture(page);
  await page.locator('#scene-cards button', { hasText: 'Star' }).click(); // the enemy is the selected sprite
  await page.locator('#block-search-toggle').click(); await expect(page.locator('#block-search-scope')).toHaveValue('ideas');
  await page.locator('#block-search-input').fill('chase');
  const card = page.locator('#block-search-results [data-recipe="chase"]');
  await expect(card).toBeVisible(); await expect(card.locator('h3')).toHaveText('Make an enemy chase the player');
  await expect.poll(() => card.locator('video').evaluate((v: HTMLVideoElement) => v.readyState >= 2 && v.videoWidth > 0)).toBe(true);
  await card.locator('.recipe-insert').click();
  await expect(card.locator('.recipe-status')).toContainText('Added a script');
  await expect.poll(async () => (await saved(page)).workspace.procedures).toMatchObject([{ name: 'on_star_update', handler: { event: 'update', sprite: 'star' } }]);
  await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('point_towards((_pb_sprites.named("Hero")).x, (_pb_sprites.named("Hero")).y)');
  await openTab(page, 'sprite'); await page.locator('#scene-cards button', { hasText: 'Star' }).click();
  const start = await live(page);
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  await page.waitForTimeout(800);
  const moved = await live(page), hero = { x: -150, y: -30 };
  expect(Math.hypot(moved.x - hero.x, moved.y - hero.y)).toBeLessThan(Math.hypot(start.x - hero.x, start.y - hero.y) - 40);
  await page.locator('#stop').click();
  // Ideas come first; matching blocks follow them.
  await page.locator('#block-search-input').fill('bounce');
  await expect(page.locator('#block-search-results [data-recipe="bounce-edges"]')).toBeVisible();
  await expect(page.locator('#block-search-results .block-search-result', { hasText: 'bounce' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await saved(page)).workspace.procedures?.length ?? 0).toBe(0);
  expect(errors).toEqual([]);
});

test('the wish box resolves child language locally and its chips need no typing', async ({ page }) => {
  await stageFixture(page); await openTab(page, 'help');
  await page.locator('#ideas-chips .idea-chip', { hasText: 'keep score' }).click();
  await expect(page.locator('#ideas-results [data-recipe]').first()).toHaveAttribute('data-recipe', 'keep-score');
  await page.locator('#ideas-input').fill('I want my bird to hop when I press space'); await page.locator('#ideas-find').click();
  await expect(page.locator('#ideas-results [data-recipe]').first()).toHaveAttribute('data-recipe', 'jump-gravity');
  // A Builder idea at Starter offers to switch, then inserts.
  await expect(page.locator('#ideas-results [data-recipe="jump-gravity"] .recipe-insert')).toHaveText('Switch to Builder and insert');
  await page.locator('#ideas-results [data-recipe="jump-gravity"] .recipe-insert').click();
  await expect(page.locator('#level-select')).toHaveValue('builder');
  await expect.poll(async () => (await saved(page)).workspace.procedures?.map((p: any) => p.handler.event)).toEqual(['start', 'key:Space']);
  await page.locator('#ideas-input').fill('photosynthesis in plants'); await page.locator('#ideas-find').click();
  await expect(page.locator('#ideas-status')).toContainText('No idea card matches');
  await page.locator('#ideas-ask-ai').click();
  await expect(page.locator('#assist-panel')).toHaveAttribute('open', ''); await expect(page.locator('#assist-mode')).toHaveValue('idea');
  await expect(page.locator('#assist-question')).toHaveValue('photosynthesis in plants');
});

test('Examples holds finished projects to play and change, with thumbnails and three things to try', async ({ page }) => {
  await page.goto('/'); await page.locator('#examples-open').click();
  const card = page.locator('#examples-dialog [data-example="scene-star-game"]');
  await expect(card.locator('img')).toHaveJSProperty('complete', true);
  expect(await card.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);
  // The games that lessons build are under Lessons, not here.
  await expect(page.locator('#examples-dialog .example-card')).toHaveCount(10);
  await expect(page.locator('#examples-dialog [data-example="catch-the-star-game"]')).toHaveCount(0);
  await expect(page.locator('#examples-dialog [data-filter="build"]')).toHaveCount(0);
  await page.locator('#scene-story-example').click();
  await expect(page.locator('#project-title')).toHaveText('Story');
  await openTab(page, 'help'); await expect(page.locator('[data-nudge="try"]')).toBeVisible();
  await page.locator('#examples-open').click(); await page.locator('#scene-drawing-example-play').click();
  await expect(page.locator('#play-dialog')).toBeVisible(); await expect(page.locator('#play-status')).toHaveText(/Event session running|Finished/, { timeout: 60_000 });
  await page.locator('#play-close').click();
});

test('Lessons lists the lesson first, then the guided builds, each to start or play', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#lessons-open').click();
  const cards = page.locator('#lessons-dialog .lesson-card');
  await expect(cards).toHaveCount(7);
  await expect(cards.first()).toHaveAttribute('data-lesson', 'brick-breaker');
  await expect(cards.first().locator('.lesson-kind')).toHaveText('Lesson');
  await expect(cards.nth(1).locator('.lesson-kind')).toHaveText('Guided build');
  await expect(cards.first().locator('img')).toHaveJSProperty('complete', true);
  // Play the finished game first…
  await page.locator('#lessons-play-pen-patterns').click();
  await expect(page.locator('#play-dialog')).toBeVisible(); await expect(page.locator('#play-status')).toHaveText(/Event session running|Finished/, { timeout: 60_000 });
  await page.locator('#play-close').click();
  // …or start it: a lesson opens its start sheet.
  await page.locator('#lessons-open').click(); await page.locator('#lessons-start-brick-breaker').click();
  await expect(page.locator('#lessons-dialog')).toBeHidden(); await expect(page.locator('#lesson-start')).toBeVisible();
  await page.locator('#lesson-start-cancel').click();
  // Help names the same section Lessons.
  await openTab(page, 'help'); await expect(page.locator('#help-nav-builds')).toHaveText('Lessons');
});
test('Catch the star can be built step by step, with checks, highlights and a finish', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#start-card')).toBeHidden(); // the default project is not empty
  await openHelp(page, 'builds'); await page.locator('#guide-start-catch-the-star').click();
  // Replacing a project is an explicit choice; the step panel does not appear until then.
  await expect(page.locator('#guide-confirm')).toContainText('replaces the project'); await expect(page.locator('#guide-active')).toBeHidden();
  await page.locator('#guide-confirm-cancel').click(); await expect(page.locator('#guide-confirm')).toBeHidden();
  await page.locator('#guide-start-catch-the-star').click(); await page.locator('#guide-confirm-start').click();
  await expect(page.locator('#guide-progress')).toHaveText('Step 1 of 7'); await expect(page.locator('#guide-next')).toBeDisabled();
  await expect(page.locator('#start-card')).toBeHidden(); // the starter's empty workspace belongs to the build, not the start card
  await expect(page.locator('#scene-stock')).toHaveClass(/guide-target/);
  // 1. Add a star from the library.
  await page.locator('#scene-stock').click(); await page.locator('#stock-dialog .stock-card[data-stock-id="star"]').click(); await expect(page.locator('#stock-dialog')).toBeHidden();
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  // 2–6. Each step's “Show me how” offers the reviewed idea; the step's sprite is selected for the learner.
  const insertShown = async (recipe: string) => {
    await openTab(page, 'help'); await page.locator('#guide-show').click();
    await page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-insert`).click();
    await expect(page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-status`)).toContainText('Added');
  };
  await expect(page.locator('#guide-progress')).toHaveText('Step 2 of 7'); await expect(page.getByRole('treeitem', { name: 'Events', exact: true })).toHaveClass(/guide-target/);
  await expect(page.locator('#scene-selection')).toHaveValue('bird');
  await insertShown('arrow-keys');
  await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  await expect(page.locator('#guide-progress')).toHaveText('Step 3 of 7');
  // A reload resumes the build at the same step.
  await page.reload(); await expect(page.locator('#run')).toBeEnabled();
  await openTab(page, 'help'); await expect(page.locator('#guide-progress')).toHaveText('Step 3 of 7');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  await page.locator('#stop').click(); await openTab(page, 'help');
  await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  for (const recipe of ['collect-coin', 'keep-score', 'win-screen']) {
    await insertShown(recipe); await expect(page.locator('#guide-check')).toHaveText(/Done/); await page.locator('#guide-next').click();
  }
  // 7. Win. A learner testing the ending can lower the target score to 0.
  await expect(page.locator('#guide-progress')).toHaveText('Step 7 of 7');
  const target = page.getByRole('button', { name: 'Edit text: 5', exact: true }); await target.scrollIntoViewIfNeeded(); await target.click();
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('0'); await page.keyboard.press('Enter');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('You win!', { timeout: 60_000 });
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/);
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-finish')).toBeVisible(); await expect(page.locator('#guide-remix li')).toHaveCount(3);
  await expect(page.locator('#guide-next-build')).toHaveText('Next build: Dodge the balls');
  await expect.poll(async () => (await saved(page)).workspace.procedures.map((p: any) => p.handler.event).sort()).toEqual(['click', 'overlap', 'start', 'start', 'start']);
  // The finish shows active time against the plan, and a facilitator can download it.
  await expect(page.locator('#guide-time')).toHaveText(/^Time: \d+ min \d+ s \(planned 15 min\)\.$/);
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#guide-timing').click()]);
  expect(file.suggestedFilename()).toBe('build-timing-catch-the-star.json');
  const timing = JSON.parse(readFileSync((await file.path())!, 'utf8'));
  expect(timing).toMatchObject({ build: 'catch-the-star', plannedMinutes: 15 });
  expect(timing.steps.map((s: any) => s.usedShowMeHow)).toEqual([false, true, false, true, true, true, false]);
  expect(timing.steps.every((s: any) => s.activeSeconds >= 0)).toBe(true); expect(timing.activeMinutes).toBeGreaterThan(0);
});

test('nudges: an empty workspace, a new library sprite, and a runtime error each suggest ideas', async ({ page }) => {
  await page.goto('/');
  await page.locator('#project-file').setInputFiles('tests/fixtures/recipes/stage.json');
  await expect(page.locator('#start-card')).toBeVisible(); await expect(page.locator('#start-picks button')).toHaveCount(3);
  await expect(page.locator('#tab-help .tab-dot')).toBeVisible();
  await page.locator('#start-card [data-wish="jump"]').click();
  await expect(page.locator('#panel-help')).toBeVisible(); await expect(page.locator('#ideas-input')).toHaveValue('jump');
  await openTab(page, 'sprite'); await page.locator('#scene-stock').click(); await page.locator('#stock-dialog .stock-card[data-stock-id="ball"]').click();
  await openTab(page, 'help');
  await expect(page.locator('[data-nudge="sprite"]')).toContainText('You added Ball');
  await page.locator('[data-nudge="sprite"] .idea-chip', { hasText: 'Make it talk' }).click();
  await expect(page.locator('#ideas-results [data-recipe="say-something"]')).toBeVisible();
  await page.locator('#ideas-results [data-recipe="say-something"] .recipe-insert').click();
  await expect(page.locator('#start-card')).toBeHidden();
  // A name error suggests the matching Fix idea.
  await page.locator('#level-select').selectOption('builder');
  const failing = { format: 'python-blocks', formatVersion: 1, languageVersion: 19, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'py_program', x: 20, y: 20, inputs: { BODY: { block: { type: 'text_print', inputs: { TEXT: { block: { type: 'py_get', fields: { SYMBOL: 'missing' } } } } } } } }] }, variables: [{ name: 'best', id: 'missing', type: 'py:module' }] } };
  await page.locator('#project-file').setInputFiles({ name: 'name.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(failing)) });
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Let’s try again', { timeout: 60_000 });
  await openTab(page, 'help'); await expect(page.locator('[data-nudge="fix"]')).toContainText('A name is not set yet');
});

test('the AI helper may only route to a reviewed idea, which the app then shows', async ({ page }) => {
  const endpoint = 'https://api.openai.com/v1/responses'; const bodies: any[] = [];
  await page.route(endpoint, async route => {
    bodies.push(JSON.parse(route.request().postData()!));
    await route.fulfill({ json: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ concept: 'event', question: 'clarify', line: 0, recipe: 'chase' }) }] }], usage: { input_tokens: 10, output_tokens: 5 } } });
  });
  await stageFixture(page); await page.locator('#level-select').selectOption('builder');
  await menu(page, 'AI assist');
  await (await reveal(page, '#assist-key')).fill('sk-test-key-0123456789abcdef'); await page.locator('#assist-enable').click();
  // A wish that matches locally never reaches the provider.
  await page.locator('#assist-chips .idea-chip', { hasText: 'jump when I press space' }).click();
  await page.locator('#assist-review').click(); await expect(page.locator('#assist-status')).toContainText('No request sent');
  await expect(page.locator('#ideas-results [data-recipe="jump-gravity"]')).toBeVisible(); expect(bodies).toHaveLength(0);
  // Otherwise the model can choose only an ID; the reviewed card is what appears.
  // The matched card opened the Ideas section; the helper's panel is back in Help → More.
  await (await reveal(page, '#assist-mode')).selectOption('idea'); await page.locator('#assist-question').fill('the flowers should wilt at sunset');
  await page.locator('#assist-review').click(); await page.locator('#assist-send').click();
  await expect(page.locator('#assist-status')).toContainText('A reviewed idea');
  await expect(page.locator('#ideas-results [data-recipe="chase"]')).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].text.format.schema.properties.recipe.enum).toContain('chase');
  expect(bodies[0].instructions).toContain('chase = Make an enemy chase the player');
  expect((await saved(page)).workspace.procedures ?? []).toEqual([]); // nothing was inserted for the learner
});

// Walkthroughs: each build completed only with what a learner has (ideas via
// “Show me how”, palette drags, the libraries and the Sprite tab).
async function startBuild(page: Page, id: string, steps: number) {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await openHelp(page, 'builds'); await page.locator(`#guide-start-${id}`).click();
  if (await page.locator('#guide-confirm').isVisible()) await page.locator('#guide-confirm-start').click();
  await expect(page.locator('#guide-progress')).toHaveText(`Step 1 of ${steps}`);
}
async function showAndInsert(page: Page, recipe: string) {
  await openTab(page, 'help'); await page.locator('#guide-show').click();
  await page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-insert`).click();
  await expect(page.locator(`#ideas-results [data-recipe="${recipe}"] .recipe-status`)).toContainText('Added');
}
async function nextStep(page: Page) {
  await openTab(page, 'help'); await expect(page.locator('#guide-check')).toHaveText(/Done/, { timeout: 60_000 }); await page.locator('#guide-next').click();
}
async function runUntil(page: Page, status: RegExp) {
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(status, { timeout: 90_000 });
}
const workspaceText = (page: Page, text: RegExp) => page.locator('#blockly > .injectionDiv > svg.blocklySvg text.blocklyText', { hasText: text });
async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 14 }); await page.mouse.up();
  await page.waitForTimeout(400); // let Blockly finish the drop (snapping and bumping) before the next gesture
}

test('Dodge the balls: ideas for each step and a game that ends', async ({ page }) => {
  test.setTimeout(180_000);
  await startBuild(page, 'dodge-the-balls', 6);
  for (const recipe of ['arrow-keys', 'fall-down', 'spawn-clones', 'lives', 'survive-timer']) { await showAndInsert(page, recipe); await nextStep(page); }
  await runUntil(page, /You win!|Game over/); await nextStep(page);
  await expect(page.locator('#guide-next-build')).toHaveText('Next build: Pen patterns');
});

test('Pen patterns: hats and loops dragged from the palette, nested by hand', async ({ page }) => {
  test.setTimeout(150_000);
  await startBuild(page, 'pen-patterns', 6);
  await page.getByRole('treeitem', { name: 'Events', exact: true }).click();
  const hat = page.locator('.blocklyToolboxFlyout g.blocklyDraggable').filter({ has: page.locator('text.blocklyText', { hasText: /^game\sstarts$/ }) }).first();
  const hatBox = (await hat.boundingBox())!, canvas = (await page.locator('#blockly').boundingBox())!;
  await dragTo(page, { x: hatBox.x + 6, y: hatBox.y + hatBox.height / 2 }, { x: canvas.x + 400, y: canvas.y + 120 });
  await nextStep(page);
  await showAndInsert(page, 'draw-square'); await nextStep(page);
  await runUntil(page, /Event session running|Finished/); await page.locator('#stop').click(); await nextStep(page);
  // Step 4, in the visible script: a new repeat at the top, then the square's repeat moved inside it.
  // Blocks are found by their symbols, which start each block's first row.
  const visibleWhen = async () => (await blockIcons(page, 'flag')).filter(b => b.x > canvas.x + 120).sort((a, b) => b.x - a.x)[0];
  await page.getByRole('treeitem', { name: 'Control', exact: true }).click();
  const repeat = page.locator('.blocklyToolboxFlyout g.blocklyDraggable').filter({ has: page.locator('text.blocklyText', { hasText: /^repeat$/ }) }).first();
  const repeatBox = (await repeat.boundingBox())!, when = await visibleWhen();
  await dragTo(page, { x: repeatBox.x + 6, y: repeatBox.y + 12 }, { x: when.x + 20, y: when.y + when.height + 20 });
  await expect(workspaceText(page, /^repeat$/)).toHaveCount(2);
  const [outer, square] = await blockIcons(page, 'loop');
  await dragTo(page, { x: square!.x - 5, y: square!.y + square!.height / 2 }, { x: outer!.x + 29, y: outer!.y + outer!.height + 22 });
  await nextStep(page);
  // Step 5: a pen color at the top of the outer repeat.
  await page.getByRole('treeitem', { name: 'Draw', exact: true }).click();
  const color = page.locator('.blocklyToolboxFlyout g.blocklyDraggable').filter({ has: page.locator('text.blocklyText', { hasText: /^set\spen\scolor$/ }) }).first();
  const colorBox = (await color.boundingBox())!, [outerNow] = await blockIcons(page, 'loop');
  await dragTo(page, { x: colorBox.x + 6, y: colorBox.y + colorBox.height / 2 }, { x: outerNow.x + 35, y: outerNow.y + outerNow.height + 24 });
  await nextStep(page);
  await runUntil(page, /Event session running|Finished/); await nextStep(page);
  await expect(page.locator('#guide-finish')).toBeVisible();
});

test('Maze run: a world from the library, camera, walls and a second world', async ({ page }) => {
  test.setTimeout(150_000);
  await startBuild(page, 'maze-run', 6); await expect(page.locator('#level-select')).toHaveValue('pro');
  const addWorld = async () => {
    await (await reveal(page, '#scene-worlds')).click(); await page.locator('#world-stock').click();
    await page.locator('#stock-dialog .stock-card[data-stock-kind="world"]').first().click(); await expect(page.locator('#stock-dialog')).toBeHidden();
    await page.locator('#world-close').click();
  };
  await addWorld(); await nextStep(page);
  await showAndInsert(page, 'arrow-keys'); await nextStep(page);
  await showAndInsert(page, 'camera-follow'); await nextStep(page);
  await nextStep(page); // the template already has wall tiles
  await runUntil(page, /Event session running/); await page.locator('#stop').click(); await page.locator('#scene-reset').click(); await nextStep(page);
  await addWorld();
  await openTab(page, 'sprite'); await page.locator('#scene-stock').click(); await page.locator('#stock-dialog .stock-card[data-stock-id="star"]').click();
  await page.locator('#scene-cards button', { hasText: 'Explorer' }).click();
  await showAndInsert(page, 'next-level'); await nextStep(page);
  await expect(page.locator('#guide-finish')).toBeVisible();
});

test('Jump quest: gravity, walking, firing and reaching the goal', async ({ page }) => {
  test.setTimeout(150_000);
  await startBuild(page, 'jump-quest', 5);
  for (const recipe of ['jump-gravity', 'arrow-keys', 'shoot-projectile']) { await showAndInsert(page, recipe); await nextStep(page); }
  await openTab(page, 'help'); await page.locator('#guide-show').click();
  await expect(page.locator('#ideas-results [data-recipe="reach-goal"] select')).toHaveValue('goal'); // the step targets the goal star
  await page.locator('#ideas-results [data-recipe="reach-goal"] .recipe-insert').click(); await nextStep(page);
  // Testing the ending: move the goal star next to the explorer, then run.
  await openTab(page, 'sprite'); await page.locator('#scene-cards button', { hasText: 'Goal star' }).click();
  await page.locator('#scene-x').fill('-190'); await page.locator('#scene-x').press('Enter');
  await page.locator('#scene-y').fill('-120'); await page.locator('#scene-y').press('Enter');
  await runUntil(page, /You win!/); await nextStep(page);
  await expect(page.locator('#guide-next-build')).toHaveText('Next build: Maze run');
});

test('Talking story: a conversation, a scene change, a new costume and a backdrop event', async ({ page }) => {
  test.setTimeout(150_000);
  await startBuild(page, 'talking-story', 5);
  await showAndInsert(page, 'conversation'); await nextStep(page);
  await showAndInsert(page, 'scene-change-later'); await nextStep(page);
  // A second costume for the bird, imported from a tiny PNG.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGP4UKHxnxLMMGrAqAGjBgwXAwDbfo8f28hHuwAAAABJRU5ErkJggg==', 'base64');
  await openTab(page, 'sprite'); await page.locator('#scene-image').setInputFiles({ name: 'wings.png', mimeType: 'image/png', buffer: png });
  await nextStep(page);
  await showAndInsert(page, 'backdrop-event'); await nextStep(page);
  await runUntil(page, /Event session running/); await nextStep(page);
  await expect(page.locator('#guide-finish')).toBeVisible(); await expect(page.locator('#guide-next-build')).toHaveText('Next lesson: Brick Breaker');
});
