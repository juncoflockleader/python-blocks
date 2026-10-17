import * as Blockly from 'blockly/core';
import { backdrops, keys } from '../scene/model';
import { sceneState } from '../scene/state';
import { allSymbols, eventNameError, handlerSignatures, nameError, type Handler, type Signature } from './functions';
import type { FunctionState } from '../blocks/core/functions';

/** Palette-only event blocks. Dragging one out never leaves a template on the
 * workspace: the drop creates an ordinary handler definition (`py_handler`)
 * with the same signature rules as Events → Manage handlers, so generated
 * Python and the Python bridge see exactly what the dialog would produce. */
export const HAT_KINDS = ['start', 'key', 'click', 'overlap', 'update', 'countdown', 'message', 'backdrop'] as const;
export type HatKind = typeof HAT_KINDS[number];
/** The four hats a Starter palette shows; Builder and Pro show every kind. */
export const STARTER_HATS: readonly HatKind[] = ['start', 'key', 'click', 'overlap'];
export const HAT_TYPE = 'py_event_hat';
const SPRITE_HATS = new Set<HatKind>(['click', 'overlap', 'update']);
export const needsSprite = (kind: HatKind) => SPRITE_HATS.has(kind);
export interface HatTemplate { kind: HatKind; key?: string; sprite?: string; other?: string; message?: string; backdrop?: string }
type State = Blockly.serialization.blocks.State;
interface HatBlock extends Blockly.Block { hatKind: HatKind; build(this: HatBlock): void }

function spriteMenu(any: boolean) {
  return function (this: Blockly.FieldDropdown): Blockly.MenuOption[] {
    const block = this.getSourceBlock();
    const options = block ? sceneState(block.workspace).sprites.map(s => [s.name, s.id] as [string, string]) : [];
    if (any) return [['any sprite', ''], ...options];
    return options.length ? options : [['no sprites yet', '']];
  };
}
const tooltips: Record<HatKind, string> = {
  start: 'Runs once when the project starts.',
  key: 'Runs each time the key is pressed. Click the stage first so it receives keys.',
  click: 'Runs when this sprite or one of its clones is clicked.',
  overlap: 'Runs when this sprite starts touching another sprite.',
  update: 'Runs for this sprite about 30 times a second while the project runs.',
  countdown: 'Runs when a game countdown reaches zero.',
  message: 'Runs each time this message is sent.',
  backdrop: 'Runs when the stage switches to this backdrop, or to any backdrop.',
};
function backdropMenu(this: Blockly.FieldDropdown): Blockly.MenuOption[] {
  const block = this.getSourceBlock();
  return [['any backdrop', ''], ...(block ? backdrops(sceneState(block.workspace)).map(a => [a.name, a.id] as [string, string]) : [])];
}

Blockly.Blocks[HAT_TYPE] = {
  init(this: HatBlock) {
    this.hatKind = 'start'; this.hat = 'cap'; this.setColour('#ba7b4e'); this.build();
    if (this.isInFlyout && this instanceof Blockly.BlockSvg) this.setDragStrategy(new HatDragStrategy(this));
  },
  build(this: HatBlock) {
    for (const input of [...this.inputList]) this.removeInput(input.name);
    const header = this.appendDummyInput('HEADER').appendField('when');
    const kind = this.hatKind;
    if (kind === 'start') header.appendField('game starts');
    if (kind === 'key') header.appendField(new Blockly.FieldDropdown(keys.map(([label, key]) => [label, key] as [string, string])), 'KEY').appendField('key pressed');
    if (SPRITE_HATS.has(kind)) header.appendField(new Blockly.FieldDropdown(spriteMenu(false)), 'SPRITE');
    if (kind === 'click') header.appendField('clicked');
    if (kind === 'overlap') header.appendField('overlaps').appendField(new Blockly.FieldDropdown(spriteMenu(true)), 'OTHER');
    if (kind === 'update') header.appendField('updates');
    if (kind === 'countdown') header.appendField('countdown ends');
    if (kind === 'message') header.appendField('I receive').appendField(new Blockly.FieldTextInput('message'), 'MESSAGE');
    if (kind === 'backdrop') header.appendField('backdrop switches to').appendField(new Blockly.FieldDropdown(backdropMenu), 'BACKDROP');
    this.appendStatementInput('BODY');
    this.setTooltip(`${tooltips[kind]} Dropping it creates an event handler; Events → Manage handlers edits its payload and order.`);
  },
  saveExtraState(this: HatBlock) { return { kind: this.hatKind }; },
  loadExtraState(this: HatBlock, state: { kind?: unknown }) {
    if (!HAT_KINDS.includes(state?.kind as HatKind)) throw new Error('Unknown event block.');
    this.hatKind = state.kind as HatKind; this.build();
  },
};

