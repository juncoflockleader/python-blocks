import * as Blockly from 'blockly/core';
import { numberInput } from '../blocks/core';
import { sceneState } from './state';
import type { SceneState } from './model';

export function installScenePalette(workspace: Blockly.WorkspaceSvg, selected: () => string) {
  const targets = (scene: SceneState) => {
    const primary = scene.sprites.find(s => s.id === selected()) ?? scene.sprites[0];
    return { primary: primary?.id ?? '', other: scene.sprites.find(s => s.id !== primary?.id)?.id ?? primary?.id ?? '' };
  };
  const sprites = (): Blockly.utils.toolbox.FlyoutItemInfo[] => {
    const scene = sceneState(workspace), target = targets(scene);
    const cost = { shadow: { type: 'scene_costume', fields: { COSTUME_ID: 'bird' } } };
    const defaults: Record<string, Blockly.serialization.blocks.ConnectionState> = {
      SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: target.primary } } },
      OTHER: { block: { type: 'scene_sprite', fields: { SPRITE_ID: target.other } } },
      VX: numberInput(120), VY: numberInput(0), KIND: { shadow: { type: 'text', fields: { TEXT: 'enemy' } } },
      KEY: { shadow: { type: 'text', fields: { TEXT: 'score' } } }, VALUE: numberInput(10), X: numberInput(0), Y: numberInput(0), SECONDS: numberInput(1), COSTUME: cost,
      TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello!' } } },
      COLOR: { shadow: { type: 'text', fields: { TEXT: '#267c70' } } },
      FRAMES: { block: { type: 'lists_create_with', extraState: { itemCount: 2 }, inputs: { ADD0: cost, ADD1: { shadow: { type: 'scene_costume', fields: { COSTUME_ID: 'star' } } } } } },
    };
    const specs: [string, string[]][] = [
      ['scene_motion_set', ['SPRITE', 'VALUE']], ['scene_motion_change', ['SPRITE', 'VALUE']], ['scene_motion_get', ['SPRITE']], ['scene_motion_body', ['SPRITE']], ['scene_motion_response', ['SPRITE']], ['scene_motion_edges', ['SPRITE']], ['scene_motion_auto', ['SPRITE']], ['scene_control', ['SPRITE', 'VX', 'VY']], ['scene_jump', ['SPRITE', 'VALUE']], ['scene_motion_stop', ['SPRITE']], ['scene_projectile', ['SPRITE', 'COSTUME', 'VX', 'VY', 'SECONDS']], ['scene_fire', ['SPRITE', 'COSTUME', 'VX', 'VY', 'SECONDS']], ['scene_kind_set', ['SPRITE', 'KIND']], ['scene_of_kind', ['KIND']],
      ['scene_self', []], ['scene_all', []], ['scene_instances', ['SPRITE']], ['scene_data', ['SPRITE']], ['scene_data_get', ['SPRITE', 'KEY']], ['scene_data_set', ['SPRITE', 'KEY', 'VALUE']],
      ['scene_pen_state', ['SPRITE']], ['scene_pen_color', ['SPRITE', 'COLOR']], ['scene_pen_set', ['SPRITE', 'VALUE']], ['scene_pen_change', ['SPRITE', 'VALUE']], ['scene_pen_get', ['SPRITE']], ['scene_stamp', ['SPRITE']], ['scene_pen_clear', []],
      ['scene_effect_set', ['SPRITE', 'VALUE']], ['scene_effect_change', ['SPRITE', 'VALUE']], ['scene_effect_get', ['SPRITE']], ['scene_effect_clear', ['SPRITE']],
      ['scene_stage_effect_set', ['VALUE']], ['scene_stage_effect_change', ['VALUE']], ['scene_stage_effect_get', []], ['scene_stage_effect_clear', []],
      ['scene_move', ['SPRITE', 'VALUE']], ['scene_turn', ['SPRITE', 'VALUE']], ['scene_go', ['SPRITE', 'X', 'Y']], ['scene_set', ['SPRITE', 'VALUE']],
      ['scene_visibility', ['SPRITE']], ['scene_costume_set', ['SPRITE', 'COSTUME']], ['scene_clone', ['SPRITE']], ['scene_destroy', ['SPRITE']],
      ['scene_glide', ['SPRITE', 'SECONDS', 'X', 'Y']], ['scene_animate', ['SPRITE', 'FRAMES', 'SECONDS']],
      ['scene_next_costume', ['SPRITE']], ['scene_frames', ['SPRITE']], ['scene_play_animation', ['SPRITE']],
      ['scene_change', ['SPRITE', 'VALUE']], ['scene_point', ['SPRITE', 'X', 'Y']],
      ['scene_bounce', ['SPRITE']], ['scene_rotation', ['SPRITE']], ['scene_layer', ['SPRITE']], ['scene_say', ['SPRITE', 'TEXT']], ['scene_say_for', ['SPRITE', 'TEXT', 'SECONDS']],
    ];
    return [
      { kind: 'block', type: 'scene_sprite', fields: { SPRITE_ID: target.primary } },
      { kind: 'block', type: 'scene_costume', fields: { COSTUME_ID: 'bird' } },
      ...specs.map(([type, names]) => ({ kind: 'block', type, inputs: Object.fromEntries(names.map(name => [name, defaults[name]])) })),
      { kind: 'block', type: 'scene_create', inputs: { COSTUME: cost } }, { kind: 'block', type: 'scene_lookup', inputs: { NAME: { shadow: { type: 'text', fields: { TEXT: scene.sprites[0]?.name ?? 'Sprite 1' } } } } },
      { kind: 'block', type: 'scene_backdrop', fields: { BACKDROP_ID: scene.backdrop ?? '' } }, { kind: 'block', type: 'scene_backdrop_set', inputs: { BACKDROP: { shadow: { type: 'scene_backdrop', fields: { BACKDROP_ID: 'backdrop_meadow' } } } } }, { kind: 'block', type: 'scene_backdrop_next' }, { kind: 'block', type: 'scene_backdrop_get' },
      { kind: 'block', type: 'scene_background', inputs: { COLOR: { shadow: { type: 'text', fields: { TEXT: '#edf2df' } } } } },
    ];
  };
  workspace.registerToolboxCategoryCallback('PY_SENSING', (): Blockly.utils.toolbox.FlyoutItemInfo[] => {
    const scene = sceneState(workspace), target = targets(scene);
    const values: Record<string, Blockly.serialization.blocks.ConnectionState> = {
      SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: target.primary } } },
      OTHER: { block: { type: 'scene_sprite', fields: { SPRITE_ID: target.other } } },
      X: numberInput(0), Y: numberInput(0), TOLERANCE: numberInput(10),
      COLOR: { shadow: { type: 'text', fields: { TEXT: '#e8b94f' } } }, OWN_COLOR: { shadow: { type: 'text', fields: { TEXT: '#478b94' } } },
      TEXT: { shadow: { type: 'text', fields: { TEXT: 'What is your name?' } } },
    };
    const specs: [string, string[]][] = [['scene_key', []], ['scene_pointer', []], ['scene_get', ['SPRITE']], ['scene_distance', ['SPRITE', 'X', 'Y']], ['scene_touching_point', ['SPRITE', 'X', 'Y']], ['scene_edge', ['SPRITE']], ['scene_overlaps', ['SPRITE', 'OTHER']], ['scene_pixels', ['SPRITE', 'OTHER']], ['scene_pixel_point', ['SPRITE', 'X', 'Y']],  ['scene_touching_color', ['SPRITE', 'COLOR', 'TOLERANCE']], ['scene_color_touching', ['SPRITE', 'OWN_COLOR', 'COLOR', 'TOLERANCE']], ['input_timer', []], ['input_timer_reset', []], ['input_ask', ['TEXT']], ['input_ask_value', ['TEXT']], ['input_answer', []], ['input_cancel_questions', []]];
    return specs.map(([type, names]) => ({ kind: 'block', type, inputs: Object.fromEntries(names.map(name => [name, values[name]])) }));
  });
  workspace.registerToolboxCategoryCallback('PY_WORLDS', (): Blockly.utils.toolbox.FlyoutItemInfo[] => {
    const state = sceneState(workspace), target = targets(state), values: Record<string, Blockly.serialization.blocks.ConnectionState> = {
      WORLD: { shadow: { type: 'scene_world', fields: { WORLD_ID: state.world ?? '' } } },
      SPRITE: { block: { type: 'scene_sprite', fields: { SPRITE_ID: target.primary } } },
      X: numberInput(0), Y: numberInput(0), COLUMN: numberInput(0), ROW: numberInput(0),
      COSTUME: { shadow: { type: 'scene_costume', fields: { COSTUME_ID: 'box' } } }, ENABLED: { shadow: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } },
    };
    const specs: [string, string[]][] = [
      ['scene_world_set', ['WORLD']], ['scene_world_restart', []], ['scene_world_get', []],
      ['scene_camera_go', ['X', 'Y']], ['scene_camera_follow', ['SPRITE']], ['scene_camera_clamp', ['ENABLED']], ['scene_camera_get', []], ['scene_map_get', []],
      ['scene_tile_get', ['COLUMN', 'ROW']], ['scene_tile_at', ['X', 'Y']], ['scene_tile_set', ['COLUMN', 'ROW', 'COSTUME', 'ENABLED']], ['scene_tile_wall', ['COLUMN', 'ROW', 'ENABLED']], ['scene_tiles_of', ['COSTUME']], ['scene_tile_place', ['SPRITE', 'COLUMN', 'ROW']],
    ];
    return [{ kind: 'block', type: 'scene_world', fields: { WORLD_ID: state.world ?? '' } }, ...specs.map(([type, names]) => ({ kind: 'block', type, inputs: Object.fromEntries(names.map(name => [name, values[name]])) }))];
  });

  const motion = new Set(['scene_move','scene_turn','scene_go','scene_set','scene_change','scene_point','scene_bounce','scene_rotation','scene_glide']);
  const looks = new Set(['scene_visibility','scene_costume','scene_costume_set','scene_animate','scene_next_costume','scene_frames','scene_play_animation','scene_layer','scene_say','scene_say_for','scene_background','scene_backdrop','scene_backdrop_set','scene_backdrop_next','scene_backdrop_get']);
  const family = (type: string) => motion.has(type) ? 'PY_MOTION' : looks.has(type) || type.startsWith('scene_effect') || type.startsWith('scene_stage_effect') ? 'PY_LOOKS' : type.startsWith('scene_pen') || type === 'scene_stamp' ? 'PY_PEN' : type.startsWith('scene_motion') || ['scene_control','scene_jump','scene_projectile','scene_fire'].includes(type) ? 'PY_PHYSICS' : 'PY_SPRITES';
  for (const group of ['PY_SPRITES','PY_MOTION','PY_LOOKS','PY_PEN','PY_PHYSICS']) workspace.registerToolboxCategoryCallback(group, () => sprites().filter(item => item.kind === 'block' && family((item as Blockly.utils.toolbox.BlockInfo).type ?? '') === group));
}
