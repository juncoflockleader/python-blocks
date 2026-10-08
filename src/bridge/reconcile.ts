import { Blockly } from '../blocks';
import { lambdaParameterSymbol, type FunctionBlock, type LambdaState } from '../language/functions';
import { canonical } from '../language/modules';
import type { BlockState, PythonBlockSpan } from './core-converter';

const functionTypes = new Set(['py_function', 'py_handler', 'py_call', 'py_call_value', 'py_function_ref']);
const assetFields: Record<string, string> = { scene_costume: 'COSTUME_ID', scene_backdrop: 'BACKDROP_ID', scene_world: 'WORLD_ID', sound_asset: 'SOUND_ID' };
function shape(block: BlockState, deep: boolean): unknown {
  const fields = { ...block.fields };
  for (const key of Object.keys(fields)) if (typeof fields[key] === 'boolean') fields[key] = fields[key] ? 'TRUE' : 'FALSE';
  if (fields.SYMBOL && typeof fields.SYMBOL === 'object') fields.SYMBOL = fields.SYMBOL.id;
  for (const key of Object.keys(fields)) if (key.endsWith('_ID') && fields[key] && typeof fields[key] === 'object') fields[key] = fields[key].id;
  // Generated asset values are ordinary strings/None. Keep an existing typed
  // reference when unchanged source alone cannot distinguish it from a literal.
  if (block.type === 'text') return { type: 'literal', value: fields.TEXT };
  if (block.type === 'py_none') return { type: 'literal', value: null };
  if (assetFields[block.type]) return { type: 'literal', value: fields[assetFields[block.type]] || null };
  if (functionTypes.has(block.type)) for (const key of Object.keys(fields)) if (['NAME', 'PARAMETERS', 'ACTION', 'EVENT', 'ORDER'].includes(key) || key.startsWith('LABEL_')) delete fields[key];
  if (block.type === 'py_lambda') delete fields.PARAMETERS;
  const extra = functionTypes.has(block.type) ? { functionId: block.extraState?.functionId }
    : block.type === 'controls_if' ? { elseIfCount: block.extraState?.elseIfCount ?? 0, hasElse: block.extraState?.hasElse ?? false }
    : block.type === 'py_lambda' ? { parameters: (block.extraState as LambdaState).parameters.map(p => p.name) } : block.extraState;
  const inputs = deep ? Object.fromEntries(Object.entries(block.inputs ?? {}).map(([name, connection]) => {
    const child = connection.block ?? connection.shadow;
    return [name, child ? chainShape(child) : null];
  })) : undefined;
  return { type: block.type, fields, extra, ...(deep ? { inputs } : {}) };
}
function chainShape(block: BlockState): unknown { return { shape: shape(block, true), ...(block.next?.block ? { next: chainShape(block.next.block) } : {}) }; }
function visit(block: BlockState, action: (block: BlockState) => void, next = true) {
  action(block);
  for (const input of Object.values(block.inputs ?? {})) {
    if (input.block) visit(input.block, action);
    else if (input.shadow) visit(input.shadow, action);
  }
  if (next && block.next?.block) visit(block.next.block, action);
}

/** Detached disabled blocks remain editable drafts. Heal their former stack
 * before collecting active state, so an enabled successor is still converted. */
export function preserveDisabledDrafts(roots: Blockly.Block[]) {
  for (const root of roots) {
    const candidates = root.getDescendants(false).filter(block => !block.isEnabled());
    for (const block of candidates) {
      let parent = block.getSurroundParent(), nested = false;
      while (parent) { if (!parent.isEnabled()) { nested = true; break; } parent = parent.getSurroundParent(); }
      if (nested || !block.getParent()) continue;
      block.setShadow(false); block.unplug(true);
      const location = root.getRelativeToSurfaceXY(), current = block.getRelativeToSurfaceXY();
      block.moveBy(location.x + 360 - current.x, location.y + 80 - current.y);
    }
  }
}

