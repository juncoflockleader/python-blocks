import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('src/scene/input-example.json','utf8'));
const b = (type: string, fields: Record<string, unknown> = {}, inputs: Record<string, any> = {}): any => ({type,fields,inputs:Object.fromEntries(Object.entries(inputs).map(([k,v]) => [k,{block:v}]))});
const n = (v: number) => b('py_number',{VALUE:String(v)}), t = (v: string) => b('text',{TEXT:v});
const print = (v: any) => b('text_print',{}, {TEXT:typeof v === 'string' ? t(v) : v});
const chain = (...items: any[]) => { items.slice(1).forEach((v,i) => items[i].next = {block:v}); return items[0]; };
const actor = (id: string, type: string, fields = {}, inputs = {}) => b(type,fields,{SPRITE:b('scene_sprite',{SPRITE_ID:id}),...inputs});
const go = (id: string, x: number, y = 0) => actor(id,'scene_go',{}, {X:n(x),Y:n(y)});
const effect = (id: string, name: string, value: number) => actor(id,'scene_effect_set',{EFFECT:name},{VALUE:n(value)});
const show = (id: string, visible: boolean) => actor(id,'scene_visibility',{ACTION:visible ? 'show' : 'hide'});
const touch = (color = '#e04646', own?: string, tolerance = 0) => actor('player', own ? 'scene_color_touching' : 'scene_touching_color',{}, {COLOR:t(color),TOLERANCE:n(tolerance),...(own ? {OWN_COLOR:t(own)} : {})});
const ask = (text: string) => b('input_ask_value',{}, {TEXT:t(text)});
const wait = (seconds: number) => b('py_wait',{}, {SECONDS:n(seconds)});
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
const lines = async (page: Page) => (await page.locator('#output').innerText()).trim().split('\n');
async function install(page: Page, handlers: [string,any][], edit?: (p: any) => void) {
  const p = structuredClone(fixture); p.workspace.pythonScene.background = '#ffffff';
  for (const s of p.workspace.pythonScene.sprites) { delete s.motion; s.x = s.y = 0; }
  p.workspace.pythonScene.sprites[0].costume = 'blue_square';
  p.workspace.procedures = handlers.map(([event],i) => ({id:'h'+i,name:'handler_'+i,async:true,parameters:[{id:'p'+i,name:'payload'}],handler:{event,order:i}}));
  p.workspace.blocks.blocks = handlers.map(([,body],i) => ({type:'py_handler',id:'hblock'+i,x:40+i*400,y:40,extraState:{functionId:'h'+i},inputs:{BODY:{block:body}}}));
  edit?.(p); await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'input.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await expect.poll(async () => (await saved(page))?.workspace?.pythonScene).toEqual(p.workspace.pythonScene);
  await expect(page.locator('#diagnostics-panel')).toBeHidden();
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running',{timeout:60_000}); }
async function send(page: Page, event: string) { await page.locator('#event-name').fill(event); await page.locator('#event-send').click(); }
async function key(page: Page, key: string) { await page.locator('#stage').focus(); await page.keyboard.press(key); }
async function point(page: Page, selector: string) { const r = (await page.locator(selector).boundingBox())!; return {x:r.x+r.width/2,y:r.y+r.height/2}; }

test('queues literal questions without losing drafts, returns each answer and isolates typing from stage keys', async ({ page }, info) => {
  await install(page,[
    ['start',print(b('py_binary',{OP:'+'},{A:ask('<b>Name?</b>'),B:t('!')}))],
    ['start',chain(wait(.8),print(ask('Second question')))],
    ['key:a',print('stage key')],
    ['check',print(b('input_answer'))],
  ]);
  await run(page); await expect(page.locator('#question-answer')).toBeFocused(); await expect(page.locator('#question-text')).toHaveText('<b>Name?</b>');
  await expect(page.locator('#question-text b')).toHaveCount(0); await page.locator('#question-answer').pressSequentially('Ada');
  await expect(page.locator('#questions')).toHaveAttribute('data-pending-questions','2'); await expect(page.locator('#question-answer')).toHaveValue('Ada');
  await page.screenshot({path:info.outputPath('queued-questions.png'),fullPage:true});
  await page.locator('#question-answer').press('Enter'); await expect(page.locator('#question-text')).toHaveText('Second question'); await expect(page.locator('#question-answer')).toHaveValue('');
  await page.locator('#question-answer').fill('雪🙂'); await page.locator('#question-answer').press('Enter');
  await expect.poll(() => lines(page)).toEqual(['Ada!','雪🙂']); await expect(page.locator('#question-form')).toBeHidden(); await expect(page.locator('#stage')).toBeFocused();
  await send(page,'check'); await expect.poll(() => lines(page)).toEqual(['Ada!','雪🙂','雪🙂']);
});

test('destroying an owner removes its question; cancellation, finish, stop and replay clear pending forms', async ({ page }) => {
  await install(page,[['start',chain(print(ask('Owned question')),print('owner must not resume'))],['start',chain(wait(.1),print(ask('Global question')))],['remove',actor('player','scene_destroy')],['finish',b('game_finish',{WON:'TRUE'},{TEXT:t('Done')})],['again',print(ask(''))],['cancel',b('input_cancel_questions')]], p => { p.workspace.procedures[0].handler.sprite = 'player'; });
  await run(page); await expect(page.locator('#questions')).toHaveAttribute('data-pending-questions','2');
  await send(page,'remove'); await expect(page.locator('#question-text')).toHaveText('Global question');
  await page.locator('#question-answer').press('Escape'); await expect.poll(() => lines(page)).toEqual(['None']);
  await send(page,'again'); await expect(page.locator('#question-answer')).toHaveAccessibleName('Your answer');
  await send(page,'cancel'); await expect(page.locator('#question-form')).toBeHidden(); await expect.poll(() => lines(page)).toEqual(['None','None']);
  await send(page,'again'); await expect(page.locator('#question-form')).toBeVisible();
  await send(page,'finish'); await expect(page.locator('#game-result-title')).toHaveText('You win!'); await expect(page.locator('#question-form')).toBeHidden();
  await expect(page.locator('#output')).not.toContainText('owner must not resume');
  await page.locator('#game-restart').click(); await expect(page.locator('#question-text')).toHaveText('Owned question',{timeout:60_000});
  await page.locator('#stop').click(); await expect(page.locator('#question-form')).toBeHidden(); await run(page); await expect(page.locator('#question-text')).toHaveText('Owned question');
});

test('timer survives questions, focus changes and world transitions, then resets explicitly and on Run', async ({ page }) => {
  const timer = () => print(b('input_timer'));
  await install(page,[['start',chain(b('input_timer_reset'),timer(),print(ask('Wait here')),timer(),b('scene_world_set',{}, {WORLD:b('scene_world',{WORLD_ID:'next'})}),timer(),b('input_timer_reset'),timer())]], p => {
    const map = {columns:30,rows:20,tileSize:16,tiles:Array(600).fill(null),walls:Array(600).fill(false)};
    p.workspace.pythonScene.worlds = ['first','next'].map(id => ({id,name:id,background:'#ffffff',map:structuredClone(map),camera:{x:0,y:0,clamp:true}})); p.workspace.pythonScene.world = 'first';
  });
  await run(page); await expect(page.locator('#question-answer')).toBeFocused(); await page.waitForTimeout(250);
  await page.locator('#question-answer').fill('hello'); await page.locator('#question-answer').press('Enter'); await expect.poll(async () => (await lines(page)).length).toBe(5);
  const result = await lines(page); expect(Number(result[0])).toBeLessThan(.1); expect(result[1]).toBe('hello'); expect(Number(result[2])).toBeGreaterThan(.2); expect(Number(result[3])).toBeGreaterThanOrEqual(Number(result[2])); expect(Number(result[4])).toBeLessThan(.1);
  await expect(page.locator('#stage')).toHaveAttribute('data-world','next'); await page.locator('#stop').click(); await run(page); await expect(page.locator('#question-text')).toHaveText('Wait here'); expect(Number((await lines(page))[0])).toBeLessThan(.1);
});

test('real multi-touch and keyboard holds aggregate, captured release/cancel clears keys, and action mappings persist', async ({ page }) => {
  await install(page,[['key:ArrowRight',print('right down')],['release:ArrowRight',print('right up')],['key:z',print('z down')],['release:z',print('z up')]]);
  await page.locator('.scene-input-settings summary').click(); await page.locator('#touch-key-a').selectOption('z'); await page.getByRole('button',{name:'Undo',exact:true}).click(); await expect(page.locator('#touch-key-a')).toHaveValue('Space');
  await page.getByRole('button',{name:'Redo',exact:true}).click(); await expect(page.locator('#touch-key-a')).toHaveValue('z'); await page.reload(); await page.locator('.scene-input-settings summary').click(); await expect(page.locator('#touch-key-a')).toHaveValue('z');
  await run(page); await expect(page.locator('#touch-key-a')).toBeDisabled(); await page.locator('#touch-toggle').click(); await page.locator('#touch-pad').scrollIntoViewIfNeeded();
  const right = await point(page,'[data-control="ArrowRight"]'), action = await point(page,'[data-control="a"]');
  await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight'); await expect.poll(() => lines(page)).toEqual(['right down']);
  await page.mouse.move(right.x,right.y); await page.mouse.down(); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(80); expect(await lines(page)).toEqual(['right down']);
  await page.mouse.move(right.x+200,right.y+100); await page.mouse.up(); await expect.poll(() => lines(page)).toEqual(['right down','right up']);
  const cdp = await page.context().newCDPSession(page);
  const r = {...right,id:1}, a = {...action,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r,a]}); await expect.poll(() => lines(page)).toEqual(['right down','right up','right down','z down']);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[r]}); await expect.poll(() => lines(page)).toEqual(['right down','right up','right down','z down','right up']);
  await expect(page.locator('[data-control="a"]')).toHaveAttribute('aria-pressed','true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]}); await expect.poll(() => lines(page)).toEqual(['right down','right up','right down','z down','right up','z up']);
  await expect(page.locator('[data-control="a"]')).toHaveAttribute('aria-pressed','false');
  await page.locator('[data-control="a"]').focus(); await page.keyboard.down('Enter'); await expect.poll(async () => (await lines(page)).at(-1)).toBe('z down');
  await page.keyboard.press('Tab'); await expect.poll(async () => (await lines(page)).at(-1)).toBe('z up'); await page.keyboard.up('Enter');
  await page.locator('#stop').click(); await expect(page.locator('[data-control="ArrowRight"]')).toBeDisabled(); await expect(page.locator('[data-control="a"]')).toBeDisabled();
});

