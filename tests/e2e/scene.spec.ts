import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const sceneFile = path.resolve('tests/fixtures/scene/sequential.json');
async function saved(page: Page) { return page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.pythonScene); }
async function open(page: Page) { await page.goto('/'); await page.locator('#project-file').setInputFiles(sceneFile); await expect(page.locator('#scene-selection')).toHaveValue('player'); }
async function run(page: Page, events = false) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(events ? 'Event session running' : 'Finished', { timeout: 60_000 }); }
async function stagePoint(page: Page, x: number, y: number) { await page.locator('#stage').scrollIntoViewIfNeeded(); const r = (await page.locator('#stage').boundingBox())!; return { x: r.x + (x + 240) / 480 * r.width, y: r.y + (160 - y) / 320 * r.height }; }

test('authors, duplicates, drags, and persists the starting scene with Undo', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/');
  await page.getByRole('button', { name: 'Add sprite', exact: true }).click();
  await page.locator('#scene-name').fill('Hero'); await page.locator('#scene-x').fill('-100'); await page.locator('#scene-size').fill('125');
  await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate sprite', exact: true }).click();
  await expect.poll(async () => (await saved(page)).sprites.length).toBe(2);
  const before = await saved(page); expect(before.sprites).toHaveLength(2); expect(before.sprites[0].id).not.toBe(before.sprites[1].id);
  await page.locator('#scene-selection').selectOption(before.sprites[0].id);
  const start = await stagePoint(page, -100, 10), end = await stagePoint(page, -130, 70);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('#scene-y')).toHaveValue('60');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#scene-y')).toHaveValue('0');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await page.reload(); await expect(page.locator('#scene-name')).toHaveValue('Hero'); await expect(page.locator('#scene-y')).toHaveValue('60');
  await page.getByRole('treeitem', { name: 'Sprites', exact: true }).click(); await expect(page.locator('.blocklyToolboxFlyout')).toBeVisible();
  expect(errors).toEqual([]); await page.screenshot({ path: info.outputPath('sprite-editor.png'), fullPage: true });
});

test('two sprites run independently with keyboard and click input and a fresh restart', async ({ page }, info) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Sprite example', exact: true }).click(); await run(page, true);
  const point = await stagePoint(page, -100, 0); await page.mouse.click(point.x, point.y);
  await expect(page.locator('#output')).toContainText('Hello from Player!');
  await page.keyboard.down('ArrowRight'); await page.keyboard.down('ArrowRight'); await page.keyboard.up('ArrowRight'); await expect(page.locator('#scene-live')).toContainText('x -80');
  await page.keyboard.down('Space'); await expect(page.locator('#output')).toContainText('True'); await page.keyboard.up('Space');
  await page.locator('#scene-selection').selectOption('friend'); await expect.poll(async () => (await page.locator('#scene-live').textContent()) !== 'Friend: x 100, y 0').toBe(true);
  await page.screenshot({ path: info.outputPath('sprite-running.png'), fullPage: true });
  await page.locator('#stop').click(); await expect(page.locator('#scene-add')).toBeDisabled();
  expect((await saved(page)).sprites[0].x).toBe(-100);
  await page.locator('#scene-selection').selectOption('player'); await run(page, true); await expect(page.locator('#scene-live')).toContainText('x -100');
  await page.locator('#stop').click(); await page.locator('#scene-reset').click(); await expect(page.locator('#scene-x')).toHaveValue('-100');
});

test('runtime transforms stay out of saved projects and scene assets travel in source exports', async ({ page }) => {
  await open(page); await run(page); await expect(page.locator('#scene-live')).toContainText('x -80'); expect((await saved(page)).sprites[0].x).toBe(-100);
  const downloading = page.waitForEvent('download'); await page.locator('#export').click(); const download = await downloading;
  const data = await readFile((await download.path())!); const files = unzipSync(data);
  expect(JSON.parse(strFromU8(files['scene.json'])).sprites[0].x).toBe(-100); expect(strFromU8(files['program.py'])).toContain('_pb_scene.load("scene.json")');
  await run(page); await expect(page.locator('#output')).toHaveText('-80\n');
  await page.reload(); await expect(page.locator('#scene-x')).toHaveValue('-100'); await expect(page.locator('#scene-live')).toContainText('x -100');
});

