import * as Blockly from 'blockly/core';
import { compileModuleDefinition } from './compiler';
import { allSymbols, resolveSymbol, signatureOf, type FunctionBlock } from './functions';
import { canonical, changeModules, moduleKey, moduleState, reachableModules, resolveModuleCall, samePin, utf8Size, validateModuleState, MODULE_LANGUAGE_VERSION, type ModuleBundle, type ModuleCallBlock, type ModuleDefinition, type ModuleImport, type ModuleState } from './modules';

export function validateModuleDefinitions(state: ModuleState) {
  validateModuleState(state);
  const files = new Map(state.definitions.map((d, index) => [moduleKey(d), `_pb_module_${index}.py`]));
  for (const definition of state.definitions) {
    const result = compileModuleDefinition(definition, state, files);
    const failures = result.diagnostics.filter(d => d.severity === 'error');
    if (result.source === null || failures.length) throw new Error(`Module “${definition.name}”: ${failures.map(d => d.message).join(' ')}`);
  }
}

export function prepareModule(text: string): ModuleBundle {
  if (utf8Size(text) > 2_000_000) throw new Error('The module bundle exceeds 2 MB.');
  const value = JSON.parse(text) as ModuleBundle;
  if (!value || value.format !== 'python-blocks.module' || value.formatVersion !== 1 || !value.entry) throw new Error('Choose a supported Python Blocks module file.');
  const state: ModuleState = { formatVersion: 1, imports: [{ ...value.entry, id: 'entry', alias: 'module_entry' }], definitions: value.definitions };
  validateModuleDefinitions(state);
  if (reachableModules(state).length !== state.definitions.length) throw new Error('The module bundle contains definitions outside its dependency closure.');
  return structuredClone(value);
}

/** Snapshot selected functions and transitive helpers, never project startup or
 * globals. Local recursion is traversed once; the separate module graph is a DAG. */
export function exportModule(workspace: Blockly.Workspace, selection: { moduleId?: string; name: string; functions: string[] }): ModuleBundle {
  if (!selection.functions.length || new Set(selection.functions).size !== selection.functions.length) throw new Error('Choose at least one distinct function to export.');
  const definitions = workspace.getTopBlocks(false).filter(b => b.type === 'py_function' && b.isEnabled()) as FunctionBlock[];
  const included = new Map<string, FunctionBlock>(); const dependencies = new Set<string>();
  const visit = (id: string) => {
    if (included.has(id)) return;
    const block = definitions.find(f => f.functionId === id);
    if (!block) throw new Error('A referenced function is missing, disabled, or an event handler.');
    included.set(id, block);
    for (const child of block.getDescendants(false)) {
      if (['py_call', 'py_call_value', 'py_function_ref'].includes(child.type)) visit((child as FunctionBlock).functionId);
      if (child.getField('SYMBOL')) {
        const symbol = resolveSymbol(child, child.getFieldValue('SYMBOL'));
        if (!symbol || symbol.kind === 'project') throw new Error(`Pass project state through parameters before exporting: ${symbol?.name ?? 'unresolved variable'}.`);
      }
      if (['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(child.type)) {
        const target = resolveModuleCall(workspace, (child as unknown as ModuleCallBlock).moduleCall);
        if (!target) throw new Error('A function depends on an unavailable module import.');
        dependencies.add(target.binding.id);
      }
    }
  };
  selection.functions.forEach(visit);
  const saved = Blockly.serialization.workspaces.save(workspace);
  const locals = new Set(allSymbols(workspace).filter(s => s.kind === 'local' && included.has(s.owner!)).map(s => s.id));
  const state = moduleState(workspace);
  const pinned = state.imports.filter(i => dependencies.has(i.id));
  const definition: ModuleDefinition = {
    moduleId: selection.moduleId ?? crypto.randomUUID(), revision: crypto.randomUUID(), name: selection.name, languageVersion: MODULE_LANGUAGE_VERSION,
    exports: selection.functions.map(id => signatureOf(included.get(id)!.getProcedureModel()!)), dependencies: pinned,
    workspace: {
      blocks: { languageVersion: 0, blocks: [...included.values()].map(b => Blockly.serialization.blocks.save(b)!) },
      procedures: (saved.procedures ?? []).filter((f: { id: string }) => included.has(f.id)),
      variables: (saved.variables ?? []).filter((v: { id: string }) => locals.has(v.id)),
    },
  };
  const bundle: ModuleBundle = { format: 'python-blocks.module', formatVersion: 1, entry: { moduleId: definition.moduleId, revision: definition.revision }, definitions: [definition, ...reachableModules(state, pinned)] };
  return prepareModule(JSON.stringify(bundle, null, 2));
}

export function importModule(workspace: Blockly.Workspace, input: ModuleBundle, alias: string): ModuleImport {
  const bundle = prepareModule(JSON.stringify(input)); const before = moduleState(workspace);
  const duplicate = before.imports.find(i => i.alias === alias);
  // A repeated import of the exact pinned contents is a no-op. Aliases and pins
  // never silently retarget existing call blocks.
  if (duplicate && !samePin(duplicate, bundle.entry)) throw new Error('This namespace already refers to another module revision. Choose a different namespace.');
  if (workspace.getProcedureMap().getProcedures().some(f => f.getName() === alias) || allSymbols(workspace).some(s => s.kind === 'project' && s.name === alias)) throw new Error('This namespace conflicts with a project variable or function.');
  for (const definition of bundle.definitions) {
    const existing = before.definitions.find(d => samePin(d, definition));
    if (existing && canonical(existing) !== canonical(definition)) throw new Error('Conflicting contents for the same pinned module revision. Keep the existing copy and export the change as a new revision.');
    if (!existing) before.definitions.push(definition);
  }
  const entry = bundle.definitions.find(d => samePin(d, bundle.entry))!;
  const recoverable = new Set(workspace.getAllBlocks(false).filter(b => ['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(b.type)).map(b => (b as ModuleCallBlock).moduleCall)
    .filter(call => samePin(call, entry) && call.alias === alias && !before.imports.some(i => i.id === call.importId) && entry.exports.some(f => canonical(f) === canonical(call.signature))).map(call => call.importId));
  const binding: ModuleImport = duplicate ?? { ...bundle.entry, id: recoverable.size === 1 ? [...recoverable][0] : Blockly.utils.idGenerator.genUid(), alias };
  if (!duplicate) before.imports.push(binding);
  validateModuleDefinitions(before);
  if (utf8Size(JSON.stringify({ format: 'python-blocks', formatVersion: 1, languageVersion: MODULE_LANGUAGE_VERSION, workspace: { ...Blockly.serialization.workspaces.save(workspace), pythonModules: before } }, null, 2)) > 16_000_000) throw new Error('This import would exceed the project file size limit.');
  changeModules(workspace, before); return structuredClone(binding);
}

export function exportImportedModule(workspace: Blockly.Workspace, id: string): ModuleBundle {
  const state = moduleState(workspace); const binding = state.imports.find(i => i.id === id);
  if (!binding) throw new Error('The module import is unavailable.');
  return { format: 'python-blocks.module', formatVersion: 1, entry: { moduleId: binding.moduleId, revision: binding.revision }, definitions: reachableModules(state, [binding]) };
}
