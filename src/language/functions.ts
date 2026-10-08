import { validKind } from '../scene/motion';
import * as Blockly from 'blockly/core';
import { ObservableParameterModel, ObservableProcedureModel, triggerProceduresUpdate } from '@blockly/block-shareable-procedures';
import eventLimits from '../runtime/event-limits.json';

export { ObservableParameterModel, ObservableProcedureModel };
// The plugin normally derives parameter names from a case-insensitive shared
// variable map. Keep the Python name on the parameter itself; its hidden backing
// variable only satisfies the plugin's interface and never binds learner code.
class PythonParameterModel extends ObservableParameterModel {
  constructor(workspace: Blockly.Workspace, private pythonName: string, id = Blockly.utils.idGenerator.genUid()) {
    super(workspace, `_pb_parameter_${id}`, id, `_pb_parameter_${id}`);
  }
  override getName() { return this.pythonName; }
  override setName(name: string) { this.pythonName = name; return this; }
  static override loadState(state: Blockly.serialization.procedures.ParameterState, workspace: Blockly.Workspace) { return new PythonParameterModel(workspace, state.name, state.id); }
}
export const MODULE_SCOPE = 'py:module';
export const localScope = (functionId: string) => `py:local:${functionId}`;
export const parameterSymbol = (parameterId: string) => `param:${parameterId}`;
export interface Parameter { id: string; name: string }
export interface LambdaState { id: string; parameters: Parameter[] }
export interface LambdaBlock extends Blockly.Block { lambda: LambdaState; updateLambda(): void }
export const lambdaParameterSymbol = (scope: string, parameter: string) => `lambda:${JSON.stringify([scope, parameter])}`;
export interface Handler { event: string; order: number; sprite?: string; kind?: string }
export interface Signature { id: string; name: string; parameters: Parameter[]; async?: boolean; handler?: Handler }
export const isScopedDefinition = (block: Blockly.Block) => ['py_function', 'py_handler'].includes(block.type);
export function eventNameError(name: unknown) {
  return typeof name !== 'string' || !name || [...name].length > eventLimits.eventNameLength ? `Event names need 1–${eventLimits.eventNameLength} characters.` : name.startsWith('_pb:') ? 'Names beginning with _pb: are reserved for scene events.' : null;
}
function validateExecution(state: { async?: unknown; handler?: unknown }) {
  if (state.async !== undefined && typeof state.async !== 'boolean') throw new Error('The async function setting is invalid.');
  if (state.handler !== undefined) {
    const handler = state.handler as Handler | null;
    if (!handler || eventNameError(handler.event) || !Number.isSafeInteger(handler.order) || handler.order < 0 || state.async !== true) throw new Error('A handler needs an event name, a nonnegative saved order, and an async definition.');
    if (handler.kind !== undefined && (!validKind(handler.kind) || handler.sprite !== undefined)) throw new Error('A kind behavior needs a kind of 1–32 characters and no individual sprite target.');
    if (handler.sprite !== undefined && (typeof handler.sprite !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(handler.sprite))) throw new Error('A sprite behavior needs a valid authored sprite ID.');
  }
}
class PythonProcedureModel extends ObservableProcedureModel {
  isAsync = false;
  handler?: Handler;
  setExecution(state: { async?: unknown; handler?: unknown }) {
    validateExecution(state); this.isAsync = state.async === true; this.handler = state.handler ? structuredClone(state.handler as Handler) : undefined;
    return this;
  }
  override saveState(): Blockly.serialization.procedures.State {
    return { ...super.saveState(), ...(this.isAsync ? { async: true } : {}), ...(this.handler ? { handler: { ...this.handler } } : {}) };
  }
  static override loadState(state: Blockly.serialization.procedures.State, workspace: Blockly.Workspace) {
    return new PythonProcedureModel(workspace, state.name, state.id).setReturnTypes(state.returnTypes).setExecution({ async: state.async, handler: state.handler });
  }
}
if (Blockly.registry.hasItem(Blockly.registry.Type.SERIALIZER, 'procedures')) Blockly.serialization.registry.unregister('procedures');
Blockly.serialization.registry.register('procedures', new Blockly.serialization.procedures.ProcedureSerializer(PythonProcedureModel, PythonParameterModel));
export interface Symbol { id: string; name: string; kind: 'project' | 'local' | 'parameter'; owner?: string }
export interface FunctionBlock extends Blockly.Block {
  functionId: string;
  signature: Signature;
  getProcedureModel(): ObservableProcedureModel | undefined;
  doProcedureUpdate(): void;
}

