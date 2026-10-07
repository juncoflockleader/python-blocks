import * as Blockly from 'blockly/core';

/** Preserve Python case distinctions for our scopes while leaving the legacy
 * and plugin-private variable types available for project migration. */
export class PythonVariableMap extends Blockly.VariableMap {
  override getVariable(name: string, type = '') {
    return type.startsWith('py:')
      ? this.getVariablesOfType(type).find(variable => variable.getName() === name) ?? null
      : super.getVariable(name, type);
  }
  override renameVariable(variable: Blockly.IVariableModel<Blockly.IVariableState>, name: string) {
    const conflict = this.getVariable(name, variable.getType());
    if (variable.getType().startsWith('py:') && conflict && conflict.getId() !== variable.getId()) throw new Error(`“${name}” already exists in this scope.`);
    return super.renameVariable(variable, name);
  }
}
export function installPythonVariables(workspace: Blockly.Workspace) {
  if (workspace.getVariableMap() instanceof PythonVariableMap) return;
  const map = new PythonVariableMap(workspace);
  for (const variable of workspace.getVariableMap().getAllVariables()) map.addVariable(variable);
  workspace.setVariableMap(map);
}
