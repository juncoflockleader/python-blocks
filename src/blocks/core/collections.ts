import * as Blockly from 'blockly/core';

function detachLiteralInputs(block: Blockly.Block, retained: Set<Blockly.Connection | null | undefined>) {
  const shadows = new Set<Blockly.Block>();
  for (const input of block.inputList) if (input.connection?.targetConnection) {
    const child = input.connection.targetBlock()!;
    if (child.isShadow() && retained.has(input.connection.targetConnection)) shadows.add(child);
    child.setShadow(false); input.connection.setShadowState(null); child.unplug();
  }
  return () => { for (const child of shadows) if (child.getParent()) child.setShadow(true); };
}

interface ListBlock extends Blockly.Block { itemCount_: number; updateShape_(): void }
interface ListItemBlock extends Blockly.Block { valueConnection_?: Blockly.Connection | null }
Blockly.Blocks['lists_create_with'].compose = function (this: ListBlock, container: Blockly.Block) {
  const connections: (Blockly.Connection | null | undefined)[] = [];
  for (let item = container.getInputTargetBlock('STACK'); item; item = item.getNextBlock()) {
    if (!item.isInsertionMarker()) connections.push((item as ListItemBlock).valueConnection_);
  }
  const restoreShadows = detachLiteralInputs(this, new Set(connections));
  this.itemCount_ = connections.length; this.updateShape_();
  connections.forEach((connection, index) => connection?.reconnect(this, `ADD${index}`));
  restoreShadows();
};

