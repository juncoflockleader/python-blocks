import type * as Blockly from 'blockly/core';
import { blockNumber, captioned } from '../ui/block-captions';
import { categoryItems, findBlock, type Level } from '../ui/levels';
import { HAT_TYPE, type HatKind } from '../language/hats';

/** A classroom step's own blocks. A step lists the few blocks it needs the way lesson text names a
 * block, "Events#hat:click" or "Looks#scene_say_for", and the editor offers exactly those in one flat
 * list ("Your blocks") in place of the categories. Each is the picker's own block, with its inputs
 * and the selected sprite filled in, so a block dragged from the list is the block the picker gives. */
type Item = Blockly.utils.toolbox.FlyoutItemInfo;
type BlockItem = Blockly.utils.toolbox.BlockInfo;
export const YOUR_BLOCKS = 'Your blocks';
const parse = (entry: string) => { const at = entry.indexOf('#'); return { category: entry.slice(0, at), ref: entry.slice(at + 1) }; };

/** The picker's block for one entry: looked for at the unit's own level first, then at the learner's (which is never lower). */
function blockFor(workspace: Blockly.WorkspaceSvg, levels: Level[], entry: string): BlockItem | undefined {
  const { category, ref } = parse(entry);
  for (const level of levels) {
    const found = findBlock(workspace, level, category, ref); if (!found) continue;
    const blocks = categoryItems(workspace, level, found.category).filter(item => item.kind === 'block');
    return blocks[found.number - 1] as BlockItem;
  }
  return undefined;
}
/** The blocks a step lists, in its order; an entry the picker does not have is left out. */
export function stepBlocks(workspace: Blockly.WorkspaceSvg, levels: Level[], entries: readonly string[]): BlockItem[] {
  return entries.flatMap(entry => { const block = blockFor(workspace, levels, entry); return block ? [block] : []; });
}
/** The entries the picker cannot find, for the content tests. */
export const missingBlocks = (workspace: Blockly.WorkspaceSvg, levels: Level[], entries: readonly string[]) => entries.filter(entry => !blockFor(workspace, levels, entry));
/** The flat list as flyout items: its title, then each block under its number and keyword. */
export function stepToolbox(workspace: Blockly.WorkspaceSvg, levels: Level[], entries: readonly string[]): Item[] {
  return [{ kind: 'label', text: YOUR_BLOCKS, 'web-class': 'classroom-blocks-title' } as Item, ...captioned(stepBlocks(workspace, levels, entries))];
}
/** A block's number in the flat list, as its caption shows it. */
export const stepBlockNumber = (workspace: Blockly.WorkspaceSvg, levels: Level[], entries: readonly string[], ref: string) => blockNumber(stepBlocks(workspace, levels, entries), ref);

function collect(state: Blockly.serialization.blocks.State | undefined, into: (type: string) => void) {
  if (!state) return;
  into(state.type);
  for (const input of Object.values(state.inputs ?? {})) { collect(input.block, into); collect(input.shadow, into); }
  collect(state.next?.block, into);
}
/** Every block type in some scripts' stacks, with the blocks in their inputs. */
export function typesIn(stacks: Blockly.serialization.blocks.State[][]) {
  const types = new Set<string>();
  for (const stack of stacks) for (const block of stack) collect(block, type => types.add(type));
  return types;
}
/** What a list can make: every block type it offers (with the blocks in their inputs), and the kinds of "when …" block. */
export function offered(workspace: Blockly.WorkspaceSvg, levels: Level[], entries: readonly string[]) {
  const types = new Set<string>(), hats = new Set<HatKind>();
  for (const block of stepBlocks(workspace, levels, entries)) {
    if (block.type === HAT_TYPE) { hats.add((block.extraState as { kind: HatKind }).kind); continue; }
    collect(block as Blockly.serialization.blocks.State, type => types.add(type));
  }
  return { types, hats };
}
