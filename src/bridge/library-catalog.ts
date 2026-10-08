export type LibraryTarget = 'sprite' | 'pen' | '_pb_scene' | '_pb_sprites' | '_pb_inputs' | '_pb_game' | '_pb_sounds';
export type LibraryArgument = { input: string } | { field: string; boolean?: true } | { fixed: string | boolean | null };
export interface LibraryCall { type: string; target: LibraryTarget; method: string; args: LibraryArgument[]; value?: true; await?: true; fields?: Record<string, string> }
export interface LibraryProperty { type: string; target: LibraryTarget; property?: string; field?: string }
const input = (input: string): LibraryArgument => ({ input });
const field = (field: string, boolean?: true): LibraryArgument => ({ field, ...(boolean ? { boolean } : {}) });
const fixed = (fixed: string | boolean | null): LibraryArgument => ({ fixed });
const call = (type: string, target: LibraryTarget, method: string, args: (string | LibraryArgument)[] = [], value = false, awaited = false, fields?: Record<string, string>): LibraryCall => ({ type, target, method, args: args.map(a => typeof a === 'string' ? input(a) : a), ...(value ? { value: true } : {}), ...(awaited ? { await: true } : {}), ...(fields ? { fields } : {}) });

/** Every mapping describes one ordinary block, with argument order matching
 * the generated Python. Dropdown values are validated against the block itself. */
