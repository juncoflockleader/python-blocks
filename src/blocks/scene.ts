import * as Blockly from 'blockly/core';
import { backdrops, costumes, keys, rotationStyles } from '../scene/model';
import { sceneState } from '../scene/state';
import { effectOptions } from '../scene/effects';
import { motionNumbers } from '../scene/motion';

export class SceneReferenceField extends Blockly.FieldDropdown {
  private candidate?: string;
  private cached?: { id: string; name: string };
  constructor(readonly kind: 'sprite' | 'costume' | 'backdrop' | 'world' | 'sound') {
    super(function () {
      const field = this as SceneReferenceField, block = field.getSourceBlock();
      const state = block && sceneState(block.workspace);
      const values = state ? (kind === 'sound' ? state.sounds ?? [] : kind === 'world' ? state.worlds ?? [] : kind === 'sprite' ? state.sprites : kind === 'backdrop' ? backdrops(state) : costumes(state)) : [];
      const current = field.candidate ?? field.getValue();
      const options: [string, string][] = values.map(v => [v.name, v.id]);
      if (current && !values.some(v => v.id === current)) options.push([`${field.cached?.name ?? kind} (unavailable)`, current]);
      return [[kind === 'world' ? 'base stage' : kind === 'backdrop' ? 'plain color' : `choose ${kind}`, ''], ...options];
    });
  }
  protected override doClassValidation_(value: string) { this.candidate = value; this.getOptions(false); return value; }
  override saveState(full = false) {
    const state = this.getSourceBlock() && sceneState(this.getSourceBlock()!.workspace), id = this.getValue();
    const found = state && (this.kind === 'sound' ? state.sounds ?? [] : this.kind === 'world' ? state.worlds ?? [] : this.kind === 'sprite' ? state.sprites : this.kind === 'backdrop' ? backdrops(state) : costumes(state)).find(v => v.id === id);
    const reference = found ?? (this.cached?.id === id ? this.cached : undefined);
    return reference && (full || !found) ? { id: reference.id, name: reference.name } : id;
  }
  override loadState(state: string | { id: string; name: string }) { this.cached = typeof state === 'object' ? { ...state } : undefined; this.setValue(typeof state === 'string' ? state : state.id); }
  refresh() { const value = this.getValue(); this.getOptions(false); if (value !== null) this.doValueUpdate_(value); this.forceRerender(); }
}
for (const kind of ['sprite', 'costume', 'backdrop', 'world'] as const) Blockly.Blocks[`scene_${kind}`] = { init(this: Blockly.Block) {
  this.appendDummyInput().appendField(kind).appendField(new SceneReferenceField(kind), kind === 'world' ? 'WORLD_ID' : kind === 'sprite' ? 'SPRITE_ID' : kind === 'backdrop' ? 'BACKDROP_ID' : 'COSTUME_ID'); this.setOutput(true); this.setColour('#477c9a');
} };
const value = (name: string) => ({ type: 'input_value', name });
const menu = (name: string, options: string[][]) => ({ type: 'field_dropdown', name, options });
const propertyOptions = ['x', 'y', 'direction', 'size', 'layer'].map(v => [v, v]);
const command = (type: string, message0: string, args0: unknown[], output = false) => ({ type, message0, args0, ...(output ? { output: null } : { previousStatement: null, nextStatement: null }), colour: '#477c9a', inputsInline: false });
Blockly.common.defineBlocksWithJsonArray([
  command('scene_world_set', 'switch to world %1', [value('WORLD')]),
  command('scene_world_restart', 'restart current world', []),
  command('scene_world_get', 'current world %1', [menu('PROPERTY', [['name', 'world_name'], ['ID', 'world_id']])], true),
  command('scene_camera_go', 'camera center x %1 y %2', [value('X'), value('Y')]),
  command('scene_camera_follow', 'camera follow sprite %1 (None to stop)', [value('SPRITE')]),
  command('scene_camera_clamp', 'clamp camera to world %1', [value('ENABLED')]),
  command('scene_camera_get', 'camera %1', [menu('PROPERTY', [['x', 'camera_x'], ['y', 'camera_y']])], true),
  command('scene_map_get', 'map %1', [menu('PROPERTY', ['columns', 'rows', 'tileSize', 'width', 'height'].map(v => [v, v]))], true),
  command('scene_tile_get', 'tile at column %1 row %2', [value('COLUMN'), value('ROW')], true),
  command('scene_tile_at', 'tile at world x %1 y %2 (None outside)', [value('X'), value('Y')], true),
  command('scene_tile_set', 'set tile column %1 row %2 costume %3 solid %4', [value('COLUMN'), value('ROW'), value('COSTUME'), value('ENABLED')]),
  command('scene_tile_wall', 'tile column %1 row %2 solid %3', [value('COLUMN'), value('ROW'), value('ENABLED')]),
  command('scene_tiles_of', 'all tiles with costume %1', [value('COSTUME')], true),
  command('scene_tile_place', 'place sprite %1 on tile column %2 row %3', [value('SPRITE'), value('COLUMN'), value('ROW')]),
  command('scene_kind_set', 'set sprite %1 kind to %2', [value('SPRITE'), value('KIND')]),
  command('scene_of_kind', 'all sprites of kind %1', [value('KIND')], true),
  command('scene_motion_set', 'set sprite %1 %2 to %3', [value('SPRITE'), menu('PROPERTY', Object.keys(motionNumbers).map(key => [key, key])), value('VALUE')]),
  command('scene_motion_change', 'change sprite %1 %2 by %3', [value('SPRITE'), menu('PROPERTY', Object.keys(motionNumbers).map(key => [key, key])), value('VALUE')]),
  command('scene_motion_get', 'sprite %1 motion %2', [value('SPRITE'), menu('PROPERTY', [...Object.keys(motionNumbers), 'grounded', 'body', 'response', 'edges', 'controller', 'autoDestroy'].map(key => [key, key]))], true),
  command('scene_motion_body', 'sprite %1 automatic motion %2', [value('SPRITE'), menu('MODE', [['off', 'off'], ['moving body', 'moving'], ['solid wall', 'wall']])]),
  command('scene_motion_response', 'sprite %1 on wall collision %2', [value('SPRITE'), menu('MODE', ['slide', 'stop', 'bounce', 'destroy'].map(key => [key, key]))]),
  command('scene_motion_edges', 'sprite %1 at stage edge %2', [value('SPRITE'), menu('MODE', [['pass through', 'none'], ['stop', 'stop'], ['bounce', 'bounce'], ['destroy', 'destroy']])]),
  command('scene_motion_auto', 'sprite %1 destroy when fully offstage %2', [value('SPRITE'), { type: 'field_checkbox', name: 'ENABLED', checked: true }]),
  command('scene_control', 'control sprite %1 with %2 horizontal speed %3 vertical speed %4', [value('SPRITE'), menu('SCHEME', [['arrow keys', 'arrows'], ['WASD keys', 'wasd'], ['no controller', 'none']]), value('VX'), value('VY')]),
  command('scene_jump', 'sprite %1 jump if grounded at speed %2', [value('SPRITE'), value('VALUE')]),
  command('scene_motion_stop', 'stop sprite %1 automatic movement', [value('SPRITE')]),
  ...['scene_projectile', 'scene_fire'].map(type => command(type, 'fire from sprite %1 costume %2 x speed %3 y speed %4 lifetime seconds %5', [value('SPRITE'), value('COSTUME'), value('VX'), value('VY'), value('SECONDS')], type === 'scene_projectile')),
  command('scene_self', 'this sprite', [], true),
  command('scene_all', 'all live sprites', [], true),
  command('scene_instances', 'original and clones of sprite %1', [value('SPRITE')], true),
  command('scene_data', 'sprite %1 data dictionary', [value('SPRITE')], true),
  command('scene_data_get', 'sprite %1 data named %2', [value('SPRITE'), value('KEY')], true),
  command('scene_data_set', 'set sprite %1 data named %2 to %3', [value('SPRITE'), value('KEY'), value('VALUE')]),
  command('scene_pixels', 'sprite %1 touches pixels of sprite %2', [value('SPRITE'), value('OTHER')], true),
  command('scene_pixel_point', 'sprite %1 has a visible pixel at x %2 y %3', [value('SPRITE'), value('X'), value('Y')], true),
  command('scene_pen_state', 'sprite %1 pen %2', [value('SPRITE'), menu('ACTION', [['down', 'pen_down'], ['up', 'pen_up']])]),
  command('scene_pen_color', 'set sprite %1 pen color %2', [value('SPRITE'), value('COLOR')]),
  command('scene_pen_set', 'set sprite %1 pen %2 to %3', [value('SPRITE'), menu('PROPERTY', [['width', 'width'], ['opacity %', 'opacity']]), value('VALUE')]),
  command('scene_pen_change', 'change sprite %1 pen %2 by %3', [value('SPRITE'), menu('PROPERTY', [['width', 'width'], ['opacity %', 'opacity']]), value('VALUE')]),
  command('scene_pen_get', 'sprite %1 pen %2', [value('SPRITE'), menu('PROPERTY', [['down?', 'down'], ['color', 'color'], ['width', 'width'], ['opacity %', 'opacity']])], true),
  command('scene_stamp', 'stamp sprite %1', [value('SPRITE')]),
  command('scene_pen_clear', 'erase all pen trails and stamps', []),
  command('scene_effect_set', 'set sprite %1 %2 effect to %3', [value('SPRITE'), menu('EFFECT', effectOptions), value('VALUE')]),
  command('scene_effect_change', 'change sprite %1 %2 effect by %3', [value('SPRITE'), menu('EFFECT', effectOptions), value('VALUE')]),
  command('scene_effect_get', 'sprite %1 %2 effect', [value('SPRITE'), menu('EFFECT', effectOptions)], true),
  command('scene_effect_clear', 'clear sprite %1 graphic effects', [value('SPRITE')]),
  command('scene_stage_effect_set', 'set stage %1 effect to %2', [menu('EFFECT', effectOptions), value('VALUE')]),
  command('scene_stage_effect_change', 'change stage %1 effect by %2', [menu('EFFECT', effectOptions), value('VALUE')]),
  command('scene_stage_effect_get', 'stage %1 effect', [menu('EFFECT', effectOptions)], true),
  command('scene_stage_effect_clear', 'clear stage graphic effects', []),
  command('scene_lookup', 'sprite with name or ID %1', [value('NAME')], true),
  command('scene_create', 'create sprite with costume %1', [value('COSTUME')], true),
  command('scene_move', 'move sprite %1 by %2 steps', [value('SPRITE'), value('VALUE')]),
  command('scene_turn', 'turn sprite %1 clockwise %2 degrees', [value('SPRITE'), value('VALUE')]),
  command('scene_go', 'move sprite %1 to x %2 y %3', [value('SPRITE'), value('X'), value('Y')]),
  command('scene_set', 'set sprite %1 %2 to %3', [value('SPRITE'), menu('PROPERTY', propertyOptions), value('VALUE')]),
  command('scene_change', 'change sprite %1 %2 by %3', [value('SPRITE'), menu('PROPERTY', propertyOptions), value('VALUE')]),
  command('scene_get', 'sprite %1 %2', [value('SPRITE'), menu('PROPERTY', [...propertyOptions, ['visible', 'visible'], ['name', 'name'], ['ID', 'id'], ['width', 'width'], ['height', 'height'], ['costume ID', 'costume_id'], ['frame duration', 'frame_seconds'], ['kind', 'kind'], ['is clone?', 'is_clone'], ['original sprite ID', 'template_id']])], true),
  command('scene_point', 'point sprite %1 towards x %2 y %3', [value('SPRITE'), value('X'), value('Y')]),
  command('scene_distance', 'distance from sprite %1 to x %2 y %3', [value('SPRITE'), value('X'), value('Y')], true),
  command('scene_touching_point', 'sprite %1 touches point x %2 y %3', [value('SPRITE'), value('X'), value('Y')], true),
  command('scene_edge', 'sprite %1 touches %2 edge?', [value('SPRITE'), menu('EDGE', ['any', 'left', 'right', 'top', 'bottom'].map(v => [v, v]))], true),
  command('scene_bounce', 'if on edge, bounce sprite %1', [value('SPRITE')]),
  command('scene_rotation', 'sprite %1 rotation style %2', [value('SPRITE'), menu('STYLE', rotationStyles)]),
  command('scene_layer', 'bring sprite %1 to %2', [value('SPRITE'), menu('PLACE', [['front', 'front'], ['back', 'back']])]),
  command('scene_say', 'sprite %1 %2 %3', [value('SPRITE'), menu('STYLE', [['say', 'say'], ['think', 'think']]), value('TEXT')]),
  command('scene_say_for', 'sprite %1 %2 %3 for %4 seconds', [value('SPRITE'), menu('STYLE', [['say', 'say'], ['think', 'think']]), value('TEXT'), value('SECONDS')]),
  command('scene_visibility', '%1 sprite %2', [menu('ACTION', [['show', 'show'], ['hide', 'hide']]), value('SPRITE')]),
  command('scene_costume_set', 'set sprite %1 costume %2', [value('SPRITE'), value('COSTUME')]),
  command('scene_clone', 'clone sprite %1', [value('SPRITE')], true),
  command('scene_destroy', 'destroy sprite %1', [value('SPRITE')]),
  command('scene_overlaps', 'sprite %1 overlaps %2', [value('SPRITE'), value('OTHER')], true),
  command('scene_glide', 'glide sprite %1 for %2 seconds to x %3 y %4', [value('SPRITE'), value('SECONDS'), value('X'), value('Y')]),
  command('scene_animate', 'animate sprite %1 with costume list %2 seconds per costume %3', [value('SPRITE'), value('FRAMES'), value('SECONDS')]),
  command('scene_next_costume', 'next costume of sprite %1', [value('SPRITE')]),
  command('scene_frames', 'sprite %1 animation frames', [value('SPRITE')], true),
  command('scene_play_animation', 'play sprite %1 animation once and wait', [value('SPRITE')]),
  command('scene_backdrop_set', 'switch stage to backdrop %1', [value('BACKDROP')]),
  command('scene_backdrop_next', 'next backdrop', []),
  command('scene_backdrop_get', 'current backdrop %1', [menu('PROPERTY', [['name', 'backdrop_name'], ['ID', 'backdrop_id']])], true),
  command('scene_key', 'key %1 held?', [menu('KEY', keys)], true),
  command('scene_pointer', 'pointer %1', [menu('PROPERTY', [['x', 'pointer_x'], ['y', 'pointer_y'], ['held?', 'pointer_down'], ['inside stage?', 'pointer_inside']])], true),
  command('scene_background', 'set stage background %1', [value('COLOR')]),
]);