/** Blockly 13 clones flyout blocks in `getTargetBlock`. Hats substitute the
 * handler they create, so the dragged block is already the real definition. */
class HatDragStrategy extends Blockly.dragging.BlockDragStrategy {
  constructor(private readonly template: Blockly.BlockSvg) { super(template); }
  protected override getTargetBlock(): Blockly.BlockSvg {
    const target = this.template.workspace.targetWorkspace;
    if (!this.template.isInFlyout || !target) return super.getTargetBlock();
    let state: State;
    try { state = handlerState(target, templateOf(Blockly.serialization.blocks.save(this.template)!)); }
    catch { return super.getTargetBlock(); } // A stale template (its sprite was deleted) is removed by the workspace guard.
    const block = Blockly.serialization.blocks.append(state, target, { recordUndo: true }) as Blockly.BlockSvg;
    Blockly.Events.setRecordUndo(false);
    try { block.render(); this.positionNewBlock(this.template, block); block.setDragging(true); }
    finally { Blockly.Events.setRecordUndo(true); }
    return block;
  }
}

export const isHatState = (state: { type?: string }) => state.type === HAT_TYPE;
export function templateOf(state: State): HatTemplate {
  const kind = (state.extraState as { kind?: HatKind } | undefined)?.kind;
  if (!kind || !HAT_KINDS.includes(kind)) throw new Error('Unknown event block.');
  const fields = (state.fields ?? {}) as Record<string, string>;
  return { kind, key: fields.KEY, sprite: fields.SPRITE, other: fields.OTHER, message: fields.MESSAGE, backdrop: fields.BACKDROP };
}
/** Palette entry for one hat, with defaults drawn from the current scene. */
export function hatItem(kind: HatKind, sprite = '', other = ''): Blockly.utils.toolbox.BlockInfo {
  const fields: Record<string, string> = {};
  if (kind === 'key') fields.KEY = 'Space';
  if (SPRITE_HATS.has(kind)) fields.SPRITE = sprite;
  if (kind === 'overlap') fields.OTHER = other;
  if (kind === 'message') fields.MESSAGE = 'message';
  if (kind === 'backdrop') fields.BACKDROP = '';
  return { kind: 'block', type: HAT_TYPE, extraState: { kind }, fields };
}

const slug = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
function handlerName(workspace: Blockly.Workspace, base: string) {
  const taken = new Set([...workspace.getProcedureMap().getProcedures().map(f => f.getName()), ...allSymbols(workspace).filter(s => s.kind === 'project').map(s => s.name)]);
  const root = nameError(base) ? 'on_event' : base;
  let name = root;
  for (let n = 2; taken.has(name); n++) name = `${root}_${n}`;
  return name;
}

/** The handler a hat creates: unique name, `payload` parameter and the next
 * delivery position, exactly as the Events dialog fills them in. */
