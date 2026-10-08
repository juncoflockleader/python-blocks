import * as Blockly from 'blockly/core';
import { sceneState } from '../../scene/state';
import { allSymbols, createFunctionModel, isScopedDefinition, signatureOf, SymbolField, type FunctionBlock, type Signature, type Symbol } from '../../language/functions';

export interface FunctionState { functionId: string; signature: Signature; locals?: Symbol[] }
const empty: Signature = { id: '', name: 'choose a function', parameters: [] };
const shared = {
  getProcedureModel(this: FunctionBlock) { return this.workspace.getProcedureMap().get(this.functionId); },
  isProcedureDef(this: FunctionBlock) { return isScopedDefinition(this); },
  saveExtraState(this: FunctionBlock, full = false): FunctionState {
    return { functionId: this.functionId, signature: structuredClone(this.signature), ...(full && isScopedDefinition(this) ? { locals: allSymbols(this.workspace).filter(s => s.kind === 'local' && s.owner === this.functionId) } : {}) };
  },
  loadExtraState(this: FunctionBlock, state: FunctionState) {
    this.functionId = state.functionId;
    this.signature = structuredClone(state.signature ?? { ...empty, id: state.functionId });
    if (isScopedDefinition(this) && !this.getProcedureModel()) createFunctionModel(this.workspace, this.signature);
    this.doProcedureUpdate();
  },
  doProcedureUpdate(this: FunctionBlock) {
    if (this.isDeadOrDying()) return;
    const model = this.getProcedureModel();
    if (model) this.signature = signatureOf(model);
    this.setFieldValue(this.signature.name, 'NAME');
    if (isScopedDefinition(this)) {
      this.setFieldValue(`(${this.signature.parameters.map(p => p.name).join(', ')})`, 'PARAMETERS');
      if (this.type === 'py_handler') {
        const owner = this.signature.handler?.sprite, kind = this.signature.handler?.kind;
        const name = owner ? sceneState(this.workspace).sprites.find(s => s.id === owner)?.name ?? 'unavailable sprite' : '';
        this.setFieldValue(`${this.signature.handler?.event ?? 'choose event'}${owner ? ` · ${name} & clones` : kind ? ` · kind ${kind}` : ''}`, 'EVENT');
        this.setFieldValue(`#${(this.signature.handler?.order ?? 0) + 1}`, 'ORDER');
      } else this.setFieldValue(this.signature.async ? 'define async' : 'define', 'ACTION');
      return;
    }
    if (this.type === 'py_function_ref') { this.setFieldValue('function', 'ACTION'); return; }
    this.setFieldValue(this.signature.async ? 'await call' : 'call', 'ACTION');
    const inputNames = new Set(this.signature.parameters.map(p => `ARG_${p.id}`));
    for (const input of [...this.inputList]) if (input.name.startsWith('ARG_') && !inputNames.has(input.name)) {
      const child = input.connection?.targetBlock();
      if (child) { child.setShadow(false); input.connection!.setShadowState(null); child.unplug(); }
      this.removeInput(input.name);
    }
    for (const p of this.signature.parameters) {
      const name = `ARG_${p.id}`;
      if (!this.getInput(name)) this.appendValueInput(name).appendField(p.name, `LABEL_${p.id}`);
      else this.setFieldValue(p.name, `LABEL_${p.id}`);
      this.moveInputBefore(name, null);
    }
  },
};
for (const type of ['py_function', 'py_handler']) Blockly.Blocks[type] = {
  ...shared,
  init(this: FunctionBlock) {
    this.functionId = ''; this.signature = structuredClone(empty);
    const header = this.appendDummyInput().appendField(new Blockly.FieldLabel(type === 'py_handler' ? 'when' : 'define'), 'ACTION');
    if (type === 'py_handler') header.appendField(new Blockly.FieldLabel('choose event'), 'EVENT').appendField('→');
    header.appendField(new Blockly.FieldLabel('choose a function'), 'NAME').appendField(new Blockly.FieldLabel('()'), 'PARAMETERS');
    if (type === 'py_handler') header.appendField(new Blockly.FieldLabel('#1'), 'ORDER');
    this.appendStatementInput('BODY'); this.setColour('#8066ba');
    this.setTooltip(type === 'py_handler' ? 'An async event handler. Edit its payload parameter and saved order with Events → Manage handlers.' : 'A Python function. Edit its name, parameters, and async setting with Functions → Manage functions.');
  },
  destroy(this: FunctionBlock) {
    const anotherDefinition = this.workspace.getAllBlocks(false).some(b => b !== this && isScopedDefinition(b) && (b as FunctionBlock).functionId === this.functionId);
    if (!this.workspace.isClearing && this.functionId && !anotherDefinition) this.workspace.getProcedureMap().delete(this.functionId);
  },
};
for (const type of ['py_call', 'py_call_value', 'py_function_ref']) Blockly.Blocks[type] = {
  ...shared,
  init(this: FunctionBlock) {
    this.functionId = ''; this.signature = structuredClone(empty);
    this.appendDummyInput('HEADER').appendField(new Blockly.FieldLabel(type === 'py_function_ref' ? 'function' : 'call'), 'ACTION').appendField(new Blockly.FieldLabel(empty.name), 'NAME');
    if (type === 'py_call') { this.setPreviousStatement(true); this.setNextStatement(true); } else this.setOutput(true);
    this.setColour('#8066ba'); this.setInputsInline(true);
    this.setTooltip(type === 'py_function_ref' ? 'The synchronous function itself, without calling it. Store it, pass it, or use Call function value.' : 'Call a function with positional arguments. An expression call uses its returned value.');
  },
};

