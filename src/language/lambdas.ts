import * as Blockly from 'blockly/core';
import { lambdaParameterSymbol, nameError, refreshSymbols, SymbolField, type LambdaBlock, type LambdaState, type Parameter } from './functions';

export const lambdaState = (names = ['value']): LambdaState => ({ id: Blockly.utils.idGenerator.genUid(), parameters: names.map(name => ({ id: Blockly.utils.idGenerator.genUid(), name })) });
export function validateLambda(state: unknown): asserts state is LambdaState {
  if (!state || typeof state !== 'object') throw new Error('The lambda parameter model is invalid.');
  const value = state as LambdaState;
  const identity = (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= 128;
  if (!identity(value.id) || !Array.isArray(value.parameters) || value.parameters.length > 100) throw new Error('A lambda needs a scope identity and 0–100 parameters.');
  for (const p of value.parameters) {
    if (!p || !identity(p.id) || typeof p.name !== 'string') throw new Error('Each lambda parameter needs a name and identity.');
    const error = nameError(p.name); if (error) throw new Error(error);
  }
  if (new Set(value.parameters.map(p => p.id)).size !== value.parameters.length || new Set(value.parameters.map(p => p.name)).size !== value.parameters.length) throw new Error('Lambda parameters need distinct names and identities.');
}
export function validateLambdaIdentities(workspace: Blockly.Workspace) {
  const ids = new Set(workspace.getProcedureMap().getProcedures().map(f => f.getId()));
  for (const b of workspace.getAllBlocks(false)) if (b.type === 'py_lambda') {
    const state = (b as LambdaBlock).lambda; validateLambda(state);
    if (ids.has(state.id)) throw new Error('Lambda scopes need distinct identities. Use Duplicate or copy/paste to create an independent lambda.');
    ids.add(state.id);
  }
}
function applyLambda(block: LambdaBlock, state: LambdaState) {
  Blockly.Events.disable();
  try {
    // Cache labels before a removed parameter becomes unresolved. Its read
    // blocks remain intact, so Undo can restore the exact binding.
    const owned = new Set(block.lambda.parameters.map(p => lambdaParameterSymbol(block.lambda.id, p.id)));
    for (const b of block.workspace.getAllBlocks(false)) {
      const field = b.getField('SYMBOL');
      if (field instanceof SymbolField && owned.has(field.getValue()!)) field.loadState(field.saveState(true)!);
    }
    block.lambda = structuredClone(state); block.updateLambda(); refreshSymbols(block.workspace);
  } finally { Blockly.Events.enable(); }
}
interface LambdaEventJson extends Blockly.Events.AbstractEventJson { blockId: string; before: LambdaState; after: LambdaState }
class LambdaEvent extends Blockly.Events.Abstract {
  type = 'py_lambda_parameters'; isBlank = false;
  constructor(block: LambdaBlock, readonly before: LambdaState, readonly after: LambdaState) { super(); this.workspaceId = block.workspace.id; this.blockId = block.id; }
  readonly blockId: string;
  override run(forward: boolean) {
    const block = this.getEventWorkspace_().getBlockById(this.blockId) as LambdaBlock | null;
    if (!block) throw new Error('The lambda no longer exists.');
    applyLambda(block, forward ? this.after : this.before);
    const notification = new LambdaEvent(block, forward ? this.before : this.after, forward ? this.after : this.before);
    notification.recordUndo = false; Blockly.Events.fire(notification);
  }
  override toJson(): LambdaEventJson { return { ...super.toJson(), blockId: this.blockId, before: this.before, after: this.after }; }
  static override fromJson(json: LambdaEventJson, workspace: Blockly.Workspace) {
    const block = workspace.getBlockById(json.blockId) as LambdaBlock | null;
    if (!block) throw new Error('The lambda no longer exists.');
    const event = new LambdaEvent(block, json.before, json.after); event.group = json.group; return event;
  }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_lambda_parameters', LambdaEvent);
export function editLambda(block: LambdaBlock, parameters: Parameter[]) {
  const next = { id: block.lambda.id, parameters: structuredClone(parameters) }; validateLambda(next);
  const before = structuredClone(block.lambda); if (JSON.stringify(before) === JSON.stringify(next)) return;
  applyLambda(block, next); Blockly.Events.fire(new LambdaEvent(block, before, next));
}
