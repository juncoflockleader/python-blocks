import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { Blockly } from '../../src/blocks';
import { defineFunction } from '../../src/blocks/core/functions';
import { convertPython, type ConvertedPython, type ParsePython } from '../../src/bridge/converter';
import { libraryBlockTypes } from '../../src/bridge/library-catalog';
import type { ParseResult } from '../../src/bridge/parser-protocol';
import { compile, supportedBlocks } from '../../src/language/compiler';
import { loadWorkspace } from '../../src/language/serialization';
import { createWorkspace, prepareProject, snapshot, type Project } from '../../src/project';
import { pythonExport } from '../../src/project/python-export';
import { changeScene, sceneState } from '../../src/scene/state';
import { builtins, builtinBackdrops } from '../../src/scene/model';
import soundExample from '../../src/scene/sound-example.json';
import worldExample from '../../src/scene/world-example.json';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const cache = new Map<string, ParseResult>();
const parse: ParsePython = async source => {
  if (!cache.has(source)) cache.set(source, JSON.parse(execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))"], { input: source, encoding: 'utf8', maxBuffer: 64_000_000 })));
  return structuredClone(cache.get(source)!);
};
async function converted(source: string, base: Project): Promise<ConvertedPython> {
  const saved = structuredClone(base), result = await convertPython(source, base, parse);
  expect(base).toEqual(saved);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics.map(d => ({ ...d, source: d.span && source.slice(d.span.start.offset, d.span.end.offset) }))));
  const w = ws(); loadWorkspace(result.project.workspace, w);
  expect(compile(w).source).toBe(result.compilation.source);
  expect(result.project.workspace.pythonScene).toEqual(base.workspace.pythonScene);
  const exported = pythonExport(result.compilation);
  if (result.compilation.scene) {
    const files = unzipSync(exported.content as Uint8Array);
    expect(JSON.parse(strFromU8(files['scene.json']))).toEqual(base.workspace.pythonScene);
    expect(strFromU8(files['program.py'])).toBe(result.compilation.source);
  }
  return result;
}
function b(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const block = w.newBlock(type); Object.entries(fields).forEach(([name, value]) => block.setFieldValue(value, name)); return block; }
function sample(w: Blockly.Workspace, input: string): Blockly.Block {
  const scene = sceneState(w);
  if (['SPRITE', 'OWNER', 'OTHER'].includes(input)) return b(w, 'scene_sprite', { SPRITE_ID: scene.sprites[0].id });
  if (input === 'COSTUME') return b(w, 'scene_costume', { COSTUME_ID: builtins[0].id });
  if (input === 'BACKDROP') return b(w, 'scene_backdrop', { BACKDROP_ID: builtinBackdrops[0].id });
  if (input === 'WORLD') return b(w, 'scene_world', { WORLD_ID: scene.worlds![0].id });
  if (input === 'SOUND') return b(w, 'sound_asset', { SOUND_ID: scene.sounds![0].id });
  if (input === 'ENABLED') return b(w, 'logic_boolean', { BOOL: 'TRUE' });
  if (['KEY', 'KIND', 'NAME', 'TEXT', 'COLOR', 'OWN_COLOR'].includes(input)) return b(w, 'text', { TEXT: input === 'NAME' ? scene.sprites[0].name : input.includes('COLOR') ? '#478b94' : 'bridge' });
  if (input === 'FRAMES') { const list = b(w, 'lists_create_with'); list.loadExtraState!({ itemCount: 1 }); list.getInput('ADD0')!.connection!.connect(sample(w, 'COSTUME').outputConnection!); return list; }
  return b(w, 'py_number', { VALUE: input === 'NOTE' ? '60' : input === 'SECONDS' || input === 'BEATS' ? '0.01' : '1' });
}
function fixture(type: string) {
  const w = ws(); loadWorkspace(prepareProject(JSON.stringify(worldExample)).project.workspace, w);
  for (const root of w.getTopBlocks(false)) root.dispose(false);
  changeScene(w, { ...sceneState(w), sounds: soundExample.workspace.pythonScene.sounds as any });
  const scene = sceneState(w), handler = defineFunction(w, { id: 'bridge-library-handler', name: 'demo', async: true, parameters: [{ id: 'bridge-payload', name: 'payload' }], handler: { event: 'update', sprite: scene.sprites[0].id, order: 0 } });
  const block = b(w, type);
  for (const field of ['SPRITE_ID', 'COSTUME_ID', 'BACKDROP_ID', 'WORLD_ID', 'SOUND_ID']) if (block.getField(field)) block.setFieldValue(field === 'SPRITE_ID' ? scene.sprites[0].id : field === 'COSTUME_ID' ? builtins[0].id : field === 'BACKDROP_ID' ? builtinBackdrops[0].id : field === 'WORLD_ID' ? scene.worlds![0].id : scene.sounds![0].id, field);
  for (const input of block.inputList) if (input.type === Blockly.inputs.inputTypes.VALUE) input.connection!.connect(sample(w, input.name).outputConnection!);
  let statement = block;
  if (block.outputConnection) { statement = b(w, 'text_print'); statement.getInput('TEXT')!.connection!.connect(block.outputConnection); }
  handler.getInput('BODY')!.connection!.connect(statement.previousConnection!);
  return { w, block };
}
function fieldVariants(): [string, string, string][] {
  const w = createWorkspace(), variants: [string, string, string][] = [];
  try {
    for (const type of libraryBlockTypes) {
      const block = w.newBlock(type);
      for (const input of block.inputList) for (const field of input.fieldRow) {
        if (!field.name || field.name.endsWith('_ID')) continue;
        const values = field instanceof Blockly.FieldDropdown ? field.getOptions(false).map(option => option[1]) : field instanceof Blockly.FieldCheckbox ? ['TRUE', 'FALSE'] : [];
        for (const value of values) if (typeof value === 'string' && value !== field.getValue()) variants.push([type, field.name, value]);
      }
      block.dispose(false);
    }
    return variants;
  } finally { w.dispose(); }
}