test('the narrow input example accepts a name and wins through the touch controller, then starts fresh', async ({ page }, info) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/'); await page.locator('#scene-input-example').click(); await run(page);
  await expect(page.locator('#question-answer')).toBeFocused(); await page.screenshot({path:info.outputPath('input-question-mobile.png')});
  expect(await page.locator('#question-form').evaluate(e => e.scrollWidth <= e.clientWidth+1)).toBe(true);
  await page.locator('#question-answer').fill('Ada'); await page.locator('#question-answer').press('Enter'); await expect(page.locator('#game-message')).toContainText('Ada');
  await page.locator('#touch-toggle').click(); await page.locator('#touch-pad').scrollIntoViewIfNeeded(); const right = await point(page,'[data-control="ArrowRight"]');
  const cdp = await page.context().newCDPSession(page); await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...right,id:1}]});
  await expect(page.locator('#game-result-title')).toHaveText('You win!',{timeout:6000}); await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#game-result-message')).toContainText('You found red in'); await expect(page.locator('[data-control="ArrowRight"]')).toHaveAttribute('aria-pressed','false');
  await page.screenshot({path:info.outputPath('input-win-mobile.png')}); await page.locator('#game-restart').click(); await expect(page.locator('#question-answer')).toHaveValue('',{timeout:60_000}); await expect(page.locator('#question-form')).toBeVisible();
});

