import * as Blockly from 'blockly/core';
import { lambdaState, validateLambda } from '../../language/lambdas';
import type { LambdaBlock, LambdaState } from '../../language/functions';

Blockly.Blocks['py_lambda'] = {
  init(this: LambdaBlock) {
    this.lambda = lambdaState();
    this.appendDummyInput('HEADER').appendField('lambda').appendField(new Blockly.FieldLabel(''), 'PARAMETERS');
    this.appendValueInput('BODY').appendField('returns');
    this.setOutput(true); this.setColour('#8066ba'); this.updateLambda();
    this.setTooltip('An anonymous synchronous function with one expression. Edit its parameters from the context menu or Function values → Manage lambdas. Its body can read only its own parameters.');
  },
  updateLambda(this: LambdaBlock) { this.setFieldValue(`(${this.lambda.parameters.map(p => p.name).join(', ')})`, 'PARAMETERS'); },
  saveExtraState(this: LambdaBlock): LambdaState {
    // A flyout is a template; each drag creates fresh scope/parameter identities.
    // Actual workspace serialization and Undo preserve existing identities.
    return this.workspace.isFlyout ? lambdaState(this.lambda.parameters.map(p => p.name)) : structuredClone(this.lambda);
  },
  loadExtraState(this: LambdaBlock, state: LambdaState) { validateLambda(state); this.lambda = structuredClone(state); this.updateLambda(); },
  customContextMenu(this: LambdaBlock, options: Blockly.ContextMenuRegistry.LegacyContextMenuOption[]) {
    if (!this.workspace.isFlyout) options.push({ text: 'Edit lambda parameters', enabled: true, callback: () => document.dispatchEvent(new CustomEvent('python-edit-lambda', { detail: { workspaceId: this.workspace.id, blockId: this.id } })) });
  },
};