test('sprite rename and deletion retain stable references and Undo repairs the program', async ({ page }) => {
  await open(page); await page.locator('#scene-name').fill('Captain'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  await expect(page.locator('#python')).toContainText('_pb_sprites.named("Captain")');
  await page.locator('#scene-delete').click(); await expect(page.locator('#run')).toBeDisabled(); await expect(page.locator('#diagnostics')).toContainText('existing scene sprite');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await page.reload(); await run(page); await expect(page.locator('#output')).toHaveText('-80\n');
});

test('imports image costumes and preserves their pixels through save and reload', async ({ page }) => {
  await open(page);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d')!; ctx.fillStyle = '#f02030'; ctx.fillRect(0, 0, 64, 64); return c.toDataURL('image/png').split(',')[1]; });
  await page.locator('#scene-image').setInputFiles({ name: 'red-square.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.locator('#scene-costume option:checked')).toHaveText('red-square.png');
  await expect.poll(async () => (await saved(page)).assets.length).toBe(1);
  const before = await saved(page); expect(before.assets[0].width).toBe(64); expect(before.sprites[0].costume).toBe(before.assets[0].id);
  await page.reload(); await expect(page.locator('#scene-costume option:checked')).toHaveText('red-square.png');
  await expect.poll(() => page.locator('#stage').evaluate(canvas => Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(140, 160, 1, 1).data))).toEqual([240, 32, 48, 255]);
  await run(page); await expect(page.locator('#output')).toHaveText('-80\n');
});

test('input shortcuts select authored sprites and typing in forms does not control the stage', async ({ page }) => {
  await page.goto('/'); await page.locator('#scene-example').click(); await run(page, true);
  await page.locator('#scene-events').click(); await page.locator('#handler-input-source').selectOption('click:player'); await expect(page.locator('#handler-event')).toHaveValue('click:player');
  await page.locator('#handler-name').fill('my_handler'); await page.keyboard.press('ArrowRight'); await page.locator('#events-close').click(); await expect(page.locator('#scene-live')).toContainText('x -100');
  await page.locator('#stop').click();
});

test('invalid scene imports preserve current work and later Undo remains usable', async ({ page }) => {
  await open(page); const value = JSON.parse(await readFile(sceneFile, 'utf8')); value.workspace.pythonScene.sprites[0].costume = 'missing';
  await page.locator('#project-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await expect(page.locator('#save-state')).toContainText('current work is unchanged'); await expect(page.locator('#scene-name')).toHaveValue('Player');
  const brokenImage = JSON.parse(await readFile(sceneFile, 'utf8')); const pngHeader = Buffer.alloc(24); pngHeader.set([137, 80, 78, 71, 13, 10, 26, 10]); pngHeader.writeUInt32BE(2, 16); pngHeader.writeUInt32BE(2, 20);
  brokenImage.workspace.pythonScene.assets = [{ id: 'broken', name: 'Broken', width: 2, height: 2, data: `data:image/png;base64,${pngHeader.toString('base64')}` }];
  await page.locator('#project-file').setInputFiles({ name: 'broken-image.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(brokenImage)) });
  await expect(page.locator('#save-state')).toContainText('not a readable PNG'); await expect(page.locator('#scene-name')).toHaveValue('Player');
  await page.locator('#scene-x').fill('90'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click(); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(page.locator('#scene-x')).toHaveValue('-100');
  await run(page); await expect(page.locator('#output')).toHaveText('-80\n');
});

test('leaving the focused stage clears held keys in the Python runtime', async ({ page }) => {
  const project = JSON.parse(await readFile('src/scene/example.json', 'utf8'));
  const handler = project.workspace.blocks.blocks.find((b: { id: string }) => b.id === 'key-state-block');
  handler.extraState.signature.handler.event = 'probe'; handler.inputs.BODY.block.inputs.TEXT.block.fields.KEY = 'ArrowRight';
  project.workspace.procedures.find((p: { id: string }) => p.id === 'key-state').handler.event = 'probe';
  await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'keys.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) }); await run(page, true);
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect(page.locator('#scene-live')).toContainText('x -80');
  await page.locator('#event-name').fill('probe'); await page.locator('#event-send').click(); await expect(page.locator('#output')).toHaveText('False\n');
  await page.keyboard.up('ArrowRight'); await page.locator('#stage').focus(); await page.keyboard.press('ArrowRight'); await expect(page.locator('#scene-live')).toContainText('x -60'); await page.locator('#stop').click();
});

test('sprite runtime failures retain their Python details and highlight the operation', async ({ page }) => {
  const project = JSON.parse(await readFile(sceneFile, 'utf8'));
  const operation = project.workspace.blocks.blocks[0].inputs.BODY.block; operation.id = 'bad-sprite-size'; operation.fields.PROPERTY = 'size'; operation.inputs.VALUE = { block: { type: 'py_number', fields: { VALUE: '0' } } };
  await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'error.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Let’s try again', { timeout: 60_000 }); await expect(page.locator('#output')).toContainText('ValueError: size');
  await expect(page.locator('g[data-id="bad-sprite-size"]')).toHaveClass(/blocklyHighlighted/);
});

test('scene properties remain usable at a narrow viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  await page.locator('#scene-name').fill('Little bird'); await page.getByRole('button', { name: 'Apply sprite', exact: true }).click();
  await expect(page.locator('#scene-selection option:checked')).toHaveText('Little bird');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('sprite-mobile.png'), fullPage: true });
});
