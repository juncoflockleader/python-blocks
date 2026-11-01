import { afterEach, describe, expect, it } from 'vitest';
import { Blockly } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { createWorkspace } from '../../src/project';
import { changeScene, sceneState } from '../../src/scene/state';
import { bounds, emptyScene, spriteScale, validateScene, type SceneState } from '../../src/scene/model';

/** Stretch: a sprite made longer one way (a laser three times as long) with Width % and Height %. */
const workspaces: Blockly.Workspace[] = [];
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const scene = (extra: object = {}): SceneState => ({ ...emptyScene(), sprites: [{ id: 'laser', name: 'Laser', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird', ...extra }] });

describe('stretch', () => {
  it('is saved only when it stretches, from 10 % to 1000 %', () => {
    expect(() => validateScene(scene())).not.toThrow();
    expect(() => validateScene(scene({ stretchY: 300, stretchX: 10 }))).not.toThrow();
    for (const bad of [{ stretchY: 5 }, { stretchX: 2000 }, { stretchY: 'tall' }]) expect(() => validateScene(scene(bad))).toThrow();
  });

  it('scales the sprite along its own width and height, turning with it', () => {
    const plain = scene(), tall = scene({ stretchY: 300 }), base = bounds(plain.sprites[0], plain);
    expect(spriteScale(tall.sprites[0])).toEqual({ x: 1, y: 3 });
    expect(bounds(tall.sprites[0], tall)).toEqual({ width: base.width, height: base.height * 3 });
    const turned = scene({ stretchY: 300, direction: 90 }), side = bounds(turned.sprites[0], turned);
    expect(side.width).toBeCloseTo(base.height * 3); expect(side.height).toBeCloseTo(base.width);
    expect(spriteScale({ size: 50, stretchX: 200 })).toEqual({ x: 1, y: 0.5 });
  });

  it('has set, change and read blocks that write stretch_x and stretch_y', () => {
    const w = createWorkspace(); workspaces.push(w);
    changeScene(w, scene());
    Blockly.serialization.workspaces.load({ ...Blockly.serialization.workspaces.save(w), blocks: { languageVersion: 0, blocks: [{ type: 'py_program', inputs: { BODY: { block: {
      type: 'scene_set', fields: { PROPERTY: 'stretch_y' }, inputs: { SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: 'laser' } } }, VALUE: { shadow: { type: 'py_number', fields: { VALUE: '300' } } } },
      next: { block: { type: 'scene_change', fields: { PROPERTY: 'stretch_x' }, inputs: { SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: 'laser' } } }, VALUE: { shadow: { type: 'py_number', fields: { VALUE: '50' } } } } } },
    } } } }] } }, w);
    expect(sceneState(w).sprites).toHaveLength(1);
    const source = compile(w).source!;
    expect(source).toContain('.set("stretch_y", 300)');
    expect(source).toContain('.change("stretch_x", 50)');
  });
});