export const libraryCalls: LibraryCall[] = [
  call('pen_move', 'pen', 'move', ['STEPS']), call('pen_turn', 'pen', 'turn', ['DEGREES']), call('pen_color', 'pen', 'color', [field('COLOR')]),
  ...['up', 'down'].map(state => call('pen_lift', 'pen', state, [], false, false, { STATE: state })),
  call('input_timer_reset', '_pb_inputs', 'reset_timer'), call('input_cancel_questions', '_pb_inputs', 'cancel_questions'),
  call('input_ask', '_pb_inputs', 'ask', ['TEXT'], false, true), call('input_ask_value', '_pb_inputs', 'ask', ['TEXT'], true, true),
  call('scene_key', '_pb_inputs', 'key_down', [field('KEY')], true),
  call('sound_play', '_pb_sounds', 'play', ['SOUND', 'OWNER']), call('sound_wait', '_pb_sounds', 'play_wait', ['SOUND', 'OWNER'], false, true),
  call('sound_stop', '_pb_sounds', 'stop', ['OWNER']), call('sound_stop_all', '_pb_sounds', 'stop_all'), call('sound_clear', '_pb_sounds', 'clear_effects', ['OWNER']),
  call('sound_set', '_pb_sounds', 'set', [field('FIELD'), 'VALUE', 'OWNER']), call('sound_change', '_pb_sounds', 'change', [field('FIELD'), 'VALUE', 'OWNER']), call('sound_get', '_pb_sounds', 'get', [field('FIELD'), 'OWNER'], true),
  call('sound_tempo', '_pb_sounds', 'set_tempo', ['VALUE']), call('sound_note', '_pb_sounds', 'note', ['NOTE', 'BEATS', field('INSTRUMENT'), 'OWNER'], false, true), call('sound_rest', '_pb_sounds', 'rest', ['BEATS'], false, true),
  call('game_set', '_pb_game', 'set', [field('FIELD'), 'VALUE']), call('game_change', '_pb_game', 'change', [field('FIELD'), 'VALUE']), call('game_get', '_pb_game', 'get', [field('FIELD')], true),
  call('game_show', '_pb_game', 'show', [field('FIELD'), field('SHOW', true)]), call('game_message', '_pb_game', 'message', ['TEXT']), call('game_lives_rule', '_pb_game', 'lives_rule', [field('ACTION')]),
  call('game_countdown', '_pb_game', 'countdown', ['SECONDS', field('ACTION')]), call('game_countdown_stop', '_pb_game', 'stop_countdown'), call('game_finish', '_pb_game', 'finish', [field('WON', true), 'TEXT']),
  call('game_effect', '_pb_game', 'effect', [field('KIND'), 'SPRITE', 'SECONDS']), call('game_effect_clear', '_pb_game', 'clear_effects'),
  call('scene_lookup', '_pb_sprites', 'get', ['NAME'], true), call('scene_create', '_pb_sprites', 'create', ['COSTUME'], true), call('scene_of_kind', '_pb_sprites', 'of_kind', ['KIND'], true),
  call('scene_all', '_pb_sprites', 'all', [], true), call('scene_instances', '_pb_sprites', 'instances', ['SPRITE'], true),
  call('scene_background', '_pb_scene', 'background', ['COLOR']), call('scene_backdrop_set', '_pb_scene', 'set_backdrop', ['BACKDROP']), call('scene_backdrop_next', '_pb_scene', 'next_backdrop'),
  call('scene_world_set', '_pb_scene', 'switch_world', ['WORLD']), call('scene_world_restart', '_pb_scene', 'restart_world'),
  call('scene_camera_go', '_pb_scene', 'camera_go', ['X', 'Y']), call('scene_camera_follow', '_pb_scene', 'camera_follow', ['SPRITE']), call('scene_camera_clamp', '_pb_scene', 'camera_clamp', ['ENABLED']),
  call('scene_map_get', '_pb_scene', 'map_value', [field('PROPERTY')], true),
  call('scene_tile_get', '_pb_scene', 'tile_get', ['COLUMN', 'ROW'], true), call('scene_tile_at', '_pb_scene', 'tile_at', ['X', 'Y'], true),
  call('scene_tile_set', '_pb_scene', 'tile_set', ['COLUMN', 'ROW', 'COSTUME', 'ENABLED']), call('scene_tile_wall', '_pb_scene', 'tile_wall', ['COLUMN', 'ROW', 'ENABLED']),
  call('scene_tiles_of', '_pb_scene', 'tiles_of', ['COSTUME'], true), call('scene_tile_place', '_pb_scene', 'tile_place', ['SPRITE', 'COLUMN', 'ROW']), call('scene_pen_clear', '_pb_scene', 'clear_pen'),
  ...[false, true].flatMap(stage => {
    const target = stage ? '_pb_scene' : 'sprite', prefix = stage ? 'scene_stage_effect_' : 'scene_effect_';
    return [call(prefix + 'set', target, 'set_effect', [field('EFFECT'), 'VALUE']), call(prefix + 'change', target, 'change_effect', [field('EFFECT'), 'VALUE']), call(prefix + 'get', target, 'get_effect', [field('EFFECT')], true), call(prefix + 'clear', target, 'clear_effects')];
  }),
  call('scene_kind_set', 'sprite', 'set_kind', ['KIND']),
  ...['body', 'response', 'edges'].map(property => call('scene_motion_' + property, 'sprite', 'set_motion', [fixed(property), field('MODE')])),
  call('scene_motion_auto', 'sprite', 'set_motion', [fixed('autoDestroy'), field('ENABLED', true)]),
  call('scene_motion_set', 'sprite', 'set_motion', [field('PROPERTY'), 'VALUE']), call('scene_motion_change', 'sprite', 'change_motion', [field('PROPERTY'), 'VALUE']), call('scene_motion_get', 'sprite', 'motion_value', [field('PROPERTY')], true),
  call('scene_motion_stop', 'sprite', 'stop_motion'), call('scene_control', 'sprite', 'control', [field('SCHEME'), 'VX', 'VY']), call('scene_jump', 'sprite', 'jump', ['VALUE']),
  call('scene_projectile', 'sprite', 'projectile', ['COSTUME', 'VX', 'VY', 'SECONDS'], true), call('scene_fire', 'sprite', 'projectile', ['COSTUME', 'VX', 'VY', 'SECONDS']),
  call('scene_pixels', 'sprite', 'touching_pixels', ['OTHER'], true), call('scene_pixel_point', 'sprite', 'touching_pixel', ['X', 'Y'], true),
  call('scene_touching_color', 'sprite', 'touching_color', ['COLOR', fixed(null), 'TOLERANCE'], true), call('scene_color_touching', 'sprite', 'touching_color', ['COLOR', 'OWN_COLOR', 'TOLERANCE'], true),
  ...['pen_down', 'pen_up'].map(action => call('scene_pen_state', 'sprite', action, [], false, false, { ACTION: action })),
  call('scene_pen_color', 'sprite', 'set_pen', [fixed('color'), 'COLOR']), call('scene_pen_set', 'sprite', 'set_pen', [field('PROPERTY'), 'VALUE']), call('scene_pen_change', 'sprite', 'change_pen', [field('PROPERTY'), 'VALUE']), call('scene_pen_get', 'sprite', 'pen_value', [field('PROPERTY')], true),
  call('scene_move', 'sprite', 'move', ['VALUE']), call('scene_turn', 'sprite', 'turn', ['VALUE']), call('scene_go', 'sprite', 'go_to', ['X', 'Y']),
  call('scene_set', 'sprite', 'set', [field('PROPERTY'), 'VALUE']), call('scene_change', 'sprite', 'change', [field('PROPERTY'), 'VALUE']),
  call('scene_costume_set', 'sprite', 'costume', ['COSTUME']), call('scene_next_costume', 'sprite', 'next_costume'), call('scene_play_animation', 'sprite', 'play_animation', [], false, true),
  call('scene_destroy', 'sprite', 'destroy'), call('scene_clone', 'sprite', 'clone', [], true), call('scene_point', 'sprite', 'point_towards', ['X', 'Y']), call('scene_bounce', 'sprite', 'bounce'), call('scene_stamp', 'sprite', 'stamp'),
  call('scene_glide', 'sprite', 'glide', ['SECONDS', 'X', 'Y'], false, true), call('scene_animate', 'sprite', 'animate', ['FRAMES', 'SECONDS'], false, true),
  call('scene_rotation', 'sprite', 'rotation_style', [field('STYLE')]), call('scene_layer', 'sprite', 'to_layer', [field('PLACE')]),
  call('scene_distance', 'sprite', 'distance_to', ['X', 'Y'], true), call('scene_touching_point', 'sprite', 'touching_point', ['X', 'Y'], true), call('scene_edge', 'sprite', 'touching_edge', [field('EDGE')], true),
  call('scene_say', 'sprite', 'say', ['TEXT', field('STYLE')]), call('scene_say_for', 'sprite', 'say_for', ['TEXT', 'SECONDS', field('STYLE')], false, true),
  ...['show', 'hide'].map(action => call('scene_visibility', 'sprite', action, [], false, false, { ACTION: action })),
  call('scene_overlaps', 'sprite', 'overlaps', ['OTHER'], true),
];
export const libraryProperties: LibraryProperty[] = [
  { type: 'input_timer', target: '_pb_inputs', property: 'timer' }, { type: 'input_answer', target: '_pb_inputs', property: 'answer' },
  { type: 'sound_tempo_get', target: '_pb_sounds', property: 'tempo' }, { type: 'scene_self', target: '_pb_scene', property: 'current_sprite' },
  ...['scene_backdrop_get', 'scene_world_get', 'scene_camera_get'].map(type => ({ type, target: '_pb_scene' as const, field: 'PROPERTY' })),
  { type: 'scene_pointer', target: '_pb_inputs', field: 'PROPERTY' }, { type: 'scene_get', target: 'sprite', field: 'PROPERTY' },
  { type: 'scene_frames', target: 'sprite', property: 'frames' }, { type: 'scene_data', target: 'sprite', property: 'data' },
];
export const libraryBlockTypes = new Set([...libraryCalls.map(r => r.type), ...libraryProperties.map(r => r.type), 'scene_sprite', 'scene_costume', 'scene_backdrop', 'scene_world', 'sound_asset', 'scene_data_get', 'scene_data_set']);
