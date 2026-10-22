import * as Blockly from 'blockly/core';
import { numberInput } from '../blocks/core';
import { soundsToolbox } from '../blocks/sounds';
import { gameToolbox, levelToolbox } from '../blocks/game';
import { HAT_KINDS, HAT_TYPE, STARTER_HATS, hatItem, needsSprite, type HatKind } from '../language/hats';
import { blockNumber, captioned } from './block-captions';
import { allSymbols } from '../language/functions';
import { moduleState } from '../language/modules';
import { handlerSignatures, type FunctionBlock } from '../language/functions';
import { sceneState } from '../scene/state';

/** Progressive disclosure. The level is editor state (one per browser), never
 * part of a project, and it only filters what the palette and menus offer:
 * blocks already in a project always stay on the workspace. Category ids are
 * stable so lessons can refer to them. */
export const LEVELS = ['starter', 'builder', 'pro'] as const;
export type Level = typeof LEVELS[number];
export const LEVEL_KEY = 'python-blocks-level';
export const levelNames: Record<Level, string> = { starter: 'Starter', builder: 'Builder', pro: 'Pro' };
export const atLeast = (level: Level, minimum: Level) => LEVELS.indexOf(level) >= LEVELS.indexOf(minimum);
export const isLevel = (value: unknown): value is Level => LEVELS.includes(value as Level);

type Item = Blockly.utils.toolbox.FlyoutItemInfo;
type BlockItem = Blockly.utils.toolbox.BlockInfo;
/** Fixed palette items, or a registered dynamic category filtered to some block types. */
export type Part = { items: Item[] } | { callback: string; types?: readonly string[] };
export interface CategorySpec { id: string; name: string; colour: string; parts: Part[] }

const block = (type: string, rest: Partial<BlockItem> = {}): Item => ({ kind: 'block', type, ...rest });
const label = (text: string): Part => ({ items: [{ kind: 'label', text }] });
const types = (...names: string[]) => names.map(type => block(type));
const program: Item[] = [block('py_program')];
const draw: Item[] = [
  block('pen_move', { inputs: { STEPS: numberInput(100) } }), block('pen_turn', { inputs: { DEGREES: numberInput(90) } }),
  block('pen_color'), block('pen_lift'),
];
const forever = block('controls_whileUntil', { fields: { MODE: 'WHILE' }, inputs: { BOOL: { shadow: { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } } } });
const counting = [
  block('py_scoped_range', { inputs: { START: numberInput(0), STOP: numberInput(5), STEP: numberInput(1) } }), block('py_for_each'),
];
const loops: Item[] = [block('controls_repeat_ext', { inputs: { TIMES: numberInput(4) } }), block('controls_whileUntil'), ...counting, block('py_flow')];
/** Starter's "Control" is a presentation grouping of existing loop, decision and wait blocks. */
const control = (builder: boolean): Item[] => [
  { kind: 'label', text: 'Repeat' }, block('controls_repeat_ext', { inputs: { TIMES: numberInput(10) } }), forever,
  block('controls_whileUntil', { fields: { MODE: 'UNTIL' } }), ...(builder ? counting : []),
  { kind: 'label', text: 'Decide' }, block('controls_if'), block('controls_if', { extraState: { hasElse: true } }),
  { kind: 'label', text: 'Wait & stop' }, block('py_wait', { inputs: { SECONDS: numberInput(1) } }), block('py_flow'),
  { kind: 'label', text: 'Compare & pick' }, block('logic_compare', { fields: { OP: 'GT' } }), block('math_random_int', { inputs: { FROM: numberInput(1), TO: numberInput(10) } }),
];
const logic = types('controls_if', 'logic_compare', 'py_logic', 'py_not', 'logic_boolean', 'py_none');
const numbers = types('py_number', 'py_binary', 'py_unary', 'py_convert', 'math_random_int');
const text = types('text', 'text_print', 'text_join', 'py_read_number', 'py_read_line');
const collections = types('lists_create_with', 'py_dict', 'py_length', 'py_item_get', 'py_item_set', 'py_item_delete', 'py_list_append', 'py_contains', 'py_dict_get', 'py_dict_keys', 'py_shallow_copy');
const colour = {
  program: '#47776c', events: '#ba7b4e', motion: '#477c9a', looks: '#8c67a2', sounds: '#9470a8', control: '#a57938', draw: '#47776c', pen: '#47776c',
  variables: '#b27745', game: '#9a6c3e', logic: '#6682a5', numbers: '#8066ba', text: '#ae657d', functions: '#8066ba', sensing: '#477a85',
  physics: '#547d91', worlds: '#506f91', sprites: '#477c9a', loops: '#a57938', values: '#8066ba', modules: '#547d91', collections: '#b27745',
};
const category = (id: keyof typeof colour, name: string, ...parts: Part[]): CategorySpec => ({ id, name, colour: colour[id], parts });
const starterSensing: Part = { callback: 'PY_SENSING', types: ['scene_key', 'scene_pointer', 'scene_edge', 'scene_overlaps'] };
/** Motion for Starter and Builder also offers position reporters and the arrow-key controller, as Scratch's Motion does. */
const motion: Part[] = [{ callback: 'PY_MOTION' }, { callback: 'PY_SENSING', types: ['scene_get'] }, label('Arrow keys'), { callback: 'PY_PHYSICS', types: ['scene_control', 'scene_motion_edges'] }];

