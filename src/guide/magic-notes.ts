import * as Blockly from 'blockly/core';
import { isPythonNumber } from '../language/compiler';
import { scriptTabs, tabOf } from '../scripts/tabs';

/** The magic book (Magic tab): a project's notes, read as a guide to the numbers worth changing.
 * Every block with a comment is a page: the comment's first line is its title and the rest its note,
 * and the numbers and words typed into that block (and the blocks inside its slots, not the blocks
 * under it) can be changed right there. A few well-known numbers (lives, points, jump, speed, gravity,
 * the clock, the end messages) are spotted even without a note, so a learner's own game has a book too. */
export interface MagicValue {
  blockId: string;
  field: string;
  kind: 'number' | 'text' | 'choice';
  value: string;
  /** For a choice (a costume): what can be picked, as [shown name, value]. */
  options?: [string, string][];
  /** The words beside it in the block, such as "set lives to" or "horizontal speed". */
  label: string;
}
export interface MagicEntry {
  blockId: string;
  title: string;
  note: string;
  values: MagicValue[];
  /** Values beyond MAX_VALUES that are only in the block. */
  more: number;
  source: 'note' | 'spotted';
  tab: string;
  /** The script it is in, in a few words: "when space key pressed". */
  script: string;
}
export const MAX_VALUES = 4;
const MAX_TITLE = 80;

/** Words the player reads (a message, a speech bubble, a question) can be changed freely; other text,
 * such as a sprite data key or a kind, names something and would break the program if it changed. */
const SHOWN_TEXT = /^(TEXT|MESSAGE|ADD\d+)$/;
/** Costume pickers are choices: a setting such as LASER_LOOK swaps a sprite's look in one place. */
const CHOICES: Record<string, string> = { scene_costume: 'COSTUME_ID' };
const literal = (block: Blockly.Block, input = 'TEXT'): MagicValue | null => {
  if (block.type === 'py_number') return { blockId: block.id, field: 'VALUE', kind: 'number', value: block.getFieldValue('VALUE'), label: '' };
  if (CHOICES[block.type]) {
    const field = block.getField(CHOICES[block.type]) as Blockly.FieldDropdown | null;
    const options = (field?.getOptions(false) ?? []).flatMap(([label, value]) => typeof label === 'string' && typeof value === 'string' ? [[label, value] as [string, string]] : []);
    return field && options.length ? { blockId: block.id, field: CHOICES[block.type], kind: 'choice', value: String(field.getValue()), label: '', options } : null;
  }
  if (block.type === 'text' && SHOWN_TEXT.test(input)) return { blockId: block.id, field: 'TEXT', kind: 'text', value: block.getFieldValue('TEXT'), label: '' };
  return null;
};
/** Block text as a learner reads it: no right-to-left marks, no "(project)" after variable names. */
const plain = (text: string) => text.replace(/[\u200e\u200f]/g, '').replace(/\s*\((project|local)\)/g, '').replace(/\s+/g, ' ').trim();
/** The words in an input's row, without operator symbols (+, ×, =) that say nothing on their own. */
function rowWords(input: Blockly.Input) {
  const words = plain(input.fieldRow.filter(f => f.isVisible() && !(f instanceof Blockly.FieldImage) && !(f instanceof Blockly.FieldCheckbox)).map(f => f.getText()).join(' '));
  return /[A-Za-z]/.test(words) ? words.replace(/\s*[:→]\s*$/, '') : '';
}
/** The numbers and words typed into a block and the blocks in its slots (not the stack under it). */
// A short row ("to", "y by") borrows the words before it that name the thing: the variable of
// "set dx to", or "change sprite" before "y by". A value slot's own row, such as "from", is not borrowed.
function rowLabel(owner: Blockly.Block, index: number) {
  const own = rowWords(owner.inputList[index]);
  if (!own || own.split(' ').length > 2) return own;
  const before: string[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const input = owner.inputList[i];
    if (input.type !== Blockly.inputs.inputTypes.DUMMY && input.name !== 'SPRITE') break;
    before.unshift(rowWords(input));
  }
  return plain([...before, own].join(' '));
}
/** The words beside a value in the block it sits in ("set LIVES to", "set lives to"), or that block's text. */
export function valueLabel(value: Blockly.Block) {
  const owner = value.getParent();
  if (!owner) return '';
  const index = owner.inputList.findIndex(input => input.connection?.targetBlock() === value);
  return (index >= 0 && rowLabel(owner, index)) || plain(owner.toString(40));
}
export function blockValues(block: Blockly.Block): MagicValue[] {
  const own = literal(block);
  if (own) return [{ ...own, label: '' }];
  const values: MagicValue[] = [];
  const visit = (owner: Blockly.Block, label: string) => {
    for (const [index, input] of owner.inputList.entries()) {
      if (input.type !== Blockly.inputs.inputTypes.VALUE || !input.connection?.targetBlock()) continue;
      const child = input.connection.targetBlock()!, words = rowLabel(owner, index) || label;
      if (child.type === 'text' && !SHOWN_TEXT.test(input.name)) continue;
      const value = literal(child, input.name);
      // A number with no words of its own (bombs < 3) is named by its block: "bombs < 3".
      if (value) values.push({ ...value, label: words || plain(owner.toString(40)) });
      else visit(child, words);
    }
  };
  visit(block, '');
  // Two numbers beside the same words (await wait 0.1 + 0.025) are told apart by their order.
  const order = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
  const labels = values.map(v => v.label);
  return values.map((value, index) => {
    const same = labels.flatMap((label, i) => label === value.label ? [i] : []), nth = same.indexOf(index);
    return same.length > 1 && value.label ? { ...value, label: `${value.label} (${order[nth] ?? nth + 1} ${value.kind === 'number' ? 'number' : 'words'})` } : value;
  });
}

