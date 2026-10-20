import * as Blockly from 'blockly/core';
import { HAT_TYPE, type HatKind } from '../language/hats';

/** Captions for the block picker: above every block in a category's flyout, a
 * number bubble and the block's keyword ("9 jump if grounded"), so a learner
 * can find a block by its number from a hint, or by its name, without reading
 * every block. The number is the block's place in that category at that level;
 * lesson hints show the same number beside a block picture. */
type Item = Blockly.utils.toolbox.FlyoutItemInfo;
type BlockItem = Blockly.utils.toolbox.BlockInfo;

/** How a hint names a block: its type, or `hat:start` for a "when …" block and `controls_if:else` for if … else. */
export function refOf(item: BlockItem) {
  if (item.type === HAT_TYPE) return `hat:${(item.extraState as { kind?: HatKind } | undefined)?.kind ?? ''}`;
  if (item.type === 'controls_if' && (item.extraState as { hasElse?: boolean } | undefined)?.hasElse) return 'controls_if:else';
  return item.type ?? '';
}
const HATS: Record<HatKind, string> = {
  start: 'when game starts', key: 'when a key is pressed', click: 'when clicked', overlap: 'when sprites touch',
  update: 'when it updates', countdown: 'when time runs out', message: 'when a message comes', backdrop: 'when the backdrop changes',
};
/** Keywords chosen by hand where the block's own words do not say what it is for. */
const KEYWORDS: Record<string, string> = {
  py_program: 'Program: runs top to bottom', 'controls_if:else': 'if … else', controls_if: 'if', controls_repeat_ext: 'repeat times',
  controls_whileUntil: 'repeat while / until', logic_compare: 'compare', py_binary: 'maths: + − × ÷ remainder', py_number: 'a number', text: 'some text',
  text_join: 'join text', py_logic: 'and / or', py_not: 'not', logic_boolean: 'True / False', py_none: 'None', py_convert: 'change type: int, str…',
  scene_motion_set: 'set speed or gravity', scene_motion_change: 'change speed or gravity', scene_motion_get: 'speed or gravity',
  scene_set: 'set x, y, size, direction…', scene_change: 'change x, y, size, direction…', scene_get: 'x, y, size, direction…',
  py_set: 'set a variable', py_get: 'a variable', py_scoped_range: 'count with a variable', py_for_each: 'for each item',
  py_read_number: 'read a number', py_read_line: 'read a line', math_random_int: 'random number',
  scene_motion_edges: 'at stage edge', scene_control: 'control with arrow keys', scene_rotation: 'rotation style', scene_costume: 'a costume',
  scene_effect_set: 'set an effect', scene_effect_change: 'change an effect', scene_effect_get: 'an effect’s value',
  scene_stage_effect_set: 'set a stage effect', scene_stage_effect_change: 'change a stage effect', scene_stage_effect_get: 'a stage effect’s value',
  scene_visibility: 'show or hide', scene_animate: 'animate with costumes', scene_animation_play: 'play an animation', scene_animation_once: 'play an animation once',
  scene_animation_stop: 'stop the animation', scene_animation_get: 'animation name', scene_next_costume: 'next costume', scene_play_animation: 'play the frames once',
  scene_layer: 'front or back', scene_backdrop: 'a backdrop', scene_backdrop_set: 'switch backdrop',
  sound_asset: 'a sound', sound_play: 'start a sound', sound_loop: 'start a sound looping', sound_wait: 'play a sound until done', sound_stop: 'stop sounds',
  sound_set: 'set volume, pitch or pan', sound_change: 'change volume, pitch or pan', sound_get: 'volume, pitch or pan', sound_clear: 'clear pitch and pan', sound_note: 'play a note',
  py_wait: 'wait', py_emit: 'send an event', py_flow: 'break or continue', py_unary: 'minus or plus', pen_color: 'set pen color',
  game_finish: 'finish the game', game_effect: 'confetti or burst', game_countdown: 'count down, then end', game_lives_rule: 'end at zero lives',
  scene_sprite: 'a sprite', scene_self: 'this sprite', scene_data: 'all sprite data', scene_data_get: 'sprite data', scene_data_set: 'set sprite data',
  scene_clone: 'clone a sprite', scene_destroy: 'destroy a sprite', scene_create: 'create a sprite', scene_lookup: 'sprite by name',
  scene_motion_body: 'automatic motion', scene_motion_response: 'on wall collision', scene_motion_auto: 'destroy when offstage',
  scene_projectile: 'fire a clone and get it', scene_fire: 'fire a clone', scene_world: 'a world', scene_camera_follow: 'camera follow', scene_tile_at: 'tile at x y',
  py_return_value: 'return a value', input_ask_value: 'ask, then the answer', py_dict: 'dictionary', py_item_set: 'set an item', py_item_delete: 'delete an item',
};
const NOISE = /\((None|none)[^)]*\)|\bfor sprite\b|\bsprite\b/g;
let scratch: Blockly.Workspace | null = null;
const cache = new Map<string, string>();

