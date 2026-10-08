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
import { GameEffects, type GameState } from '../../src/scene/game';
import { isSceneCommand } from '../../src/scene/model';
const spaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); spaces.push(w); return w; };
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const block = (w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) => { const b = w.newBlock(type); Object.entries(fields).forEach(([k,v]) => b.setFieldValue(v, k)); return b; };
const plug = (p: Blockly.Block, key: string, c: Blockly.Block) => { p.getInput(key)!.connection!.connect(c.outputConnection ?? c.previousConnection!); return p; };

describe('game state, presentation and compiler integration', () => {
  it('compiles, maps, saves and exports the editable game while accepting version 14', () => {
    const w = ws(); const text = readFileSync('src/scene/star-game-example.json', 'utf8'); restore(w, prepareProject(text).project);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.executionMode).toBe('events');
    expect(result.source).toContain('_pb_game.countdown(20, "lose")'); expect(result.source).toContain('_pb_game.finish(True,');
    const line = result.source!.split('\n').findIndex(l => l.includes('_pb_game.change("lives"')) + 1;
    expect(w.getBlockById(blockForLine(result, 'program.py', line)!)!.type).toBe('game_change');
    const file = unzipSync(pythonExport(result).content as Uint8Array); expect(strFromU8(file['program.py'])).toBe(result.source); expect(JSON.parse(strFromU8(file['scene.json'])).sprites).toHaveLength(6);
    const roundtrip = ws(); restore(roundtrip, snapshot(w)); expect(compile(roundtrip).source).toBe(result.source);
    expect(prepareProject(JSON.stringify({ ...JSON.parse(text), languageVersion: 14 })).project.languageVersion).toBe(19);
  });
  it('enables a game session for reusable game helpers before validating input in the caller', () => {
    const m = ws(); const fn = defineFunction(m, { id: 'clock', name: 'start_clock', parameters: [] });
    plug(fn, 'BODY', plug(block(m, 'game_countdown'), 'SECONDS', block(m, 'py_number', { VALUE: '10' })));
    const bundle = exportModule(m, { name: 'game_rules', functions: ['clock'] }); const w = ws(); const binding = importModule(w, bundle, 'game_rules');
    const call = Blockly.serialization.blocks.append(moduleCallState(binding, fn.signature), w);
    call.nextConnection!.connect(plug(block(w, 'text_print'), 'TEXT', block(w, 'scene_key')).previousConnection!);
    plug(block(w, 'py_program'), 'BODY', call);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.executionMode).toBe('events'); expect(result.requiresGame).toBe(true); expect(result.scene).toBeDefined(); expect(result.source).not.toContain('.enable_motion()');
    expect(Object.values(result.files)[0]).toContain('_pb_game.countdown(10, "lose")');
  });
  it('validates game messages and bounded presentation commands at the worker bridge', () => {
    const state: GameState = { score: 0, lives: 3, seconds: null, visible: { score: true, lives: false, countdown: true }, text: '', result: null };
    expect(isSceneCommand({ type: 'game', state })).toBe(true);
    for (const changes of [{ score: Infinity }, { lives: -1 }, { seconds: 1.2 }, { visible: null }, { text: 'x'.repeat(121) }, { result: { won: 1, message: '' } }, { result: { won: true, message: 'x'.repeat(241) } }]) expect(isSceneCommand({ type: 'game', state: { ...state, ...changes } })).toBe(false);
    for (const effect of [{ kind: 'sparkles', seconds: 1, at: null }, { kind: 'rings', seconds: 10, at: { x: 1e6, y: -1e6 } }]) expect(isSceneCommand({ type: 'game_effect', ...effect })).toBe(true);
    for (const changes of [{ kind: 'unknown' }, { seconds: 0 }, { at: { x: NaN, y: 0 } }]) expect(isSceneCommand({ type: 'game_effect', kind: 'rings', seconds: 1, at: null, ...changes })).toBe(false);
  });
  it('bounds bursts, anchors world bursts to the camera and clears expired effects', () => {
    const effects = new GameEffects(), arcs: number[][] = [];
    const context = { save() {}, restore() {}, beginPath() {}, stroke() {}, arc(...a: number[]) { arcs.push(a); } } as unknown as CanvasRenderingContext2D;
    effects.add({ type: 'game_effect', kind: 'rings', seconds: 1, at: { x: 700, y: -30 } }, 0);
    expect(effects.paint(context, { x: 600, y: -10 }, 500)).toBe(true); expect(arcs[0].slice(0, 2)).toEqual([340, 180]);
    expect(effects.paint(context, { x: 600, y: 0 }, 1000)).toBe(false); expect(effects.count).toBe(0);
    for (let i = 0; i < 100; i++) effects.add({ type: 'game_effect', kind: 'confetti', seconds: 1, at: null }, 1000);
    expect(effects.count).toBe(16); arcs.length = 0; effects.paint(context, { x: 0, y: 0 }, 1200, true); expect(arcs).toEqual([]);
    effects.clear(); expect(effects.count).toBe(0);
  });
});
