import { sceneState } from '../scene/state';
import { backdrops, builtinBackdrops, builtins, costumes, emptyScene, validKey, type SceneState } from '../scene/model';
import { loadWorkspace } from './serialization';
import * as Blockly from 'blockly/core';
import { pythonGenerator as standardGenerator, PythonGenerator, Order } from 'blockly/python';
import { allSymbols, enclosingFunction, enclosingLambda, eventNameError, isScopedDefinition, nameError, resolveSymbol, signatureOf, type FunctionBlock, type LambdaBlock } from './functions';
import { validateLambda, validateLambdaIdentities } from './lambdas';
import type { ExecutionMode } from '../runtime/protocol';
import { canonical, moduleKey, moduleState, reachableModules, resolveModuleCall, validateModuleState, type ModuleCallBlock, type ModuleDefinition, type ModulePin, type ModuleState } from './modules';
import { installPythonVariables } from './variables';

export const LANGUAGE_VERSION = 19;
const inputBlocks = new Set(['input_timer', 'input_timer_reset', 'input_ask', 'input_ask_value', 'input_answer', 'input_cancel_questions']);
const soundBlocks = new Set(['sound_asset', 'sound_play', 'sound_wait', 'sound_stop', 'sound_stop_all', 'sound_set', 'sound_change', 'sound_get', 'sound_clear', 'sound_tempo', 'sound_tempo_get', 'sound_note', 'sound_rest']);
const gameBlocks = new Set(['game_set', 'game_change', 'game_get', 'game_show', 'game_message', 'game_lives_rule', 'game_countdown', 'game_countdown_stop', 'game_finish', 'game_effect', 'game_effect_clear']);
const motionBlocks = new Set(['scene_camera_follow', 'scene_world_set', 'scene_world_restart', 'scene_motion_set', 'scene_motion_change', 'scene_motion_body', 'scene_motion_response', 'scene_motion_edges', 'scene_motion_auto', 'scene_control', 'scene_jump', 'scene_projectile', 'scene_fire']);
export const supportedBlocks = new Set([
  'scene_touching_color', 'scene_color_touching', ...inputBlocks, ...soundBlocks, ...gameBlocks,
  'scene_world', 'scene_world_set', 'scene_world_restart', 'scene_world_get', 'scene_camera_go', 'scene_camera_follow', 'scene_camera_clamp', 'scene_camera_get', 'scene_map_get', 'scene_tile_get', 'scene_tile_at', 'scene_tile_set', 'scene_tile_wall', 'scene_tiles_of', 'scene_tile_place',
  ...motionBlocks, 'scene_motion_get', 'scene_motion_stop', 'scene_kind_set', 'scene_of_kind',
  'scene_self', 'scene_data', 'scene_data_get', 'scene_data_set', 'scene_instances', 'scene_all', 'scene_pixels', 'scene_pixel_point',
  'scene_pen_state', 'scene_pen_color', 'scene_pen_set', 'scene_pen_change', 'scene_pen_get', 'scene_stamp', 'scene_pen_clear',
  'scene_effect_set', 'scene_effect_change', 'scene_effect_get', 'scene_effect_clear', 'scene_stage_effect_set', 'scene_stage_effect_change', 'scene_stage_effect_get', 'scene_stage_effect_clear',
  'scene_sprite', 'scene_costume', 'scene_lookup', 'scene_create', 'scene_move', 'scene_turn', 'scene_go', 'scene_set', 'scene_get', 'scene_visibility', 'scene_costume_set', 'scene_clone', 'scene_destroy', 'scene_overlaps', 'scene_glide', 'scene_animate', 'scene_key', 'scene_background',
  'scene_backdrop', 'scene_backdrop_set', 'scene_backdrop_next', 'scene_backdrop_get', 'scene_next_costume', 'scene_frames', 'scene_play_animation',
  'scene_change', 'scene_point', 'scene_distance', 'scene_touching_point', 'scene_edge', 'scene_bounce', 'scene_rotation', 'scene_layer', 'scene_say', 'scene_say_for', 'scene_pointer',
  'py_lambda',
  'py_function_ref', 'py_module_function_ref', 'py_dynamic_call', 'py_dynamic_call_value',
  'py_module_call', 'py_module_call_value',
  'py_handler', 'py_emit', 'py_wait',
  'lists_create_with', 'py_dict', 'py_length', 'py_item_get', 'py_item_set', 'py_item_delete', 'py_list_append', 'py_contains', 'py_dict_get', 'py_dict_keys', 'py_shallow_copy',
  'py_function', 'py_call', 'py_call_value', 'py_return', 'py_return_value', 'py_get', 'py_set', 'py_for_each', 'py_scoped_range',
  'py_program', 'py_number', 'py_binary', 'py_unary', 'py_logic', 'py_not', 'py_none', 'py_convert', 'py_range', 'py_flow',
  'pen_move', 'pen_turn', 'pen_color', 'pen_lift', 'controls_repeat_ext', 'controls_whileUntil', 'controls_if', 'controls_forEach',
  'logic_compare', 'logic_operation', 'logic_boolean', 'logic_negate', 'logic_null', 'math_number', 'math_arithmetic', 'math_random_int',
  'text', 'text_print', 'text_join', 'variables_get', 'variables_set',
  'procedures_defnoreturn', 'procedures_defreturn', 'procedures_callnoreturn', 'procedures_callreturn', 'procedures_ifreturn',
]);
export interface Diagnostic { code: string; severity: 'error' | 'warning'; message: string; blockId?: string; input?: string; module?: ModulePin & { name: string } }
export interface SourceSpan { file: string; startLine: number; endLine: number; blockId: string; module?: ModulePin & { name: string } }
export interface Compilation {
  source: string | null;
  diagnostics: Diagnostic[];
  sourceMap: SourceSpan[];
  revision: string;
  languageVersion: number;
  executionMode: ExecutionMode;
  hasEntry: boolean;
  files: Record<string, string>;
  moduleSources: Record<string, ModulePin & { name: string }>;
  requiresEvents: boolean;
  requiresScene?: boolean;
  requiresMotion?: boolean;
  requiresGame?: boolean;
  requiresSound?: boolean;
  requiresInput?: boolean;
  scene?: SceneState;
}
const isDefinition = (b: Blockly.Block) => isScopedDefinition(b) || b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn';
const loops = new Set(['controls_repeat_ext', 'controls_whileUntil', 'controls_forEach', 'py_range', 'py_scoped_range', 'py_for_each']);
const bindsSymbol = (b: Blockly.Block) => ['py_set', 'py_scoped_range', 'py_for_each'].includes(b.type);
let revision = 0;
export const isPythonNumber = (text: string) => /^[+-]?(?:(?:0+|[1-9][0-9]*)|(?:(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|[0-9]+[eE][+-]?[0-9]+))$/.test(text);

class Generator extends PythonGenerator {
  readonly marker = `# pb-map-${crypto.randomUUID()}:`;
  private markers = new Map<number, string>();
  private nextMarker = 0;

  override init(workspace: Blockly.Workspace) {
    super.init(workspace);
    delete this.definitions_['variables'];
    this.INDENT = '    ';
    this.PASS = `${this.INDENT}pass\n`;
  }

  // Encode strings independently of Blockly's line-continuation convention.
  override quote_(value: string) { return JSON.stringify(value); }
  usePen() { this.definitions_['import_pen'] = 'from playground import pen'; }
  useScene(name: 'sprites' | 'scene' | 'inputs' | 'game' | 'sounds') { this.definitions_[`import_${name}`] = `from playground import ${name} as _pb_${name}`; }
  useEvents() { this.definitions_['import_events'] = 'from playground import events'; }
  useModule(alias: string, file: string) { this.definitions_[`import_module_${alias}`] = `import ${file.slice(0, -3)} as ${alias}`; }
  defineFunction(name: string, source: string) { this.definitions_[`%${name}`] = source; }
  registerHandler(block: FunctionBlock) {
    const handler = block.signature.handler!;
    if (handler.kind) { this.useScene('scene'); return this.mark(block, `_pb_scene.on_kind(${this.quote_(handler.kind)}, ${this.quote_(handler.event)}, ${block.signature.name})\n`); }
    if (handler.sprite) { this.useScene('scene'); return this.mark(block, `_pb_scene.on(${this.quote_(handler.sprite)}, ${this.quote_(handler.event)}, ${block.signature.name})\n`); }
    return this.mark(block, `events.on(${this.quote_(handler.event)}, ${block.signature.name})\n`);
  }

  private mark(block: Blockly.Block, code: string) {
    const id = ++this.nextMarker;
    this.markers.set(id, block.id);
    return `${this.marker}${id}:start\n${code}${this.marker}${id}:end\n`;
  }

  trackStatements() {
    for (const [type, generate] of Object.entries(this.forBlock)) {
      this.forBlock[type] = (block, generator) => {
        const code = generate(block, generator);
        if (isDefinition(block)) {
          const key = `%${isScopedDefinition(block) ? block.getFieldValue('NAME') : this.getProcedureName(block.getFieldValue('NAME'))}`;
          if (this.definitions_[key]) this.definitions_[key] = this.mark(block, this.definitions_[key]);
        }
        return typeof code === 'string' && code && block.type !== 'py_program' ? this.mark(block, code) : code;
      };
    }
  }

  // Emission markers travel with generated fragments through indentation and
  // definition hoisting. They never appear in the preview or executed source.
  extractMap(code: string): { source: string; sourceMap: SourceSpan[] } {
    const lines: string[] = [];
    const stack: number[] = [];
    const sourceMap: SourceSpan[] = [];
    for (const line of code.split('\n')) {
      if (line.trim().startsWith(this.marker)) {
        const [idText, action] = line.trim().slice(this.marker.length).split(':');
        const id = Number(idText);
        if (!this.markers.has(id)) throw new Error('Unknown source-map marker.');
        if (action === 'start') stack.push(id);
        else if (action !== 'end' || stack.pop() !== id) throw new Error('Unbalanced source-map markers.');
        continue;
      }
      if (!lines.length && !line.trim()) continue;
      lines.push(line);
      const blockId = this.markers.get(stack.at(-1)!);
      if (blockId && line.trim()) {
        const last = sourceMap.at(-1);
        if (last?.blockId === blockId && last.endLine === lines.length - 1) last.endLine = lines.length;
        else sourceMap.push({ file: 'program.py', startLine: lines.length, endLine: lines.length, blockId });
      }
    }
    if (stack.length) throw new Error('Unclosed source-map marker.');
    return { source: lines.join('\n'), sourceMap };
  }
}

function generator() {
  const g = new Generator();
  Object.assign(g.forBlock, standardGenerator.forBlock);
  g.addReservedWords('pen,playground');
  const v = (b: Blockly.Block, gen: Generator, name: string) => gen.valueToCode(b, name, Order.NONE);
  const sprite = (b: Blockly.Block, gen: Generator) => `(${v(b, gen, 'SPRITE')})`;
  for (const type of ['input_timer', 'input_answer']) g.forBlock[type] = (_b, gen) => { gen.useScene('inputs'); return [`_pb_inputs.${type === 'input_timer' ? 'timer' : 'answer'}`, Order.MEMBER]; };
  for (const [type, method] of [['input_timer_reset', 'reset_timer'], ['input_cancel_questions', 'cancel_questions']]) g.forBlock[type] = (_b, gen) => { gen.useScene('inputs'); return `_pb_inputs.${method}()\n`; };
  for (const type of ['input_ask', 'input_ask_value']) g.forBlock[type] = (b, gen) => { gen.useScene('inputs'); const code = `await _pb_inputs.ask(${v(b, gen, 'TEXT')})`; return type === 'input_ask_value' ? [`(${code})`, Order.ATOMIC] : code + '\n'; };
  for (const type of ['scene_touching_color', 'scene_color_touching']) g.forBlock[type] = (b, gen) => [`${sprite(b, gen)}.touching_color(${v(b, gen, 'COLOR')}, ${type === 'scene_color_touching' ? v(b, gen, 'OWN_COLOR') : 'None'}, ${v(b, gen, 'TOLERANCE')})`, Order.FUNCTION_CALL];
  g.forBlock['sound_asset'] = (b, gen) => [gen.quote_(b.getFieldValue('SOUND_ID')), Order.ATOMIC];
  for (const [type, method, args] of [
    ['sound_play', 'play', ['SOUND', 'OWNER']], ['sound_wait', 'play_wait', ['SOUND', 'OWNER']],
    ['sound_stop', 'stop', ['OWNER']], ['sound_stop_all', 'stop_all', []], ['sound_clear', 'clear_effects', ['OWNER']],
    ['sound_tempo', 'set_tempo', ['VALUE']], ['sound_rest', 'rest', ['BEATS']],
  ] as const) g.forBlock[type] = (b, gen) => { gen.useScene('sounds'); return `${['sound_wait', 'sound_rest'].includes(type) ? 'await ' : ''}_pb_sounds.${method}(${args.map(a => v(b, gen, a)).join(', ')})\n`; };
  for (const type of ['sound_set', 'sound_change', 'sound_get']) g.forBlock[type] = (b, gen) => {
    gen.useScene('sounds'); const code = `_pb_sounds.${type.slice(6)}(${gen.quote_(b.getFieldValue('FIELD'))}, ${type === 'sound_get' ? '' : v(b, gen, 'VALUE') + ', '}${v(b, gen, 'OWNER')})`;
    return type === 'sound_get' ? [code, Order.FUNCTION_CALL] : code + '\n';
  };
  g.forBlock['sound_tempo_get'] = (_b, gen) => { gen.useScene('sounds'); return ['_pb_sounds.tempo', Order.MEMBER]; };
  g.forBlock['sound_note'] = (b, gen) => { gen.useScene('sounds'); return `await _pb_sounds.note(${v(b, gen, 'NOTE')}, ${v(b, gen, 'BEATS')}, ${gen.quote_(b.getFieldValue('INSTRUMENT'))}, ${v(b, gen, 'OWNER')})\n`; };
  for (const type of ['game_set', 'game_change']) g.forBlock[type] = (b, gen) => { gen.useScene('game'); return `_pb_game.${type === 'game_set' ? 'set' : 'change'}(${gen.quote_(b.getFieldValue('FIELD'))}, ${v(b, gen, 'VALUE')})\n`; };
  g.forBlock['game_get'] = (b, gen) => { gen.useScene('game'); return [`_pb_game.get(${gen.quote_(b.getFieldValue('FIELD'))})`, Order.FUNCTION_CALL]; };
  g.forBlock['game_show'] = (b, gen) => { gen.useScene('game'); return `_pb_game.show(${gen.quote_(b.getFieldValue('FIELD'))}, ${b.getFieldValue('SHOW') === 'TRUE' ? 'True' : 'False'})\n`; };
  g.forBlock['game_message'] = (b, gen) => { gen.useScene('game'); return `_pb_game.message(${v(b, gen, 'TEXT')})\n`; };
  g.forBlock['game_lives_rule'] = (b, gen) => { gen.useScene('game'); return `_pb_game.lives_rule(${gen.quote_(b.getFieldValue('ACTION'))})\n`; };
  g.forBlock['game_countdown'] = (b, gen) => { gen.useScene('game'); return `_pb_game.countdown(${v(b, gen, 'SECONDS')}, ${gen.quote_(b.getFieldValue('ACTION'))})\n`; };
  g.forBlock['game_countdown_stop'] = (_b, gen) => { gen.useScene('game'); return '_pb_game.stop_countdown()\n'; };
  g.forBlock['game_finish'] = (b, gen) => { gen.useScene('game'); return `_pb_game.finish(${b.getFieldValue('WON') === 'TRUE' ? 'True' : 'False'}, ${v(b, gen, 'TEXT')})\n`; };
  g.forBlock['game_effect'] = (b, gen) => { gen.useScene('game'); return `_pb_game.effect(${gen.quote_(b.getFieldValue('KIND'))}, ${v(b, gen, 'SPRITE')}, ${v(b, gen, 'SECONDS')})\n`; };
  g.forBlock['game_effect_clear'] = (_b, gen) => { gen.useScene('game'); return '_pb_game.clear_effects()\n'; };
  g.forBlock['scene_sprite'] = (b, gen) => { gen.useScene('sprites'); return [`_pb_sprites.named(${gen.quote_(sceneState(b.workspace).sprites.find(s => s.id === b.getFieldValue('SPRITE_ID'))!.name)})`, Order.FUNCTION_CALL]; };
  g.forBlock['scene_costume'] = (b, gen) => [gen.quote_(b.getFieldValue('COSTUME_ID')), Order.ATOMIC];
  g.forBlock['scene_backdrop'] = (b, gen) => [b.getFieldValue('BACKDROP_ID') ? gen.quote_(b.getFieldValue('BACKDROP_ID')) : 'None', Order.ATOMIC];
  g.forBlock['scene_backdrop_set'] = (b, gen) => { gen.useScene('scene'); return `_pb_scene.set_backdrop(${v(b, gen, 'BACKDROP')})\n`; };
  g.forBlock['scene_backdrop_next'] = (_b, gen) => { gen.useScene('scene'); return '_pb_scene.next_backdrop()\n'; };
  g.forBlock['scene_backdrop_get'] = (b, gen) => { gen.useScene('scene'); return [`_pb_scene.${b.getFieldValue('PROPERTY')}`, Order.MEMBER]; };
  g.forBlock['scene_frames'] = (b, gen) => [`${sprite(b, gen)}.frames`, Order.MEMBER];
  g.forBlock['scene_kind_set'] = (b, gen) => `${sprite(b, gen)}.set_kind(${v(b, gen, 'KIND')})\n`;
  g.forBlock['scene_of_kind'] = (b, gen) => { gen.useScene('sprites'); return [`_pb_sprites.of_kind(${v(b, gen, 'KIND')})`, Order.FUNCTION_CALL]; };
  for (const [type, action] of [['scene_motion_set', 'set_motion'], ['scene_motion_change', 'change_motion']]) g.forBlock[type] = (b, gen) => `${sprite(b, gen)}.${action}(${gen.quote_(b.getFieldValue('PROPERTY'))}, ${v(b, gen, 'VALUE')})\n`;
  g.forBlock['scene_motion_get'] = (b, gen) => [`${sprite(b, gen)}.motion_value(${gen.quote_(b.getFieldValue('PROPERTY'))})`, Order.FUNCTION_CALL];
  for (const key of ['body', 'response', 'edges']) g.forBlock['scene_motion_' + key] = (b, gen) => `${sprite(b, gen)}.set_motion(${gen.quote_(key)}, ${gen.quote_(b.getFieldValue('MODE'))})\n`;
  g.forBlock['scene_motion_auto'] = (b, gen) => `${sprite(b, gen)}.set_motion("autoDestroy", ${b.getFieldValue('ENABLED') === 'TRUE' ? 'True' : 'False'})\n`;
  g.forBlock['scene_motion_stop'] = (b, gen) => `${sprite(b, gen)}.stop_motion()\n`;
  g.forBlock['scene_control'] = (b, gen) => `${sprite(b, gen)}.control(${gen.quote_(b.getFieldValue('SCHEME'))}, ${v(b, gen, 'VX')}, ${v(b, gen, 'VY')})\n`;
  g.forBlock['scene_jump'] = (b, gen) => `${sprite(b, gen)}.jump(${v(b, gen, 'VALUE')})\n`;
  for (const type of ['scene_projectile', 'scene_fire']) g.forBlock[type] = (b, gen) => { const code = `${sprite(b, gen)}.projectile(${v(b, gen, 'COSTUME')}, ${v(b, gen, 'VX')}, ${v(b, gen, 'VY')}, ${v(b, gen, 'SECONDS')})`; return type === 'scene_projectile' ? [code, Order.FUNCTION_CALL] : code + '\n'; };
  g.forBlock['scene_world'] = (b, gen) => [b.getFieldValue('WORLD_ID') ? gen.quote_(b.getFieldValue('WORLD_ID')) : 'None', Order.ATOMIC];
  for (const [type, method, args, output] of [
    ['scene_world_set', 'switch_world', ['WORLD'], false], ['scene_world_restart', 'restart_world', [], false],
    ['scene_camera_go', 'camera_go', ['X', 'Y'], false], ['scene_camera_follow', 'camera_follow', ['SPRITE'], false], ['scene_camera_clamp', 'camera_clamp', ['ENABLED'], false],
    ['scene_tile_get', 'tile_get', ['COLUMN', 'ROW'], true], ['scene_tile_at', 'tile_at', ['X', 'Y'], true], ['scene_tile_set', 'tile_set', ['COLUMN', 'ROW', 'COSTUME', 'ENABLED'], false], ['scene_tile_wall', 'tile_wall', ['COLUMN', 'ROW', 'ENABLED'], false], ['scene_tiles_of', 'tiles_of', ['COSTUME'], true], ['scene_tile_place', 'tile_place', ['SPRITE', 'COLUMN', 'ROW'], false],
  ] as const) g.forBlock[type] = (b, gen) => { gen.useScene('scene'); const code = `_pb_scene.${method}(${args.map(a => v(b, gen, a)).join(', ')})`; return output ? [code, Order.FUNCTION_CALL] : code + '\n'; };
  for (const type of ['scene_world_get', 'scene_camera_get']) g.forBlock[type] = (b, gen) => { gen.useScene('scene'); return [`_pb_scene.${b.getFieldValue('PROPERTY')}`, Order.MEMBER]; };
  g.forBlock['scene_map_get'] = (b, gen) => { gen.useScene('scene'); return [`_pb_scene.map_value(${gen.quote_(b.getFieldValue('PROPERTY'))})`, Order.FUNCTION_CALL]; };
  g.forBlock['scene_self'] = (_b, gen) => { gen.useScene('scene'); return ['_pb_scene.current_sprite', Order.MEMBER]; };
  g.forBlock['scene_data'] = (b, gen) => [`${sprite(b, gen)}.data`, Order.MEMBER];
  g.forBlock['scene_data_get'] = (b, gen) => [`${sprite(b, gen)}.data[${v(b, gen, 'KEY')}]`, Order.MEMBER];
  g.forBlock['scene_data_set'] = (b, gen) => `${sprite(b, gen)}.data[${v(b, gen, 'KEY')}] = ${v(b, gen, 'VALUE')}\n`;
  g.forBlock['scene_all'] = (_b, gen) => { gen.useScene('sprites'); return ['_pb_sprites.all()', Order.FUNCTION_CALL]; };
  g.forBlock['scene_instances'] = (b, gen) => { gen.useScene('sprites'); return [`_pb_sprites.instances(${v(b, gen, 'SPRITE')})`, Order.FUNCTION_CALL]; };
  g.forBlock['scene_pixels'] = (b, gen) => [`${sprite(b, gen)}.touching_pixels(${v(b, gen, 'OTHER')})`, Order.FUNCTION_CALL];
  g.forBlock['scene_pixel_point'] = (b, gen) => [`${sprite(b, gen)}.touching_pixel(${v(b, gen, 'X')}, ${v(b, gen, 'Y')})`, Order.FUNCTION_CALL];
  g.forBlock['scene_pen_state'] = (b, gen) => `${sprite(b, gen)}.${b.getFieldValue('ACTION')}()\n`;
  g.forBlock['scene_pen_color'] = (b, gen) => `${sprite(b, gen)}.set_pen("color", ${v(b, gen, 'COLOR')})\n`;
  for (const [type, method] of [['scene_pen_set', 'set_pen'], ['scene_pen_change', 'change_pen']]) g.forBlock[type] = (b, gen) => `${sprite(b, gen)}.${method}(${gen.quote_(b.getFieldValue('PROPERTY'))}, ${v(b, gen, 'VALUE')})\n`;
  g.forBlock['scene_pen_get'] = (b, gen) => [`${sprite(b, gen)}.pen_value(${gen.quote_(b.getFieldValue('PROPERTY'))})`, Order.FUNCTION_CALL];
  g.forBlock['scene_pen_clear'] = (_b, gen) => { gen.useScene('scene'); return '_pb_scene.clear_pen()\n'; };
  for (const stage of [false, true]) {
    const target = (b: Blockly.Block, gen: Generator) => { if (stage) { gen.useScene('scene'); return '_pb_scene'; } return sprite(b, gen); };
    const prefix = stage ? 'scene_stage_effect_' : 'scene_effect_';
    for (const action of ['set', 'change']) g.forBlock[prefix + action] = (b, gen) => `${target(b, gen)}.${action}_effect(${gen.quote_(b.getFieldValue('EFFECT'))}, ${v(b, gen, 'VALUE')})\n`;
    g.forBlock[prefix + 'get'] = (b, gen) => [`${target(b, gen)}.get_effect(${gen.quote_(b.getFieldValue('EFFECT'))})`, Order.FUNCTION_CALL];
    g.forBlock[prefix + 'clear'] = (b, gen) => `${target(b, gen)}.clear_effects()\n`;
  }
  g.forBlock['scene_lookup'] = (b, gen) => { gen.useScene('sprites'); return [`_pb_sprites.get(${v(b, gen, 'NAME')})`, Order.FUNCTION_CALL]; };
  g.forBlock['scene_create'] = (b, gen) => { gen.useScene('sprites'); return [`_pb_sprites.create(${v(b, gen, 'COSTUME')})`, Order.FUNCTION_CALL]; };
  for (const [type, method, args] of [
    ['scene_move', 'move', ['VALUE']], ['scene_turn', 'turn', ['VALUE']], ['scene_go', 'go_to', ['X', 'Y']],
    ['scene_costume_set', 'costume', ['COSTUME']], ['scene_next_costume', 'next_costume', []], ['scene_play_animation', 'play_animation', []], ['scene_destroy', 'destroy', []],
    ['scene_point', 'point_towards', ['X', 'Y']], ['scene_bounce', 'bounce', []], ['scene_stamp', 'stamp', []],
    ['scene_glide', 'glide', ['SECONDS', 'X', 'Y']], ['scene_animate', 'animate', ['FRAMES', 'SECONDS']],
  ] as const) g.forBlock[type] = (b, gen) => `${['scene_glide', 'scene_animate', 'scene_play_animation'].includes(type) ? 'await ' : ''}${sprite(b, gen)}.${method}(${args.map(a => v(b, gen, a)).join(', ')})\n`;
  g.forBlock['scene_set'] = (b, gen) => `${sprite(b, gen)}.set(${gen.quote_(b.getFieldValue('PROPERTY'))}, ${v(b, gen, 'VALUE')})\n`;
  g.forBlock['scene_change'] = (b, gen) => `${sprite(b, gen)}.change(${gen.quote_(b.getFieldValue('PROPERTY'))}, ${v(b, gen, 'VALUE')})\n`;
  g.forBlock['scene_rotation'] = (b, gen) => `${sprite(b, gen)}.rotation_style(${gen.quote_(b.getFieldValue('STYLE'))})\n`;
  g.forBlock['scene_layer'] = (b, gen) => `${sprite(b, gen)}.to_layer(${gen.quote_(b.getFieldValue('PLACE'))})\n`;
  for (const [type, method] of [['scene_distance', 'distance_to'], ['scene_touching_point', 'touching_point']]) g.forBlock[type] = (b, gen) => [`${sprite(b, gen)}.${method}(${v(b, gen, 'X')}, ${v(b, gen, 'Y')})`, Order.FUNCTION_CALL];
  g.forBlock['scene_edge'] = (b, gen) => [`${sprite(b, gen)}.touching_edge(${gen.quote_(b.getFieldValue('EDGE'))})`, Order.FUNCTION_CALL];
  g.forBlock['scene_say'] = (b, gen) => `${sprite(b, gen)}.say(${v(b, gen, 'TEXT')}, ${gen.quote_(b.getFieldValue('STYLE'))})\n`;
  g.forBlock['scene_say_for'] = (b, gen) => `await ${sprite(b, gen)}.say_for(${v(b, gen, 'TEXT')}, ${v(b, gen, 'SECONDS')}, ${gen.quote_(b.getFieldValue('STYLE'))})\n`;
  g.forBlock['scene_pointer'] = (b, gen) => { gen.useScene('inputs'); return [`_pb_inputs.${b.getFieldValue('PROPERTY')}`, Order.MEMBER]; };
  g.forBlock['scene_get'] = (b, gen) => [`${sprite(b, gen)}.${b.getFieldValue('PROPERTY')}`, Order.MEMBER];
  g.forBlock['scene_visibility'] = (b, gen) => `${sprite(b, gen)}.${b.getFieldValue('ACTION')}()\n`;
  g.forBlock['scene_clone'] = (b, gen) => [`${sprite(b, gen)}.clone()`, Order.FUNCTION_CALL];
  g.forBlock['scene_overlaps'] = (b, gen) => [`${sprite(b, gen)}.overlaps(${v(b, gen, 'OTHER')})`, Order.FUNCTION_CALL];
  g.forBlock['scene_key'] = (b, gen) => { gen.useScene('inputs'); return [`_pb_inputs.key_down(${gen.quote_(b.getFieldValue('KEY'))})`, Order.FUNCTION_CALL]; };
  g.forBlock['scene_background'] = (b, gen) => { gen.useScene('scene'); return `_pb_scene.background(${v(b, gen, 'COLOR')})\n`; };
  g.forBlock['py_emit'] = (b, gen) => { gen.useEvents(); return `events.emit(${gen.valueToCode(b, 'EVENT', Order.NONE)}, ${gen.valueToCode(b, 'PAYLOAD', Order.NONE)})\n`; };
  g.forBlock['py_wait'] = (b, gen) => { gen.useEvents(); return `await events.wait(${gen.valueToCode(b, 'SECONDS', Order.NONE)})\n`; };
  g.forBlock['lists_create_with'] = (b, gen) => [`[${b.inputList.filter(i => i.name.startsWith('ADD')).map(i => gen.valueToCode(b, i.name, Order.NONE)).join(', ')}]`, Order.ATOMIC];
  g.forBlock['py_dict'] = (b, gen) => [`{${b.inputList.filter(i => i.name.startsWith('KEY')).map(i => `${gen.valueToCode(b, i.name, Order.NONE)}: ${gen.valueToCode(b, i.name.replace('KEY', 'VALUE'), Order.NONE)}`).join(', ')}}`, Order.ATOMIC];
  g.forBlock['py_length'] = (b, gen) => [`len(${gen.valueToCode(b, 'VALUE', Order.NONE)})`, Order.FUNCTION_CALL];
  const indexed = (b: Blockly.Block, gen: Generator) => `(${gen.valueToCode(b, 'COLLECTION', Order.NONE)})[${gen.valueToCode(b, 'KEY', Order.NONE)}]`;
  g.forBlock['py_item_get'] = (b, gen) => [indexed(b, gen), Order.MEMBER];
  g.forBlock['py_item_set'] = (b, gen) => `${indexed(b, gen)} = ${gen.valueToCode(b, 'VALUE', Order.NONE)}\n`;
  g.forBlock['py_item_delete'] = (b, gen) => `del ${indexed(b, gen)}\n`;
  g.forBlock['py_list_append'] = (b, gen) => `(${gen.valueToCode(b, 'LIST', Order.NONE)}).append(${gen.valueToCode(b, 'VALUE', Order.NONE)})\n`;
  g.forBlock['py_contains'] = (b, gen) => [`(${gen.valueToCode(b, 'ITEM', Order.NONE)}) ${b.getFieldValue('OP')} (${gen.valueToCode(b, 'COLLECTION', Order.NONE)})`, Order.RELATIONAL];
  g.forBlock['py_dict_get'] = (b, gen) => [`(${gen.valueToCode(b, 'DICT', Order.NONE)}).get(${gen.valueToCode(b, 'KEY', Order.NONE)}, ${gen.valueToCode(b, 'DEFAULT', Order.NONE)})`, Order.FUNCTION_CALL];
  g.forBlock['py_dict_keys'] = (b, gen) => [`(${gen.valueToCode(b, 'DICT', Order.NONE)}).keys()`, Order.FUNCTION_CALL];
  g.forBlock['py_shallow_copy'] = (b, gen) => [`(${gen.valueToCode(b, 'VALUE', Order.NONE)}).copy()`, Order.FUNCTION_CALL];
  g.forBlock['py_get'] = b => [resolveSymbol(b, b.getFieldValue('SYMBOL'))!.name, Order.ATOMIC];
  g.forBlock['py_set'] = (b, gen) => `${resolveSymbol(b, b.getFieldValue('SYMBOL'))!.name} = ${gen.valueToCode(b, 'VALUE', Order.NONE)}\n`;
  g.forBlock['py_scoped_range'] = (b, gen) => `for ${resolveSymbol(b, b.getFieldValue('SYMBOL'))!.name} in range(${['START', 'STOP', 'STEP'].map(input => gen.valueToCode(b, input, Order.NONE)).join(', ')}):\n${gen.statementToCode(b, 'DO') || gen.PASS}`;
  g.forBlock['py_for_each'] = (b, gen) => `for ${resolveSymbol(b, b.getFieldValue('SYMBOL'))!.name} in ${gen.valueToCode(b, 'ITERABLE', Order.NONE)}:\n${gen.statementToCode(b, 'DO') || gen.PASS}`;
  g.forBlock['py_function'] = (block, gen) => {
    const b = block as FunctionBlock; const model = b.getProcedureModel()!;
    const signature = signatureOf(model);
    if (signature.handler) gen.useEvents();
    const globals = [...new Set(activeBlocks(b).filter(bindsSymbol).map(b => resolveSymbol(b, b.getFieldValue('SYMBOL'))!).filter(s => s.kind === 'project').map(s => s.name))].sort();
    const body = gen.statementToCode(b, 'BODY');
    gen.defineFunction(model.getName(), `${signature.async ? 'async ' : ''}def ${model.getName()}(${model.getParameters().map(p => p.getName()).join(', ')}):\n${globals.length ? `${gen.INDENT}global ${globals.join(', ')}\n` : ''}${body || gen.PASS}`);
    return '';
  };
  g.forBlock['py_handler'] = g.forBlock['py_function'];
  const call = (block: Blockly.Block, gen: Generator) => {
    const model = (block as FunctionBlock).getProcedureModel()!;
    return `${signatureOf(model).async ? 'await ' : ''}${model.getName()}(${model.getParameters().map(p => gen.valueToCode(block, `ARG_${p.getId()}`, Order.NONE)).join(', ')})`;
  };
  g.forBlock['py_call'] = (b, gen) => `${call(b, gen)}\n`;
  g.forBlock['py_call_value'] = (b, gen) => signatureOf((b as FunctionBlock).getProcedureModel()!).async ? [`(${call(b, gen)})`, Order.ATOMIC] : [call(b, gen), Order.FUNCTION_CALL];
  g.forBlock['py_function_ref'] = b => [(b as FunctionBlock).getProcedureModel()!.getName(), Order.ATOMIC];
  g.forBlock['py_lambda'] = (b, gen) => {
    const parameters = (b as LambdaBlock).lambda.parameters.map(p => p.name).join(', ');
    return [`(lambda${parameters ? ` ${parameters}` : ''}: ${gen.valueToCode(b, 'BODY', Order.NONE)})`, Order.ATOMIC];
  };
  const dynamicCall = (b: Blockly.Block, gen: Generator) => `(${gen.valueToCode(b, 'CALLABLE', Order.NONE)})(${b.inputList.filter(i => /^ARG\d+$/.test(i.name)).map(i => gen.valueToCode(b, i.name, Order.NONE)).join(', ')})`;
  g.forBlock['py_dynamic_call'] = (b, gen) => `${dynamicCall(b, gen)}\n`;
  g.forBlock['py_dynamic_call_value'] = (b, gen) => [dynamicCall(b, gen), Order.FUNCTION_CALL];
  const moduleCall = (block: Blockly.Block, gen: Generator) => {
    const target = resolveModuleCall(block.workspace, (block as ModuleCallBlock).moduleCall)!;
    return `${target.signature.async ? 'await ' : ''}${target.binding.alias}.${target.signature.name}(${target.signature.parameters.map(p => gen.valueToCode(block, `ARG_${p.id}`, Order.NONE)).join(', ')})`;
  };
  g.forBlock['py_module_call'] = (b, gen) => `${moduleCall(b, gen)}\n`;
  g.forBlock['py_module_call_value'] = (b, gen) => (b as ModuleCallBlock).moduleCall.signature.async ? [`(${moduleCall(b, gen)})`, Order.ATOMIC] : [moduleCall(b, gen), Order.FUNCTION_CALL];
  g.forBlock['py_module_function_ref'] = b => {
    const target = resolveModuleCall(b.workspace, (b as ModuleCallBlock).moduleCall)!;
    return [`${target.binding.alias}.${target.signature.name}`, Order.MEMBER];
  };
  g.forBlock['py_return'] = () => 'return\n';
  g.forBlock['py_return_value'] = (b, gen) => `return ${gen.valueToCode(b, 'VALUE', Order.NONE)}\n`;
  g.forBlock['py_program'] = (b, gen) => gen.blockToCode(b.getInputTargetBlock('BODY')) as string;
  g.forBlock['py_number'] = b => [b.getFieldValue('VALUE'), /^[+-]/.test(b.getFieldValue('VALUE')) ? Order.UNARY_SIGN : Order.ATOMIC];
  g.forBlock['py_unary'] = (b, gen) => [`${b.getFieldValue('OP')}(${gen.valueToCode(b, 'VALUE', Order.NONE)})`, Order.UNARY_SIGN];
  g.forBlock['py_none'] = () => ['None', Order.ATOMIC];
  g.forBlock['py_convert'] = (b, gen) => [`${b.getFieldValue('TYPE')}(${gen.valueToCode(b, 'VALUE', Order.NONE)})`, Order.FUNCTION_CALL];
  // Parenthesizing each operand preserves grouping, including exponentiation
  // and non-associative subtraction, without evaluating an operand twice.
  g.forBlock['py_binary'] = (b, gen) => [`(${gen.valueToCode(b, 'A', Order.NONE)}) ${b.getFieldValue('OP')} (${gen.valueToCode(b, 'B', Order.NONE)})`, Order.NONE];
  g.forBlock['py_logic'] = g.forBlock['py_binary'];
  g.forBlock['py_not'] = (b, gen) => [`not (${gen.valueToCode(b, 'VALUE', Order.NONE)})`, Order.LOGICAL_NOT];
  g.forBlock['py_flow'] = b => `${b.getFieldValue('FLOW')}\n`;
  g.forBlock['py_range'] = (b, gen) => `for ${gen.getVariableName(b.getFieldValue('VAR'))} in range(${['START', 'STOP', 'STEP'].map(name => gen.valueToCode(b, name, Order.NONE)).join(', ')}):\n${gen.statementToCode(b, 'DO') || gen.PASS}`;
  g.forBlock['controls_repeat_ext'] = (b, gen) => {
    const name = gen.nameDB_!.getDistinctName('_pb_repeat', Blockly.Names.NameType.VARIABLE);
    return `for ${name} in range(${gen.valueToCode(b, 'TIMES', Order.NONE)}):\n${gen.statementToCode(b, 'DO') || gen.PASS}`;
  };
  for (const [type, method, input] of [['pen_move', 'move', 'STEPS'], ['pen_turn', 'turn', 'DEGREES']]) {
    g.forBlock[type] = (b, gen) => { gen.usePen(); return `pen.${method}(${gen.valueToCode(b, input, Order.NONE)})\n`; };
  }
  g.forBlock['pen_color'] = (b, gen) => { gen.usePen(); return `pen.color(${gen.quote_(b.getFieldValue('COLOR'))})\n`; };
  g.forBlock['pen_lift'] = (b, gen) => { gen.usePen(); return `pen.${b.getFieldValue('STATE')}()\n`; };
  g.trackStatements();
  return g;
}

function activeBlocks(root: Blockly.Block): Blockly.Block[] {
  const found: Blockly.Block[] = [];
  function visit(block: Blockly.Block | null) {
    if (!block) return;
    if (block.isEnabled()) {
      found.push(block);
      for (const input of block.inputList) visit(input.connection?.targetBlock() ?? null);
    }
    visit(block.getNextBlock());
  }
  visit(root);
  return found;
}

interface UnitOptions { inputEnabled?: boolean; soundEnabled?: boolean; motionEnabled?: boolean; gameEnabled?: boolean; file?: string; module?: boolean; moduleFiles?: Map<string, string> }
export function compileUnit(workspace: Blockly.Workspace, options: UnitOptions = {}): Compilation {
  workspace.options.oneBasedIndex = false;
  const result: Compilation = { source: null, diagnostics: [], sourceMap: [], revision: `compile-${++revision}`, languageVersion: LANGUAGE_VERSION, executionMode: 'sequential', hasEntry: false, files: {}, moduleSources: {}, requiresEvents: false };
  const report = (code: string, message: string, block?: Blockly.Block, severity: Diagnostic['severity'] = 'error', input?: string) => result.diagnostics.push({ code, message, severity, blockId: block?.id, input });
  const roots = workspace.getTopBlocks(false).filter(b => b.isEnabled());
  const entries = roots.filter(b => b.type === 'py_program');
  const handlers = roots.filter(b => b.type === 'py_handler') as FunctionBlock[];
  result.executionMode = handlers.length ? 'events' : 'sequential';
  result.hasEntry = entries.length === 1 || handlers.length > 0;
  if (entries.length > 1) report('multiple-programs', 'Keep one Program block. Connect startup actions inside it.', entries[1]);
  if (!result.hasEntry && !options.module) report('no-entry', 'Add a Program block or an event handler to run this project.', undefined, 'warning');
  const definitions = roots.filter(isDefinition).sort((a, b) => String(a.getFieldValue('NAME')).localeCompare(String(b.getFieldValue('NAME'))));
  for (const root of roots) if (!entries.includes(root) && !definitions.includes(root)) report('inactive-draft', 'This loose block is a draft. Connect it inside Program or a function to run it.', root, 'warning');
  const active = [...entries, ...definitions].flatMap(activeBlocks);
  const functions = definitions.filter(isScopedDefinition) as FunctionBlock[];
  const symbols = allSymbols(workspace);
  const imports = moduleState(workspace).imports;
  const scene = sceneState(workspace);
  result.requiresMotion = !!scene.worlds?.length || !!scene.camera?.follow || options.motionEnabled || active.some(b => motionBlocks.has(b.type)) || scene.sprites.some(s => s.motion && (s.motion.body && s.motion.body !== 'off' || (s.motion.lifetime ?? 0) > 0));
  result.requiresInput = !!options.inputEnabled || active.some(b => inputBlocks.has(b.type));
  result.requiresSound = !!options.soundEnabled || active.some(b => soundBlocks.has(b.type));
  result.requiresGame = !!options.gameEnabled || active.some(b => gameBlocks.has(b.type));
  if ((result.requiresInput || result.requiresSound || result.requiresMotion || result.requiresGame) && !options.module) { result.executionMode = 'events'; result.hasEntry = true; result.diagnostics = result.diagnostics.filter(d => d.code !== 'no-entry'); }
  result.requiresScene = result.requiresInput || result.requiresSound || result.requiresGame || active.some(b => b.type.startsWith('scene_')) || handlers.some(h => h.signature.handler?.sprite || h.signature.handler?.kind);
  for (const binding of imports) {
    if (functions.some(f => f.signature.name === binding.alias) || symbols.some(s => s.kind === 'project' && s.name === binding.alias)) report('module-name-conflict', `Module namespace “${binding.alias}” conflicts with a project variable or function. Rename the namespace.`);
  }
  if (options.module) {
    for (const root of workspace.getTopBlocks(false)) if (root.type !== 'py_function' || !root.isEnabled()) report('module-definition', 'A module contains enabled function definitions only; startup actions and handlers stay in the project.', root);
    for (const block of workspace.getAllBlocks(false)) {
      if (['variables_get', 'variables_set', 'controls_forEach', 'py_range'].includes(block.type) || block.type.startsWith('procedures_')) report('module-legacy', 'Save this project with scoped functions and variables before exporting a module.', block);
      const symbol = block.getField('SYMBOL') && resolveSymbol(block, block.getFieldValue('SYMBOL'));
      if (symbol && symbol.kind === 'project') report('module-global', `Module function depends on project variable “${symbol.name}”. Pass that value as a parameter.`, block);
    }
    if (symbols.some(s => s.kind === 'project' || (s.kind === 'local' && !functions.some(f => f.functionId === s.owner)))) report('module-scope', 'Module variables must belong to an included function.');
    if (workspace.getProcedureMap().getProcedures().some(f => !functions.some(b => b.functionId === f.getId()))) report('module-definition', 'Every module function model needs its definition.');
  }
  for (const definition of functions) {
    const model = definition.getProcedureModel();
    if (!model) { report('unresolved-function', 'Choose or restore the function definition.', definition); continue; }
    const signature = signatureOf(model);
    if ((definition.type === 'py_handler') !== !!signature.handler) report('definition-kind', 'The definition does not match its handler/function metadata. Restore its matching definition.', definition);
    if (signature.handler) {
      if (signature.handler.sprite && !scene.sprites.some(s => s.id === signature.handler!.sprite)) report('missing-sprite', 'This behavior targets a missing authored sprite. Restore it or select another sprite.', definition);
      if (signature.handler.sprite && ['clone', 'update', 'overlap', 'separate', 'click'].includes(signature.handler.event)) result.requiresEvents = true;
      if (!signature.async || signature.parameters.length !== 1) report('handler-signature', 'An event handler needs an async definition and exactly one payload parameter.', definition);
      if (signature.handler.event.startsWith('click:') && !scene.sprites.some(s => s.id === signature.handler!.event.slice(6))) report('missing-sprite', 'This click handler targets a missing sprite. Restore it or choose another input event.', definition);
      if (signature.handler.event.startsWith('world:') && signature.handler.event !== 'world:enter' && !scene.worlds?.some(w => w.id === signature.handler!.event.slice(6))) report('missing-world', 'Choose an available world for this handler.', definition);
      if (signature.handler.event.startsWith('backdrop:') && signature.handler.event !== 'backdrop:change' && !backdrops(scene).some(a => a.id === signature.handler!.event.slice(9))) report('missing-backdrop', 'Choose an available backdrop for this handler.', definition);
      if (/^(key|release):/.test(signature.handler.event) && !validKey(signature.handler.event.split(':')[1])) report('input-key', 'Choose a supported input key in the event editor.', definition);
      if (eventNameError(signature.handler.event)) report('event-name', eventNameError(signature.handler.event)!, definition);
      if (handlers.some(h => h !== definition && h.signature.handler?.order === signature.handler!.order)) report('handler-order', 'Handlers need distinct saved positions. Reorder them in Manage handlers.', definition);
    }
    if (functions.filter(f => f.functionId === definition.functionId).length !== 1) report('duplicate-function', 'Two definitions share an identity. Remove the duplicate and use Duplicate or copy/paste to make an independent function.', definition);
    for (const name of [model.getName(), ...model.getParameters().map(p => p.getName())]) if (nameError(name)) report('invalid-name', nameError(name)!, definition);
    if (new Set(model.getParameters().map(p => p.getName())).size !== model.getParameters().length) report('duplicate-parameter', 'Parameter names must be distinct.', definition);
    if (functions.some(f => f !== definition && f.signature.name === model.getName()) || symbols.some(s => s.kind === 'project' && s.name === model.getName())) report('name-conflict', `“${model.getName()}” is already used in this project.`, definition);
    const body = activeBlocks(definition);
    const referenced = body.filter(b => b.getField('SYMBOL') && !enclosingLambda(b)).map(b => ({ block: b, symbol: resolveSymbol(b, b.getFieldValue('SYMBOL')) }));
    const parameters = symbols.filter(s => s.kind === 'parameter' && s.owner === definition.functionId);
    for (const { block, symbol } of referenced) {
      if (!symbol) continue;
      if (referenced.some(other => other.symbol?.name === symbol.name && other.symbol.id !== symbol.id) || parameters.some(p => p.name === symbol.name && p.id !== symbol.id)) report('scope-conflict', `“${symbol.name}” refers to different variables in this function. Rename one so Python can distinguish them.`, block);
      if (symbol.kind === 'local' && block.type === 'py_get' && !body.some(b => bindsSymbol(b) && b.getFieldValue('SYMBOL') === symbol.id)) report('unbound-local', `Assign a value to local “${symbol.name}” before reading it.`, block);
    }
    for (const call of body.filter(b => ['py_call', 'py_call_value', 'py_function_ref'].includes(b.type))) {
      const name = (call as FunctionBlock).getProcedureModel()?.getName();
      if (parameters.some(p => p.name === name) || referenced.some(({ symbol, block }) => symbol && symbol.name === name && symbol.kind !== 'project' && bindsSymbol(block))) report('shadowed-function', `A local name hides function “${name}”. Rename the variable or function.`, call);
    }
    for (const call of body.filter(b => ['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(b.type))) {
      const alias = resolveModuleCall(workspace, (call as ModuleCallBlock).moduleCall)?.binding.alias;
      if (parameters.some(p => p.name === alias) || referenced.some(({ symbol, block }) => symbol && symbol.name === alias && bindsSymbol(block))) report('shadowed-module', `A local name hides module namespace “${alias}”. Rename the variable or namespace.`, call);
    }
  }
  for (const block of active) {
    if (!supportedBlocks.has(block.type)) { report('unsupported-block', `This version cannot generate ${block.type}.`, block); continue; }
    if (block.type === 'py_program' && block.getParent()) report('nested-program', 'Program must be a top-level block.', block);
    if (isScopedDefinition(block) && block.getParent()) report('nested-function', 'Functions and event handlers must be at the top level.', block);
    const context = enclosingFunction(block); const lambda = enclosingLambda(block);
    const asyncContext = !lambda && context?.getProcedureModel() ? signatureOf(context.getProcedureModel()!).async : false;
    if (block.type === 'scene_self' && (!(context?.signature.handler?.sprite || context?.signature.handler?.kind) || lambda)) report('sprite-context', 'This sprite belongs directly inside a sprite behavior. Pass it as a parameter to helper functions.', block);
    if (block.type === 'py_lambda') {
      const state = (block as LambdaBlock).lambda;
      try { validateLambda(state); } catch (error) { report('lambda-parameters', error instanceof Error ? error.message : String(error), block); continue; }
      if (workspace.getProcedureMap().has(state.id) || workspace.getAllBlocks(false).some(b => b !== block && b.type === 'py_lambda' && (b as LambdaBlock).lambda.id === state.id)) report('lambda-identity', 'Lambda scopes need distinct identities. Use Duplicate or copy/paste to create an independent lambda.', block);
      // Also visit nested lambda expressions: their free function/module names
      // can be captured by this outer lambda's parameters under Python rules.
      for (const child of activeBlocks(block)) {
        const named = ['py_call', 'py_call_value', 'py_function_ref'].includes(child.type);
        const imported = ['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(child.type);
        const name = named ? (child as FunctionBlock).getProcedureModel()?.getName() : imported ? resolveModuleCall(workspace, (child as ModuleCallBlock).moduleCall)?.binding.alias : undefined;
        if (name && state.parameters.some(p => p.name === name)) report(named ? 'shadowed-function' : 'shadowed-module', `Lambda parameter “${name}” hides the selected ${named ? 'function' : 'module namespace'}. Rename the parameter.`, child);
      }
    }
    if (lambda && (block.type.startsWith('variables_') || block.type.startsWith('procedures_'))) report('lambda-legacy', 'Use scoped parameter and function blocks inside a lambda.', block);
    if (block.type === 'sound_asset' && (options.module || !scene.sounds?.some(s => s.id === block.getFieldValue('SOUND_ID')))) report('missing-sound', 'Choose an available sound; pass project sounds as module parameters.', block);
    if (block.type === 'scene_world' && block.getFieldValue('WORLD_ID') && (options.module || !scene.worlds?.some(w => w.id === block.getFieldValue('WORLD_ID')))) report('missing-world', 'Choose an available world; pass project worlds as module parameters.', block);
    if (block.type === 'scene_sprite' && (!scene.sprites.some(s => s.id === block.getFieldValue('SPRITE_ID')) || options.module)) report('missing-sprite', options.module ? 'Pass a sprite as a parameter when exporting a function module.' : 'Choose an existing scene sprite. Deleted sprites stay unresolved until restored.', block);
    if (block.type === 'scene_backdrop' && block.getFieldValue('BACKDROP_ID') && !(options.module ? builtinBackdrops : backdrops(scene)).some(a => a.id === block.getFieldValue('BACKDROP_ID'))) report('missing-backdrop', 'Choose an available backdrop; pass project backdrops as module parameters.', block);
    if (block.type === 'scene_costume' && !(options.module ? builtins : costumes(scene)).some(a => a.id === block.getFieldValue('COSTUME_ID'))) report('missing-costume', 'Choose an available costume; pass project costumes as module parameters.', block);
    if (['scene_key', 'scene_pointer', 'scene_glide', 'scene_animate', 'scene_say_for', 'scene_play_animation'].includes(block.type)) {
      result.requiresEvents = true;
      if (result.executionMode !== 'events' && !options.module) report('event-context', 'Add an event handler to use live input or timed sprite actions.', block);
    }
    if (['input_ask', 'input_ask_value', 'sound_wait', 'sound_note', 'sound_rest', 'py_wait', 'scene_glide', 'scene_animate', 'scene_say_for', 'scene_play_animation'].includes(block.type) && !asyncContext) report('wait-context', 'Wait belongs inside an event handler or a function explicitly marked async.', block);
    if (block.type === 'py_emit') {
      result.requiresEvents = true;
      if (result.executionMode !== 'events' && !options.module) report('event-context', 'Add an event handler to run a project that sends events.', block);
      const event = block.getInputTargetBlock('EVENT');
      if (event?.type === 'text') {
        const value = event.getFieldValue('TEXT');
        if (eventNameError(value)) report('event-name', eventNameError(value)!, block, 'error', 'EVENT');
        if (value === 'start') report('reserved-event', 'The runtime sends start once. Choose another event name to send.', block, 'error', 'EVENT');
      }
    }
    if (block.getField('SYMBOL')) {
      const symbol = resolveSymbol(block, block.getFieldValue('SYMBOL'));
      if (!symbol) report('unresolved-symbol', 'Choose an existing variable or parameter.', block);
      else {
        if (nameError(symbol.name)) report('invalid-name', nameError(symbol.name)!, block);
        if (lambda && symbol.owner !== lambda.lambda.id) report('lambda-capture', `A lambda can read only its own parameters. Pass “${symbol.name}” as an argument instead of capturing it.`, block);
        else if (symbol.owner && symbol.owner !== (lambda?.lambda.id ?? context?.functionId)) report('out-of-scope', `“${symbol.name}” belongs to another function or lambda. Choose a variable available here.`, block);
      }
    }
    if (['py_call', 'py_call_value', 'py_function_ref'].includes(block.type)) {
      const id = (block as FunctionBlock).functionId;
      if (!workspace.getProcedureMap().has(id) || !functions.some(f => f.functionId === id)) report('unresolved-call', block.type === 'py_function_ref' ? 'This function reference has no active definition. Restore its function or choose another reference block.' : 'This call has no active definition. Restore its function or choose another call block.', block);
      const model = workspace.getProcedureMap().get(id);
      if (model) {
        const target = signatureOf(model);
        if (target.handler) report('handler-call', block.type === 'py_function_ref' ? 'Handlers cannot be used as function values. Send their event to start them.' : 'Send the handler’s event instead of calling a handler directly.', block);
        if (target.async && block.type === 'py_function_ref') report('async-function-value', 'Function values currently support synchronous functions. Use a direct awaited call for async functions.', block);
        else if (target.async && !asyncContext) report('async-call-context', 'This call awaits an async function. Place it inside a handler or mark the containing function async.', block);
      }
    }
    if (['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(block.type)) {
      const saved = (block as ModuleCallBlock).moduleCall; const target = resolveModuleCall(workspace, saved);
      if (!target) report('unresolved-module-call', 'Restore this pinned module import and exported function. A same-named module cannot replace its identity.', block);
      else {
        if (canonical(target.signature) !== canonical(saved.signature)) report('module-signature', 'The pinned function signature differs from this call. Restore the matching module revision or replace the call explicitly.', block);
        if (target.signature.async && block.type === 'py_module_function_ref') report('async-function-value', 'Function values currently support synchronous module functions. Use a direct awaited call for async functions.', block);
        else if (target.signature.async && !asyncContext) report('async-call-context', 'This module call awaits an async function. Use a handler or async function.', block);
      }
    }
    if (['py_return', 'py_return_value'].includes(block.type) && !enclosingFunction(block)) report('return-outside-function', 'Return belongs inside a function.', block);
    for (const input of block.inputList) {
      if (input.type !== Blockly.inputs.inputTypes.VALUE) continue;
      if (isDefinition(block) && input.name === 'RETURN') continue; // Python fallthrough returns None.
      const signature = (block as FunctionBlock).signature ?? (block as ModuleCallBlock).moduleCall?.signature;
      const parameter = input.name.startsWith('ARG_') ? signature?.parameters.find(p => `ARG_${p.id}` === input.name) : undefined;
      if (!input.connection?.targetBlock()?.isEnabled()) report('missing-input', `Connect a value to ${parameter ? `parameter “${parameter.name}”` : input.name}.`, block, 'error', input.name);
    }
    if (block.type === 'py_number' && !isPythonNumber(block.getFieldValue('VALUE'))) report('invalid-number', 'Use a Python integer or decimal, such as 12, -3, or 0.5.', block);
    if (block.type === 'math_number') {
      const value = Number(block.getFieldValue('NUM'));
      if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) report('legacy-number', 'Replace this number with a number block that preserves every digit.', block);
    }
    if (block.type === 'py_flow') {
      let parent = block.getSurroundParent();
      while (parent && !loops.has(parent.type) && !isDefinition(parent)) parent = parent.getSurroundParent();
      if (!parent || !loops.has(parent.type)) report('flow-outside-loop', 'Break and continue belong inside a loop.', block);
    }
    if (block.type === 'procedures_ifreturn' && !isDefinition(block.getRootBlock())) report('return-outside-function', 'Return belongs inside a function.', block);
  }
  if (result.diagnostics.some(d => d.severity === 'error')) return result;
  try {
    const g = generator();
    g.init(workspace);
    for (const binding of imports) {
      const file = options.moduleFiles?.get(moduleKey(binding));
      if (!file) throw new Error('A pinned module has no generated source file.');
      g.useModule(binding.alias, file);
    }
    for (const definition of definitions) {
      if (isScopedDefinition(definition)) continue;
      const name = definition.getFieldValue('NAME');
      if (g.getProcedureName(name) !== name) report('invalid-name', `Rename “${name}” to a Python identifier that is not reserved.`, definition);
    }
    for (const block of active) {
      for (const variable of block.getVarModels() ?? []) {
        if (g.getVariableName(variable.getId()) !== variable.getName()) report('invalid-name', `Rename “${variable.getName()}” to a Python identifier that is not reserved.`, block);
      }
    }
    if (result.diagnostics.some(d => d.severity === 'error')) return result;
    for (const definition of definitions) g.blockToCode(definition);
    const body = (entries[0] ? g.blockToCode(entries[0]) as string : '') + handlers.sort((a, b) => a.signature.handler!.order - b.signature.handler!.order).map(h => g.registerHandler(h)).join('');
    Object.assign(result, g.extractMap(g.finish(body)));
    if (options.file) result.sourceMap = result.sourceMap.map(span => ({ ...span, file: options.file! }));
  } catch (error) {
    report('generation-failed', error instanceof Error ? error.message : String(error));
  }
  return result;
}

export function compileModuleDefinition(definition: ModuleDefinition, state: ModuleState, moduleFiles: Map<string, string>): Compilation {
  const workspace = new Blockly.Workspace(new Blockly.Options({ oneBasedIndex: false })); installPythonVariables(workspace);
  Blockly.Events.disable();
  try {
    loadWorkspace({ ...definition.workspace, pythonModules: { ...state, imports: definition.dependencies } }, workspace);
    validateLambdaIdentities(workspace);
    if (workspace.getAllBlocks(false).length > 2000) throw new Error('A module exceeds 2,000 blocks.');
    const result = compileUnit(workspace, { module: true, file: moduleFiles.get(moduleKey(definition)), moduleFiles });
    for (const exported of definition.exports) {
      const model = workspace.getProcedureMap().get(exported.id);
      if (!model || canonical(signatureOf(model)) !== canonical(exported)) result.diagnostics.push({ code: 'module-export', severity: 'error', message: `Export “${exported.name}” does not match its saved function definition.` });
    }
    if (result.diagnostics.some(d => d.severity === 'error')) result.source = null;
    return result;
  } finally { workspace.dispose(); Blockly.Events.enable(); }
}

export function compile(workspace: Blockly.Workspace): Compilation {
  const state = moduleState(workspace);
  const files = new Map(state.definitions.map((d, index) => [moduleKey(d), `_pb_module_${index}.py`]));
  const units: { definition: ModuleDefinition; unit: Compilation }[] = [];
  let moduleError: unknown;
  try { validateModuleState(state); for (const definition of reachableModules(state)) units.push({ definition, unit: compileModuleDefinition(definition, state, files) }); } catch (error) { moduleError = error; }
  const result = compileUnit(workspace, { moduleFiles: files, inputEnabled: units.some(({ unit }) => unit.requiresInput), soundEnabled: units.some(({ unit }) => unit.requiresSound), motionEnabled: units.some(({ unit }) => unit.requiresMotion), gameEnabled: units.some(({ unit }) => unit.requiresGame) });
  try {
    if (moduleError) throw moduleError;
    for (const { definition, unit } of units) {
      const location = { moduleId: definition.moduleId, revision: definition.revision, name: definition.name };
      result.diagnostics.push(...unit.diagnostics.map(d => ({ ...d, module: location, message: `${definition.name}: ${d.message}` })));
      if (unit.source !== null) {
        const file = files.get(moduleKey(definition))!;
        result.files[file] = unit.source; result.moduleSources[file] = location;
        result.sourceMap.push(...unit.sourceMap.map(span => ({ ...span, module: location })));
      }
      result.requiresScene ||= unit.requiresScene;
      result.requiresMotion ||= unit.requiresMotion;
      result.requiresGame ||= unit.requiresGame;
      result.requiresSound ||= unit.requiresSound;
      result.requiresInput ||= unit.requiresInput;
      if (unit.requiresInput || unit.requiresSound || unit.requiresMotion || unit.requiresGame) result.executionMode = 'events';
      if (unit.requiresEvents && result.executionMode !== 'events') result.diagnostics.push({ code: 'module-event-context', severity: 'error', module: location, message: `Module “${definition.name}” sends events. Add an event handler to run an event session.` });
    }
  } catch (error) { result.diagnostics.push({ code: 'module-invalid', severity: 'error', message: error instanceof Error ? error.message : String(error) }); }
  const scene = sceneState(workspace);
  if (result.requiresScene || JSON.stringify(scene) !== JSON.stringify(emptyScene())) {
    result.scene = scene;
    if (result.source !== null) {
      const prefix = 'from playground import scene as _pb_scene\n_pb_scene.load("scene.json")\n' + (result.requiresMotion ? '_pb_scene.enable_motion()\n' : '') + '\n';
      const offset = prefix.split('\n').length - 1;
      result.source = prefix + result.source;
      result.sourceMap = result.sourceMap.map(span => span.file === 'program.py' ? { ...span, startLine: span.startLine + offset, endLine: span.endLine + offset } : span);
    }
  }
  if (result.diagnostics.some(d => d.severity === 'error')) result.source = null;
  return result;
}

export function blockForLine(compilation: Compilation, file: string, line: number) {
  return compilation.sourceMap.find(span => span.file === file && span.startLine <= line && span.endLine >= line)?.blockId;
}