/** Builder makes a game of several levels with the world blocks a level needs; Pro's Worlds has the rest (tiles, camera). */
const levelBlocks = ['scene_world_next', 'scene_world_set', 'scene_world_restart', 'scene_world_get'] as const;

/** The single source of truth for what each level's palette contains. */
export const palette: Record<Level, CategorySpec[]> = {
  starter: [
    category('events', 'Events', { items: program }, { callback: 'PB_HATS_STARTER' }),
    category('motion', 'Motion', ...motion),
    category('looks', 'Looks', { callback: 'PY_LOOKS' }),
    category('sounds', 'Sounds', { items: soundsToolbox }),
    category('control', 'Control', { items: control(false) }, label('Check'), starterSensing),
    category('draw', 'Draw', { items: draw }, label('Sprite pen'), { callback: 'PY_PEN' }),
    category('variables', 'Variables', { callback: 'PY_VARIABLES' }),
    category('game', 'Game', { items: gameToolbox }, label('Sprites'), { callback: 'PY_SPRITES', types: ['scene_sprite', 'scene_self', 'scene_clone', 'scene_destroy'] }),
  ],
  builder: [
    category('events', 'Events', { items: program }, { callback: 'PB_HATS_ALL' }, { callback: 'PY_EVENTS' }),
    category('motion', 'Motion', ...motion),
    category('looks', 'Looks', { callback: 'PY_LOOKS' }),
    category('sounds', 'Sounds', { items: soundsToolbox }),
    category('control', 'Control', { items: control(true) }, label('Check'), starterSensing),
    category('logic', 'Logic', { items: logic }),
    category('numbers', 'Numbers', { items: numbers }),
    category('text', 'Text', { items: text }),
    category('draw', 'Draw', { items: draw }, label('Sprite pen'), { callback: 'PY_PEN' }),
    category('variables', 'Variables', { callback: 'PY_VARIABLES' }),
    category('functions', 'Functions', { callback: 'PY_FUNCTIONS' }),
    category('game', 'Game', { items: gameToolbox }, label('Sprites'), { callback: 'PY_SPRITES' }, label('Levels'), { callback: 'PY_WORLDS', types: levelBlocks }, { items: levelToolbox }),
    category('sensing', 'Sensing & input', { callback: 'PY_SENSING' }),
    category('physics', 'Physics', { callback: 'PY_PHYSICS' }),
  ],
  // Today's full toolbox, with Loops, Logic and Numbers moved above the scene categories.
  pro: [
    category('program', 'Program', { items: program }),
    category('loops', 'Loops', { items: loops }),
    category('logic', 'Logic', { items: logic }),
    category('numbers', 'Numbers', { items: numbers }),
    category('sensing', 'Sensing & input', { callback: 'PY_SENSING' }),
    category('sounds', 'Sounds', { items: soundsToolbox }),
    category('game', 'Game', { items: gameToolbox }),
    category('worlds', 'Worlds', { callback: 'PY_WORLDS' }),
    category('sprites', 'Sprites', { callback: 'PY_SPRITES' }),
    category('motion', 'Motion', { callback: 'PY_MOTION' }),
    category('looks', 'Looks', { callback: 'PY_LOOKS' }),
    category('physics', 'Physics', { callback: 'PY_PHYSICS' }),
    category('pen', 'Sprite pen', { callback: 'PY_PEN' }),
    category('draw', 'Draw', { items: draw }),
    category('text', 'Text', { items: text }),
    category('variables', 'Variables', { callback: 'PY_VARIABLES' }),
    category('functions', 'Functions', { callback: 'PY_FUNCTIONS' }),
    category('values', 'Function values', { callback: 'PY_FUNCTION_VALUES' }),
    category('events', 'Events', { callback: 'PB_HATS_ALL' }, { callback: 'PY_EVENTS' }),
    category('modules', 'Modules', { callback: 'PY_MODULES' }),
    category('collections', 'Collections', { items: collections }),
  ],
};
/** Blocks a palette offers only once they exist (calls, variable getters) or
 * that dropping another palette entry creates (a hat becomes a handler). */
