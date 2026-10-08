import * as Blockly from 'blockly/core';
import { nameError, type Signature } from './functions';

export const MODULE_LANGUAGE_VERSION = 19;
export const utf8Size = (text: string) => new TextEncoder().encode(text).length;
export interface ModulePin { moduleId: string; revision: string }
export interface ModuleImport extends ModulePin { id: string; alias: string }
export interface ModuleDefinition extends ModulePin {
  name: string;
  languageVersion: number;
  exports: Signature[];
  dependencies: ModuleImport[];
  workspace: Record<string, any>;
}
export interface ModuleAuthoring { moduleId: string; name: string; functions: string[] }
export interface ModuleState { formatVersion: 1; imports: ModuleImport[]; definitions: ModuleDefinition[]; authoring?: ModuleAuthoring }
export interface ModuleBundle { format: 'python-blocks.module'; formatVersion: 1; entry: ModulePin; definitions: ModuleDefinition[] }
export interface ModuleCallState extends ModulePin { importId: string; functionId: string; alias: string; signature: Signature }
export interface ModuleCallBlock extends Blockly.Block { moduleCall: ModuleCallState; refreshModuleCall(): void }
const states = new WeakMap<Blockly.Workspace, ModuleState>();
export const emptyModules = (): ModuleState => ({ formatVersion: 1, imports: [], definitions: [] });
export const moduleKey = (pin: ModulePin) => JSON.stringify([pin.moduleId, pin.revision]);
export const samePin = (a: ModulePin, b: ModulePin) => a.moduleId === b.moduleId && a.revision === b.revision;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function object(value: unknown): asserts value is Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid module metadata.'); }
function identity(value: unknown): asserts value is string { if (typeof value !== 'string' || !value || value.length > 128) throw new Error('Module and function identities need 1–128 characters.'); }
function pin(value: unknown): asserts value is ModulePin { object(value); identity(value.moduleId); identity(value.revision); }
function pythonName(value: unknown): asserts value is string { if (typeof value !== 'string' || nameError(value)) throw new Error('Module, function, and parameter names must be unreserved Python identifiers.'); }
export function validateModuleSignature(value: unknown): asserts value is Signature {
  object(value); identity(value.id); pythonName(value.name);
  if (value.handler !== undefined || (value.async !== undefined && typeof value.async !== 'boolean') || !Array.isArray(value.parameters)) throw new Error('Module exports must be ordinary function signatures.');
  const ids = new Set<string>(); const names = new Set<string>();
  for (const p of value.parameters) { object(p); identity(p.id); pythonName(p.name); if (ids.has(p.id) || names.has(p.name)) throw new Error('Module parameters need distinct names and identities.'); ids.add(p.id); names.add(p.name); }
}
function imports(value: unknown): asserts value is ModuleImport[] {
  if (!Array.isArray(value) || value.length > 32) throw new Error('A project or module supports at most 32 imports.');
  const ids = new Set<string>(); const aliases = new Set<string>();
  for (const item of value) {
    pin(item); const entry = item as ModuleImport; identity(entry.id); pythonName(entry.alias);
    if (ids.has(entry.id) || aliases.has(entry.alias)) throw new Error('Imports need distinct identities and namespace aliases.');
    ids.add(entry.id); aliases.add(entry.alias);
  }
}

/** Structural validation precedes all workspace mutation. Semantic validation
 * additionally loads each immutable definition and compiles it in isolation. */