/** The block's keyword: chosen by hand, or its own label words without "sprite" and its inputs. */
export function keyword(item: BlockItem) {
  const ref = refOf(item);
  if (ref.startsWith('hat:')) return HATS[ref.slice(4) as HatKind] ?? 'when …';
  if (ref === 'controls_whileUntil') {
    const forever = (item.inputs as { BOOL?: { shadow?: { fields?: { BOOL?: string } } } } | undefined)?.BOOL?.shadow?.fields?.BOOL === 'TRUE';
    return item.fields?.MODE === 'UNTIL' ? 'repeat until' : forever ? 'repeat forever' : 'repeat while';
  }
  if (KEYWORDS[ref]) return KEYWORDS[ref];
  const key = JSON.stringify([item.type, item.fields ?? {}]);
  let text = cache.get(key);
  if (text === undefined) {
    text = '';
    try {
      scratch ??= new Blockly.Workspace();
      const block = scratch.newBlock(item.type!), words: string[] = [];
      for (const input of block.inputList) for (const field of input.fieldRow) {
        if (field instanceof Blockly.FieldDropdown) {
          const wanted = item.fields?.[field.name ?? ''];
          const option = wanted === undefined ? undefined : field.getOptions(false).find(([, value]) => value === wanted);
          words.push(typeof option?.[0] === 'string' ? option[0] : field.getText());
        } else if (!field.EDITABLE && field.getText()) words.push(field.getText());
      }
      block.dispose(false);
      text = words.join(' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
    } catch { text = ''; }
    const parts = (text || item.type!.replace(/^[a-z]+_/, '').replace(/_/g, ' ')).split(' ');
    text = parts.length > 6 ? `${parts.slice(0, 6).join(' ')}…` : parts.join(' ');
    cache.set(key, text);
  }
  return text;
}

const termCache = new Map<string, string>();
/** Words a search can match for a block: its keyword, its own words, every menu choice and its tooltip. */
export function searchTerms(item: BlockItem) {
  const key = JSON.stringify([item.type, item.fields ?? {}, refOf(item)]);
  let terms = termCache.get(key);
  if (terms === undefined) {
    const words = [keyword(item), item.type ?? ''];
    try {
      scratch ??= new Blockly.Workspace();
      const block = scratch.newBlock(item.type!);
      for (const input of block.inputList) for (const field of input.fieldRow) {
        if (field instanceof Blockly.FieldDropdown) for (const [text] of field.getOptions(false)) { if (typeof text === 'string') words.push(text); }
        else if (!field.EDITABLE) words.push(field.getText());
      }
      const tip = block.getTooltip(); if (typeof tip === 'string') words.push(tip);
      block.dispose(false);
    } catch { /* the keyword and type still match */ }
    terms = words.join(' ').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/_/g, ' ');
    termCache.set(key, terms);
  }
  return terms;
}

/** A category's flyout with a caption above each block: "3\u2002keyword", drawn as a number bubble and words.
 * `name` gives a block's own words where the project decides them, such as a variable's name. */
export function captioned(items: Item[], name: (item: BlockItem) => string | undefined = () => undefined): Item[] {
  let number = 0;
  return items.flatMap(item => item.kind === 'block'
    ? [{ kind: 'label', text: `${++number}\u2002${name(item as BlockItem) ?? keyword(item as BlockItem)}`, 'web-class': 'block-caption' } as Item, item]
    : [item]);
}
/** The number a block has in a category's flyout (`ref` as refOf gives it, or a plain type for its first block). */
export function blockNumber(items: Item[], ref: string) {
  // `type:FIELD=value` names the block of that type whose field starts with that value (set lives, not set score).
  const [type, field] = ref.split(':'), [name, value] = field?.includes('=') ? field.split('=') : [];
  let number = 0;
  for (const item of items) if (item.kind === 'block') {
    number++;
    const block = item as BlockItem;
    if (name ? block.type === type && block.fields?.[name] === value : refOf(block) === ref || block.type === ref) return number;
  }
  return undefined;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Draw each caption's number as a bubble at its left, with the keyword after it. Blockly lays out the
 * caption as one centred text; this turns "9 jump if grounded" into a bubble and left-aligned words. */
function bubble(group: Element) {
  const text = group.querySelector('text.blocklyFlyoutLabelText');
  if (!text || group.querySelector('.block-caption-number')) return;
  const [number, words] = (text.textContent ?? '').split(' ');
  if (!words) return;
  const circle = document.createElementNS(SVG, 'circle'), digits = document.createElementNS(SVG, 'text');
  circle.setAttribute('class', 'block-caption-bubble'); circle.setAttribute('cx', '10'); circle.setAttribute('cy', '9'); circle.setAttribute('r', '10');
  digits.setAttribute('class', 'block-caption-number'); digits.setAttribute('x', '10'); digits.setAttribute('y', '13'); digits.setAttribute('text-anchor', 'middle');
  digits.textContent = number;
  text.textContent = words; text.setAttribute('x', '26'); text.setAttribute('text-anchor', 'start');
  group.insertBefore(circle, text); group.insertBefore(digits, text);
}
/** Watch the flyouts and give every caption its bubble as Blockly draws it. */
export function installCaptionBubbles(root: Element = document.body) {
  const sweep = () => root.querySelectorAll('g.block-caption').forEach(bubble);
  const observer = new MutationObserver(sweep);
  observer.observe(root, { childList: true, subtree: true });
  sweep();
  return () => observer.disconnect();
}