describe('complete creative library block coverage', () => {
  it('lists every supported pen, scene, input, game and sound block in the bridge catalog', () => {
    const types = [...supportedBlocks].filter(type => /^(pen|scene|input|game|sound)_/.test(type)).sort();
    expect([...libraryBlockTypes].sort()).toEqual(types);
  });
  it.each([...libraryBlockTypes].sort())('converts %s to its ordinary editable library block with exact captured assets', async type => {
    const { w, block } = fixture(type), base = snapshot(w), original = compile(w);
    expect(original.diagnostics.filter(d => d.severity === 'error')).toEqual([]); expect(original.source).not.toBeNull();
    const result = await converted('# learner note\n' + original.source!, base), restored = ws(); loadWorkspace(result.project.workspace, restored);
    expect(restored.getAllBlocks(false).some(b => b.type === type)).toBe(true);
    expect(restored.getBlockById(block.id)?.type).toBe(type);
    expect(result.compilation.executionMode).toBe(original.executionMode);
    expect(result.compilation.files).toEqual(original.files);
  });
  it.each(fieldVariants())('preserves the nondefault %s %s=%s choice and block identity', async (type, field, value) => {
    const { w, block } = fixture(type); block.setFieldValue(value, field);
    const original = compile(w); expect(original.source).not.toBeNull();
    const result = await converted('# learner choice\n' + original.source!, snapshot(w)), restored = ws(); loadWorkspace(result.project.workspace, restored);
    expect(restored.getBlockById(block.id)?.getFieldValue(field)).toBe(value);
  });
});

describe('creative project conversion and reference errors', () => {
  it.each(readdirSync('src/scene').filter(name => name.endsWith('example.json')))('converts the authored %s example with all metadata and source exports intact', async name => {
    const base = prepareProject(readFileSync(`src/scene/${name}`, 'utf8')).project;
    const w = ws(); loadWorkspace(base.workspace, w); const original = compile(w); expect(original.source).not.toBeNull();
    const result = await converted('# learner note\n' + original.source!, base);
    expect(result.compilation.requiresMotion).toBe(original.requiresMotion);
    const again = await convertPython(result.compilation.source!, result.project, parse);
    expect(again).toMatchObject({ ok: true, unchanged: true, project: result.project });
  });
  it('keeps sprite/kind registration targets and ordering while editing behavior source', async () => {
    const { w } = fixture('scene_say'), base = snapshot(w), original = compile(w).source!;
    const scene = sceneState(w), oldTarget = `_pb_scene.on(${JSON.stringify(scene.sprites[0].id)}, "update", demo)`;
    expect(original).toContain(oldTarget);
    const result = await converted(original.replace(oldTarget, '_pb_scene.on_kind("enemy", "update", demo)').replace('"bridge", "say"', '"new words", "think"'), base);
    expect(result.compilation.source).toContain('_pb_scene.on_kind("enemy", "update", demo)');
    expect(result.compilation.source).toContain('"new words", "think"');
  });
  it.each([
    ['scene_sprite', source => source.replace(/\.named\("[^"]+"\)/, '.named("Missing sprite")'), 'authored sprite'],
    ['scene_costume_set', source => source.replace(JSON.stringify(builtins[0].id), '"missing-costume"'), 'existing costume'],
    ['scene_backdrop_set', source => source.replace(JSON.stringify(builtinBackdrops[0].id), '"missing-backdrop"'), 'existing backdrop'],
    ['scene_world_set', source => source.replace('.switch_world("meadow")', '.switch_world("missing-world")'), 'existing world'],
    ['sound_play', source => source.replace('.play("first_song",', '.play("missing-sound",'), 'existing sound'],
    ['scene_animate', source => source.replace(JSON.stringify(builtins[0].id), '"missing-frame"'), 'existing costume'],
    ['scene_key', source => source.replace(/key_down\("[^"]+"\)/, 'key_down("unsupported key")'), 'literal property'],
    ['scene_set', source => source.replace('.set("x",', '.set("unknown-property",'), 'literal property'],
    ['scene_glide', source => source.replace('await ', ''), 'needs await'],
    ['scene_move', source => source.replace('.move(1)', '.move(1, 2)'), 'positional argument'],
    ['scene_move', source => source.replace('_pb_scene.load("scene.json")', '_pb_scene.load("different.json")'), 'before startup'],
  ] satisfies [string, (source: string) => string, string][])('rejects invalid references and call forms for %s without changing the project', async (type, edit, message) => {
    const { w } = fixture(type), base = snapshot(w), original = compile(w).source!, source = edit(original); expect(source).not.toBe(original);
    const result = await convertPython(source, base, parse); expect(result.ok).toBe(false); expect(snapshot(w)).toEqual(base);
    if (!result.ok) { expect(result.source).toBe(source); expect(result.diagnostics[0].message).toContain(message); expect(result.diagnostics[0].span).toBeDefined(); }
  });
});
