import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import { pythonGenerator as standardGenerator, PythonGenerator, Order } from 'blockly/python';

class PlaygroundGenerator extends PythonGenerator {
  usePen() { this.definitions_['import_pen'] = 'from playground import pen'; }
  // JSON string escaping is valid for Python strings and preserves embedded newlines.
  override quote_(text: string) { return JSON.stringify(text); }
}
const pythonGenerator = new PlaygroundGenerator();
Object.assign(pythonGenerator.forBlock, standardGenerator.forBlock);
pythonGenerator.addReservedWords('pen,playground');

// Blockly's locale types include a synthetic default; only pass message strings.
Blockly.setLocale(Object.fromEntries(Object.entries(En).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
Blockly.common.defineBlocksWithJsonArray([
  { type: 'pen_move', message0: 'move %1 steps', args0: [{ type: 'input_value', name: 'STEPS', check: 'Number' }], previousStatement: null, nextStatement: null, colour: '#47776c', tooltip: 'Move the pen forward and draw a line.' },
  { type: 'pen_turn', message0: 'turn right %1 degrees', args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: '#47776c', tooltip: 'Turn the pen clockwise.' },
  { type: 'pen_color', message0: 'set pen color %1', args0: [{ type: 'field_dropdown', name: 'COLOR', options: [['teal', '#267c70'], ['orange', '#e47d4b'], ['purple', '#8066ba'], ['blue', '#487dc9']] }], previousStatement: null, nextStatement: null, colour: '#47776c' },
  { type: 'pen_lift', message0: 'pen %1', args0: [{ type: 'field_dropdown', name: 'STATE', options: [['up', 'up'], ['down', 'down']] }], previousStatement: null, nextStatement: null, colour: '#47776c' },
]);

function penImport() { pythonGenerator.usePen(); }
pythonGenerator.forBlock['pen_move'] = (block, generator) => {
  penImport();
  return `pen.move(${generator.valueToCode(block, 'STEPS', Order.NONE) || '0'})\n`;
};
pythonGenerator.forBlock['pen_turn'] = (block, generator) => {
  penImport();
  return `pen.turn(${generator.valueToCode(block, 'DEGREES', Order.NONE) || '0'})\n`;
};
pythonGenerator.forBlock['pen_color'] = (block) => {
  penImport();
  return `pen.color(${pythonGenerator.quote_(block.getFieldValue('COLOR'))})\n`;
};
pythonGenerator.forBlock['pen_lift'] = (block) => {
  penImport();
  return block.getFieldValue('STATE') === 'up' ? 'pen.up()\n' : 'pen.down()\n';
};

const numberInput = (value: number) => ({ shadow: { type: 'math_number', fields: { NUM: value } } });
export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: 'Draw', colour: '#47776c', contents: [
      { kind: 'block', type: 'pen_move', inputs: { STEPS: numberInput(100) } },
      { kind: 'block', type: 'pen_turn', inputs: { DEGREES: numberInput(90) } },
      { kind: 'block', type: 'pen_color' }, { kind: 'block', type: 'pen_lift' },
    ] },
    { kind: 'category', name: 'Loops', colour: '#a57938', contents: [
      { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: numberInput(4) } },
      { kind: 'block', type: 'controls_whileUntil' },
    ] },
    { kind: 'category', name: 'Logic', colour: '#6682a5', contents: ['controls_if', 'logic_compare', 'logic_operation', 'logic_boolean'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Numbers', colour: '#8066ba', contents: ['math_number', 'math_arithmetic', 'math_random_int'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Text', colour: '#ae657d', contents: ['text', 'text_print', 'text_join'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Variables', colour: '#a57938', custom: 'VARIABLE' },
    { kind: 'category', name: 'Functions', colour: '#8066ba', custom: 'PROCEDURE' },
  ],
};

export const squareProject = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'pen_color', x: 48, y: 48, fields: { COLOR: '#267c70' },
    next: { block: {
      type: 'controls_repeat_ext', inputs: {
        TIMES: numberInput(4),
        DO: { block: { type: 'pen_move', inputs: { STEPS: numberInput(100) }, next: { block: { type: 'pen_turn', inputs: { DEGREES: numberInput(90) } } } } },
      },
    } },
  }] },
};

export function generatePython(workspace: Blockly.Workspace): string {
  return pythonGenerator.workspaceToCode(workspace);
}

export { Blockly };
