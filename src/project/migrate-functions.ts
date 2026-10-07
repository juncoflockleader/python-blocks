import * as Blockly from 'blockly/core';
import { MODULE_SCOPE, parameterSymbol, type Signature } from '../language/functions';
type State = Blockly.serialization.blocks.State;
type WorkspaceState = ReturnType<typeof Blockly.serialization.workspaces.save>;

/** Convert the old workspace-wide variable/procedure model without changing
 * its bindings. Legacy function assignments remain explicit project bindings;
 * only parameters become local. New functions use the scope-aware picker. */
export function migrateFunctions(workspace: Blockly.Workspace): WorkspaceState {
  const state = Blockly.serialization.workspaces.save(workspace);
  const roots: State[] = state.blocks?.blocks ?? [];
  const definitions = new Map<string, { signature: Signature; parameterVariables: Map<string, string> }>();
  for (const root of roots) if (['procedures_defnoreturn', 'procedures_defreturn'].includes(root.type)) {
    const name = String(root.fields?.NAME);
    if (definitions.has(name)) throw new Error(`Cannot migrate ambiguous function “${name}”. The original project is preserved.`);
    const id = `function:${root.id}`;
    const params: { name: string; id: string }[] = root.extraState?.params ?? [];
    const signature = { id, name, parameters: params.map((p, i) => ({ id: `parameter:${root.id}:${i}`, name: p.name })) };
    definitions.set(name, { signature, parameterVariables: new Map(params.map((p, i) => [p.id, parameterSymbol(signature.parameters[i].id)])) });
  }
  const usedProjectVariables = new Set<string>();
  const parameterVariables = new Set([...definitions.values()].flatMap(d => [...d.parameterVariables.keys()]));
  function visit(block: State, context?: ReturnType<typeof definitions.get>) {
    if (['procedures_defnoreturn', 'procedures_defreturn'].includes(block.type)) {
      context = definitions.get(String(block.fields?.NAME))!;
      const body = block.inputs?.STACK;
      const returned = block.inputs?.RETURN;
      if (returned?.block || returned?.shadow) {
        const tail: State = { type: 'py_return_value', id: Blockly.utils.idGenerator.genUid(), inputs: { VALUE: returned } };
        if (body?.block) { let last = body.block; while (last.next?.block) last = last.next.block; last.next = { block: tail }; }
        else block.inputs = { ...block.inputs, STACK: { block: tail } };
      }
      const currentBody = block.inputs?.STACK;
      block.type = 'py_function'; block.fields = {};
      block.extraState = { functionId: context.signature.id, signature: context.signature };
      block.inputs = currentBody ? { BODY: currentBody } : {};
    } else if (['procedures_callnoreturn', 'procedures_callreturn'].includes(block.type)) {
      const name = String(block.extraState?.name ?? 'missing_function');
      const names: string[] = block.extraState?.params ?? [];
      const definition = definitions.get(name)?.signature;
      if (definition && (definition.parameters.length !== names.length || definition.parameters.some((p, i) => p.name !== names[i]))) throw new Error(`Cannot migrate call to “${name}”: its parameters do not match the definition. The original project is preserved.`);
      const signature = definition ?? { id: `unresolved:${name}`, name, parameters: names.map((name, i) => ({ id: `unresolved:${i}`, name })) };
      const inputs = block.inputs ?? {};
      block.inputs = Object.fromEntries(signature.parameters.flatMap((p, i) => inputs[`ARG${i}`] ? [[`ARG_${p.id}`, inputs[`ARG${i}`]]] : []));
      block.type = block.type === 'procedures_callreturn' ? 'py_call_value' : 'py_call';
      block.fields = {}; block.extraState = { functionId: signature.id, signature };
    } else if (block.type === 'procedures_ifreturn') {
      const inputs = block.inputs ?? {};
      const returnsValue = block.extraState?.hasReturnValue !== false;
      block.type = 'controls_if'; delete block.extraState;
      block.inputs = { IF0: inputs.CONDITION, DO0: { block: { type: returnsValue ? 'py_return_value' : 'py_return', inputs: returnsValue ? { VALUE: inputs.VALUE } : {} } } };
    } else if (['variables_get', 'variables_set', 'py_range', 'controls_forEach'].includes(block.type)) {
      const variable = block.fields?.VAR;
      const id = typeof variable === 'string' ? variable : variable?.id;
      const symbol = context?.parameterVariables.get(id) ?? id;
      if (symbol === id) usedProjectVariables.add(id);
      const types: Record<string, string> = { variables_get: 'py_get', variables_set: 'py_set', py_range: 'py_scoped_range', controls_forEach: 'py_for_each' };
      if (block.type === 'controls_forEach' && block.inputs) { block.inputs.ITERABLE = block.inputs.LIST; delete block.inputs.LIST; }
      block.type = types[block.type]; block.fields = { SYMBOL: symbol };
    }
    for (const connection of Object.values(block.inputs ?? {})) {
      if (connection?.block) visit(connection.block, context);
      if (connection?.shadow) visit(connection.shadow, context);
    }
    if (block.next?.block) visit(block.next.block, context);
  }
  roots.forEach(root => visit(root));
  const variables: { id: string; name: string; type?: string }[] = state.variables ?? [];
  state.variables = variables.filter(v => v.type || !parameterVariables.has(v.id) || usedProjectVariables.has(v.id)).map(v => ({ ...v, type: v.type || MODULE_SCOPE }));
  state.procedures = [...(state.procedures ?? []), ...[...definitions.values()].map(({ signature }) => ({ ...signature, returnTypes: null }))];
  return state;
}
