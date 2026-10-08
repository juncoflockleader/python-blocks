import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { Blockly } from '../../src/blocks';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { compile, blockForLine } from '../../src/language/compiler';
import { defineFunction } from '../../src/blocks/core/functions';
import { exportModule, importModule } from '../../src/language/module-format';
import { moduleCallState } from '../../src/language/modules';
import { pythonExport } from '../../src/project/python-export';
import { HeldKeys } from '../../src/scene/touch';
import { validQuestionCommand, validQuestionReply } from '../../src/scene/questions';
import { changeScene, sceneState } from '../../src/scene/state';
import { emptyScene, validateScene, validKey } from '../../src/scene/model';
const spaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); spaces.push(w); return w; };
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const block = (w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) => { const b = w.newBlock(type); Object.entries(fields).forEach(([k,v]) => b.setFieldValue(v,k)); return b; };
const plug = (p: Blockly.Block, key: string, c: Blockly.Block) => { p.getInput(key)!.connection!.connect(c.outputConnection ?? c.previousConnection!); return p; };

describe('questions, timers and on-screen input', () => {
  it('keeps shared keys held until the final source releases and resets stale releases', () => {
    const sent: [string, boolean][] = [], held = new HeldKeys((key, down) => sent.push([key,down]));
    held.set('keyboard', 'Space', true); held.set('keyboard', 'Space', true);
    held.set('finger1', 'Space', true); held.set('finger2', 'Space', true);
    held.set('up', 'ArrowUp', true); held.set('finger1', 'Space', false); held.set('keyboard', 'Space', false);
    expect(sent).toEqual([['Space',true],['ArrowUp',true]]);
    held.set('finger2', 'x', false); // release uses its captured key, even after a mapping change
    expect(sent.at(-1)).toEqual(['Space',false]);
    held.clear(); held.set('up', 'ArrowUp', false); expect(sent).toHaveLength(3);
    held.set('up', 'ArrowUp', true); expect(sent.at(-1)).toEqual(['ArrowUp',true]);
  });
  it('validates question boundaries in UTF-16 units and rejects coercible keys', () => {
    expect(validQuestionCommand({type:'ask',id:1,text:'🙂'.repeat(200)})).toBe(true);
    expect(validQuestionReply({id:1,answer:'🙂'.repeat(1024)})).toBe(true);
    for (const invalid of [null, {type:'ask',id:0,text:''}, {type:'ask',id:1,text:'🙂'.repeat(201)}, {type:'ask',id:1,text:2}, {type:'cancel',id:1.5}]) expect(validQuestionCommand(invalid)).toBe(false);
    for (const invalid of [undefined, {id:1,answer:2}, {id:1,answer:'🙂'.repeat(1025)}, {id:Infinity,answer:null}]) expect(validQuestionReply(invalid)).toBe(false);
    expect(validQuestionReply({id:2,answer:null})).toBe(true); expect(validQuestionReply({id:2,answer:''})).toBe(true);
    for (const key of [1, ['x'], null, {toString: () => 'Space'}]) expect(validKey(key)).toBe(false);
  });
  it('compiles the input example, maps waits/colors, migrates version 16 and exports captured controls', () => {
    const w = ws(); restore(w, prepareProject(readFileSync('src/scene/input-example.json','utf8')).project);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.requiresInput).toBe(true); expect(result.executionMode).toBe('events');
    expect(result.source).toContain('await _pb_inputs.ask'); expect(result.source).toContain('.touching_color("#e04646", None, 10)');
    const line = result.source!.split('\n').findIndex(s => s.includes('await _pb_inputs.ask')) + 1; expect(w.getBlockById(blockForLine(result,'program.py',line)!)!.type).toBe('input_ask');
    changeScene(w,{...sceneState(w),controls:{a:'z',b:'c'}});
    const archive = unzipSync(pythonExport(result).content as Uint8Array); expect(JSON.parse(strFromU8(archive['scene.json'])).controls).toEqual({a:'Space',b:'x'});
    const restored = ws(); restore(restored, prepareProject(JSON.stringify({...snapshot(w),languageVersion:16})).project); expect(sceneState(restored).controls).toEqual({a:'z',b:'c'});
    const controlOnly = ws(); changeScene(controlOnly,{...emptyScene(),controls:{a:'1',b:'2'}}); const copy = ws(); restore(copy,snapshot(controlOnly)); expect(sceneState(copy).controls).toEqual({a:'1',b:'2'});
    for (const controls of [{a:1,b:'x'}, {a:'bad',b:'Space'}, {a:'z'}, null]) expect(() => validateScene({...emptyScene(),controls})).toThrow();
  });
  it('propagates input-only modules and protects await contexts and expression precedence', () => {
    const m = ws(), fn = defineFunction(m,{id:'reset',name:'reset_clock',parameters:[]}); plug(fn,'BODY',block(m,'input_timer_reset'));
    const w = ws(), binding = importModule(w, exportModule(m,{name:'clock',functions:['reset']}),'clock');
    plug(block(w,'py_program'),'BODY',Blockly.serialization.blocks.append(moduleCallState(binding,fn.signature),w));
    expect(compile(w).requiresInput).toBe(true); expect(compile(w).executionMode).toBe('events');
    const asyncSpace = ws(), h = defineFunction(asyncSpace,{id:'ask',name:'ask_it',parameters:[{id:'p',name:'payload'}],async:true,handler:{event:'start',order:0}});
    const ask = plug(block(asyncSpace,'input_ask_value'),'TEXT',block(asyncSpace,'text',{TEXT:'Name?'}));
    const joined = plug(plug(block(asyncSpace,'py_binary',{OP:'+'}),'A',ask),'B',block(asyncSpace,'text',{TEXT:'!'}));
    plug(h,'BODY',plug(block(asyncSpace,'text_print'),'TEXT',joined));
    const result = compile(asyncSpace); expect(result.diagnostics).toEqual([]); expect(result.source).toContain('print(((await _pb_inputs.ask("Name?"))) + ("!"))');
    const plain = ws(); plug(block(plain,'py_program'),'BODY',plug(block(plain,'input_ask'),'TEXT',block(plain,'text',{TEXT:'Question'})));
    expect(compile(plain).diagnostics.some(d => d.code === 'wait-context')).toBe(true);
  });
});
