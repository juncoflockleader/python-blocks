import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('src/scene/input-example.json','utf8'));
const b = (type: string, fields: Record<string,unknown> = {}, inputs: Record<string,any> = {}): any => ({type,fields,inputs:Object.fromEntries(Object.entries(inputs).map(([k,v]) => [k,{block:v}]))});
const n = (v: number) => b('py_number',{VALUE:String(v)}), t = (v: string) => b('text',{TEXT:v});
const print = (v: any) => b('text_print',{}, {TEXT:typeof v === 'string' ? t(v) : v});
const actor = (type: string, fields = {}, inputs = {}) => b(type,fields,{SPRITE:b('scene_sprite',{SPRITE_ID:'player'}),...inputs});
const chain = (...items: any[]) => { items.slice(1).forEach((v,i) => items[i].next = {block:v}); return items[0]; };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function install(page: Page, handlers: [string,any][], edit?: (p: any) => void) {
  const p = structuredClone(fixture); p.workspace.pythonScene.sprites[0].x = 0; delete p.workspace.pythonScene.sprites[0].motion;
  p.workspace.pythonScene.sprites[0].data = {items:[1,2]};
  p.workspace.procedures = handlers.map(([event],i) => ({id:'h'+i,name:'handler_'+i,async:true,parameters:[{id:'p'+i,name:'payload'}],handler:{event,order:i}}));
  p.workspace.blocks.blocks = handlers.map(([,body],i) => ({type:'py_handler',id:'hblock'+i,x:40+i*500,y:40,extraState:{functionId:'h'+i},inputs:{BODY:{block:body}}}));
  edit?.(p); await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'editor.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await expect.poll(async () => (await saved(page))?.workspace?.pythonScene).toEqual(p.workspace.pythonScene);
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running',{timeout:60_000}); }
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }
async function addWatch(page: Page, property: string, key?: string) { await page.locator('#watch-property').selectOption(property); if (key !== undefined) await page.locator('#watch-key').fill(key); await page.locator('#watch-add').click(); }

test('focused palettes use the selected sprite and navigation opens its costume and script', async ({ page }, info) => {
  await page.goto('/'); await page.locator('#scene-example').click(); const before = await saved(page);
  await page.locator('#scene-filter').fill('friend'); await expect(page.locator('#scene-cards button:visible')).toHaveCount(1); await page.locator('#scene-cards button:visible').click();
  await expect(page.locator('#scene-selection')).toHaveValue('friend'); await expect(page.locator('#scene-cards button:visible')).toHaveAttribute('aria-pressed','true');
  await page.getByRole('treeitem',{name:'Motion',exact:true}).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('Friend');
  await expect(page.locator('.blocklyToolboxFlyout')).not.toContainText('fire');
  await page.getByRole('treeitem',{name:'Worlds',exact:true}).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('Friend');
  await expect(page.locator('.blocklyToolboxFlyout')).not.toContainText('Player');
  await page.getByRole('treeitem',{name:'Looks',exact:true}).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('say');
  await page.getByRole('treeitem',{name:'Physics',exact:true}).click(); await expect(page.locator('.blocklyToolboxFlyout')).toContainText('fire');
  await page.locator('#scene-edit-costume').click(); await expect(page.locator('#art-assets')).toHaveValue(before.workspace.pythonScene.sprites[1].costume); await expect(page.locator('#art-kind')).toHaveValue('costume'); await page.locator('#art-close').click();
  await page.locator('#scene-script-find').click(); await expect(page.locator('.blocklyHighlighted')).toHaveCount(1);
  expect((await saved(page)).workspace.pythonScene).toEqual(before.workspace.pythonScene);
  await page.locator('#scene-filter').fill('no such sprite'); await expect(page.locator('#scene-filter-empty')).toBeVisible(); await page.locator('#scene-filter').fill('');
  await page.screenshot({path:info.outputPath('sprite-navigation-desktop.png'),fullPage:true});
});

test('world navigation and framing find inactive sprites, preserve positions and restore authored camera', async ({ page }) => {
  await page.goto('/'); await page.locator('#scene-world-example').click(); const original = await saved(page), scene = original.workspace.pythonScene;
  const target = scene.sprites.find((s: any) => s.world && s.world !== scene.world);
  await page.locator('#scene-selection').selectOption(target.id); await page.locator('#scene-locate').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-world',target.world); await expect(page.locator('#scene-browse-world')).toHaveValue(target.world);
  expect((await saved(page)).workspace.pythonScene.sprites).toEqual(scene.sprites);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(page.locator('#scene-browse-world')).toHaveValue(scene.world);
  await page.locator('#scene-browse-world').selectOption(''); await expect(page.locator('#stage')).toHaveAttribute('data-world','');
  await page.reload(); await expect(page.locator('#scene-browse-world')).toHaveValue('');
});

