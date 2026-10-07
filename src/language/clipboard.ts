import { loadWorkspace, preserveEditingState } from './serialization';
import * as Blockly from 'blockly/core';
import { allSymbols, createFunctionModel, handlerSignatures, lambdaParameterSymbol, localScope, parameterSymbol, signatureOf, type LambdaState, type Signature, type Symbol } from './functions';
import { lambdaState, validateLambda } from './lambdas';
import { installPythonVariables } from './variables';
import type { FunctionState } from '../blocks/core/functions';
import { canonical, moduleState, samePin, type ModuleCallState } from './modules';

type State = Blockly.serialization.blocks.State;
interface PreparedCopy { root: State; detached: State[]; functions: Signature[]; locals: Symbol[] }
function walk(block: State, visit: (block: State) => void) {
  visit(block);
  for (const input of Object.values(block.inputs ?? {})) {
    if (input.block) walk(input.block, visit);
    if (input.shadow) walk(input.shadow, visit);
  }
  if (block.next?.block) walk(block.next.block, visit);
}

/** Copy is the identity-changing boundary. Ordinary deserialization and undo
 * must never allocate replacement function, parameter, or symbol identities. */
export function prepareBlockCopy(workspace: Blockly.Workspace, saved: State): PreparedCopy {
  const root = structuredClone(saved);
  const functions = new Map<string, Signature>();
  const lambdas = new Map<string, LambdaState>();
  const symbols = new Map<string, Symbol>();
  const existingSymbols = allSymbols(workspace);
  const occupied = new Set([...workspace.getProcedureMap().getProcedures().map(f => f.getName()), ...existingSymbols.filter(s => s.kind === 'project').map(s => s.name)]);
  const locals: Symbol[] = [];
  let handlerOrder = Math.max(-1, ...handlerSignatures(workspace).map(s => s.handler!.order)) + 1;
  const rewrite = (block: State) => {
    delete block.id;
    if (block.type === 'py_lambda') {
      const old = block.extraState as LambdaState; validateLambda(old);
      if (lambdas.has(old.id)) throw new Error('Copy requires distinct lambda scope identities.');
      const copy = lambdaState(old.parameters.map(p => p.name)); lambdas.set(old.id, copy);
      old.parameters.forEach((p, i) => symbols.set(lambdaParameterSymbol(old.id, p.id), { id: lambdaParameterSymbol(copy.id, copy.parameters[i].id), name: p.name, kind: 'parameter', owner: copy.id }));
    }
    if (!['py_function', 'py_handler'].includes(block.type)) return;
    const extra = block.extraState as FunctionState;
    const original = extra.signature;
    if (!original?.id || functions.has(original.id)) throw new Error('Copy requires distinct, resolved function definitions.');
    const owned = extra.locals ?? existingSymbols.filter(s => s.kind === 'local' && s.owner === original.id);
    const shadowing = new Set([...owned.map(s => s.name), ...original.parameters.map(p => p.name)]);
    let name = original.name;
    for (let suffix = 1; occupied.has(name) || shadowing.has(name); suffix++) name = `${original.name}_copy${suffix === 1 ? '' : suffix}`;
    occupied.add(name);
    const signature: Signature = { ...structuredClone(original), id: Blockly.utils.idGenerator.genUid(), name, parameters: original.parameters.map(p => ({ id: Blockly.utils.idGenerator.genUid(), name: p.name })), ...(original.handler ? { handler: { ...original.handler, order: handlerOrder++ } } : {}) };
    functions.set(original.id, signature);
    original.parameters.forEach((p, i) => symbols.set(parameterSymbol(p.id), { id: parameterSymbol(signature.parameters[i].id), name: p.name, kind: 'parameter', owner: signature.id }));
    for (const local of owned) {
      const copy = { ...local, id: Blockly.utils.idGenerator.genUid(), owner: signature.id };
      symbols.set(local.id, copy); locals.push(copy);
    }
  };
  walk(root, rewrite);
  const detached: State[] = [];
  const rewriteReferences = (block: State) => {
    if (block.type === 'py_lambda') block.extraState = lambdas.get((block.extraState as LambdaState).id)!;
    if (['py_module_call', 'py_module_call_value', 'py_module_function_ref'].includes(block.type)) {
      const call = block.extraState as ModuleCallState; const state = moduleState(workspace);
      const matches = state.imports.filter(i => samePin(i, call) && state.definitions.find(d => samePin(d, i))?.exports.some(f => canonical(f) === canonical(call.signature)));
      const target = matches.find(i => i.id === call.importId) ?? matches[0];
      if (target) block.extraState = { ...call, importId: target.id, alias: target.alias };
    }
    const reference = block.fields?.SYMBOL as Symbol | string | undefined;
    if (reference) {
      const id = typeof reference === 'string' ? reference : reference.id;
      block.fields!.SYMBOL = symbols.get(id) ?? reference;
    }
    if (!['py_function', 'py_handler', 'py_call', 'py_call_value', 'py_function_ref'].includes(block.type)) return;
    const extra = block.extraState as FunctionState;
    const original = extra.signature;
    const cloned = functions.get(extra.functionId);
    const current = workspace.getProcedureMap().get(extra.functionId);
    const target = cloned ?? (current ? signatureOf(current) : original);
    if (!target) throw new Error('The copied call has no signature information.');
    const definition = ['py_function', 'py_handler'].includes(block.type);
    if (!definition) {
      const inputs: NonNullable<State['inputs']> = {};
      for (const [name, input] of Object.entries(block.inputs ?? {})) {
        const oldParameter = original.parameters.find(p => `ARG_${p.id}` === name);
        const mapped = oldParameter && symbols.get(parameterSymbol(oldParameter.id));
        const parameterId = mapped?.kind === 'parameter' ? mapped.id.slice('param:'.length) : oldParameter?.id;
        if (parameterId && target.parameters.some(p => p.id === parameterId)) inputs[`ARG_${parameterId}`] = input;
        else if (name.startsWith('ARG_')) {
          const child = input.block ?? input.shadow;
          if (child) detached.push(child);
        } else inputs[name] = input;
      }
      block.inputs = inputs;
    }
    block.extraState = { functionId: target.id, signature: target, ...(definition ? { locals: locals.filter(s => s.owner === target.id) } : {}) } satisfies FunctionState;
  };
  walk(root, rewriteReferences);
  // A removed argument is no longer visited through its parent's inputs. It
  // still needs the same reference remapping, including nested function calls.
  for (let index = 0; index < detached.length; index++) walk(detached[index], rewriteReferences);
  return { root, detached, functions: [...functions.values()], locals };
}
function materializeModels(workspace: Blockly.Workspace, prepared: PreparedCopy) {
  for (const variable of prepared.locals) workspace.getVariableMap().createVariable(variable.name, localScope(variable.owner!), variable.id);
  for (const signature of prepared.functions) createFunctionModel(workspace, signature);
}
function validateCopy(workspace: Blockly.Workspace, prepared: PreparedCopy) {
  const candidate = new Blockly.Workspace(new Blockly.Options({ oneBasedIndex: false })); installPythonVariables(candidate);
  Blockly.Events.disable();
  try {
    loadWorkspace(Blockly.serialization.workspaces.save(workspace), candidate);
    materializeModels(candidate, prepared);
    preserveEditingState(() => Blockly.serialization.blocks.append(prepared.root, candidate));
    for (const child of prepared.detached) preserveEditingState(() => Blockly.serialization.blocks.append(child, candidate));
  } finally { candidate.dispose(); Blockly.Events.enable(); }
}

