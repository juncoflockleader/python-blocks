import * as Blockly from 'blockly/core';

export interface DynamicCallBlock extends Blockly.Block {
  argumentCount: number;
  updateArguments(): void;
}
interface ArgumentBlock extends Blockly.Block { valueConnection?: Blockly.Connection | null }
function argumentsOf(container: Blockly.Block): ArgumentBlock[] {
  const args: ArgumentBlock[] = [];
  for (let item = container.getInputTargetBlock('ARGUMENTS'); item; item = item.getNextBlock()) if (!item.isInsertionMarker()) args.push(item as ArgumentBlock);
  return args;
}
Blockly.common.defineBlocksWithJsonArray([
  { type: 'py_call_arguments', message0: 'positional arguments %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'ARGUMENTS' }], colour: '#8066ba', enableContextMenu: false },
  { type: 'py_call_argument', message0: 'argument', previousStatement: null, nextStatement: null, colour: '#8066ba', enableContextMenu: false },
]);

for (const type of ['py_dynamic_call', 'py_dynamic_call_value']) Blockly.Blocks[type] = {
  init(this: DynamicCallBlock) {
    this.argumentCount = 1;
    this.appendValueInput('CALLABLE').appendField('call function value');
    if (type === 'py_dynamic_call') { this.setPreviousStatement(true); this.setNextStatement(true); } else this.setOutput(true);
    this.setColour('#8066ba'); this.setInputsInline(false);
    this.setTooltip('Call a synchronous function value with positional arguments. Edit the argument list with the gear. Python reports wrong argument counts and non-callable values.');
    this.setMutator(new Blockly.icons.MutatorIcon(['py_call_argument'], this as unknown as Blockly.BlockSvg));
    this.updateArguments();
  },
  saveExtraState(this: DynamicCallBlock) { return { argumentCount: this.argumentCount }; },
  loadExtraState(this: DynamicCallBlock, state: { argumentCount: number }) {
    if (!Number.isInteger(state.argumentCount) || state.argumentCount < 0 || state.argumentCount > 100) throw new Error('A dynamic call needs between 0 and 100 positional arguments.');
    this.argumentCount = state.argumentCount; this.updateArguments();
  },
  updateArguments(this: DynamicCallBlock) {
    for (let index = 0; index < this.argumentCount; index++) if (!this.getInput(`ARG${index}`)) this.appendValueInput(`ARG${index}`).appendField(`argument ${index + 1}`);
    for (const input of [...this.inputList]) if (/^ARG\d+$/.test(input.name) && Number(input.name.slice(3)) >= this.argumentCount) this.removeInput(input.name);
  },
  decompose(this: DynamicCallBlock, workspace: Blockly.WorkspaceSvg) {
    const container = workspace.newBlock('py_call_arguments'); container.initSvg();
    let connection = container.getInput('ARGUMENTS')!.connection!;
    for (let index = 0; index < this.argumentCount; index++) {
      const arg = workspace.newBlock('py_call_argument'); arg.initSvg();
      connection.connect(arg.previousConnection!); connection = arg.nextConnection!;
    }
    return container;
  },
  saveConnections(this: DynamicCallBlock, container: Blockly.Block) {
    argumentsOf(container).forEach((arg, index) => arg.valueConnection = this.getInput(`ARG${index}`)?.connection?.targetConnection);
  },
  compose(this: DynamicCallBlock, container: Blockly.Block) {
    const args = argumentsOf(container);
    if (args.length > 100) throw new Error('A dynamic call supports at most 100 arguments.');
    const retained = new Set(args.map(arg => arg.valueConnection));
    const shadows: Blockly.Block[] = [];
    // Leave CALLABLE connected. Preserve removed expressions, including shadows,
    // as ordinary drafts; reconnect retained expressions in their new positions.
    for (const input of this.inputList) if (/^ARG\d+$/.test(input.name) && input.connection?.targetConnection) {
      const child = input.connection.targetBlock()!;
      if (child.isShadow() && retained.has(input.connection.targetConnection)) shadows.push(child);
      child.setShadow(false); input.connection.setShadowState(null); child.unplug();
    }
    this.argumentCount = args.length; this.updateArguments();
    args.forEach((arg, index) => arg.valueConnection?.reconnect(this, `ARG${index}`));
    for (const child of shadows) if (child.getParent()) child.setShadow(true);
  },
};