Blockly.common.defineBlocksWithJsonArray([
  { type: 'py_length', message0: 'length of %1', args0: [{ type: 'input_value', name: 'VALUE' }], output: 'Number', colour: '#b27745' },
  { type: 'py_item_get', message0: 'item of %1 at key / index %2', args0: [{ type: 'input_value', name: 'COLLECTION' }, { type: 'input_value', name: 'KEY' }], output: null, inputsInline: true, colour: '#b27745', tooltip: 'Python indexing starts at zero; negative list indices count from the end. Missing keys/indices raise an error.' },
  { type: 'py_item_set', message0: 'set item of %1 at key / index %2 to %3', args0: [{ type: 'input_value', name: 'COLLECTION' }, { type: 'input_value', name: 'KEY' }, { type: 'input_value', name: 'VALUE' }], previousStatement: null, nextStatement: null, inputsInline: true, colour: '#b27745' },
  { type: 'py_item_delete', message0: 'delete item of %1 at key / index %2', args0: [{ type: 'input_value', name: 'COLLECTION' }, { type: 'input_value', name: 'KEY' }], previousStatement: null, nextStatement: null, inputsInline: true, colour: '#b27745' },
  { type: 'py_list_append', message0: 'append %1 to list %2', args0: [{ type: 'input_value', name: 'VALUE' }, { type: 'input_value', name: 'LIST' }], previousStatement: null, nextStatement: null, inputsInline: true, colour: '#b27745' },
  { type: 'py_contains', message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'ITEM' }, { type: 'field_dropdown', name: 'OP', options: [['is in', 'in'], ['is not in', 'not in']] }, { type: 'input_value', name: 'COLLECTION' }], output: 'Boolean', inputsInline: true, colour: '#b27745' },
  { type: 'py_dict_get', message0: 'dictionary %1 get key %2 or default %3', args0: [{ type: 'input_value', name: 'DICT' }, { type: 'input_value', name: 'KEY' }, { type: 'input_value', name: 'DEFAULT' }], output: null, inputsInline: true, colour: '#b27745', tooltip: 'Use the default only when the key is absent. The default expression is evaluated when this call is made, following Python dict.get.' },
  { type: 'py_dict_keys', message0: 'keys of dictionary %1', args0: [{ type: 'input_value', name: 'DICT' }], output: null, colour: '#b27745' },
  { type: 'py_shallow_copy', message0: 'shallow copy of %1', args0: [{ type: 'input_value', name: 'VALUE' }], output: null, colour: '#b27745', tooltip: 'Copy a list or dictionary. Nested collections are still shared.' },
  { type: 'py_dict_container', message0: 'dictionary pairs %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'PAIRS' }], colour: '#b27745', enableContextMenu: false },
  { type: 'py_dict_pair', message0: 'key and value', previousStatement: null, nextStatement: null, colour: '#b27745', enableContextMenu: false },
]);
interface DictionaryBlock extends Blockly.Block {
  itemCount: number;
  updateShape(): void;
}
interface PairBlock extends Blockly.Block { keyConnection?: Blockly.Connection | null; valueConnection?: Blockly.Connection | null }
function pairBlocks(container: Blockly.Block): PairBlock[] {
  const result: PairBlock[] = [];
  for (let item = container.getInputTargetBlock('PAIRS'); item; item = item.getNextBlock()) if (!item.isInsertionMarker()) result.push(item as PairBlock);
  return result;
}
Blockly.Blocks['py_dict'] = {
  init(this: DictionaryBlock) {
    this.itemCount = 2; this.setOutput(true, 'Dictionary'); this.setColour('#b27745');
    this.setTooltip('A Python dictionary. Keys can be any hashable Python value. Repeated keys keep the last value.');
    this.setMutator(new Blockly.icons.MutatorIcon(['py_dict_pair'], this as unknown as Blockly.BlockSvg));
    this.updateShape();
  },
  saveExtraState(this: DictionaryBlock) { return { itemCount: this.itemCount }; },
  loadExtraState(this: DictionaryBlock, state: { itemCount: number }) {
    if (!Number.isInteger(state.itemCount) || state.itemCount < 0 || state.itemCount > 100) throw new Error('A dictionary block needs between 0 and 100 pairs.');
    this.itemCount = state.itemCount; this.updateShape();
  },
  updateShape(this: DictionaryBlock) {
    if (!this.getInput('TITLE')) this.appendDummyInput('TITLE').appendField('dictionary');
    for (let index = 0; index < this.itemCount; index++) {
      if (!this.getInput(`KEY${index}`)) this.appendValueInput(`KEY${index}`).appendField('key');
      if (!this.getInput(`VALUE${index}`)) this.appendValueInput(`VALUE${index}`).appendField('value');
    }
    for (const input of [...this.inputList]) if (/^(KEY|VALUE)\d+$/.test(input.name) && Number(input.name.replace(/\D/g, '')) >= this.itemCount) this.removeInput(input.name);
  },
  decompose(this: DictionaryBlock, workspace: Blockly.WorkspaceSvg) {
    const container = workspace.newBlock('py_dict_container'); container.initSvg();
    let connection = container.getInput('PAIRS')!.connection!;
    for (let index = 0; index < this.itemCount; index++) {
      const pair = workspace.newBlock('py_dict_pair'); pair.initSvg();
      connection.connect(pair.previousConnection!); connection = pair.nextConnection!;
    }
    return container;
  },
  saveConnections(this: DictionaryBlock, container: Blockly.Block) {
    pairBlocks(container).forEach((pair, index) => { pair.keyConnection = this.getInput(`KEY${index}`)?.connection?.targetConnection; pair.valueConnection = this.getInput(`VALUE${index}`)?.connection?.targetConnection; });
  },
  compose(this: DictionaryBlock, container: Blockly.Block) {
    const pairs = pairBlocks(container);
    if (pairs.length > 100) throw new Error('A dictionary block supports at most 100 pairs.');
    const retained = new Set(pairs.flatMap(pair => [pair.keyConnection, pair.valueConnection]));
    // Keep removed expressions as drafts, including visible shadow values.
    const restoreShadows = detachLiteralInputs(this, retained);
    this.itemCount = pairs.length; this.updateShape();
    pairs.forEach((pair, index) => { pair.keyConnection?.reconnect(this, `KEY${index}`); pair.valueConnection?.reconnect(this, `VALUE${index}`); });
    restoreShadows();
  },
};