export function handlerSignature(workspace: Blockly.Workspace, template: HatTemplate): Signature {
  const scene = sceneState(workspace);
  const sprite = scene.sprites.find(s => s.id === template.sprite);
  if (SPRITE_HATS.has(template.kind) && !sprite) throw new Error('Add a sprite before using this event block.');
  const typed = (template.message ?? '').trim(), message = typed && !eventNameError(typed) && typed !== 'start' ? typed : 'message';
  const owner = sprite ? slug(sprite.name) || 'sprite' : '';
  const key = keys.find(([, value]) => value === template.key);
  const backdrop = template.backdrop ? backdrops(scene).find(a => a.id === template.backdrop) : undefined;
  if (template.kind === 'key' && !key) throw new Error('Choose a key for this event block.');
  const [event, base]: [string, string] = {
    start: ['start', 'on_start'],
    key: [`key:${key?.[1]}`, `on_${slug(key?.[0] ?? '') || 'key'}_key`],
    click: ['click', `on_${owner}_click`],
    overlap: ['overlap', `on_${owner}_overlap`],
    update: ['update', `on_${owner}_update`],
    countdown: ['game:countdown', 'on_countdown_end'],
    message: [message, `on_${slug(message) || 'message'}`],
    backdrop: backdrop ? [`backdrop:${backdrop.id}`, `on_backdrop_${slug(backdrop.name) || 'change'}`] : ['backdrop:change', 'on_backdrop_change'],
  }[template.kind] as [string, string];
  const handler: Handler = { event, order: Math.max(-1, ...handlerSignatures(workspace).map(h => h.handler!.order)) + 1, ...(sprite ? { sprite: sprite.id } : {}) };
  return { id: Blockly.utils.idGenerator.genUid(), name: handlerName(workspace, base), async: true, parameters: [{ id: Blockly.utils.idGenerator.genUid(), name: 'payload' }], handler };
}

/** A serialized `py_handler` for the template. "Overlaps Star" starts with a
 * check for that sprite, because the runtime event fires for any contact. */
export function handlerState(workspace: Blockly.Workspace, template: HatTemplate): State {
  const signature = handlerSignature(workspace, template);
  const other = template.kind === 'overlap' && template.other && sceneState(workspace).sprites.some(s => s.id === template.other) ? template.other : '';
  const body: State | undefined = other ? { type: 'controls_if', inputs: { IF0: { block: { type: 'scene_overlaps', inputs: { SPRITE: { block: { type: 'scene_self' } }, OTHER: { block: { type: 'scene_sprite', fields: { SPRITE_ID: other } } } } } } } } : undefined;
  return { type: 'py_handler', extraState: { functionId: signature.id, signature } satisfies FunctionState, ...(body ? { inputs: { BODY: { block: body } } } : {}) };
}

/** Insert a handler for a hat outside a drag (block search, keyboard insert). */
export function insertHat(workspace: Blockly.WorkspaceSvg, template: HatTemplate) {
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try { return Blockly.serialization.blocks.append(handlerState(workspace, template), workspace, { recordUndo: true }) as Blockly.BlockSvg; }
  finally { Blockly.Events.setGroup(group); }
}

/** Templates should only exist in flyouts. If one arrives some other way
 * (a paste from the flyout, an add-on insert path), replace it in place within
 * the same undo group so one Undo still removes everything. */
export function installHatGuard(workspace: Blockly.WorkspaceSvg) {
  const replace = (event: Blockly.Events.Abstract) => {
    if (event.type !== Blockly.Events.BLOCK_CREATE && event.type !== Blockly.Events.BLOCK_DRAG) return;
    for (const block of workspace.getBlocksByType(HAT_TYPE, false).filter(b => !b.isDeadOrDying() && !(b as Blockly.BlockSvg).isDragging())) {
      const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(event.group || true);
      try {
        const position = block.getRelativeToSurfaceXY();
        const children = block.getInputTargetBlock('BODY');
        const created = Blockly.serialization.blocks.append({ ...handlerState(workspace, templateOf(Blockly.serialization.blocks.save(block, { addInputBlocks: false })!)), x: position.x, y: position.y }, workspace, { recordUndo: true });
        if (children?.previousConnection) created.getInput('BODY')?.connection?.connect(children.previousConnection);
        block.dispose(false);
      } catch { block.dispose(false); }
      finally { Blockly.Events.setGroup(group); }
    }
  };
  workspace.addChangeListener(replace);
  return () => workspace.removeChangeListener(replace);
}
