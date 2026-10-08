import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { strFromU8 } from 'fflate';
import { exported, isolated, run } from './playable-support';

const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!).workspace.pythonScene);
async function open(page: Page) {
  await page.goto('/'); await page.locator('#project-file').setInputFiles('tests/fixtures/scene/sequential.json');
  await expect.poll(() => saved(page)).toEqual(JSON.parse(readFileSync('tests/fixtures/scene/sequential.json','utf8')).workspace.pythonScene);
}
async function add(page: Page, id: string) {
  const before = JSON.stringify(await saved(page));
  await page.locator(`[data-stock-id="${id}"]`).click(); await expect(page.locator('#stock-dialog')).not.toBeVisible();
  await expect.poll(async () => JSON.stringify(await saved(page))).not.toBe(before);
}
const errors = new WeakMap<Page,string[]>();
test.beforeEach(({page}) => { const items: string[]=[]; errors.set(page,items); page.on('pageerror',e => items.push(e.message)); });
test.afterEach(({page}) => expect(errors.get(page)).toEqual([]));

test('stock sprites have real previews, searchable categories and atomic reusable editable assets', async ({page},info) => {
  await open(page);
  const project = JSON.parse(readFileSync('tests/fixtures/scene/sequential.json','utf8'));
  const data = await page.evaluate(() => { const c=document.createElement('canvas'); c.width=c.height=2; c.getContext('2d')!.fillRect(0,0,2,2); return c.toDataURL(); });
  project.workspace.pythonScene.assets.push({id:'cat',name:'My original cat',width:2,height:2,data});
  await page.locator('#project-file').setInputFiles({name:'existing-art.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect.poll(() => saved(page)).toEqual(project.workspace.pythonScene);
  const before = await saved(page);
  await page.locator('#scene-stock').click(); await expect(page.locator('.stock-card')).toHaveCount(20); await expect(page.locator('.stock-thumbnail canvas')).toHaveCount(20);
  const coverage = await page.locator('.stock-thumbnail canvas').evaluateAll(canvases => canvases.map(canvas => { const c=canvas as HTMLCanvasElement; return Array.from(c.getContext('2d')!.getImageData(0,0,c.width,c.height).data).filter((v,i) => i%4===3 && v>0).length; }));
  expect(coverage.every(n => n>200)).toBe(true);
  await page.locator('#stock-dialog').screenshot({path:info.outputPath('stock-sprites-desktop.png')});
  await page.locator('#stock-category').selectOption('Characters'); await expect(page.locator('.stock-card')).toHaveCount(9);
  await page.locator('#stock-search').fill('cat'); await expect(page.locator('.stock-card')).toHaveCount(1); await add(page,'cat');
  const first = await saved(page), cat = first.sprites.at(-1); expect(cat.name).toBe('Cat 1'); expect(cat.costume).not.toBe('cat'); expect(first.assets[0]).toEqual(before.assets[0]);
  await page.locator('#scene-stock').click(); await add(page,'cat'); const second = await saved(page);
  expect(second.sprites.at(-1).costume).toBe(cat.costume); expect(second.assets).toEqual(first.assets);
  await page.locator('#language-undo').click(); await expect.poll(() => saved(page)).toEqual(first);
  await page.locator('#language-undo').click(); await expect.poll(() => saved(page)).toEqual(before);
  await page.locator('#language-redo').click(); await expect.poll(() => saved(page)).toEqual(first);
  await page.reload(); expect(await saved(page)).toEqual(first);
  await page.locator('#scene-selection').selectOption(cat.id); await page.locator('#scene-art').click(); await expect(page.locator('#art-name')).toHaveValue('Cat'); await expect(page.locator('#art-save')).toBeEnabled();
  await page.locator('#art-close').click(); await page.setViewportSize({width:390,height:844}); await page.locator('#scene-stock').click();
  await page.locator('#stock-search').fill('robot'); await expect(page.locator('[data-stock-id="robot"] canvas')).toBeVisible();
  expect(await page.locator('#stock-dialog').evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.locator('#stock-dialog').screenshot({path:info.outputPath('stock-sprites-mobile.png')});
  // Escape inside a native search input clears its query first. From a button,
  // Escape uses the dialog's normal cancellation and restores opener focus.
  await page.locator('#stock-close').press('Escape'); await expect(page.locator('#stock-dialog')).not.toBeVisible();
  await expect(page.locator('#scene-stock')).toBeFocused();
});

test('world templates preserve previous work, embed reusable artwork, undo together and play independently', async ({page,browser},info) => {
  await open(page); const before=await saved(page);
  await page.locator('#scene-worlds').click(); await page.locator('#world-stock').click();
  await expect(page.locator('.stock-card')).toHaveCount(4); await expect(page.locator('.stock-thumbnail canvas')).toHaveCount(4);
  await page.locator('#stock-dialog').screenshot({path:info.outputPath('stock-worlds.png')}); await add(page,'forest');
  await expect(page.locator('#world-name')).toHaveValue('Forest trail'); const first=await saved(page);
  expect(first.sprites).toEqual(before.sprites); expect(first.worlds).toHaveLength(1); expect(first.worlds[0].map.walls.some(Boolean)).toBe(true);
  expect(first.assets.length).toBe(before.assets.length+3); expect(first.backdrops).toHaveLength(1);
  const ids=new Set(first.assets.map((a:any)=>a.id)); expect(first.worlds[0].map.tiles.every((id:string|null)=>id===null||ids.has(id))).toBe(true);
  await page.locator('#world-undo').click(); await expect.poll(() => saved(page)).toEqual(before);
  await page.locator('#world-redo').click(); await expect.poll(() => saved(page)).toEqual(first);
  await page.locator('#world-stock').click(); await add(page,'forest'); const second=await saved(page);
  expect(second.worlds.map((w:any)=>w.name)).toEqual(['Forest trail','Forest trail 2']); expect(second.assets).toEqual(first.assets); expect(second.backdrops).toEqual(first.backdrops);
  await page.locator('#world-close').click();
  await page.locator('#scene-stock').click(); await add(page,'fox'); const scene=await saved(page); expect(scene.sprites.at(-1).world).toBe(scene.world);
  const files=await exported(page); expect(JSON.parse(strFromU8(files['scene.json']))).toEqual(scene);
  const play=await isolated(browser,files,info);
  try {
    await play.page.goto(play.url); await run(play.page); await expect(play.page.locator('#stage')).toHaveAttribute('data-world',scene.world);
    await expect(play.page.locator('#stage')).toHaveAttribute('data-backdrop',scene.worlds[1].backdrop);
    const color=await play.page.locator('#stage').evaluate(canvas=>Array.from((canvas as HTMLCanvasElement).getContext('2d')!.getImageData(5,5,1,1).data)); expect(color[3]).toBe(255); expect(color.slice(0,3)).not.toEqual([253,253,249]);
    await play.page.screenshot({path:info.outputPath('stock-world-player.png'),fullPage:true}); expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
  await page.reload(); expect(await saved(page)).toEqual(scene);
});

test('all stock backdrops and worlds add through the normal save format and respect the world limit', async ({page},info) => {
  await open(page); await page.locator('#scene-stock-backdrop').click(); await expect(page.locator('.stock-card')).toHaveCount(6); await expect(page.locator('.stock-thumbnail canvas')).toHaveCount(6);
  await page.locator('#stock-dialog').screenshot({path:info.outputPath('stock-backdrops.png')}); await add(page,'reef');
  const backdrop=await saved(page); expect(backdrop.backdrops[0].name).toBe('Coral reef'); expect(backdrop.backdrop).toBe(backdrop.backdrops[0].id);
  await page.locator('#scene-worlds').click();
  for (const id of ['forest','reef','city','space','forest','reef','city','space']) { await page.locator('#world-stock').click(); await add(page,id); }
  const full=await saved(page); expect(full.worlds).toHaveLength(8); expect(full.backdrops).toHaveLength(4);
  await page.locator('#world-stock').click(); await page.locator('[data-stock-id="forest"]').click(); await expect(page.locator('#stock-error')).toContainText('already has 8 worlds');
  expect(await saved(page)).toEqual(full); await page.locator('#stock-close').click(); await page.locator('#world-close').click();
  await page.reload(); expect(await saved(page)).toEqual(full);
});