test('watchers show actual nested Python mutations, survive rename/undo/reload, and retain last-run values until reset', async ({ page }, info) => {
  await install(page,[['key:g',chain(actor('scene_set',{PROPERTY:'x'},{VALUE:n(40)}),b('py_list_append',{}, {VALUE:n(3),LIST:actor('scene_data_get',{}, {KEY:t('items')})}))],['key:d',actor('scene_destroy')]]);
  await page.locator('#watch-settings summary').click(); await addWatch(page,'x'); await addWatch(page,'data','items'); await addWatch(page,'data','missing');
  await expect(page.locator('#watch-values li')).toHaveCount(3); await expect(page.locator('#watch-values output').nth(0)).toHaveText('0'); await expect(page.locator('#watch-values output').nth(2)).toHaveText('Key not set');
  await page.locator('#watch-add').click(); await expect(page.locator('#watch-error')).toContainText('already has a watcher');
  await page.locator('#scene-name').fill('Scout'); await page.getByRole('button',{name:'Apply sprite',exact:true}).click(); await expect(page.locator('#watch-values')).toContainText('Scout');
  await page.reload(); await expect(page.locator('#watch-values li')).toHaveCount(3); await run(page); await key(page,'g');
  await expect(page.locator('#watch-values output').nth(0)).toHaveText('40'); await expect(page.locator('#watch-values output').nth(1)).toHaveText('[1, 2, 3]');
  await expect(page.locator('#watch-add')).toBeDisabled(); expect((await saved(page)).workspace.pythonScene.sprites[0].data.items).toEqual([1,2]);
  await page.screenshot({path:info.outputPath('live-watchers-desktop.png'),fullPage:true});
  await key(page,'d'); await expect(page.locator('#watch-values output').nth(0)).toHaveText('Sprite not active'); await page.locator('#stop').click(); await expect(page.locator('#watch-phase')).toHaveText('Last run values');
  await page.locator('#scene-reset').click(); await expect(page.locator('#watch-phase')).toHaveText('Starting values'); await expect(page.locator('#watch-values output').nth(0)).toHaveText('0');
  await page.locator('#watch-settings summary').click(); await page.locator('#watch-config button').first().click(); await expect(page.locator('#watch-values li')).toHaveCount(2);
  await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(page.locator('#watch-values li')).toHaveCount(3);
});

