import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import { exported, isolated, key, openProject, run } from './playable-support';

async function edit(page: Page, source?: string) {
  await page.locator('#python-edit').click(); await expect(page.locator('#python-editor')).toBeVisible();
  if (source !== undefined) await page.locator('#python-editor').fill(source);
}
async function sourceFiles(page: Page) {
  const pending = page.waitForEvent('download'); await page.locator('#export').click();
  return unzipSync(readFileSync((await (await pending).path())!));
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const seen: string[] = []; errors.set(page, seen); page.on('pageerror', error => seen.push(error.message)); });
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

test('replay accepts its validated draft but blocks later invalid or unapplied text', async ({ page }) => {
  await openProject(page, 'src/scene/example.json');
  const source = 'from playground import scene as _pb_scene\n_pb_scene.load("scene.json")\nfrom playground import game as _pb_game\nprint("first run")\n_pb_game.finish(True, "First finish")\n';
  await edit(page, source); await page.locator('#run').click();
  await expect(page.locator('#game-result-message')).toHaveText('First finish', { timeout: 60_000 });
  await page.locator('#game-restart').click(); await expect(page.locator('#game-result-message')).toHaveText('First finish', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('first run\n');
  for (const draft of [source + 'print(', source.replace('First finish', 'Second finish')]) {
    await page.locator('#python-editor').fill(draft); await page.locator('#game-restart').click();
    await expect(page.locator('#python-state')).toContainText('Use Run Python');
    await expect(page.locator('#python-editor')).toBeFocused(); await expect(page.locator('#game-result-message')).toHaveText('First finish');
    await expect(page.locator('#stop')).toBeDisabled();
  }
  await page.locator('#run').click(); await expect(page.locator('#game-result-message')).toHaveText('Second finish', { timeout: 60_000 });
  await page.locator('#python-editor').fill('print('); await page.locator('#python-discard').click();
  await page.locator('#game-restart').click(); await expect(page.locator('#game-result-message')).toHaveText('Second finish', { timeout: 60_000 });
});

test('edited scene source and playable ZIP capture accepted code, exact draft and original assets', async ({ page, browser }, info) => {
  const project = JSON.parse(readFileSync('src/scene/example.json', 'utf8'));
  project.workspace.pythonScene.watchers = [{ id: 'x', sprite: 'player', property: 'x' }];
  await page.goto('/'); await page.locator('#project-file').setInputFiles({ name: 'scene.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  await edit(page); const original = await page.locator('#python-editor').inputValue();
  const source = '# My written program 雪🙂\n' + original.replace('.x) + (20)', '.x) + (35)');
  expect(source).toContain('35'); await page.locator('#python-editor').fill(source);
  const sources = await sourceFiles(page), generated = (await page.locator('#python').textContent())!;
  expect(strFromU8(sources['program.py'])).toBe(generated);
  expect(JSON.parse(strFromU8(sources['scene.json']))).toEqual(project.workspace.pythonScene);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/player/bundle.json', async route => { await held; await route.continue(); });
  const pending = exported(page); await expect(page.locator('#export-cancel')).toBeVisible();
  await page.locator('#python-editor').fill('print('); release(); const files = await pending;
  const captured = JSON.parse(strFromU8(files['project.python-blocks.json']));
  expect(captured.workspace.pythonBridge.draft.source).toBe(source); expect(captured.workspace.pythonBridge.draft.baseSource).toBe(source);
  expect(strFromU8(files['program.py'])).toBe(generated); expect(JSON.parse(strFromU8(files['scene.json']))).toEqual(project.workspace.pythonScene);
  await expect(page.locator('#python-editor')).toHaveValue('print(');
  const play = await isolated(browser, files, info, true);
  try {
    await play.page.goto(play.url); await run(play.page);
    await expect(play.page.locator('[data-watch-id="x"]')).toContainText('-100');
    await key(play.page, 'ArrowRight'); await expect(play.page.locator('[data-watch-id="x"]')).toContainText('-65');
    await play.page.screenshot({ path: info.outputPath('python-edited-independent-player.png'), fullPage: true });
    await play.page.locator('#stop').click(); await run(play.page); await expect(play.page.locator('[data-watch-id="x"]')).toContainText('-100');
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
  await page.locator('#project-file').setInputFiles({ name: 'captured.json', mimeType: 'application/json', buffer: Buffer.from(files['project.python-blocks.json']) });
  await expect(page.locator('#python-editor')).toHaveValue(source); await expect(page.locator('#python-state')).toContainText('Python applied');
});

test('main-file edits keep transitive module sources and pins in independently runnable exports', async ({ page, browser }, info) => {
  await openProject(page, 'tests/fixtures/modules/transitive-consumer.json');
  const original = await sourceFiles(page); await edit(page);
  const source = (await page.locator('#python-editor').inputValue()) + '\n# an extra learner-authored statement\nprint(42)\n';
  await page.locator('#python-editor').fill(source); const sources = await sourceFiles(page), files = await exported(page);
  for (const name of Object.keys(original).filter(name => /^_pb_module_/.test(name) || name === 'modules.json')) {
    expect(sources[name]).toEqual(original[name]); expect(files[name]).toEqual(original[name]);
  }
  expect(strFromU8(files['program.py'])).toBe(strFromU8(sources['program.py']));
  expect(JSON.parse(strFromU8(files['project.python-blocks.json'])).workspace.pythonBridge.draft.source).toBe(source);
  const play = await isolated(browser, files, info);
  try {
    await play.page.goto(play.url); await run(play.page, false); await expect(play.page.locator('#output')).toHaveText('7\n42\n');
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('Python edits retain finite execution limits and Stop in editor and independent player', async ({ page, browser }, info) => {
  await openProject(page, 'tests/fixtures/language/large-integer.json'); await edit(page, 'while True:\n    pass\n');
  const files = await exported(page);
  async function bounded(target: Page) {
    await target.locator('#run').click(); await expect(target.locator('#output')).toContainText('Stopped after 10 seconds', { timeout: 60_000 });
    await expect(target.locator('#run')).toBeEnabled();
    await target.locator('#run').click(); await expect(target.locator('#stop')).toBeEnabled(); await target.locator('#stop').click();
    await expect(target.locator('#run')).toBeEnabled(); await expect(target.locator('#stop')).toBeDisabled();
  }
  await bounded(page);
  const play = await isolated(browser, files, info);
  try { await play.page.goto(play.url); await bounded(play.page); expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]); }
  finally { await play.close(); }
  await page.locator('#python-editor').fill('print(42)\n'); await run(page, false); await expect(page.locator('#output')).toHaveText('42\n');
});