const implied: Record<Level, [string, string][]> = {
  starter: [['py_handler', 'Events'], ['py_get', 'Variables'], ['py_set', 'Variables'], [HAT_TYPE, 'Events']],
  builder: [['py_function', 'Functions'], ['py_call', 'Functions'], ['py_call_value', 'Functions'], ['py_function_ref', 'Functions'], ['py_emit', 'Events']],
  pro: [['py_lambda', 'Function values'], ['py_dynamic_call', 'Function values'], ['py_dynamic_call_value', 'Function values'], ['py_module_call', 'Modules'], ['py_module_call_value', 'Modules'], ['py_module_function_ref', 'Modules']],
};

const callbackKey = (level: Level, spec: CategorySpec) => `PB_${level.toUpperCase()}_${spec.id.toUpperCase()}`;
const single = (spec: CategorySpec) => spec.parts.length === 1 ? spec.parts[0] : undefined;
export function toolboxFor(level: Level): Blockly.utils.toolbox.ToolboxInfo {
  // Every category is built by one callback, so each flyout gets its block captions (block-captions.ts).
  return { kind: 'categoryToolbox', contents: palette[level].map(spec => ({ kind: 'category', name: spec.name, colour: spec.colour, toolboxitemid: `category-${spec.id}`, custom: callbackKey(level, spec) })) } as Blockly.utils.toolbox.ToolboxInfo;
}
/** A category's flyout items at a level, before captions: the list block numbers count. */
export function categoryItems(workspace: Blockly.WorkspaceSvg, level: Level, name: string): Item[] {
  const spec = palette[level].find(c => c.name === name);
  return spec ? spec.parts.flatMap(p => partItems(workspace, p)) : [];
}
/** A block's number in a category's flyout at a level, as its caption shows it. */
export const numberOf = (workspace: Blockly.WorkspaceSvg, level: Level, category: string, ref: string) => blockNumber(categoryItems(workspace, level, category), ref);
/** Where a block is at a level: in `category` when that category has it there, or else in the first one
 * that does (a lesson written for Builder names Motion for a block that Pro keeps in Physics). A variant
 * the level does not offer, such as Builder's if … else, is found as its plain block (Pro's if, with its gear). */
export function findBlock(workspace: Blockly.WorkspaceSvg, level: Level, category: string, ref: string) {
  const names = [category, ...palette[level].map(spec => spec.name).filter(name => name !== category)];
  for (const wanted of new Set([ref, ref.split(':')[0]])) for (const name of names) {
    const number = numberOf(workspace, level, name, wanted);
    if (number !== undefined) return { category: name, number };
  }
  return undefined;
}

function partItems(workspace: Blockly.WorkspaceSvg, part: Part): Item[] {
  if ('items' in part) return structuredClone(part.items);
  // Dynamic categories in this app return JSON flyout items, never DOM nodes.
  const items = workspace.getToolboxCategoryCallback(part.callback)?.(workspace) as Item[] | undefined;
  if (!Array.isArray(items)) return [];
  return part.types ? items.filter(item => item.kind === 'block' && part.types!.includes((item as BlockItem).type ?? '')) : items;
}