Blockly.common.defineBlocksWithJsonArray([
  { type: 'py_return', message0: 'return', previousStatement: null, colour: '#8066ba', tooltip: 'Leave this function, returning None.' },
  { type: 'py_return_value', message0: 'return %1', args0: [{ type: 'input_value', name: 'VALUE' }], previousStatement: null, colour: '#8066ba' },
  { type: 'py_emit', message0: 'send event %1 with payload %2', args0: [{ type: 'input_value', name: 'EVENT' }, { type: 'input_value', name: 'PAYLOAD' }], inputsInline: true, previousStatement: null, nextStatement: null, colour: '#ba7b4e', tooltip: 'Queue an event without waiting. Each receiver gets its own payload snapshot. The start event is reserved.' },
  { type: 'py_wait', message0: 'await wait %1 seconds', args0: [{ type: 'input_value', name: 'SECONDS' }], previousStatement: null, nextStatement: null, colour: '#ba7b4e', tooltip: 'Explicitly yield from a handler or async function. Zero seconds also yields.' },
]);
for (const type of ['py_get', 'py_set', 'py_for_each', 'py_scoped_range']) Blockly.Blocks[type] = {
  init(this: Blockly.Block) {
    if (type === 'py_get') {
      this.appendDummyInput().appendField(new SymbolField(), 'SYMBOL'); this.setOutput(true);
    } else {
      this.appendDummyInput().appendField(type === 'py_set' ? 'set' : 'for').appendField(new SymbolField(), 'SYMBOL');
      if (type === 'py_set') this.appendValueInput('VALUE').appendField('to');
      if (type === 'py_for_each') this.appendValueInput('ITERABLE').appendField('in');
      if (type === 'py_scoped_range') {
        this.appendValueInput('START').appendField('from');
        this.appendValueInput('STOP').appendField('up to (excluding)');
        this.appendValueInput('STEP').appendField('step');
      }
      if (type !== 'py_set') this.appendStatementInput('DO');
      this.setPreviousStatement(true); this.setNextStatement(true);
    }
    this.setInputsInline(true); this.setColour('#a57938');
  },
};

export function defineFunction(workspace: Blockly.Workspace, signature: Signature): FunctionBlock {
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try {
    createFunctionModel(workspace, signature);
    return Blockly.serialization.blocks.append({ type: signature.handler ? 'py_handler' : 'py_function', extraState: { functionId: signature.id, signature } }, workspace, { recordUndo: true }) as FunctionBlock;
  } finally { Blockly.Events.setGroup(group); }
}
export function callState(signature: Signature, value = false): Blockly.serialization.blocks.State {
  return { type: value ? 'py_call_value' : 'py_call', extraState: { functionId: signature.id, signature } };
}
export function referenceState(signature: Signature): Blockly.serialization.blocks.State {
  return { ...callState(signature), type: 'py_function_ref' };
}
