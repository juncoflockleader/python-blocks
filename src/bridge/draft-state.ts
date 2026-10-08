import * as Blockly from 'blockly/core';
import { canonical, utf8Size } from '../language/modules';

export interface PythonDraft {
  source: string;
  /** Exact last accepted source; it may retain learner formatting/comments. */
  baseSource: string;
  /** SHA-256 of the complete authored project, excluding Python draft state. */
  baseRevision: string;
  origin: 'blocks' | 'python';
}
export interface RecoveredDraft extends PythonDraft {
  id: string;
  reason: 'before-apply' | 'replaced' | 'discarded';
}
export interface BridgeState { version: 1; draft?: PythonDraft; recovery: RecoveredDraft[] }
export const MAX_RECOVERIES = 20;
export const MAX_SOURCE_BYTES = 16_000_000;
const states = new WeakMap<Blockly.Workspace, BridgeState>();
export const emptyBridge = (): BridgeState => ({ version: 1, recovery: [] });
export function bridgeState(workspace: Blockly.Workspace): BridgeState { return structuredClone(states.get(workspace) ?? emptyBridge()); }
export const draftChanged = (draft?: PythonDraft) => !!draft && draft.source !== draft.baseSource;

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid saved Python draft.');
}
function draft(value: unknown): asserts value is PythonDraft {
  object(value);
  if (typeof value.source !== 'string' || typeof value.baseSource !== 'string' || utf8Size(value.source) > MAX_SOURCE_BYTES || utf8Size(value.baseSource) > MAX_SOURCE_BYTES) throw new Error('Saved Python source exceeds the 16 MB limit or is not text.');
  if (typeof value.baseRevision !== 'string' || !/^[a-f0-9]{64}$/.test(value.baseRevision) || !['blocks', 'python'].includes(String(value.origin))) throw new Error('The saved Python draft has an invalid base revision.');
}
export function validateBridgeState(value: unknown): asserts value is BridgeState {
  object(value);
  if (value.version !== 1 || !Array.isArray(value.recovery) || value.recovery.length > MAX_RECOVERIES) throw new Error('Unsupported Python draft format or too many recovery entries.');
  if (value.draft !== undefined) draft(value.draft);
  const ids = new Set<string>();
  for (const item of value.recovery) {
    draft(item); const entry = item as unknown as RecoveredDraft;
    if (typeof entry.id !== 'string' || !entry.id || entry.id.length > 128 || ids.has(entry.id) || !['before-apply', 'replaced', 'discarded'].includes(entry.reason)) throw new Error('Invalid Python recovery entry.');
    ids.add(entry.id);
  }
}

/** A notification only: typing never consumes the block Undo stack. */
export class BridgeNotification extends Blockly.Events.Abstract {
  type = 'py_bridge_change'; isBlank = false; recordUndo = false;
  constructor(workspace: Blockly.Workspace) { super(); this.workspaceId = workspace.id; }
  static override fromJson(_json: Blockly.Events.AbstractEventJson, workspace: Blockly.Workspace) { return new BridgeNotification(workspace); }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_bridge_change', BridgeNotification);
export function changeBridgeState(workspace: Blockly.Workspace, state: BridgeState) {
  validateBridgeState(state);
  if (canonical(bridgeState(workspace)) === canonical(state)) return;
  states.set(workspace, structuredClone(state));
  Blockly.Events.fire(new BridgeNotification(workspace));
}
Blockly.serialization.registry.register('pythonBridge', {
  priority: 96,
  save(workspace) { const state = bridgeState(workspace); return state.draft || state.recovery.length ? state : null; },
  load(state, workspace) { validateBridgeState(state); states.set(workspace, structuredClone(state)); },
  clear(workspace) { states.delete(workspace); },
});
