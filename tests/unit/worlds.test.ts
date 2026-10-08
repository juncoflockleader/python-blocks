import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { Blockly } from '../../src/blocks';
import { defaultCamera, newMap, resizeMap, validMap, cameraPosition } from '../../src/scene/world';
import { validateScene, emptyScene, isSceneCommand, validateInput, type SceneState } from '../../src/scene/model';
import { removeAsset } from '../../src/scene/assets';
import { sceneState, changeScene } from '../../src/scene/state';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { compile, blockForLine } from '../../src/language/compiler';
import { pythonExport } from '../../src/project/python-export';

const spaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); spaces.push(w); return w; };
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const example = () => JSON.parse(readFileSync('src/scene/world-example.json', 'utf8'));
describe('tile worlds, camera and persistence', () => {
  it('validates complete maps, identities, membership and camera data before replacing work', () => {
    const data: SceneState = example().workspace.pythonScene; expect(() => validateScene(data)).not.toThrow();
    const bads = [
      (s: SceneState) => s.worlds![0].map.tiles.pop(), (s: SceneState) => s.worlds![0].map.walls.push(false),
      (s: SceneState) => { s.worlds![0].map.columns = 65; }, (s: SceneState) => { s.worlds![0].map.tileSize = 17; },
      (s: SceneState) => { s.worlds![0].map.tiles[0] = 'missing'; }, (s: SceneState) => { s.worlds![0].camera.x = Infinity; },
      (s: SceneState) => { s.worlds![0].camera.follow = 'missing'; }, (s: SceneState) => { s.sprites[0].world = 'missing'; },
      (s: SceneState) => { s.world = 'missing'; }, (s: SceneState) => { s.worlds![1].id = s.worlds![0].id; },
      (s: SceneState) => { s.worlds![1].name = s.worlds![0].name; }, (s: SceneState) => { s.worlds![0].id = 'enter'; },
    ];
    for (const corrupt of bads) { const bad = structuredClone(data); corrupt(bad); expect(() => validateScene(bad)).toThrow(); }
    expect(validMap(newMap(64, 64, 64))).toBe(true); expect(() => resizeMap(newMap(), 1.5, 4, 16)).toThrow();
    expect(isSceneCommand({ type: 'tile', column: 64, row: 0, costume: null, solid: false })).toBe(false);
    expect(isSceneCommand({ type: 'camera', x: 100, y: Infinity })).toBe(false);
    expect(() => validateInput({ kind: 'click', x: 600, y: -300, sprite: null })).not.toThrow();
  });
  it('preserves top-left cells when resizing and clamps small and scrolling cameras', () => {
    const m = newMap(2, 2); m.tiles[3] = 'box'; m.walls[3] = true;
    const bigger = resizeMap(m, 4, 3, 32); expect(bigger.tiles[5]).toBe('box'); expect(bigger.walls[5]).toBe(true); expect(m.tileSize).toBe(16);
    expect(resizeMap(m, 1, 1, 16).tiles).toEqual([null]);
    expect(cameraPosition(defaultCamera(), newMap(64, 32), { x: 800, y: -500 })).toEqual({ x: 544, y: -192 });
    expect(cameraPosition(defaultCamera(), m)).toEqual({ x: -224, y: 144 });
    expect(cameraPosition({ ...defaultCamera(), clamp: false }, m, { x: 800, y: -500 })).toEqual({ x: 800, y: -500 });
  });
  it('compiles the editable scrolling adventure and captures maps, local sprites and art in source exports', () => {
    const w = ws(); restore(w, prepareProject(JSON.stringify(example())).project); const result = compile(w);
    expect(result.diagnostics).toEqual([]); expect(result.executionMode).toBe('events'); expect(result.source).toContain('_pb_scene.switch_world("cavern")'); expect(result.source).toContain('_pb_scene.tile_set(14, 5, None, False)');
    expect(result.source).toContain('_pb_scene.on_kind("player", "tile:overlap"');
    const sourceLine = result.source!.split('\n').findIndex(line => line.includes('.switch_world(')) + 1;
    expect(w.getBlockById(blockForLine(result, 'program.py', sourceLine)!)!.type).toBe('scene_world_set');
    const bundle = unzipSync(pythonExport(result).content as Uint8Array); const saved = JSON.parse(strFromU8(bundle['scene.json'])); expect(saved.worlds).toHaveLength(2); expect(saved.sprites[1].world).toBe('meadow'); expect(saved.assets[0].data).toMatch(/^data:image/);
    const restored = ws(); restore(restored, snapshot(w)); expect(compile(restored).source).toEqual(result.source);
    const legacy = prepareProject(JSON.stringify({ ...example(), languageVersion: 13 })); expect(legacy.project.languageVersion).toBe(19);
  });
  it('keeps world references through rename, deletion diagnostics and Undo; deletes referenced art atomically', async () => {
    const w = ws(); restore(w, prepareProject(JSON.stringify(example())).project); const original = sceneState(w);
    original.worlds![1].name = 'Renamed cavern'; changeScene(w, original); await new Promise(r => setTimeout(r, 30)); w.clearUndo();
    const removed = sceneState(w); removed.sprites = removed.sprites.filter(s => s.world !== 'cavern'); removed.worlds = removed.worlds!.filter(s => s.id !== 'cavern'); changeScene(w, removed);
    expect(compile(w).diagnostics.some(d => d.code === 'missing-world')).toBe(true); await new Promise(r => setTimeout(r, 30)); w.undo(false);
    expect(compile(w).diagnostics).toEqual([]); expect(sceneState(w).worlds![1].name).toBe('Renamed cavern');
    const withoutArt = removeAsset(sceneState(w), 'costume', 'grass'); expect(withoutArt.worlds![0].map.tiles[0]).toBeNull(); expect(withoutArt.worlds![0].map.walls[0]).toBe(false); expect(() => validateScene(withoutArt)).not.toThrow();
    changeScene(w, { ...emptyScene(), camera: defaultCamera() }); expect(snapshot(w).workspace.pythonScene).toHaveProperty('camera');
  });
});