const keywords = new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' '));
// These names appear in generated operations or belong to the host API.
const reserved = new Set('print range int float str bool len list dict set tuple enumerate zip min max sum abs round input sorted reversed isinstance callable map filter any all pen playground events random math'.split(' '));
export function nameError(name: string): string | null {
  if (!/^[_\p{ID_Start}][_\p{ID_Continue}]*$/u.test(name) || name.normalize('NFKC') !== name) return 'Use a Python identifier: start with a letter or underscore, then letters, digits, or underscores.';
  if (keywords.has(name) || reserved.has(name) || name.startsWith('_pb_')) return `“${name}” is reserved. Choose another name.`;
  return null;
}
export function signatureOf(model: Blockly.procedures.IProcedureModel): Signature {
  const execution = model as PythonProcedureModel;
  return { id: model.getId(), name: model.getName(), parameters: model.getParameters().map(p => ({ id: p.getId(), name: p.getName() })), ...(execution.isAsync ? { async: true } : {}), ...(execution.handler ? { handler: { ...execution.handler } } : {}) };
}
export function handlerSignatures(workspace: Blockly.Workspace) {
  return workspace.getProcedureMap().getProcedures().map(signatureOf).filter(s => s.handler).sort((a, b) => a.handler!.order - b.handler!.order || a.id.localeCompare(b.id));
}
export function allSymbols(workspace: Blockly.Workspace): Symbol[] {
  workspace = (workspace as Blockly.WorkspaceSvg).targetWorkspace ?? workspace;
  const variables = workspace.getVariableMap().getAllVariables().flatMap<Symbol>(v => {
    const type = v.getType();
    if (type === MODULE_SCOPE) return [{ id: v.getId(), name: v.getName(), kind: 'project' as const }];
    if (type.startsWith('py:local:')) return [{ id: v.getId(), name: v.getName(), kind: 'local' as const, owner: type.slice('py:local:'.length) }];
    return [];
  });
  const lambdaParameters = workspace.getAllBlocks(false).filter(b => b.type === 'py_lambda' && (b as LambdaBlock).lambda).flatMap(b => {
    const state = (b as LambdaBlock).lambda;
    return state.parameters.map(p => ({ id: lambdaParameterSymbol(state.id, p.id), name: p.name, kind: 'parameter' as const, owner: state.id }));
  });
  return [...variables, ...workspace.getProcedureMap().getProcedures().flatMap(f => f.getParameters().map(p => ({ id: parameterSymbol(p.getId()), name: p.getName(), kind: 'parameter' as const, owner: f.getId() }))), ...lambdaParameters];
}
export function enclosingFunction(block: Blockly.Block): FunctionBlock | undefined {
  for (let parent: Blockly.Block | null = block; parent; parent = parent.getSurroundParent()) if (isScopedDefinition(parent)) return parent as FunctionBlock;
  return undefined;
}
export function enclosingLambda(block: Blockly.Block): LambdaBlock | undefined {
  for (let parent = block.getSurroundParent(); parent; parent = parent.getSurroundParent()) {
    if (parent.type === 'py_lambda') return parent as LambdaBlock;
    if (isScopedDefinition(parent)) break;
  }
  return undefined;
}
export function resolveSymbol(block: Blockly.Block, id: string): Symbol | undefined {
  return allSymbols(block.workspace).find(s => s.id === id);
}
export function createVariable(workspace: Blockly.Workspace, name: string, owner?: string) {
  const error = nameError(name); if (error) throw new Error(error);
  if (owner && !workspace.getProcedureMap().has(owner)) throw new Error('The function no longer exists.');
  if (allSymbols(workspace).some(s => s.name === name && s.owner === owner)) throw new Error(`“${name}” already exists in this scope.`);
  if (!owner && workspace.getProcedureMap().getProcedures().some(f => f.getName() === name)) throw new Error('A function already has this name.');
  return workspace.getVariableMap().createVariable(name, owner ? localScope(owner) : MODULE_SCOPE);
}
export function validateSignature(workspace: Blockly.Workspace, signature: Signature) {
  validateExecution(signature);
  if (signature.handler && signature.parameters.length !== 1) throw new Error('A handler needs exactly one payload parameter.');
  for (const name of [signature.name, ...signature.parameters.map(p => p.name)]) { const error = nameError(name); if (error) throw new Error(error); }
  if (workspace.getProcedureMap().getProcedures().some(f => f.getId() !== signature.id && f.getName() === signature.name)
    || allSymbols(workspace).some(s => s.kind === 'project' && s.name === signature.name)) throw new Error(`“${signature.name}” already exists in the project.`);
  if (new Set(signature.parameters.map(p => p.id)).size !== signature.parameters.length || new Set(signature.parameters.map(p => p.name)).size !== signature.parameters.length) throw new Error('Every parameter needs a distinct name and identity.');
  const locals = allSymbols(workspace).filter(s => s.kind === 'local' && s.owner === signature.id);
  if (signature.parameters.some(p => locals.some(s => s.name === p.name))) throw new Error('A parameter and a local variable cannot have the same name.');
}
export function createFunctionModel(workspace: Blockly.Workspace, signature: Signature) {
  validateSignature(workspace, signature);
  const model = new PythonProcedureModel(workspace, signature.name, signature.id).setExecution(signature);
  model.startBulkUpdate();
  signature.parameters.forEach((p, i) => model.insertParameter(new PythonParameterModel(workspace, p.name, p.id), i));
  model.endBulkUpdate(); workspace.getProcedureMap().add(model);
  return model;
}

