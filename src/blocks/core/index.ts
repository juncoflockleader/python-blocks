import * as Blockly from 'blockly/core';

Blockly.common.defineBlocksWithJsonArray([
  { type: 'py_program', message0: 'Program %1 %2', args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'BODY' }], colour: '#47776c', tooltip: 'Startup statements run in this order. Other loose blocks are drafts.' },
  { type: 'py_number', message0: '%1', args0: [{ type: 'field_input', name: 'VALUE', text: '0' }], output: 'Number', colour: '#8066ba', tooltip: 'A Python integer or decimal. Integer digits are preserved exactly.' },
  { type: 'py_unary', message0: '%1 %2', args0: [{ type: 'field_dropdown', name: 'OP', options: [['−', '-'], ['+', '+']] }, { type: 'input_value', name: 'VALUE' }], output: null, colour: '#8066ba', tooltip: 'Apply Python unary minus or plus to a value.' },
  { type: 'py_binary', message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A' }, { type: 'field_dropdown', name: 'OP', options: [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['floor divide', '//'], ['remainder', '%'], ['power', '**']] }, { type: 'input_value', name: 'B' }], inputsInline: true, output: null, colour: '#8066ba' },
  { type: 'py_logic', message0: '%1 %2 %3', args0: [{ type: 'input_value', name: 'A' }, { type: 'field_dropdown', name: 'OP', options: [['and', 'and'], ['or', 'or']] }, { type: 'input_value', name: 'B' }], inputsInline: true, output: null, colour: '#6682a5', tooltip: 'Python short-circuit logic: returns one of its operands.' },
  { type: 'py_not', message0: 'not %1', args0: [{ type: 'input_value', name: 'VALUE' }], output: 'Boolean', colour: '#6682a5' },
  { type: 'py_none', message0: 'None', output: null, colour: '#6682a5' },
  { type: 'py_convert', message0: '%1 of %2', args0: [{ type: 'field_dropdown', name: 'TYPE', options: [['integer (int)', 'int'], ['decimal (float)', 'float'], ['text (str)', 'str'], ['Boolean (bool)', 'bool']] }, { type: 'input_value', name: 'VALUE' }], output: null, colour: '#8066ba' },
  { type: 'py_range', message0: 'for %1 from %2 up to (excluding) %3 step %4 %5 %6', args0: [{ type: 'field_variable', name: 'VAR', variable: 'number' }, { type: 'input_value', name: 'START' }, { type: 'input_value', name: 'STOP' }, { type: 'input_value', name: 'STEP' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], previousStatement: null, nextStatement: null, colour: '#a57938' },
  { type: 'py_flow', message0: '%1', args0: [{ type: 'field_dropdown', name: 'FLOW', options: [['break out of loop', 'break'], ['continue with next iteration', 'continue']] }], previousStatement: null, colour: '#a57938' },
]);

// Conditions follow Python truthiness; the expression need not be a Boolean.
for (const type of ['controls_if', 'controls_whileUntil', 'controls_forEach']) {
  const original = Blockly.Blocks[type].init;
  Blockly.Blocks[type].init = function () {
    original.call(this);
    const allowExpressions = () => {
      for (const input of this.inputList) if (input.type === Blockly.inputs.inputTypes.VALUE) input.connection?.setCheck(null);
    };
    const updateShape = this.updateShape_;
    if (updateShape) this.updateShape_ = (...args: unknown[]) => { updateShape.apply(this, args); allowExpressions(); };
    allowExpressions();
  };
}

// Python permits equality across types and reports invalid ordering at runtime.
// Blockly's default change handler unplugs differently typed operands instead.
const initializeComparison = Blockly.Blocks['logic_compare'].init;
Blockly.Blocks['logic_compare'].init = function () {
  initializeComparison.call(this);
  this.onchange = null;
};

export const numberInput = (value: number | string) => ({ shadow: { type: 'py_number', fields: { VALUE: String(value) } } });
