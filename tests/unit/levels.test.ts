import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { changeScene, sceneState } from '../../src/scene/state';
import { createWorkspace, prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { defineFunction } from '../../src/blocks/core/functions';
import { handlerSignatures } from '../../src/language/functions';
import { describeEvent } from '../../src/language/event-names';
import { HAT_KINDS, HAT_TYPE, STARTER_HATS, handlerSignature, handlerState, hatItem, templateOf } from '../../src/language/hats';
import { LEVELS, levelTypes, palette, requiredLevel, toolboxFor } from '../../src/ui/levels';
import { resizeWorld } from '../../src/scene/world-size';
import { paletteWorkspace } from './palette-workspace';

type Item = Blockly.utils.toolbox.FlyoutItemInfo;
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const workspace = (project?: string) => { const w = paletteWorkspace(project); spaces.push(w); return w; };
const sprite = (id: string, name: string) => ({ id, name, x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird' });

describe('levels', () => {
  it('show 8 Starter, 14 Builder and all 21 Pro categories with stable ids', () => {
    expect(palette.starter.map(c => c.name)).toEqual(['Events', 'Motion', 'Looks', 'Sounds', 'Control', 'Draw', 'Variables', 'Game']);
    expect(palette.builder.map(c => c.name)).toEqual(['Events', 'Motion', 'Looks', 'Sounds', 'Control', 'Logic', 'Numbers', 'Text', 'Draw', 'Variables', 'Functions', 'Game', 'Sensing & input', 'Physics']);
    expect(palette.pro.map(c => c.name)).toEqual(['Program', 'Loops', 'Logic', 'Numbers', 'Sensing & input', 'Sounds', 'Game', 'Worlds', 'Sprites', 'Motion', 'Looks', 'Physics', 'Sprite pen', 'Draw', 'Text', 'Variables', 'Functions', 'Function values', 'Events', 'Modules', 'Collections']);
    for (const level of LEVELS) {
      expect(new Set(palette[level].map(c => c.id)).size).toBe(palette[level].length);
      const toolbox = toolboxFor(level).contents as unknown as { toolboxitemid: string; custom?: string; contents?: unknown }[];
      expect(toolbox.map(c => c.toolboxitemid)).toEqual(palette[level].map(c => `category-${c.id}`));
      for (const category of toolbox) expect(!!category.custom !== !!category.contents).toBe(true);
    }
  });

  it('offer only registered blocks, and each level includes everything below it', () => {
    const w = workspace('src/scene/example.json');
    const sets = LEVELS.map(level => levelTypes(w, level));
    for (const set of sets) for (const type of set.keys()) expect(Blockly.Blocks[type], type).toBeDefined();
    for (const type of sets[0].keys()) { expect(sets[1].has(type), type).toBe(true); expect(sets[2].has(type), type).toBe(true); }
    for (const type of sets[1].keys()) expect(sets[2].has(type), type).toBe(true);
    expect(sets[0].get('controls_repeat_ext')).toBe('Control'); expect(sets[0].get('pen_move')).toBe('Draw');
    expect(sets[0].has('text_print')).toBe(false); expect(sets[1].get('text_print')).toBe('Text');
    expect(sets[0].has('scene_world_set')).toBe(false); expect(sets[1].has('scene_world_set')).toBe(false); expect(sets[2].get('scene_world_set')).toBe('Worlds');
    // Starter's Control and Game groupings borrow existing blocks; nothing new is defined for them.
    for (const type of ['controls_whileUntil', 'controls_if', 'py_wait', 'py_flow', 'logic_compare', 'math_random_int', 'scene_key', 'scene_pointer', 'scene_edge', 'scene_overlaps']) expect(sets[0].get(type), type).toBe('Control');
    for (const type of ['scene_get', 'scene_control', 'scene_motion_edges']) expect(sets[0].get(type), type).toBe('Motion');
    for (const type of ['scene_clone', 'scene_destroy', 'scene_self', 'game_change']) expect(sets[0].get(type), type).toBe('Game');
    expect(sets[0].has('scene_distance')).toBe(false);
  });

  it('composite categories filter dynamic callbacks and show the hats for each level', () => {
    const w = workspace('src/scene/example.json');
    const items = (key: string) => (w.getToolboxCategoryCallback(key)!(w) as Item[]).filter(item => item.kind === 'block') as Blockly.utils.toolbox.BlockInfo[];
    expect(items('PB_STARTER_CONTROL').map(i => i.type)).toEqual(['controls_repeat_ext', 'controls_whileUntil', 'controls_whileUntil', 'controls_if', 'controls_if', 'py_wait', 'py_flow', 'logic_compare', 'math_random_int', 'scene_key', 'scene_pointer', 'scene_edge', 'scene_overlaps']);
    expect(items('PB_STARTER_MOTION').map(i => i.type)).toEqual(expect.arrayContaining(['scene_move', 'scene_get', 'scene_control', 'scene_motion_edges']));
    expect(items('PB_STARTER_MOTION').map(i => i.type)).not.toContain('scene_jump');
    expect(items('PB_STARTER_EVENTS').map(i => i.type === HAT_TYPE ? (i.extraState as { kind: string }).kind : i.type)).toEqual(['py_program', ...STARTER_HATS]);
    expect(items('PB_BUILDER_EVENTS').filter(i => i.type === HAT_TYPE)).toHaveLength(HAT_KINDS.length);
    const click = items('PB_STARTER_EVENTS').find(i => (i.extraState as { kind?: string })?.kind === 'overlap')!;
    expect(click.fields).toEqual({ SPRITE: 'player', OTHER: 'friend' });
    changeScene(w, { ...sceneState(w), sprites: [] });
    expect(items('PB_STARTER_EVENTS').map(i => (i.extraState as { kind?: string })?.kind).filter(Boolean)).toEqual(['start', 'key']);
  });

  it('name the lowest level a project needs and why', () => {
    const w = workspace();
    expect(requiredLevel(w)).toEqual({ level: 'starter', uses: [] });
    restore(w, prepareProject(readFileSync('src/scene/example.json', 'utf8')).project);
    expect(requiredLevel(w).level).toBe('builder');
    expect(requiredLevel(w).uses.map(u => u.name)).toEqual(['Numbers', 'Text']); // position reporters are Starter Motion blocks
    restore(w, prepareProject(readFileSync('src/scene/world-example.json', 'utf8')).project);
    expect(requiredLevel(w)).toMatchObject({ level: 'pro', uses: expect.arrayContaining([{ name: 'Worlds', level: 'pro' }]) });
    restore(w, prepareProject(readFileSync('src/scene/drawing-example.json', 'utf8')).project);
    expect(requiredLevel(w)).toEqual({ level: 'starter', uses: [] }); // pens, stamps and effects are all Starter tools
    // One world bigger than the stage (screens added in Stage view) is a Builder tool; several worlds are Pro.
    changeScene(w, resizeWorld(sceneState(w), 2, 1));
    expect(requiredLevel(w)).toEqual({ level: 'builder', uses: [{ name: 'Big world', level: 'builder' }] });
    changeScene(w, { ...sceneState(w), watchers: [{ id: 'watch', sprite: sceneState(w).sprites[0].id, property: 'x' }] });
    expect(requiredLevel(w).uses).toContainEqual({ name: 'Watch values', level: 'builder' });
  });
});

describe('hat blocks', () => {
  it('create the same handler signature the Events dialog would, with unique names and order', () => {
    const w = workspace();
    const first = handlerSignature(w, { kind: 'key', key: 'Space' });
    expect(first).toMatchObject({ name: 'on_space_key', async: true, parameters: [{ name: 'payload' }], handler: { event: 'key:Space', order: 0 } });
    expect(first.handler!.sprite).toBeUndefined();
    defineFunction(w, first);
    expect(handlerSignature(w, { kind: 'key', key: 'Space' })).toMatchObject({ name: 'on_space_key_2', handler: { order: 1 } });
    expect(handlerSignature(w, { kind: 'key', key: 'ArrowUp' }).name).toBe('on_up_arrow_key');
    expect(handlerSignature(w, { kind: 'start' })).toMatchObject({ name: 'on_start', handler: { event: 'start' } });
    expect(handlerSignature(w, { kind: 'countdown' })).toMatchObject({ name: 'on_countdown_end', handler: { event: 'game:countdown' } });
    expect(handlerSignature(w, { kind: 'message', message: 'level up!' })).toMatchObject({ name: 'on_level_up', handler: { event: 'level up!' } });
    for (const message of ['', '_pb:secret', 'start']) expect(handlerSignature(w, { kind: 'message', message }).handler!.event).toBe('message');
    expect(() => handlerSignature(w, { kind: 'click', sprite: 'missing' })).toThrow(/Add a sprite/);
    expect(() => handlerSignature(w, { kind: 'key', key: 'F13' })).toThrow(/Choose a key/);
  });

  it('target the chosen sprite, and overlap starts with a check for the other sprite', () => {
    const w = workspace();
    changeScene(w, { ...sceneState(w), sprites: [sprite('hero', 'Brave Fox'), sprite('coin', 'Coin')] });
    expect(handlerSignature(w, { kind: 'click', sprite: 'hero' })).toMatchObject({ name: 'on_brave_fox_click', handler: { event: 'click', sprite: 'hero' } });
    expect(handlerSignature(w, { kind: 'update', sprite: 'coin' })).toMatchObject({ name: 'on_coin_update', handler: { event: 'update', sprite: 'coin' } });
    const state = handlerState(w, templateOf({ type: HAT_TYPE, ...hatItem('overlap', 'hero', 'coin') } as Blockly.serialization.blocks.State));
    expect(state.inputs!.BODY.block).toMatchObject({ type: 'controls_if', inputs: { IF0: { block: { type: 'scene_overlaps', inputs: { SPRITE: { block: { type: 'scene_self' } }, OTHER: { block: { type: 'scene_sprite', fields: { SPRITE_ID: 'coin' } } } } } } } });
    expect(handlerState(w, { kind: 'overlap', sprite: 'hero', other: '' }).inputs).toBeUndefined();
    Blockly.serialization.blocks.append(state, w);
    const result = compile(w);
    expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.source).toContain('_pb_scene.on("hero", "overlap", on_brave_fox_overlap)');
    expect(result.source).toContain('if (_pb_scene.current_sprite).overlaps(_pb_sprites.named("Coin")):');
    expect(handlerSignatures(w)).toHaveLength(1);
  });

  it('materialize into handlers that compile like dialog-made ones', () => {
    const w = workspace();
    Blockly.serialization.blocks.append(handlerState(w, { kind: 'key', key: 'a' }), w);
    Blockly.serialization.blocks.append(handlerState(w, { kind: 'start' }), w);
    const source = compile(w).source!;
    expect(source).toContain('async def on_a_key(payload):'); expect(source).toContain('events.on("key:a", on_a_key)');
    expect(source).toContain('events.on("start", on_start)');
    expect(handlerSignatures(w).map(h => h.handler!.order)).toEqual([0, 1]);
  });
});

describe('handler labels', () => {
  it('describe events in learner words without changing the saved event', () => {
    const scene = { ...sceneState(createWorkspace()), sprites: [sprite('hero', 'Fox')] };
    expect(describeEvent({ event: 'key:ArrowUp', order: 0 }, scene)).toBe('up arrow key pressed');
    expect(describeEvent({ event: 'start', order: 0 }, scene)).toBe('game starts');
    expect(describeEvent({ event: 'click', order: 0, sprite: 'hero' }, scene)).toBe('Fox & clones clicked');
    expect(describeEvent({ event: 'overlap', order: 0, kind: 'player' }, scene)).toBe('kind player overlaps a sprite');
    expect(describeEvent({ event: 'click:hero', order: 0 }, scene)).toBe('Fox clicked');
    expect(describeEvent({ event: 'game:countdown', order: 0 }, scene)).toBe('countdown ends');
    expect(describeEvent({ event: 'win', order: 0, sprite: 'gone' }, scene)).toBe('I receive “win” · unavailable sprite & clones');
    expect(describeEvent(undefined, scene)).toBe('choose event');
  });
});