export function validateModuleState(value: unknown): asserts value is ModuleState {
  object(value);
  if (utf8Size(JSON.stringify(value)) > 2_000_000) throw new Error('The module bundle exceeds 2 MB.');
  if (value.formatVersion !== 1 || !Array.isArray(value.definitions) || value.definitions.length > 32) throw new Error('Unsupported module format or more than 32 pinned modules.');
  imports(value.imports);
  if (value.authoring !== undefined) {
    object(value.authoring); identity(value.authoring.moduleId); pythonName(value.authoring.name);
    if (!Array.isArray(value.authoring.functions)) throw new Error('The authored module selection is invalid.');
    value.authoring.functions.forEach(identity);
  }
  const definitions = new Map<string, ModuleDefinition>();
  for (const raw of value.definitions) {
    pin(raw); const d = raw as ModuleDefinition; pythonName(d.name);
    if (![5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, MODULE_LANGUAGE_VERSION].includes(d.languageVersion)) throw new Error('Unsupported module language version.');
    if (definitions.has(moduleKey(d))) throw new Error('A module revision appears more than once.');
    if (!Array.isArray(d.exports) || !d.exports.length) throw new Error('A module must export at least one function.');
    d.exports.forEach(validateModuleSignature);
    if (new Set(d.exports.map(f => f.id)).size !== d.exports.length || new Set(d.exports.map(f => f.name)).size !== d.exports.length) throw new Error('Module exports need distinct identities and names.');
    imports(d.dependencies); object(d.workspace);
    if (Object.keys(d.workspace).some(k => !['blocks', 'procedures', 'variables'].includes(k))) throw new Error('Module workspaces contain only function blocks, procedures, and scoped variables.');
    definitions.set(moduleKey(d), d);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (p: ModulePin) => {
    const key = moduleKey(p); const definition = definitions.get(key);
    if (!definition) throw new Error(`Missing pinned module ${p.moduleId} at revision ${p.revision}.`);
    if (visiting.has(key)) throw new Error('Module dependencies must be acyclic. Function recursion within a module is supported.');
    if (visited.has(key)) return;
    visiting.add(key); definition.dependencies.forEach(visit); visiting.delete(key); visited.add(key);
  };
  value.imports.forEach(visit); value.definitions.forEach(visit);
}
export function moduleState(workspace: Blockly.Workspace): ModuleState {
  workspace = (workspace as Blockly.WorkspaceSvg).targetWorkspace ?? workspace;
  return structuredClone(states.get(workspace) ?? emptyModules());
}
export function resolveModuleCall(workspace: Blockly.Workspace, call: ModuleCallState) {
  const state = moduleState(workspace);
  const binding = state.imports.find(i => i.id === call.importId && samePin(i, call));
  const definition = binding && state.definitions.find(d => samePin(d, binding));
  const signature = definition?.exports.find(f => f.id === call.functionId);
  return binding && definition && signature ? { binding, definition, signature } : undefined;
}
export function moduleCallState(binding: ModuleImport, signature: Signature, value = false): Blockly.serialization.blocks.State {
  return { type: value ? 'py_module_call_value' : 'py_module_call', extraState: { moduleId: binding.moduleId, revision: binding.revision, importId: binding.id, alias: binding.alias, functionId: signature.id, signature: structuredClone(signature) } satisfies ModuleCallState };
}
export function moduleReferenceState(binding: ModuleImport, signature: Signature): Blockly.serialization.blocks.State {
  return { ...moduleCallState(binding, signature), type: 'py_module_function_ref' };
}
function applyState(workspace: Blockly.Workspace, state: ModuleState) {
  validateModuleState(state); states.set(workspace, structuredClone(state));
  Blockly.Events.disable();
  try { for (const b of workspace.getAllBlocks(false)) if (['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(b.type)) (b as ModuleCallBlock).refreshModuleCall(); }
  finally { Blockly.Events.enable(); }
}
interface ModuleEventJson extends Blockly.Events.AbstractEventJson { before: ModuleState; after: ModuleState }
class ModuleEvent extends Blockly.Events.Abstract {
  type = 'py_modules'; isBlank = false;
  constructor(workspace: Blockly.Workspace, readonly before: ModuleState, readonly after: ModuleState) { super(); this.workspaceId = workspace.id; }
  override run(forward: boolean) {
    const workspace = this.getEventWorkspace_(); applyState(workspace, forward ? this.after : this.before);
    const event = new ModuleEvent(workspace, forward ? this.before : this.after, forward ? this.after : this.before); event.recordUndo = false; Blockly.Events.fire(event);
  }
  override toJson(): ModuleEventJson { return { ...super.toJson(), before: this.before, after: this.after }; }
  static override fromJson(json: ModuleEventJson, workspace: Blockly.Workspace) { const event = new ModuleEvent(workspace, json.before, json.after); event.group = json.group; return event; }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_modules', ModuleEvent);
export function changeModules(workspace: Blockly.Workspace, next: ModuleState) {
  const before = moduleState(workspace); if (canonical(before) === canonical(next)) return;
  applyState(workspace, next); Blockly.Events.fire(new ModuleEvent(workspace, before, structuredClone(next)));
}
Blockly.serialization.registry.register('pythonModules', {
  priority: 90,
  save(workspace) { const state = moduleState(workspace); return state.imports.length || state.definitions.length || state.authoring ? state : null; },
  load(state, workspace) { validateModuleState(state); applyState(workspace, state); },
  clear(workspace) { states.delete(workspace); },
});

export function reachableModules(state: ModuleState, roots: ModulePin[] = state.imports): ModuleDefinition[] {
  const reached = new Map<string, ModuleDefinition>();
  const visit = (pin: ModulePin) => {
    const key = moduleKey(pin); if (reached.has(key)) return;
    const definition = state.definitions.find(d => samePin(d, pin));
    if (!definition) throw new Error(`Missing pinned module ${pin.moduleId}.`);
    reached.set(key, definition); definition.dependencies.forEach(visit);
  };
  roots.forEach(visit); return [...reached.values()].sort((a, b) => moduleKey(a).localeCompare(moduleKey(b)));
}
export function renameModule(workspace: Blockly.Workspace, id: string, alias: string) {
  pythonName(alias); const state = moduleState(workspace); const binding = state.imports.find(i => i.id === id);
  if (!binding) throw new Error('The module import no longer exists.');
  if (workspace.getProcedureMap().getProcedures().some(f => f.getName() === alias) || workspace.getVariableMap().getAllVariables().some(v => v.getType() === 'py:module' && v.getName() === alias)) throw new Error('This namespace conflicts with a project variable or function.');
  binding.alias = alias; changeModules(workspace, state);
}
export function removeModule(workspace: Blockly.Workspace, id: string) {
  const state = moduleState(workspace); state.imports = state.imports.filter(i => i.id !== id); state.definitions = reachableModules(state); changeModules(workspace, state);
}