interface Attachment { call: string; parameter: string; block: string; shadow: boolean }
function attachments(workspace: Blockly.Workspace, id: string): Attachment[] {
  return workspace.getAllBlocks(false).filter(b => ['py_call', 'py_call_value'].includes(b.type) && (b as FunctionBlock).functionId === id).flatMap(b =>
    (b as FunctionBlock).signature.parameters.flatMap(p => {
      const child = b.getInputTargetBlock(`ARG_${p.id}`);
      return child ? [{ call: b.id, parameter: p.id, block: child.id, shadow: child.isShadow() }] : [];
    }));
}
function applySignature(workspace: Blockly.Workspace, signature: Signature, connections: Attachment[]) {
  const model = workspace.getProcedureMap().get(signature.id) as PythonProcedureModel | undefined;
  if (!model) throw new Error('The function no longer exists.');
  // One atomic edit: intermediate delete/insert events would expose transient
  // signatures during undo, before a call's inputs exist to receive arguments.
  Blockly.Events.disable();
  try {
    model.startBulkUpdate(); model.setExecution(signature); model.setName(signature.name);
    const previous = new Map(model.getParameters().map(p => [p.getId(), p as ObservableParameterModel]));
    for (let i = model.getParameters().length - 1; i >= 0; i--) model.deleteParameter(i);
    signature.parameters.forEach((p, i) => {
      const param = previous.get(p.id) ?? new PythonParameterModel(workspace, p.name, p.id);
      param.setName(p.name); model.insertParameter(param, i);
    });
    model.endBulkUpdate();
    for (const saved of connections) {
      const child = workspace.getBlockById(saved.block);
      const input = workspace.getBlockById(saved.call)?.getInput(`ARG_${saved.parameter}`)?.connection;
      if (child?.outputConnection && !child.getParent() && input && !input.targetBlock()) {
        input.connect(child.outputConnection); child.setShadow(saved.shadow);
      }
    }
    refreshSymbols(workspace);
  } finally { Blockly.Events.enable(); }
}
interface SignatureEventJson extends Blockly.Events.AbstractEventJson { before: Signature; after: Signature; beforeConnections: Attachment[]; afterConnections: Attachment[] }
class SignatureEvent extends Blockly.Events.Abstract {
  type = 'py_function_signature'; isBlank = false;
  constructor(workspace: Blockly.Workspace, readonly before: Signature, readonly after: Signature, readonly beforeConnections: Attachment[], readonly afterConnections: Attachment[]) { super(); this.workspaceId = workspace.id; }
  override run(forward: boolean) {
    const workspace = this.getEventWorkspace_();
    applySignature(workspace, forward ? this.after : this.before, forward ? this.afterConnections : this.beforeConnections);
    // Replaying our atomic edit suppresses intermediate model events. Notify
    // preview/autosave listeners once, without adding a new undo operation.
    const notification = new SignatureEvent(workspace, forward ? this.before : this.after, forward ? this.after : this.before, forward ? this.beforeConnections : this.afterConnections, forward ? this.afterConnections : this.beforeConnections);
    notification.recordUndo = false; Blockly.Events.fire(notification);
  }
  override toJson(): SignatureEventJson { return { ...super.toJson(), before: this.before, after: this.after, beforeConnections: this.beforeConnections, afterConnections: this.afterConnections }; }
  static override fromJson(json: SignatureEventJson, workspace: Blockly.Workspace) { const event = new SignatureEvent(workspace, json.before, json.after, json.beforeConnections, json.afterConnections); event.group = json.group; return event; }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_function_signature', SignatureEvent);
export function editSignature(workspace: Blockly.Workspace, next: Signature) {
  validateSignature(workspace, next);
  const model = workspace.getProcedureMap().get(next.id);
  if (!model) throw new Error('The function no longer exists.');
  const before = signatureOf(model); const beforeConnections = attachments(workspace, next.id);
  if (JSON.stringify(before) === JSON.stringify(next)) return;
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try {
    applySignature(workspace, next, beforeConnections);
    Blockly.Events.fire(new SignatureEvent(workspace, before, structuredClone(next), beforeConnections, attachments(workspace, next.id)));
  } finally { Blockly.Events.setGroup(group); }
}
export function reorderHandlers(workspace: Blockly.Workspace, orderedIds: string[]) {
  const handlers = handlerSignatures(workspace);
  if (orderedIds.length !== handlers.length || new Set(orderedIds).size !== handlers.length || handlers.some(h => !orderedIds.includes(h.id))) throw new Error('Choose every handler exactly once.');
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try {
    orderedIds.forEach((id, order) => { const signature = handlers.find(h => h.id === id)!; editSignature(workspace, { ...signature, handler: { ...signature.handler!, order } }); });
  } finally { Blockly.Events.setGroup(group); }
}
export function refreshSymbols(workspace: Blockly.Workspace) {
  for (const block of workspace.getAllBlocks(false)) {
    const field = block.getField('SYMBOL');
    if (field instanceof SymbolField) field.refresh();
  }
}

export class SymbolField extends Blockly.FieldDropdown {
  private candidate?: string;
  private reference?: Symbol;
  constructor() {
    super(function () {
      const block = this.getSourceBlock();
      if (!block) return [['choose variable', '']];
      const workspace = (block.workspace as Blockly.WorkspaceSvg).targetWorkspace ?? block.workspace;
      const lambda = enclosingLambda(block);
      const owner = lambda?.lambda.id ?? enclosingFunction(block)?.functionId;
      const all = allSymbols(workspace);
      const current = (this as SymbolField).candidate ?? this.getValue();
      const available = all.filter(s => lambda ? s.owner === owner : !s.owner || s.owner === owner || !block.getParent());
      const ownerName = (id: string) => workspace.getProcedureMap().get(id)?.getName() ?? (workspace.getAllBlocks(false).some(b => b.type === 'py_lambda' && (b as LambdaBlock).lambda?.id === id) ? 'lambda' : 'missing function');
      const options: [string, string][] = available.map(s => [`${s.name} (${s.kind}${s.owner && !owner ? `: ${ownerName(s.owner)}` : ''})`, s.id]);
      if (current && !available.some(s => s.id === current)) options.push([`${all.find(s => s.id === current)?.name ?? (this as SymbolField).reference?.name ?? 'missing variable'} (unavailable here)`, current]);
      return [['choose variable', ''], ...options];
    });
  }
  // Preserve broken references on load; validation explains them. Never choose
  // another same-named symbol because the original was removed or is out of scope.
  protected override doClassValidation_(value: string) { this.candidate = value; this.getOptions(false); return value; }
  override saveState(full = false): string | Symbol | null {
    const block = this.getSourceBlock(); const id = this.getValue();
    const symbol = block && id ? resolveSymbol(block, id) : undefined;
    const reference = symbol ?? (this.reference?.id === id ? this.reference : undefined);
    return reference && (full || !symbol) ? { ...reference } : id;
  }
  override loadState(state: string | Symbol) {
    this.reference = typeof state === 'object' ? { ...state } : undefined;
    this.setValue(typeof state === 'string' ? state : state.id);
  }
  refresh() { const value = this.getValue(); this.getOptions(false); if (value !== null) this.doValueUpdate_(value); this.forceRerender(); }
}

export function refreshFunctions(workspace: Blockly.Workspace) { triggerProceduresUpdate(workspace); refreshSymbols(workspace); }