/** Register the hat categories and every composite category, for all levels. */
export function installLevels(workspace: Blockly.WorkspaceSvg, selected: () => string) {
  // A variable's blocks are captioned with its name: "score", "set score".
  const variableName = (item: Blockly.utils.toolbox.BlockInfo) => {
    if (item.type !== 'py_get' && item.type !== 'py_set') return undefined;
    const symbol = allSymbols(workspace).find(s => s.id === item.fields?.SYMBOL);
    return symbol ? (item.type === 'py_set' ? `set ${symbol.name}` : symbol.name) : undefined;
  };
  const hats = (kinds: readonly HatKind[]) => (): Item[] => {
    const scene = sceneState(workspace), primary = scene.sprites.find(s => s.id === selected()) ?? scene.sprites[0];
    const other = scene.sprites.find(s => s.id !== primary?.id);
    // Existing handlers follow the hats, so a learner can jump back to a script they made.
    const scripts = handlerSignatures(workspace).map((handler): Item => {
      const key = `PB_GOTO_${handler.id}`;
      workspace.registerButtonCallback?.(key, () => {
        const block = workspace.getAllBlocks(false).find(b => b.type === 'py_handler' && (b as unknown as FunctionBlock).functionId === handler.id) as Blockly.BlockSvg | undefined;
        if (block) { workspace.centerOnBlock(block.id); block.select(); }
      });
      return { kind: 'button', text: `Go to ${handler.name}`, callbackkey: key };
    });
    // "When a world starts" shows once the project has worlds (levels).
    return [{ kind: 'label', text: 'Start a script' }, ...kinds.filter(kind => (primary || !needsSprite(kind)) && (kind !== 'world' || scene.worlds?.length)).map(kind => hatItem(kind, primary?.id, other?.id)),
      ...(scripts.length ? [{ kind: 'label', text: 'Your scripts' } as Item, ...scripts] : [])];
  };
  workspace.registerToolboxCategoryCallback('PB_HATS_STARTER', hats(STARTER_HATS));
  workspace.registerToolboxCategoryCallback('PB_HATS_ALL', hats(HAT_KINDS));
  for (const level of LEVELS) for (const spec of palette[level])
    workspace.registerToolboxCategoryCallback(callbackKey(level, spec), () => captioned(spec.parts.flatMap(p => partItems(workspace, p)), variableName));
}

function collect(state: Blockly.serialization.blocks.State | undefined, into: (type: string) => void) {
  if (!state) return;
  into(state.type);
  for (const input of Object.values(state.inputs ?? {})) { collect(input.block, into); collect(input.shadow, into); }
  collect(state.next?.block, into);
}
/** Every block type a level's palette can produce, mapped to the category that offers it. */
export function levelTypes(workspace: Blockly.WorkspaceSvg, level: Level): Map<string, string> {
  const found = new Map<string, string>();
  for (const spec of palette[level]) for (const part of spec.parts) for (const item of partItems(workspace, part)) {
    if (item.kind === 'block') collect(item as Blockly.serialization.blocks.State, type => { if (!found.has(type)) found.set(type, spec.name); });
  }
  for (const lower of LEVELS.slice(0, LEVELS.indexOf(level) + 1)) for (const [type, name] of implied[lower]) if (!found.has(type)) found.set(type, name);
  return found;
}

export interface LevelNeed { level: Level; uses: { name: string; level: Level }[] }
/** The lowest level whose palette and tools cover this project. Unknown or
 * legacy block types never raise the level; they are not in any palette. */
export function requiredLevel(workspace: Blockly.WorkspaceSvg): LevelNeed {
  const maps = LEVELS.map(level => levelTypes(workspace, level));
  const uses = new Map<string, Level>();
  const need = (name: string, level: Level) => { const current = uses.get(name); uses.set(name, current && atLeast(current, level) ? current : level); };
  for (const b of workspace.getAllBlocks(false)) {
    const index = maps.findIndex(map => map.has(b.type));
    // Name the most specific (Pro) category, e.g. Sprites rather than Builder's combined Game.
    if (index > 0) need(maps.at(-1)!.get(b.type) ?? maps[index].get(b.type)!, LEVELS[index]);
  }
  const scene = sceneState(workspace);
  // One world bigger than the stage (screens added in Stage view) and several worlds (a game's levels) are Builder tools.
  if ((scene.worlds?.length ?? 0) > 1) need('Levels', 'builder');
  else if (scene.worlds?.length) need('Big world', 'builder');
  if (moduleState(workspace).imports.length) need('Modules', 'pro');
  if (scene.watchers?.length) need('Watch values', 'builder');
  if (scene.sprites.some(s => s.motion && (s.motion.body && s.motion.body !== 'off' || s.motion.controller && s.motion.controller !== 'none' || (s.motion.lifetime ?? 0) > 0))) need('Physics', 'builder');
  const list = [...uses].map(([name, level]) => ({ name, level }));
  const level = list.reduce<Level>((max, use) => atLeast(use.level, max) ? use.level : max, 'starter');
  return { level, uses: list.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || a.name.localeCompare(b.name)) };
}

export function storedLevel(): Level {
  try { const value = localStorage.getItem(LEVEL_KEY); return isLevel(value) ? value : 'starter'; } catch { return 'starter'; }
}
export function storeLevel(level: Level) { try { localStorage.setItem(LEVEL_KEY, level); } catch { /* the level still applies to this tab */ } }