test('color contact sees synchronous layers, visibility, effects, own colors and tolerance', async ({ page }) => {
  await install(page,[['start',chain(
    print(touch()), show('decoy',false), print(touch()), print(touch('#e04746',undefined,0)), print(touch('#e04746',undefined,1)),
    print(touch('#e04646','#3e74d5')), print(touch('#e04646','#ffffff')), effect('player','brightness',100), print(touch('#e04646','#ffffff')), print(touch('#e04646','#3e74d5')),
    show('decoy',true), print(touch()), actor('decoy','scene_layer',{PLACE:'back'}), print(touch()), effect('goal','ghost',100), print(touch()), effect('goal','ghost',0), print(touch()),
    show('player',false), print(touch()), show('player',true), effect('player','ghost',100), print(touch()), effect('player','ghost',0), go('player',1000), go('goal',1000), print(touch()), print('done')
  )]], p => { p.workspace.pythonScene.sprites[2].size = 150; });
  await run(page); await expect.poll(() => lines(page)).toEqual(['False','True','False','True','True','False','True','False','False','True','False','True','False','False','False','done']);
});

test('color contact includes immediate pen/stamp/turtle erasure, tiles, camera changes and backdrops', async ({ page }) => {
  await install(page,[['start',chain(
    show('goal',false),show('decoy',false),print(touch()),actor('goal','scene_stamp'),print(touch()),b('scene_pen_clear'),print(touch()),
    actor('goal','scene_pen_color',{}, {COLOR:t('#e04646')}),go('goal',-50),actor('goal','scene_pen_state',{ACTION:'pen_down'}),go('goal',50),print(touch()),b('scene_pen_clear'),print(touch()),
    b('pen_color',{COLOR:'#267c70'}),b('pen_move',{}, {STEPS:n(30)}),print(touch('#267c70')),b('scene_pen_clear'),print(touch('#267c70')),
    b('scene_tile_set',{}, {COLUMN:n(7),ROW:n(4),COSTUME:b('scene_costume',{COSTUME_ID:'red_square'}),ENABLED:b('logic_boolean',{BOOL:'FALSE'})}),print(touch()),
    b('scene_camera_go',{}, {X:n(700),Y:n(0)}),print(touch()),b('scene_camera_go',{}, {X:n(0),Y:n(0)}),print(touch()),
    b('scene_tile_set',{}, {COLUMN:n(7),ROW:n(4),COSTUME:b('py_none'),ENABLED:b('logic_boolean',{BOOL:'FALSE'})}),print(touch()),
    b('scene_background',{}, {COLOR:t('#e04646')}),print(touch()),b('scene_stage_effect_set',{EFFECT:'brightness'},{VALUE:n(100)}),print(touch()),b('scene_stage_effect_clear'),print(touch()),
    b('scene_backdrop_set',{}, {BACKDROP:b('scene_backdrop',{BACKDROP_ID:'solid_blue'})}),print(touch()),print(touch('#3e74d5')),
    b('scene_world_set',{}, {WORLD:b('scene_world',{WORLD_ID:'next'})}),print(touch()),print(touch('#3e74d5')),print('done')
  )]], p => {
    const s = p.workspace.pythonScene; s.worlds = [{id:'world',name:'World',background:'#ffffff',camera:{x:0,y:0,clamp:false},map:{columns:40,rows:10,tileSize:32,tiles:Array(400).fill(null),walls:Array(400).fill(false)}}]; s.world = 'world';
    s.worlds.push({...structuredClone(s.worlds[0]),id:'next',name:'Next',background:'#e04646'});
    s.backdrops = [{...s.assets[1],id:'solid_blue',name:'Blue backdrop'}];
  });
  await run(page); await expect.poll(() => lines(page)).toEqual(['False','True','False','True','False','True','False','True','False','True','False','True','False','True','False','True','True','False','done']);
  await expect.poll(() => page.locator('#stage').evaluate(c => Array.from((c as HTMLCanvasElement).getContext('2d')!.getImageData(101,101,1,1).data))).toEqual([224,70,70,255]);
});