/** A script's name in a few words, from its first row: "when game starts", "define make_aliens". */
export function scriptName(root: Blockly.Block) {
  const words = root.inputList[0]?.fieldRow.filter(f => f.isVisible()).map(f => f.getText().trim()).filter(Boolean).join(' ') ?? '';
  return (words.split(/\s*→\s*|\s+\(/)[0] || root.toString(40)).slice(0, 60);
}

/** `input` is the slot that holds the spotted value; when that value comes from elsewhere (a setting such
 * as CANNON_SPEED), the number is not in this block and nothing is spotted. */
interface Spot { type: string; input?: string; when?: (block: Blockly.Block) => boolean; title: string | ((block: Blockly.Block) => string); note: string }
const field = (name: string, value: string) => (block: Blockly.Block) => block.getFieldValue(name) === value;
/** Numbers every game has, found without a note. */
export const SPOTS: Spot[] = [
  { type: 'game_set', when: field('FIELD', 'lives'), title: 'Lives at the start', note: 'How many tries the player gets. More lives make the game easier.' },
  { type: 'game_change', when: field('FIELD', 'lives'), title: 'Lives lost (or won)', note: 'A minus number takes lives away. Try -2 for a harder game, or 0 for no damage at all.' },
  { type: 'game_change', when: field('FIELD', 'score'), title: 'Points', note: 'How many points this gives. Bigger numbers make the score climb faster.' },
  { type: 'scene_jump', title: 'Jump strength', note: 'A bigger number jumps higher. Too big and you fly off the screen!' },
  { type: 'scene_control', input: 'VX', title: 'Move speed', note: 'How fast the keys move this sprite. Bigger is faster.' },
  { type: 'scene_motion_set', when: field('PROPERTY', 'ay'), title: 'Gravity', note: 'How hard things fall. More minus falls faster; closer to 0 floats like on the moon.' },
  { type: 'game_countdown', input: 'SECONDS', title: 'Time on the clock', note: 'How many seconds the countdown starts from.' },
  { type: 'game_finish', input: 'TEXT', title: block => block.getFieldValue('WON') === 'TRUE' ? 'Winning message' : 'Game over message', note: 'The words shown when the game ends. Make them your own!' },
];

const typedHere = (block: Blockly.Block, input: string) => ['py_number', 'text'].includes(block.getInputTargetBlock(input)?.type ?? '');
/** The comment's first line, as the page's title, and the rest as its note. */
export function readNote(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').map(line => line.trim());
  const first = lines.findIndex(Boolean);
  if (first < 0) return null;
  return { title: lines[first].slice(0, MAX_TITLE), note: lines.slice(first + 1).filter(Boolean).join(' ') };
}

/** The magic book's pages, in tab order, then from the top of the tab, then down each script. */
export function magicEntries(workspace: Blockly.Workspace): MagicEntry[] {
  const tabs = scriptTabs(workspace).tabs.map(t => t.id);
  const roots = workspace.getTopBlocks(false).map(root => ({ root, tab: tabOf(workspace, root), at: root.getRelativeToSurfaceXY() }))
    .sort((a, b) => tabs.indexOf(a.tab) - tabs.indexOf(b.tab) || a.at.y - b.at.y || a.at.x - b.at.x);
  const entries: MagicEntry[] = [];
  for (const { root, tab } of roots) {
    const script = scriptName(root);
    for (const block of root.getDescendants(true)) {
      if (block.isShadow()) continue;
      const comment = block.getCommentText(), note = comment ? readNote(comment) : null;
      const spot = note ? null : SPOTS.find(s => s.type === block.type && (!s.when || s.when(block)) && typedHere(block, s.input ?? 'VALUE'));
      if (!note && !spot) continue;
      const values = blockValues(block);
      if (spot && !values.length) continue;
      entries.push({
        blockId: block.id, values: values.slice(0, MAX_VALUES), more: Math.max(0, values.length - MAX_VALUES), tab, script,
        ...(note ? { title: note.title, note: note.note, source: 'note' as const }
          : { title: typeof spot!.title === 'function' ? spot!.title(block) : spot!.title, note: spot!.note, source: 'spotted' as const }),
      });
    }
  }
  return entries;
}

/** A value typed in the magic book, checked the way the block checks it. */
export function acceptValue(kind: MagicValue['kind'], text: string, options?: [string, string][]): string | null {
  if (kind === 'text') return text.slice(0, 500);
  if (kind === 'choice') return options?.some(([, value]) => value === text) ? text : null;
  const value = text.trim().replace(/^\+/, '').replace(/^−/, '-');
  return isPythonNumber(value) ? value : null;
}
/** The − and + buttons: a step that suits the number (1 for 3, 10 for 220, 0.01 for 0.1). */
export function stepValue(text: string, direction: 1 | -1): string | null {
  if (!isPythonNumber(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  const decimals = (text.split('.')[1] ?? '').replace(/e.*$/i, '').length;
  const size = Math.abs(value);
  let step = size >= 10 ? 10 ** (Math.floor(Math.log10(size)) - 1) : decimals ? 10 ** -Math.max(decimals, size < 1 ? Math.ceil(-Math.log10(size || 1)) + 1 : 1) : 1;
  if (!decimals && step < 1) step = 1;
  const places = Math.max(decimals, step < 1 ? Math.round(-Math.log10(step)) : 0);
  const next = Math.round((value + direction * step) * 10 ** places) / 10 ** places;
  return places ? next.toFixed(places) : String(next);
}
