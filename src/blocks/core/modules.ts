import * as Blockly from 'blockly/core';
import { resolveModuleCall, validateModuleSignature, type ModuleCallBlock, type ModuleCallState } from '../../language/modules';

for (const type of ['py_module_call', 'py_module_call_value', 'py_module_function_ref']) Blockly.Blocks[type] = {
  init(this: ModuleCallBlock) {
    this.moduleCall = { importId: '', moduleId: '', revision: '', functionId: '', alias: 'module', signature: { id: '', name: 'choose function', parameters: [] } };
    this.appendDummyInput('HEADER').appendField(new Blockly.FieldLabel('call'), 'ACTION').appendField(new Blockly.FieldLabel('choose module function'), 'NAME');
    if (type === 'py_module_call') { this.setPreviousStatement(true); this.setNextStatement(true); } else this.setOutput(true);
    this.setColour('#547d91'); this.setInputsInline(true);
    this.setTooltip(type === 'py_module_function_ref' ? 'A synchronous function from this pinned module, without calling it. Use Call function value to invoke it.' : 'Call a function from a pinned module. Manage its namespace and inspect its definition with Modules.');
  },
  saveExtraState(this: ModuleCallBlock) { return structuredClone(this.moduleCall); },
  loadExtraState(this: ModuleCallBlock, state: ModuleCallState) {
    validateModuleSignature(state.signature);
    for (const key of ['importId', 'moduleId', 'revision', 'functionId', 'alias'] as const) if (typeof state[key] !== 'string' || !state[key]) throw new Error('The module call reference is invalid.');
    if (state.functionId !== state.signature.id) throw new Error('The module call signature has a different function identity.');
    this.moduleCall = structuredClone(state); this.refreshModuleCall();
  },
  refreshModuleCall(this: ModuleCallBlock) {
    if (this.isDeadOrDying()) return;
    const target = resolveModuleCall(this.workspace, this.moduleCall);
    if (target) this.moduleCall.alias = target.binding.alias;
    const signature = this.moduleCall.signature;
    this.setFieldValue(this.type === 'py_module_function_ref' ? 'function' : signature.async ? 'await call' : 'call', 'ACTION');
    this.setFieldValue(`${this.moduleCall.alias}.${signature.name}`, 'NAME');
    if (this.type === 'py_module_function_ref') return;
    // Pinned signatures never change implicitly. A mismatched file is diagnosed
    // without deleting argument blocks or rebinding them by position.
    for (const p of signature.parameters) if (!this.getInput(`ARG_${p.id}`)) this.appendValueInput(`ARG_${p.id}`).appendField(p.name);
  },
};