function applyCopy<T>(workspace: Blockly.Workspace, prepared: PreparedCopy, append: (state: State) => T): T {
  validateCopy(workspace, prepared);
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try {
    materializeModels(workspace, prepared);
    const copied = append(prepared.root);
    for (const [index, child] of prepared.detached.entries()) append({ ...child, x: (prepared.root.x ?? 0) + 80, y: (prepared.root.y ?? 0) + 100 + index * 60 });
    return copied;
  } finally { Blockly.Events.setGroup(group); }
}

/** Headless counterpart of the rendered clipboard, also used by module tests. */
export function pasteBlockCopy(workspace: Blockly.Workspace, state: State): Blockly.Block {
  return applyCopy(workspace, prepareBlockCopy(workspace, state), state => Blockly.serialization.blocks.append(state, workspace, { recordUndo: true }));
}
class PythonBlockPaster extends Blockly.clipboard.BlockPaster {
  override paste(data: Blockly.clipboard.BlockCopyData, workspace: Blockly.WorkspaceSvg, coordinate?: Blockly.utils.Coordinate) {
    if (!workspace.isCapacityAvailable(data.typeCounts)) return null;
    const prepared = prepareBlockCopy(workspace, data.blockState);
    if (coordinate) { prepared.root.x = coordinate.x; prepared.root.y = coordinate.y; }
    return applyCopy(workspace, prepared, state => {
      const typeCounts: Record<string, number> = {};
      walk(state, block => typeCounts[block.type] = (typeCounts[block.type] ?? 0) + 1);
      return super.paste({ ...data, blockState: state, typeCounts }, workspace);
    });
  }
}
export function installLanguageClipboard() {
  Blockly.clipboard.registry.unregister(Blockly.clipboard.BlockPaster.TYPE);
  Blockly.clipboard.registry.register(Blockly.clipboard.BlockPaster.TYPE, new PythonBlockPaster());
}
