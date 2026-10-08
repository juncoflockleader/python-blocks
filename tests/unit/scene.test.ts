import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { Blockly } from '../../src/blocks';
import { compile, blockForLine } from '../../src/language/compiler';
import { defineFunction } from '../../src/blocks/core/functions';
import { exportModule, importModule } from '../../src/language/module-format';
import { parameterSymbol, handlerSignatures } from '../../src/language/functions';
import { moduleCallState } from '../../src/language/modules';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { pythonExport } from '../../src/project/python-export';
import { sceneState, changeScene } from '../../src/scene/state';
import { bounds, emptyScene, validateScene, validateInput, isSceneCommand, validData, type SceneState } from '../../src/scene/model';
import { SceneReferenceField } from '../../src/blocks/scene';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { removeAsset } from '../../src/scene/assets';
import { defaultMotion, validMotion, validKind } from '../../src/scene/motion';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const b = w.newBlock(type); for (const [key, value] of Object.entries(fields)) b.setFieldValue(value, key); return b; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
const num = (w: Blockly.Workspace, n: number) => block(w, 'py_number', { VALUE: String(n) });
const ref = (w: Blockly.Workspace, id = 'player') => block(w, 'scene_sprite', { SPRITE_ID: id });
function scene(): SceneState { return { ...emptyScene(), sprites: [{ id: 'player', name: 'Player', x: -100, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird' }] }; }
function movement(w: Blockly.Workspace, n = 10) { return plug(plug(block(w, 'scene_move'), 'SPRITE', ref(w)), 'VALUE', num(w, n)); }
function execute(w: Blockly.Workspace) {
  const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const dir = mkdtempSync(path.join(tmpdir(), 'pb-scene-'));
  try {
    if (result.scene) writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(result.scene));
    const script = `import sys,types,json,importlib.util\nsys.path.insert(0,${JSON.stringify(path.resolve('src/runtime'))})\nhost=types.ModuleType('_playground_host');host.emit=lambda s:None;host.scene_emit=lambda s:None;sys.modules['_playground_host']=host\nimport physics;sys.modules['_playground_physics']=physics;import worlds;sys.modules['_playground_worlds']=worlds\nspec=importlib.util.spec_from_file_location('_playground_scene',${JSON.stringify(path.resolve('src/runtime/scene.py'))});module=importlib.util.module_from_spec(spec);sys.modules['_playground_scene']=module;spec.loader.exec_module(module)\nfrom execution import run_program\ndata=json.load(sys.stdin);sys.stderr.write(run_program(data['source'],data['files']))`;
    const process = spawnSync('python3', ['-c', script], { cwd: dir, input: JSON.stringify(result), encoding: 'utf8' });
    expect(process.status).toBe(0); return { ...result, output: process.stdout, result: JSON.parse(process.stderr) };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

describe('scene integration', () => {
  it('starts an event session for saved game settings even without a Program or handler', () => {
    const w = ws(), state = scene(); state.sprites[0].motion = { body: 'moving', ay: -600 }; changeScene(w, state);
    const result = compile(w); expect(result.source).toContain('_pb_scene.enable_motion()'); expect(result.hasEntry).toBe(true); expect(result.executionMode).toBe('events'); expect(result.diagnostics).toEqual([]);
    state.sprites[0].motion!.ay = -1; expect(result.scene!.sprites[0].motion!.ay).toBe(-600);
    const restored = ws(), old = snapshot(w); old.languageVersion = 12; restore(restored, prepareProject(JSON.stringify(old)).project); expect(compile(restored).source).toBe(result.source);
  });

  it('generates numeric game settings, projectiles, controllers and kind handlers with mapped statements', () => {
    const w = ws(); changeScene(w, scene()); const handler = defineFunction(w, { id: 'shot', name: 'shot', parameters: [{ id: 'p', name: 'payload' }], async: true, handler: { event: 'created', order: 0, kind: 'projectile' } });
    const actor = (type: string, fields = {}) => plug(block(w, type, fields), 'SPRITE', block(w, 'scene_self'));
    const operations = [plug(actor('scene_motion_set', { PROPERTY: 'vx' }), 'VALUE', num(w, 100)), plug(actor('scene_motion_change', { PROPERTY: 'vx' }), 'VALUE', num(w, 20)), actor('scene_motion_body', { MODE: 'moving' }), actor('scene_motion_response', { MODE: 'bounce' }), actor('scene_motion_edges', { MODE: 'stop' }), actor('scene_motion_auto', { ENABLED: 'TRUE' }), plug(plug(actor('scene_control', { SCHEME: 'wasd' }), 'VX', num(w, 120)), 'VY', num(w, 0)), plug(actor('scene_jump'), 'VALUE', num(w, 300)), actor('scene_motion_stop'), plug(actor('scene_kind_set'), 'KIND', block(w, 'text', { TEXT: 'ball' })), plug(block(w, 'text_print'), 'TEXT', actor('scene_motion_get', { PROPERTY: 'grounded' }))];
    operations.slice(1).forEach((next, i) => operations[i].nextConnection!.connect(next.previousConnection!)); plug(handler, 'BODY', operations[0]);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.source).toContain('_pb_scene.on_kind("projectile", "created", shot)'); expect(result.source).toContain('.control("wasd", 120, 0)'); expect(result.source).toContain('.set_motion("autoDestroy", True)');
    const line = result.source!.split('\n').findIndex(line => line.includes('.set_motion("vx"')) + 1; expect(blockForLine(result, 'program.py', line)).toBe(operations[0].id);
    const restored = ws(); restore(restored, snapshot(w)); expect(handlerSignatures(restored)[0].handler!.kind).toBe('projectile');
  });

  it('enables motion requested by a reusable helper before validating caller input blocks', () => {
    const module = ws(), fn = defineFunction(module, { id: 'control', name: 'control_actor', parameters: [{ id: 'actor', name: 'actor' }] });
    const control = plug(plug(plug(block(module, 'scene_control', { SCHEME: 'arrows' }), 'SPRITE', block(module, 'py_get', { SYMBOL: parameterSymbol('actor') })), 'VX', num(module, 120)), 'VY', num(module, 0)); plug(fn, 'BODY', control);
    const artifact = exportModule(module, { name: 'game_helpers', functions: ['control'] }); const w = ws(); changeScene(w, scene());
    const binding = importModule(w, artifact, 'game_helpers'); const call = Blockly.serialization.blocks.append(moduleCallState(binding, fn.signature), w); plug(call, 'ARG_actor', ref(w));
    call.nextConnection!.connect(plug(block(w, 'text_print'), 'TEXT', block(w, 'scene_key', { KEY: 'Space' })).previousConnection!); plug(block(w, 'py_program'), 'BODY', call);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.executionMode).toBe('events'); expect(result.source).toContain('_pb_scene.enable_motion()');
  });

  it('validates bounded motion and kinds and compiles the editable platformer', () => {
    expect(validMotion(defaultMotion())).toBe(true); expect(validMotion({})).toBe(true);
    for (const value of [{ vx: 2001 }, { ax: Infinity }, { ay: true }, { dragX: -1 }, { speedY: 2001 }, { lifetime: 3601 }, { body: 'unknown' }, { edges: 'slide' }, { autoDestroy: 1 }, { other: 0 }, []]) expect(validMotion(value)).toBe(false);
    for (const value of ['', ' x', 'x'.repeat(33), 'line\nbreak', false]) expect(validKind(value)).toBe(false);
    const w = ws(); restore(w, prepareProject(readFileSync('src/scene/game-example.json', 'utf8')).project);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.source).toContain('.projectile("ball", 350, 0, 3)'); expect(result.source).toContain('_pb_scene.on_kind');
    const files = unzipSync(pythonExport(result).content as Uint8Array); expect(JSON.parse(strFromU8(files['scene.json'])).sprites[0].motion.ay).toBe(-600);
  });
  it('keeps behavior targets through copy, rename, deletion, Undo and version-11 migration', async () => {
    const w = ws(); const data = scene(); data.sprites[0].data = { score: 0 }; changeScene(w, data);
    const handler = defineFunction(w, { id: 'tick', name: 'tick', parameters: [{ id: 'p', name: 'payload' }], async: true, handler: { event: 'update', order: 0, sprite: 'player' } });
    const set = plug(plug(plug(block(w, 'scene_data_set'), 'SPRITE', block(w, 'scene_self')), 'KEY', block(w, 'text', { TEXT: 'score' })), 'VALUE', num(w, 3)); plug(handler, 'BODY', set);
    expect(compile(w).source).toContain('_pb_scene.on("player", "update", tick)'); expect(compile(w).source).toContain('(_pb_scene.current_sprite).data["score"] = 3');
    await flush(); w.clearUndo();
    data.sprites[0].name = 'Renamed'; changeScene(w, data); await flush();
    expect(handler.getFieldValue('EVENT')).toContain('Renamed'); expect(compile(w).source).toContain('_pb_scene.on("player"');
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(handler, { doFullSerialization: true })!); expect(handlerSignatures(w).every(h => h.handler!.sprite === 'player')).toBe(true); copy.dispose(false); await flush(); w.clearUndo();
    changeScene(w, emptyScene()); await flush(); expect(compile(w).diagnostics.some(d => d.code === 'missing-sprite')).toBe(true);
    w.undo(false); await flush(); expect(compile(w).source).not.toBeNull(); expect(sceneState(w).sprites[0].data).toEqual({ score: 0 });
    const saved = snapshot(w); saved.languageVersion = 11; const restored = ws(); restore(restored, prepareProject(JSON.stringify(saved)).project);
    expect(snapshot(restored).languageVersion).toBe(19); expect(handlerSignatures(restored)[0].handler!.sprite).toBe('player');
    const archive = unzipSync(pythonExport(compile(restored)).content as Uint8Array); expect(JSON.parse(strFromU8(archive['scene.json'])).sprites[0].data).toEqual({ score: 0 });
  });

  it('rejects this-sprite outside owned handlers and supports data through helper parameters', () => {
    const w = ws(); changeScene(w, scene()); const self = block(w, 'scene_self'); plug(block(w, 'py_program'), 'BODY', plug(block(w, 'text_print'), 'TEXT', self));
    expect(compile(w).diagnostics.some(d => d.code === 'sprite-context' && d.blockId === self.id)).toBe(true);
    const module = ws(), fn = defineFunction(module, { id: 'score', name: 'score', parameters: [{ id: 'actor', name: 'actor' }] });
    const value = plug(plug(block(module, 'scene_data_get'), 'SPRITE', block(module, 'py_get', { SYMBOL: parameterSymbol('actor') })), 'KEY', block(module, 'text', { TEXT: 'score' }));
    plug(fn, 'BODY', plug(block(module, 'text_print'), 'TEXT', value)); expect(() => exportModule(module, { name: 'scores', functions: ['score'] })).not.toThrow();
  });

  it('executes data/instance reporters as native Python and bounds saved starting data', () => {
    const w = ws(), data = scene(); data.sprites[0].data = { score: 7 }; changeScene(w, data);
    const actor = (type: string) => plug(block(w, type), 'SPRITE', ref(w));
    const print = (value: Blockly.Block) => plug(block(w, 'text_print'), 'TEXT', value);
    const statements = [print(actor('scene_data')), plug(actor('scene_data_set'), 'KEY', block(w, 'text', { TEXT: 'score' })), print(plug(actor('scene_data_get'), 'KEY', block(w, 'text', { TEXT: 'score' }))), print(plug(block(w, 'py_length'), 'VALUE', actor('scene_instances'))), print(plug(block(w, 'py_length'), 'VALUE', block(w, 'scene_all')))];
    plug(statements[1], 'VALUE', num(w, 8)); statements.slice(1).forEach((next, i) => statements[i].nextConnection!.connect(next.previousConnection!)); plug(block(w, 'py_program'), 'BODY', statements[0]);
    expect(execute(w).output).toBe("{'score': 7}\n8\n1\n1\n");
    for (const invalid of [[], { n: Infinity }, { n: 2 ** 53 }, { s: 'x'.repeat(16384) }, { list: Array(1024).fill(0) }]) expect(validData(invalid)).toBe(false);
    expect(validData({ a: [null, true, { text: 'snow 雪' }] })).toBe(true);
    const cycle: Record<string, unknown> = {}; cycle.self = cycle; expect(validData(cycle)).toBe(false);
  });
  it('executes sprite pen and sprite/stage effects blocks and retains version-10 settings', async () => {
    const w = ws(); const state = scene(); state.sprites[0].effects = { ghost: 20 }; state.sprites[0].pen = { down: false, color: '#123456', width: 9, opacity: 70 }; state.effects = { brightness: 10 }; changeScene(w, state);
    const actor = (type: string, fields = {}) => plug(block(w, type, fields), 'SPRITE', ref(w));
    const print = (value: Blockly.Block) => plug(block(w, 'text_print'), 'TEXT', value);
    const statements = [
      actor('scene_pen_state', { ACTION: 'pen_down' }), plug(actor('scene_pen_color'), 'COLOR', block(w, 'text', { TEXT: '#aabbcc' })),
      plug(actor('scene_pen_set', { PROPERTY: 'width' }), 'VALUE', num(w, 10)), plug(actor('scene_pen_change', { PROPERTY: 'width' }), 'VALUE', num(w, 2)),
      movement(w), actor('scene_stamp'), block(w, 'scene_pen_clear'), print(actor('scene_pen_get', { PROPERTY: 'width' })),
      plug(actor('scene_effect_set', { EFFECT: 'color' }), 'VALUE', num(w, 350)), plug(actor('scene_effect_change', { EFFECT: 'color' }), 'VALUE', num(w, 20)),
      print(actor('scene_effect_get', { EFFECT: 'color' })), actor('scene_effect_clear'), print(actor('scene_effect_get', { EFFECT: 'ghost' })),
      plug(block(w, 'scene_stage_effect_set', { EFFECT: 'ghost' }), 'VALUE', num(w, 50)), plug(block(w, 'scene_stage_effect_change', { EFFECT: 'ghost' }), 'VALUE', num(w, 60)),
      print(block(w, 'scene_stage_effect_get', { EFFECT: 'ghost' })), block(w, 'scene_stage_effect_clear'), print(block(w, 'scene_stage_effect_get', { EFFECT: 'ghost' })),
    ];
    plug(block(w, 'py_program'), 'BODY', statements[0]); statements.slice(1).forEach((s, i) => statements[i].nextConnection!.connect(s.previousConnection!));
    const result = execute(w); expect(result.output).toBe('12\n10\n0\n100\n0\n'); expect(result.result.type).toBe('done');
    const copy = ws(); restore(copy, { ...snapshot(w), languageVersion: 10 }); expect(sceneState(copy)).toEqual(state);
    const before = compile(w).scene; state.effects.brightness = 30; changeScene(w, state); expect(before!.effects).toEqual({ brightness: 10 });
    const archive = unzipSync(pythonExport(result).content as Uint8Array); expect(JSON.parse(strFromU8(archive['scene.json'])).sprites[0].pen.width).toBe(9);
    const empty = ws(); changeScene(empty, { ...emptyScene(), effects: { ghost: 30 } }); expect(snapshot(empty).workspace.pythonScene.effects.ghost).toBe(30);
  });
  it('runs readable sprite operations with native state and mapped errors', () => {
    const w = ws(); changeScene(w, scene()); const move = movement(w); plug(block(w, 'py_program'), 'BODY', move);
    const output = plug(block(w, 'text_print'), 'TEXT', plug(block(w, 'scene_get', { PROPERTY: 'x' }), 'SPRITE', ref(w))); move.nextConnection!.connect(output.previousConnection!);
    expect(execute(w).output).toBe('-90.0\n'); expect(compile(w).source).toContain('_pb_sprites.named("Player")');
    move.getInputTargetBlock('VALUE')!.dispose(); plug(move, 'VALUE', block(w, 'text', { TEXT: 'oops' }));
    const result = execute(w); expect(result.result.exceptionType).toBe('TypeError');
    const frame = result.result.frames.find((f: { file: string }) => f.file === 'program.py'); expect(blockForLine(result, frame.file, frame.line)).toBe(move.id);
  });

  it('preserves references through rename, delete, Undo, copy and reload without same-name rebinding', async () => {
    const w = ws(); changeScene(w, scene()); const move = movement(w); plug(block(w, 'py_program'), 'BODY', move); await flush(); w.clearUndo();
    const next = sceneState(w); next.sprites[0].name = 'Bird friend'; changeScene(w, next); await flush();
    expect(execute(w).source).toContain('named("Bird friend")');
    const field = move.getInputTargetBlock('SPRITE')!.getField('SPRITE_ID') as SceneReferenceField;
    next.sprites = []; changeScene(w, next); await flush(); expect(compile(w).source).toBeNull(); expect(field.getText()).toContain('Bird friend');
    const broken = ws(); restore(broken, snapshot(w)); expect(compile(broken).source).toBeNull();
    w.undo(false); await flush(); expect(execute(w).result.type).toBe('done');
    const copied = pasteBlockCopy(w, Blockly.serialization.blocks.save(move, { doFullSerialization: true })!); expect(copied.getInputTargetBlock('SPRITE')!.getFieldValue('SPRITE_ID')).toBe('player');
    const other = ws(); const sameName = scene(); sameName.sprites[0].id = 'another'; sameName.sprites[0].name = 'Bird friend'; changeScene(other, sameName);
    const foreign = pasteBlockCopy(other, Blockly.serialization.blocks.save(move, { doFullSerialization: true })!); plug(block(other, 'py_program'), 'BODY', foreign); expect(compile(other).source).toBeNull();
  });

  it('keeps the scene in the captured artifact and in source/project exports', () => {
    const w = ws(); changeScene(w, scene()); plug(block(w, 'py_program'), 'BODY', movement(w)); const result = compile(w);
    const edited = sceneState(w); edited.sprites[0].x = 120; changeScene(w, edited); expect(result.scene!.sprites[0].x).toBe(-100);
    const archive = unzipSync(pythonExport(result).content as Uint8Array); expect(strFromU8(archive['program.py'])).toBe(result.source); expect(JSON.parse(strFromU8(archive['scene.json']))).toEqual(result.scene);
    const reload = ws(); restore(reload, prepareProject(JSON.stringify(snapshot(w))).project); expect(sceneState(reload).sprites[0].x).toBe(120);
    const old = ws(); restore(old, { ...snapshot(old), languageVersion: 7 }); expect(sceneState(old)).toEqual(emptyScene());
  });

  it('rejects malformed scene metadata before replacing a project or losing Undo state', () => {
    const w = ws(); changeScene(w, scene()); const before = snapshot(w);
    for (const mutate of [(s: SceneState) => s.sprites.push({ ...s.sprites[0] }), (s: SceneState) => { s.sprites[0].size = 0; }, (s: SceneState) => { s.sprites[0].costume = 'missing'; }, (s: SceneState) => { s.background = 'red'; }]) {
      const bad = structuredClone(before); mutate(bad.workspace.pythonScene); const recording = Blockly.Events.getRecordUndo();
      expect(() => restore(w, bad)).toThrow(); expect(snapshot(w)).toEqual(before); expect(Blockly.Events.getRecordUndo()).toBe(recording);
    }
    expect(() => validateScene({ ...scene(), assets: [{ id: 'bad', name: 'Bad', width: 2, height: 2, data: 'https://example.com/a.png' }] })).toThrow();
  });

  it('requires explicit event contexts for input and timed actions, and diagnoses missing click targets', () => {
    const w = ws(); changeScene(w, scene()); const glide = plug(plug(plug(plug(block(w, 'scene_glide'), 'SPRITE', ref(w)), 'SECONDS', num(w, 1)), 'X', num(w, 10)), 'Y', num(w, 0)); plug(block(w, 'py_program'), 'BODY', glide);
    expect(compile(w).diagnostics.map(d => d.code)).toContain('wait-context');
    defineFunction(w, { id: 'clicker', name: 'on_click', async: true, parameters: [{ id: 'payload', name: 'payload' }], handler: { event: 'click:absent', order: 0 } });
    expect(compile(w).diagnostics.map(d => d.code)).toContain('missing-sprite');
  });

  it('exports reusable sprite operations when sprites enter through parameters', () => {
    const w = ws(); const fn = defineFunction(w, { id: 'move', name: 'move_actor', parameters: [{ id: 'actor', name: 'actor' }] });
    const move = plug(plug(block(w, 'scene_move'), 'SPRITE', block(w, 'py_get', { SYMBOL: parameterSymbol('actor') })), 'VALUE', num(w, 10)); plug(fn, 'BODY', move);
    const bundle = exportModule(w, { name: 'actors', functions: ['move'] }); const other = ws(); const binding = importModule(other, bundle, 'actors');
    expect(compile(other).scene).toEqual(emptyScene()); expect(compile(other).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    changeScene(other, scene()); const call = Blockly.serialization.blocks.append(moduleCallState(binding, fn.signature), other); plug(call, 'ARG_actor', ref(other));
    const output = plug(block(other, 'text_print'), 'TEXT', plug(block(other, 'scene_get', { PROPERTY: 'x' }), 'SPRITE', ref(other))); call.nextConnection!.connect(output.previousConnection!); plug(block(other, 'py_program'), 'BODY', call);
    expect(execute(other).output).toBe('-90.0\n');
    changeScene(w, scene()); move.getInputTargetBlock('SPRITE')!.dispose(); plug(move, 'SPRITE', ref(w)); expect(() => exportModule(w, { name: 'actors', functions: ['move'] })).toThrow('Pass a sprite');
  });

  it('bounds host input and validates rendering messages', () => {
    for (const value of [{ kind: 'key', key: 'ArrowRight', down: true }, { kind: 'click', x: 240, y: -160, sprite: 'player' }, { kind: 'reset' }]) expect(() => validateInput(value as never)).not.toThrow();
    for (const value of [{ kind: 'key', key: 'Escape', down: true }, { kind: 'click', x: Infinity, y: 0, sprite: null }]) expect(() => validateInput(value as never)).toThrow();
    expect(isSceneCommand({ type: 'sprite', sprite: scene().sprites[0] })).toBe(true); expect(isSceneCommand({ type: 'sprite', sprite: { ...scene().sprites[0], x: Infinity } })).toBe(false);
  });

  it('executes motion, sensing, layers and dialogue blocks as native Python calls', () => {
    const w = ws(); changeScene(w, scene());
    const actor = (type: string, fields = {}) => plug(block(w, type, fields), 'SPRITE', ref(w));
    const xy = (type: string, x: number, y: number) => plug(plug(actor(type), 'X', num(w, x)), 'Y', num(w, y));
    const print = (value: Blockly.Block) => plug(block(w, 'text_print'), 'TEXT', value);
    const statements = [
      plug(actor('scene_change', { PROPERTY: 'x' }), 'VALUE', num(w, 100)),
      xy('scene_point', 0, 100), actor('scene_rotation', { STYLE: 'none' }),
      print(actor('scene_get', { PROPERTY: 'direction' })), print(xy('scene_distance', 3, 4)),
      print(actor('scene_get', { PROPERTY: 'width' })), print(xy('scene_touching_point', 23, 0)),
      xy('scene_go', 230, 0), plug(actor('scene_set', { PROPERTY: 'direction' }), 'VALUE', num(w, 0)),
      print(actor('scene_edge', { EDGE: 'right' })), actor('scene_bounce'), print(actor('scene_get', { PROPERTY: 'direction' })),
      actor('scene_layer', { PLACE: 'front' }), plug(actor('scene_say', { STYLE: 'think' }), 'TEXT', block(w, 'text', { TEXT: 'A thought' })),
    ];
    plug(block(w, 'py_program'), 'BODY', statements[0]);
    statements.slice(1).forEach((s, i) => statements[i].nextConnection!.connect(s.previousConnection!));
    const result = execute(w); expect(result.output).toBe('270.0\n5.0\n48.0\nTrue\nTrue\n180.0\n'); expect(result.result.type).toBe('done');
    expect(result.source).toContain('.say("A thought", "think")');
  });

  it('requires event and async contexts for pointer sensing and timed dialogue', () => {
    const w = ws(); changeScene(w, scene());
    const say = plug(plug(plug(block(w, 'scene_say_for'), 'SPRITE', ref(w)), 'TEXT', block(w, 'text', { TEXT: 'Hi' })), 'SECONDS', num(w, 0.1));
    const main = plug(block(w, 'py_program'), 'BODY', say);
    expect(compile(w).diagnostics.map(d => d.code)).toEqual(expect.arrayContaining(['event-context', 'wait-context']));
    say.unplug(); main.dispose();
    const handler = defineFunction(w, { id: 'speech', name: 'greeting', async: true, parameters: [{ id: 'data', name: 'data' }], handler: { event: 'stage:press', order: 0 } }); plug(handler, 'BODY', say);
    const output = plug(block(w, 'text_print'), 'TEXT', block(w, 'scene_pointer', { PROPERTY: 'pointer_down' })); say.nextConnection!.connect(output.previousConnection!);
    const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.source).toContain('await (_pb_sprites.named("Player")).say_for'); expect(result.source).toContain('_pb_inputs.pointer_down'); expect(result.requiresEvents).toBe(true);
  });

  it('persists rotation style, migrates version 8, and rejects malformed new state', () => {
    const w = ws(); const state = scene(); state.sprites[0].rotationStyle = 'left-right'; state.sprites[0].direction = 90;
    changeScene(w, state); const restored = ws(); restore(restored, { ...snapshot(w), languageVersion: 8 });
    expect(snapshot(restored).languageVersion).toBe(19); expect(sceneState(restored).sprites[0].rotationStyle).toBe('left-right');
    expect(bounds(state.sprites[0], state)).toEqual({ width: 48, height: 40 });
    for (const rotationStyle of ['diagonal', null, 1]) expect(() => validateScene({ ...state, sprites: [{ ...state.sprites[0], rotationStyle }] })).toThrow();
    for (const input of [{ kind: 'pointer', x: 1000001, y: 0, down: false, inside: true }, { kind: 'pointer', x: 0, y: 0, down: 'yes', inside: true }]) expect(() => validateInput(input as never)).toThrow();
    expect(isSceneCommand({ type: 'bubble', id: 'player', text: 'Hello', style: 'think' })).toBe(true);
    expect(isSceneCommand({ type: 'bubble', id: 'player', text: '🐦'.repeat(121), style: 'say' })).toBe(false);
  });

  it('runs backdrop and frame blocks and persists a backdrop-only project through version 9 migration', () => {
    const w = ws(); const state = scene(); state.backdrop = 'backdrop_meadow'; state.sprites[0].costumes = ['bird', 'ball']; state.sprites[0].frameSeconds = .3; changeScene(w, state);
    const set = plug(block(w, 'scene_backdrop_set'), 'BACKDROP', block(w, 'scene_backdrop', { BACKDROP_ID: 'backdrop_night' }));
    const statements = [set, plug(block(w, 'text_print'), 'TEXT', block(w, 'scene_backdrop_get', { PROPERTY: 'backdrop_name' })), plug(block(w, 'scene_next_costume'), 'SPRITE', ref(w)), plug(block(w, 'text_print'), 'TEXT', plug(block(w, 'scene_get', { PROPERTY: 'costume_id' }), 'SPRITE', ref(w))), plug(block(w, 'text_print'), 'TEXT', plug(block(w, 'scene_frames'), 'SPRITE', ref(w)))];
    plug(block(w, 'py_program'), 'BODY', set); statements.slice(1).forEach((s, i) => statements[i].nextConnection!.connect(s.previousConnection!));
    const result = execute(w); expect(result.output).toBe("Night\nball\n['bird', 'ball']\n");
    const exported = unzipSync(pythonExport(result).content as Uint8Array); expect(JSON.parse(strFromU8(exported['scene.json'])).sprites[0].costumes).toEqual(['bird', 'ball']);
    const empty = ws(); changeScene(empty, { ...emptyScene(), backdrop: 'backdrop_night' }); const next = ws(); restore(next, { ...snapshot(empty), languageVersion: 9 }); expect(sceneState(next).backdrop).toBe('backdrop_night');
  });

  it('keeps backdrop references stable through rename, deletion, saved recovery and Undo', async () => {
    const w = ws(); const state = scene(); const bytes = Buffer.alloc(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.writeUInt32BE(480, 16); bytes.writeUInt32BE(320, 20);
    state.backdrops = [{ id: 'sky', name: 'Old sky', width: 480, height: 320, data: 'data:image/png;base64,' + bytes.toString('base64') }]; state.backdrop = 'sky'; changeScene(w, state);
    const reference = block(w, 'scene_backdrop', { BACKDROP_ID: 'sky' }); plug(block(w, 'py_program'), 'BODY', plug(block(w, 'scene_backdrop_set'), 'BACKDROP', reference));
    state.backdrops[0].name = 'My new sky'; changeScene(w, state); await flush(); w.clearUndo();
    expect(reference.getField('BACKDROP_ID')!.getText()).toBe('My new sky');
    changeScene(w, removeAsset(sceneState(w), 'backdrop', 'sky')); await flush();
    expect(compile(w).diagnostics.map(d => d.code)).toContain('missing-backdrop'); expect(reference.getField('BACKDROP_ID')!.getText()).toContain('My new sky');
    const restored = ws(); restore(restored, snapshot(w)); expect(compile(restored).source).toBeNull();
    w.undo(false); await flush(); expect(execute(w).result.type).toBe('done'); expect(sceneState(w).backdrop).toBe('sky');
  });

  it('enforces saved-frame animation context and permits portable builtin backdrops in modules', () => {
    const w = ws(); changeScene(w, scene()); const animation = plug(block(w, 'scene_play_animation'), 'SPRITE', ref(w)); plug(block(w, 'py_program'), 'BODY', animation);
    expect(compile(w).diagnostics.map(d => d.code)).toContain('wait-context');
    const module = ws(), fn = defineFunction(module, { id: 'night', name: 'night', parameters: [] }); plug(fn, 'BODY', plug(block(module, 'scene_backdrop_set'), 'BACKDROP', block(module, 'scene_backdrop', { BACKDROP_ID: 'backdrop_night' })));
    expect(() => exportModule(module, { name: 'story', functions: ['night'] })).not.toThrow();
    fn.getInputTargetBlock('BODY')!.getInputTargetBlock('BACKDROP')!.setFieldValue('missing', 'BACKDROP_ID'); expect(() => exportModule(module, { name: 'story', functions: ['night'] })).toThrow('available backdrop');
  });
});