test('malformed watcher metadata preserves the open project and sequential runs publish final values', async ({ page }) => {
  await install(page,[],p => { p.workspace.pythonScene.watchers = [{id:'watch',sprite:'player',property:'x'}]; p.workspace.blocks.blocks = [{type:'py_program',inputs:{BODY:{block:actor('scene_set',{PROPERTY:'x'},{VALUE:n(27)})}}}]; });
  const before = await saved(page); const bad = structuredClone(before); bad.workspace.pythonScene.watchers[0].property = 'constructor';
  await page.locator('#project-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))}); await expect(page.locator('#save-state')).toContainText('valid sprite/property watchers'); expect(await saved(page)).toEqual(before);
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished',{timeout:60_000}); await expect(page.locator('#watch-values output')).toHaveText('27'); await expect(page.locator('#watch-phase')).toHaveText('Last run values');
});

test('large stage preserves the worker, maps pointer coordinates and keeps questions, watchers, errors and Stop accessible', async ({ page }, info) => {
  await install(page,[['start',print('started once')],['stage:click',chain(print(b('scene_pointer',{PROPERTY:'pointer_x'})),print(b('scene_pointer',{PROPERTY:'pointer_y'})))],['key:q',print(b('input_ask_value',{}, {TEXT:t('Large question')}))],['key:e',print(b('py_binary',{OP:'/'},{A:n(1),B:n(0)}))]],p => {p.workspace.pythonScene.watchers = [{id:'watch',sprite:'player',property:'x'}];p.workspace.pythonScene.sprites[0].motion = {body:'moving',controller:'arrows',speedX:100,speedY:100};});
  await run(page); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect.poll(async () => Number(await page.locator('#watch-values output').textContent())).toBeGreaterThan(5);
  const small = (await page.locator('#stage').boundingBox())!; await page.locator('#play-expand').click(); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#play-dialog')).toBeVisible(); const large = (await page.locator('#stage').boundingBox())!; expect(large.width).toBeGreaterThan(small.width*1.5);
  await expect(page.locator('#play-run')).toBeDisabled(); await expect(page.locator('#play-stop')).toBeEnabled(); await expect(page.locator('#play-dialog #watch-values')).toBeVisible();
  await page.waitForTimeout(150); const x = await page.locator('#watch-values output').textContent(); await page.waitForTimeout(180); await expect(page.locator('#watch-values output')).toHaveText(x!);
  await page.mouse.click(large.x+large.width*.75,large.y+large.height*.25); await expect(page.locator('#output')).toContainText('120\n80');
  await key(page,'q'); await expect(page.locator('#play-dialog #question-answer')).toBeFocused(); await page.locator('#question-answer').fill('Hello'); await page.locator('#question-answer').press('Enter'); await expect(page.locator('#output')).toContainText('Hello');
  await page.screenshot({path:info.outputPath('large-stage-desktop.png')});
  expect((await page.locator('#output').textContent())!.match(/started once/g)).toHaveLength(1); await key(page,'e'); await expect(page.locator('#play-error')).toContainText('ZeroDivisionError'); await expect(page.locator('#play-run')).toBeEnabled();
  await page.locator('#play-close').click(); await expect(page.locator('#play-dialog')).not.toBeVisible(); await expect(page.locator('#play-expand')).toBeFocused(); await expect(page.locator('.stage-panel #stage')).toHaveCount(1);
});

test('a narrow large-stage playthrough answers, uses touch, wins and replays without leaving the play view', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await page.locator('#scene-input-example').click(); await page.locator('#play-expand').click(); await page.locator('#play-run').click();
  await expect(page.locator('#question-answer')).toBeFocused({timeout:60_000}); await page.locator('#question-answer').fill('Scout'); await page.locator('#question-answer').press('Enter');
  await page.locator('#touch-toggle').click(); await page.locator('[data-control="ArrowRight"]').scrollIntoViewIfNeeded(); const r = (await page.locator('[data-control="ArrowRight"]').boundingBox())!;
  const cdp = await page.context().newCDPSession(page); await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2,id:1}]});
  await expect(page.locator('#game-result-title')).toHaveText('You win!',{timeout:6000}); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#game-result').scrollIntoViewIfNeeded(); expect(await page.locator('#play-dialog').evaluate(e => e.scrollWidth <= e.clientWidth+1)).toBe(true); await page.screenshot({path:info.outputPath('large-stage-mobile-win.png')});
  await page.locator('#game-restart').click(); await expect(page.locator('#question-answer')).toBeFocused({timeout:60_000}); await page.locator('#play-stop').click(); await expect(page.locator('#question-form')).toBeHidden();
  await page.locator('#stage').focus(); await page.keyboard.press('Escape'); await expect(page.locator('#play-dialog')).not.toBeVisible(); await expect(page.locator('.stage-panel #stage')).toHaveCount(1); await expect(page.locator('#play-expand')).toBeFocused();
});

test('narrow keyboard authoring selects sprites, pins readable values and preserves a pending artwork draft', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await page.locator('#scene-story-example').click();
  const s = (await saved(page)).workspace.pythonScene, second = s.sprites[1];
  await page.locator('#scene-filter').fill(second.name); const card = page.locator('#scene-cards button:visible'); await card.focus(); await card.press('Enter'); await expect(page.locator('#scene-selection')).toHaveValue(second.id);
  await page.locator('#scene-edit-costume').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#art-assets')).toHaveValue(second.costume);
  await page.locator('#art-name').fill('My unfinished art'); await page.locator('#art-close').click();
  await page.locator('#scene-selection').selectOption(s.sprites[0].id); await page.locator('#scene-edit-costume').click(); await expect(page.locator('#art-name')).toHaveValue('My unfinished art'); await expect(page.locator('#art-state')).toContainText('unsaved artwork draft'); await page.locator('#art-close').click();
  await page.locator('#watch-settings summary').focus(); await page.keyboard.press('Enter'); await page.locator('#watch-sprite').selectOption(second.id); await page.locator('#watch-property').selectOption('size'); await page.locator('#watch-add').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#watch-values output')).toHaveText(String(second.size)); await page.locator('#watch-readouts').scrollIntoViewIfNeeded();
  expect(await page.locator('.scene-editor').evaluate(e => e.scrollWidth <= e.clientWidth+1)).toBe(true); await page.screenshot({path:info.outputPath('watcher-authoring-mobile.png')});
  await page.reload(); await expect(page.locator('#watch-values li')).toHaveCount(1); await expect(page.locator('#watch-values')).toContainText(second.name);
});
