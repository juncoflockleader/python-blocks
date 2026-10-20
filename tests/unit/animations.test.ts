import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { defineFunction } from '../../src/blocks/core/functions';
import { createWorkspace, snapshot } from '../../src/project';
import { changeScene, sceneState } from '../../src/scene/state';
import { emptyScene, validateScene, type SceneState, type SpriteState } from '../../src/scene/model';
import { removeAsset } from '../../src/scene/assets';
import { includeStockSet } from '../../src/scene/stock-art';
import { convertPython, type ParsePython } from '../../src/bridge/converter';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const parse: ParsePython = async source => JSON.parse(execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))"], { input: source, encoding: 'utf8' }));

function fox(extra: Partial<SpriteState> = {}): SceneState {
  const scene = emptyScene(), set = includeStockSet(scene, 'costume', 'fox');
  scene.sprites.push({ id: 'fox', name: 'Fox', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: set.costume, costumes: set.frames, animations: set.animations, rotationStyle: 'left-right', ...extra });
  return scene;
}
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const b = w.newBlock(type); for (const [key, value] of Object.entries(fields)) b.setFieldValue(value, key); return b; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
const self = (w: Blockly.Workspace) => block(w, 'scene_sprite', { SPRITE_ID: 'fox' });
/** A start handler that plays walk, plays jump once, prints the animation name and stops. */
function script(w: Blockly.Workspace) {
  const handler = defineFunction(w, { id: 'go', name: 'go', async: true, parameters: [{ id: 'go-payload', name: 'payload' }], handler: { event: 'start', order: 0 } });
  const play = plug(block(w, 'scene_animation_play', { ANIMATION: 'walk' }), 'SPRITE', self(w));
  const once = plug(block(w, 'scene_animation_once', { ANIMATION: 'jump' }), 'SPRITE', self(w));
  const show = plug(block(w, 'text_print'), 'TEXT', plug(block(w, 'scene_animation_get'), 'SPRITE', self(w)));
  const stop = plug(block(w, 'scene_animation_stop'), 'SPRITE', self(w));
  play.nextConnection!.connect(once.previousConnection!); once.nextConnection!.connect(show.previousConnection!); show.nextConnection!.connect(stop.previousConnection!);
  plug(handler, 'BODY', play);
}

describe('named animations', () => {
  it('come with library characters and props, and are validated with the sprite', () => {
    const scene = fox();
    expect(scene.sprites[0].animations!.map(a => [a.name, a.frames.length, a.seconds])).toEqual([['idle', 2, 0.4], ['walk', 4, undefined], ['jump', 1, undefined], ['happy', 1, undefined]]);
    expect(includeStockSet(emptyScene(), 'costume', 'coin').animations).toEqual([{ name: 'spin', frames: ['stock-coin-1', 'stock-coin-2', 'stock-coin-3', 'stock-coin-4', 'stock-coin-5', 'stock-coin-6'] }]);
    expect(() => validateScene(fox({ autoAnimate: { moving: 'walk', air: 'jump', still: 'idle', turn: true } }))).not.toThrow();
    const walk = scene.sprites[0].animations![1];
    for (const animations of [[walk, walk], [{ ...walk, name: 'frames' }], [{ ...walk, name: '1st' }], [{ ...walk, frames: [] }], [{ ...walk, frames: ['missing'] }], [{ ...walk, seconds: 0 }], Array.from({ length: 9 }, (_, i) => ({ ...walk, name: `a${i}` }))])
      expect(() => validateScene(fox({ animations })), JSON.stringify(animations).slice(0, 60)).toThrow();
    expect(() => validateScene(fox({ autoAnimate: { moving: 'run', air: '', still: '', turn: false } }))).toThrow();
  });

  it('lose a deleted costume, and animate while moving lets go of an animation left empty', () => {
    const scene = fox({ autoAnimate: { moving: 'walk', air: 'jump', still: 'idle', turn: true } });
    const next = removeAsset(scene, 'costume', 'stock-fox-jump'), sprite = next.sprites[0];
    expect(sprite.animations!.map(a => a.name)).toEqual(['idle', 'walk', 'happy']);
    expect(sprite.autoAnimate).toEqual({ moving: 'walk', air: '', still: 'idle', turn: true });
    expect(() => validateScene(next)).not.toThrow();
  });

  it('compile to play, play_once, stop_animation and animation, with no extra line for animating while moving', () => {
    const w = ws(); changeScene(w, fox({ autoAnimate: { moving: 'walk', air: 'jump', still: 'idle', turn: true } })); script(w);
    const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    for (const line of ['.play("walk")', 'await (', '.play_once("jump")', '.animation)', '.stop_animation()']) expect(result.source).toContain(line);
    expect(result.source).not.toContain('enable_motion');   // the runtime starts the clock itself, so hand-written Python needs no setup line
    // A project that only prints runs to the end: animating a still sprite does not keep it running.
    const plain = ws(); changeScene(plain, fox({ autoAnimate: { moving: 'walk', air: 'jump', still: 'idle', turn: true } }));
    const program = block(plain, 'py_program'); plug(program, 'BODY', plug(block(plain, 'text_print'), 'TEXT', block(plain, 'text', { TEXT: 'hi' })));
    expect(compile(plain).executionMode).not.toBe('events'); expect(compile(plain).source).not.toContain('enable_motion');
  });

  it('round-trip from Python to the same blocks', async () => {
    const w = ws(); changeScene(w, fox()); script(w);
    const base = snapshot(w), source = compile(w).source!;
    const result = await convertPython(source, base, parse);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.compilation.source).toBe(source);
    const types = JSON.stringify(result.project.workspace.blocks);
    for (const type of ['scene_animation_play', 'scene_animation_once', 'scene_animation_get', 'scene_animation_stop']) expect(types).toContain(type);
    expect(sceneState(w).sprites[0].animations).toHaveLength(4);
  });
});
