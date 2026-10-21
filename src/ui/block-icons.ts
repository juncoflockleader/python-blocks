import * as Blockly from 'blockly/core';
import { iconSvg, type IconName } from './icon-art';
import { categoryIcons } from './icons';
import { levelTypes } from './levels';
import { handlerKind } from '../guide/checks';
import { HAT_TYPE, isEventHat } from '../language/hats';

/** A small white symbol at the start of every command and event block, so a
 * block's family reads at a glance: its palette category's icon, or a more
 * specific one for common blocks and for each kind of event. Value blocks stay
 * compact. The symbol is decoration only: it has no value, is not saved, and
 * its alternative text is empty. */
const blockIcons: Record<string, IconName> = {
  py_program: 'play', controls_if: 'decide', py_wait: 'hourglass', sound_wait: 'hourglass', py_flow: 'stop',
  scene_say: 'message', scene_say_for: 'message', game_message: 'message',
  scene_turn: 'rotate', scene_point: 'rotate', scene_rotation: 'rotate',
  scene_destroy: 'trash', game_countdown: 'clock', game_countdown_stop: 'clock',
  sound_stop: 'mute', sound_stop_all: 'mute', scene_camera_follow: 'target', scene_camera_go: 'target',
};
const eventIcons: Record<string, IconName> = {
  start: 'flag', key: 'keyboard', release: 'keyboard', click: 'pointer', overlap: 'touch', update: 'restart',
  countdown: 'clock', message: 'message', backdrop: 'image', world: 'world', stage: 'pointer',
};
/** A block's symbol: its own, its event's for a "when" block, or its category's in the Pro palette. */
function symbolOf(type: string, hatKind: string | undefined, category: string | undefined): IconName | undefined {
  if (hatKind !== undefined) return eventIcons[hatKind] ?? 'event';
  if (blockIcons[type]) return blockIcons[type];
  return category ? categoryIcons[category] : undefined;
}
// The palette is the single source of truth for which category offers a block (per workspace, at Pro).
const proCategories = new WeakMap<Blockly.Workspace, Map<string, string>>();
const proCategory = (workspace: Blockly.Workspace, type: string) => {
  let map = proCategories.get(workspace);
  if (!map) { map = levelTypes(workspace as Blockly.WorkspaceSvg, 'pro'); proCategories.set(workspace, map); }
  return map.get(type);
};
let scratch: Blockly.Workspace | null = null;
const looks = new Map<string, { colour: string; icon?: IconName }>();
/** How a block looks, from its own definition, the same data the picker draws it with: its colour and its symbol.
 * `ref` names it as lesson text does: a type, `hat:start` for a "when" block, `controls_if:else`, or `game_set:FIELD=lives`.
 * A block's picture in lesson text uses this, so it always matches the block in the picker. */
export function blockLook(workspace: Blockly.Workspace, ref: string) {
  let look = looks.get(ref);
  if (look) return look;
  const [head, rest] = ref.split(':'), hat = head === 'hat', type = hat ? HAT_TYPE : head;
  if (!Blockly.Blocks[type]) return undefined;
  scratch ??= new Blockly.Workspace();
  const block = scratch.newBlock(type);
  try {
    if (hat) (block as Blockly.Block & { loadExtraState?(state: unknown): void }).loadExtraState?.({ kind: rest });
    look = { colour: block.getColour(), icon: symbolOf(type, hat ? rest : undefined, proCategory(workspace, type)) };
  } finally { block.dispose(false); }
  looks.set(ref, look);
  return look;
}
const sources = new Map<IconName, string>();
const source = (name: IconName) => {
  let url = sources.get(name);
  if (!url) { url = `data:image/svg+xml,${encodeURIComponent(iconSvg(name, 'white'))}`; sources.set(name, url); }
  return url;
};
const FIELD = 'PB_ICON';
const SIZE = 18;

export function installBlockIcons(workspace: Blockly.Workspace) {
  function iconFor(block: Blockly.Block): IconName | undefined {
    if (block.type === 'py_handler') {
      const event = (block as Blockly.Block & { signature?: { handler?: { event: string } } }).signature?.handler?.event;
      return symbolOf(block.type, event ? handlerKind(event) : '', undefined);
    }
    if (isEventHat(block)) return symbolOf(block.type, block.hatKind, undefined);
    return symbolOf(block.type, undefined, proCategory(workspace, block.type));
  }
  function ensure(block: Blockly.Block) {
    if (block.outputConnection || block.isShadow()) return;
    const name = iconFor(block), input = block.inputList[0];
    if (!name || !input) return;
    const existing = block.getField(FIELD) as Blockly.FieldImage | null;
    if (existing && input.fieldRow[0] === existing) { if (existing.getValue() !== source(name)) existing.setValue(source(name)); return; }
    if (existing) existing.getParentInput().removeField(FIELD);
    input.insertFieldAt(0, new Blockly.FieldImage(source(name), SIZE, SIZE, ''), FIELD);
  }
  // Blocks that rebuild their first row (event hats) or change their event
  // (handlers) are checked again after those methods run.
  const hooks = ['init', 'build', 'loadExtraState', 'domToMutation', 'doProcedureUpdate'] as const;
  for (const definition of Object.values(Blockly.Blocks) as Record<string, unknown>[]) {
    for (const hook of hooks) {
      const original = definition[hook];
      if (typeof original !== 'function' || (original as { blockIcons?: true }).blockIcons) continue;
      const wrapped = function (this: Blockly.Block, ...args: unknown[]) {
        const result = (original as (...a: unknown[]) => unknown).apply(this, args);
        if (!this.isDeadOrDying()) ensure(this);
        return result;
      };
      wrapped.blockIcons = true as const;
      definition[hook] = wrapped;
    }
  }
}
