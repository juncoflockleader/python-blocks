import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { installScenePalette } from '../../src/scene/palette';
import { validWatches, validWatchValues, initialWatch, type Watch } from '../../src/scene/watch-model';
import { changeScene, sceneState } from '../../src/scene/state';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { pythonExport } from '../../src/project/python-export';
import { strFromU8, unzipSync } from 'fflate';
const spaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); spaces.push(w); return w; };
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
describe('editor workflow state', () => {
  it('keeps every scene/input block discoverable in one focused palette with selected-sprite defaults', () => {
    const w = ws(), callbacks = new Map<string,() => Blockly.utils.toolbox.FlyoutItemInfo[]>();
    restore(w,prepareProject(readFileSync('src/scene/example.json','utf8')).project);
    const mock = w as Blockly.WorkspaceSvg; mock.registerToolboxCategoryCallback = (key,fn) => { callbacks.set(key,() => fn(mock) as Blockly.utils.toolbox.FlyoutItemInfo[]); };
    installScenePalette(mock,() => 'friend');
    const groups = [...callbacks].map(([name,fn]) => ({name,blocks:fn().filter(b => b.kind === 'block') as Blockly.utils.toolbox.BlockInfo[]}));
    const all = groups.flatMap(g => g.blocks.map(b => b.type!));
    expect(new Set(all)).toEqual(new Set(Object.keys(Blockly.Blocks).filter(type => type.startsWith('scene_') || type.startsWith('input_'))));
    for (const type of new Set(all)) if (!['scene_sprite','scene_world'].includes(type)) expect(all.filter(t => t === type),type).toHaveLength(1);
    const move = groups.find(g => g.name === 'PY_MOTION')!.blocks.find(b => b.type === 'scene_move')!;
    expect(move.inputs!.SPRITE).toEqual({block:{type:'scene_sprite',fields:{SPRITE_ID:'friend'}}});
    for (const block of groups.flatMap(g => g.blocks)) {
      if (block.inputs?.SPRITE) expect(block.inputs.SPRITE, block.type).toEqual({block:{type:'scene_sprite',fields:{SPRITE_ID:'friend'}}});
      if (block.inputs?.OTHER) expect(block.inputs.OTHER, block.type).toEqual({block:{type:'scene_sprite',fields:{SPRITE_ID:'player'}}});
    }
    expect(groups.find(g => g.name === 'PY_SPRITES')!.blocks.length).toBeLessThan(18);
    for (const g of groups) expect(g.blocks.length,g.name).toBeLessThan(27);
  });
  it('validates saved watchers and bounded results without rejecting recoverable missing sprite references', () => {
    const watch: Watch = {id:'watch',sprite:'gone',property:'data',key:'score'};
    expect(validWatches([watch])).toBe(true);
    for (const value of [null,[watch,watch],Array.from({length:13},(_,i)=>({...watch,id:'w'+i})),[{...watch,property:'__proto__'}],[{...watch,key:42}],[{...watch,key:'x'.repeat(129)}]]) expect(validWatches(value)).toBe(false);
    expect(initialWatch(watch,undefined)).toMatchObject({state:'unavailable'});
    const sprite = {id:'gone',name:'Gone',x:3,y:0,direction:0,size:100,layer:0,visible:true,costume:'bird',data:{score:null}};
    expect(initialWatch(watch,sprite)).toMatchObject({text:'None',state:'value'}); expect(initialWatch({...watch,key:'unknown'},sprite)).toMatchObject({state:'missing'});
    expect(initialWatch({id:'kind',sprite:'gone',property:'kind'},sprite).text).toBe('sprite');
    const long = initialWatch(watch,{...sprite,data:{score:'🙂'.repeat(300)}}); expect(long.text).toBe('🙂'.repeat(80)+'…'); expect(validWatchValues([long])).toBe(true);
    expect(validWatchValues([{id:'watch',text:'🙂'.repeat(120),state:'value'}])).toBe(true); expect(validWatchValues([{id:'watch',text:'🙂'.repeat(121),state:'value'}])).toBe(false);
  });
  it('migrates version 17, preserves watcher identity through rename/delete and exports the captured configuration', () => {
    const w = ws(); restore(w,prepareProject(readFileSync('src/scene/example.json','utf8')).project);
    const s = sceneState(w); s.watchers = [{id:'x-watch',sprite:'player',property:'x'}]; changeScene(w,s);
    const captured = compile(w); expect(captured.diagnostics).toEqual([]);
    s.sprites[0].name = 'Renamed'; changeScene(w,s); expect(sceneState(w).watchers).toEqual(s.watchers);
    s.sprites = s.sprites.filter(s => s.id !== 'player'); changeScene(w,s); expect(sceneState(w).watchers![0].sprite).toBe('player');
    const zip = unzipSync(pythonExport(captured).content as Uint8Array); expect(JSON.parse(strFromU8(zip['scene.json'])).watchers).toEqual(s.watchers);
    const copy = ws(); restore(copy,prepareProject(JSON.stringify({...snapshot(w),languageVersion:17})).project); expect(snapshot(copy).languageVersion).toBe(19); expect(sceneState(copy).watchers).toEqual(s.watchers);
  });
});