test('transparent holes, transformed masks and translucent occluders follow visible color pixels', async ({ page }) => {
  await page.goto('/'); const ring = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d')!; ctx.fillStyle = '#3e74d5'; ctx.fillRect(0,0,32,32); ctx.clearRect(4,4,24,24); return c.toDataURL(); });
  await install(page,[['start',chain(
    show('decoy',false),print(touch()),go('goal',14),print(touch()),
    actor('player','scene_set',{PROPERTY:'size'},{VALUE:n(200)}),print(touch()),go('goal',28),print(touch()),
    show('decoy',true),go('decoy',28),effect('decoy','ghost',50),print(touch()),print(touch('#8f5d8e',undefined,1)),
    effect('decoy','ghost',100),print(touch()),print('done')
  )]], p => {
    p.workspace.pythonScene.assets.push({id:'ring',name:'Hollow square',width:32,height:32,data:ring});
    p.workspace.pythonScene.sprites[0].costume = 'ring'; p.workspace.pythonScene.sprites[1].size = 25; p.workspace.pythonScene.sprites[2].size = 25;
  });
  await run(page); await expect.poll(() => lines(page)).toEqual(['False','True','False','True','False','True','True','done']);
});

test('invalid question prompts identify their block and close any concurrent form', async ({ page }) => {
  const invalid = b('input_ask',{}, {TEXT:n(42)}); invalid.id = 'bad-question';
  await install(page,[['start',print(ask('Waiting'))],['start',chain(wait(.1),invalid)]]); await page.locator('#run').click();
  await expect(page.locator('#output')).toContainText('Question needs text',{timeout:60_000}); await expect(page.locator('.blocklyHighlighted')).toHaveCount(1); await expect(page.locator('#question-form')).toBeHidden(); await expect(page.locator('#run')).toBeEnabled();
});
