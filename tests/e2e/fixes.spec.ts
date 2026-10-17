import { test, expect, type Page } from '@playwright/test';
import { openTab } from './shell';

// A new browser at Starter, on an iPad-sized viewport.
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1024, height: 700 } });
const b = (type: string, id: string, fields: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ type, id, fields, inputs, ...extra });
const project = (blocks: unknown[], scene?: unknown) => ({ format: 'python-blocks', formatVersion: 1, languageVersion: 19, workspace: { blocks: { languageVersion: 0, blocks }, ...(scene ? { pythonScene: scene } : {}) } });
async function load(page: Page, value: unknown, name = 'project.json') {
  await page.locator('#project-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const warningOf = (page: Page, id: string) => page.locator(`#blockly [data-id="${id}"] .blocklyIconGroup`).first();

test('tapping a block’s “!” offers a step-by-step fix; its one-tap action clears the warning', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await load(page, project([b('py_program', 'prog', {}, { BODY: { block: b('pen_move', 'mv') } }, { x: 60, y: 60 })]));
  await expect(warningOf(page, 'mv')).toBeVisible();
  await warningOf(page, 'mv').click();
  // A non-modal popover, not Blockly's bubble, and the editor stays usable behind it.
  await expect(page.locator('#fix-popover')).toBeVisible();
  await expect(page.locator('#fix-popover-title')).toHaveText('This slot needs a value');
  await expect(page.locator('#fix-popover-message')).toContainText('Connect a value');
  await expect(page.locator('.blocklyBubble')).toHaveCount(0);
  await expect(page.locator('#fix-popover')).toHaveAttribute('role', 'dialog'); await expect(page.locator('#fix-popover')).not.toHaveAttribute('aria-modal', 'true');
  await page.locator('#fix-popover-dismiss').click(); await expect(page.locator('#fix-popover')).toBeHidden();
  await warningOf(page, 'mv').click(); await page.locator('#fix-popover-start').click();
  await expect(page.locator('#fix-popover')).toBeHidden();
  await expect(page.locator('#panel-help')).toBeVisible(); await expect(page.locator('#fix-active')).toBeVisible();
  await expect(page.locator('#fix-title')).toHaveText('This slot needs a value');
  await expect(page.locator('#blockly [data-id="mv"]')).toHaveClass(/fix-target/);
  await page.locator('#fix-steps .fix-action', { hasText: 'Put a 0 here' }).click();
  await expect(page.locator('#fix-check')).toHaveText('Fixed! The warning is gone.');
  await expect(warningOf(page, 'mv')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).workspace.blocks.blocks[0].inputs.BODY.block.inputs?.STEPS?.block?.type).toBe('py_number');
  await expect(page.locator('#fix-stop')).toHaveText('Done'); await page.locator('#fix-stop').click(); await expect(page.locator('#fix-active')).toBeHidden();
  // One Undo takes the fill back.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(warningOf(page, 'mv')).toBeVisible();
});

test('a missing sprite walks from the library to a one-tap pick; a loose block gets a start script', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  const scene = { version: 1, background: '#fdfdf9', sprites: [], assets: [] };
  await load(page, project([b('py_program', 'prog', {}, { BODY: { block: b('scene_move', 'mv', {}, { SPRITE: { block: b('scene_sprite', 'ref', { SPRITE_ID: 'ghost' }) }, VALUE: { block: b('py_number', 'n', { VALUE: '10' }) } }) } }, { x: 60, y: 60 })], scene), 'ghost.json');
  await warningOf(page, 'ref').click(); await expect(page.locator('#fix-popover-title')).toHaveText('This sprite is gone');
  await page.locator('#fix-popover-start').click();
  await expect(page.locator('#scene-stock')).toHaveClass(/guide-target/);
  await page.locator('#fix-steps .fix-action', { hasText: 'Open the Sprite library' }).click();
  await expect(page.locator('#stock-dialog')).toBeVisible();
  await page.locator('#stock-dialog .stock-card[data-stock-id="ball"]').click(); await expect(page.locator('#stock-dialog')).toBeHidden();
  // The flow moved on: the new sprite can be used in one tap.
  await openTab(page, 'help');
  await page.locator('#fix-steps .fix-action', { hasText: 'Use Ball 1 here' }).click();
  await expect(page.locator('#fix-check')).toHaveText('Fixed! The warning is gone.');
  await expect(warningOf(page, 'ref')).toHaveCount(0);
  await page.locator('#fix-stop').click();
  // A block outside every script is a draft; the flow puts it under “when game starts”.
  await load(page, project([b('py_program', 'prog', {}, {}, { x: 60, y: 60 }), b('pen_move', 'loose', {}, { STEPS: { block: b('py_number', 'n', { VALUE: '100' }) } }, { x: 320, y: 220 })]), 'loose.json');
  await warningOf(page, 'loose').click(); await expect(page.locator('#fix-popover-title')).toHaveText('This block is not in a script');
  await page.locator('#fix-popover-start').click();
  await expect(page.getByRole('treeitem', { name: 'Events', exact: true })).toHaveClass(/guide-target/);
  await page.locator('#fix-steps .fix-action', { hasText: 'when game starts' }).click();
  await expect(page.locator('#fix-check')).toHaveText('Fixed! The warning is gone.');
  await expect.poll(async () => (await saved(page)).workspace.procedures?.[0]?.handler?.event).toBe('start');
  await openTab(page, 'python'); await expect(page.locator('#python')).toContainText('pen.move(100)');
});

test('at Pro the “!” keeps Blockly’s own bubble', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#level-select').selectOption('pro');
  await load(page, project([b('py_program', 'prog', {}, { BODY: { block: b('pen_move', 'mv') } }, { x: 60, y: 60 })]));
  await warningOf(page, 'mv').click();
  await expect(page.locator('.blocklyBubble')).toHaveCount(1);
  await expect(page.locator('#fix-popover')).toBeHidden();
});