/** Reuse identities within their existing Program/function owner. Exact
 * subtrees may move within that owner; changed nodes use their corresponding
 * input/statement position only when their block shape still agrees. */
export function reconcileBlocks(next: BlockState[], previous: BlockState[], sourceMap: PythonBlockSpan[]) {
  const ids = new Map<string, string>(), claimed = new Set<string>();
  const owner = (block: BlockState) => block.type === 'py_program' ? 'program' : block.extraState?.functionId;
  for (const root of next) {
    const oldRoot = previous.find(old => owner(root) && owner(old) === owner(root));
    if (!oldRoot) continue;
    const old: BlockState[] = []; visit(oldRoot, block => old.push(block));
    const pool = new Map<string, BlockState[]>();
    for (const block of old) {
      const key = canonical(shape(block, true)); const choices = pool.get(key) ?? []; choices.push(block); pool.set(key, choices);
    }
    const reconcile = (block: BlockState, positional?: BlockState) => {
      const exactKey = canonical(shape(block, true));
      const exact = positional?.id && !claimed.has(positional.id) && canonical(shape(positional, true)) === exactKey ? positional : pool.get(exactKey)?.find(candidate => candidate.id && !claimed.has(candidate.id));
      const match = exact ?? (positional?.id && !claimed.has(positional.id) && canonical(shape(block, false)) === canonical(shape(positional, false)) ? positional : undefined);
      if (match?.id) {
        if (['text', 'py_none'].includes(block.type) && assetFields[match.type]) { block.type = match.type; block.fields = structuredClone(match.fields); }
        claimed.add(match.id); if (block.id) ids.set(block.id, match.id); block.id = match.id;
        for (const key of ['collapsed', 'inline', 'x', 'y', 'data', 'movable', 'deletable', 'editable'] as const) if (match[key] !== undefined) (block as any)[key] = structuredClone(match[key]);
        if (!block.icons && match.icons) block.icons = structuredClone(match.icons);
        if (block.type === 'py_lambda') {
          const state = block.extraState as LambdaState, saved = match.extraState as LambdaState;
          const replacements = new Map<string, string>();
          state.parameters.forEach(parameter => {
            const original = saved.parameters.find(p => p.name === parameter.name)!;
            replacements.set(lambdaParameterSymbol(state.id, parameter.id), lambdaParameterSymbol(saved.id, original.id)); parameter.id = original.id;
          });
          visit(block, child => { if (child.fields?.SYMBOL && replacements.has(child.fields.SYMBOL)) child.fields.SYMBOL = replacements.get(child.fields.SYMBOL); }, false);
          state.id = saved.id;
        }
      }
      for (const [name, input] of Object.entries(block.inputs ?? {})) {
        const child = input.block ?? input.shadow, oldInput = match?.inputs?.[name];
        if (child) reconcile(child, oldInput?.block ?? oldInput?.shadow);
        if (input.block && oldInput?.block && oldInput.shadow && !input.shadow) input.shadow = structuredClone(oldInput.shadow);
        else if (input.block && oldInput?.shadow && !oldInput.block && canonical(shape(input.block, true)) === canonical(shape(oldInput.shadow, true))) {
          input.shadow = input.block; delete input.block;
        }
      }
      if (block.next?.block) reconcile(block.next.block, match?.next?.block);
    };
    reconcile(root, oldRoot);
  }
  for (const span of sourceMap) span.blockId = ids.get(span.blockId) ?? span.blockId;
}

export function refreshPreservedCalls(workspace: Blockly.Workspace) {
  // Signature changes can remove inputs on loose calls. The existing block
  // updater detaches those argument blocks before changing the shape.
  for (const block of workspace.getAllBlocks(false)) if (['py_call', 'py_call_value', 'py_function_ref'].includes(block.type)) (block as FunctionBlock).doProcedureUpdate();
}
