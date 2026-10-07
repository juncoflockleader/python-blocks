import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import './core';
import './core/functions';
import './core/collections';
import './core/modules';
import './core/function-values';
import './core/lambdas';
import { numberInput } from './core';
import { compile } from '../language/compiler';

// Blockly's locale types include a synthetic default; only pass message strings.
Blockly.setLocale(Object.fromEntries(Object.entries(En).filter((entry): entry is [string, string] => typeof entry[1] === 'string')));
Blockly.Msg['TEXT_JOIN_TITLE_CREATEWITH'] = 'join as text';
Blockly.Msg['PROCEDURES_DEFNORETURN_PROCEDURE'] = 'do_something';
Blockly.Msg['PROCEDURES_DEFRETURN_PROCEDURE'] = 'calculate';
Blockly.common.defineBlocksWithJsonArray([
  { type: 'pen_move', message0: 'move %1 steps', args0: [{ type: 'input_value', name: 'STEPS', check: 'Number' }], previousStatement: null, nextStatement: null, colour: '#47776c', tooltip: 'Move the pen forward and draw a line.' },
  { type: 'pen_turn', message0: 'turn right %1 degrees', args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }], previousStatement: null, nextStatement: null, colour: '#47776c', tooltip: 'Turn the pen clockwise.' },
  { type: 'pen_color', message0: 'set pen color %1', args0: [{ type: 'field_dropdown', name: 'COLOR', options: [['teal', '#267c70'], ['orange', '#e47d4b'], ['purple', '#8066ba'], ['blue', '#487dc9']] }], previousStatement: null, nextStatement: null, colour: '#47776c' },
  { type: 'pen_lift', message0: 'pen %1', args0: [{ type: 'field_dropdown', name: 'STATE', options: [['up', 'up'], ['down', 'down']] }], previousStatement: null, nextStatement: null, colour: '#47776c' },
]);

export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox', contents: [
    { kind: 'category', name: 'Program', colour: '#47776c', contents: [{ kind: 'block', type: 'py_program' }] },
    { kind: 'category', name: 'Draw', colour: '#47776c', contents: [
      { kind: 'block', type: 'pen_move', inputs: { STEPS: numberInput(100) } },
      { kind: 'block', type: 'pen_turn', inputs: { DEGREES: numberInput(90) } },
      { kind: 'block', type: 'pen_color' }, { kind: 'block', type: 'pen_lift' },
    ] },
    { kind: 'category', name: 'Loops', colour: '#a57938', contents: [
      { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: numberInput(4) } },
      { kind: 'block', type: 'controls_whileUntil' },
      { kind: 'block', type: 'py_scoped_range', inputs: { START: numberInput(0), STOP: numberInput(5), STEP: numberInput(1) } },
      { kind: 'block', type: 'py_for_each' }, { kind: 'block', type: 'py_flow' },
    ] },
    { kind: 'category', name: 'Logic', colour: '#6682a5', contents: ['controls_if', 'logic_compare', 'py_logic', 'py_not', 'logic_boolean', 'py_none'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Numbers', colour: '#8066ba', contents: ['py_number', 'py_binary', 'py_convert', 'math_random_int'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Text', colour: '#ae657d', contents: ['text', 'text_print', 'text_join'].map(type => ({ kind: 'block', type })) },
    { kind: 'category', name: 'Variables', colour: '#a57938', custom: 'PY_VARIABLES' },
    { kind: 'category', name: 'Functions', colour: '#8066ba', custom: 'PY_FUNCTIONS' },
    { kind: 'category', name: 'Function values', colour: '#8066ba', custom: 'PY_FUNCTION_VALUES' },
    { kind: 'category', name: 'Events', colour: '#ba7b4e', custom: 'PY_EVENTS' },
    { kind: 'category', name: 'Modules', colour: '#547d91', custom: 'PY_MODULES' },
    { kind: 'category', name: 'Collections', colour: '#b27745', contents: ['lists_create_with', 'py_dict', 'py_length', 'py_item_get', 'py_item_set', 'py_item_delete', 'py_list_append', 'py_contains', 'py_dict_get', 'py_dict_keys', 'py_shallow_copy'].map(type => ({ kind: 'block', type })) },
  ],
};

export const squareProject = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'py_program', x: 48, y: 48, inputs: { BODY: { block: { type: 'pen_color', fields: { COLOR: '#267c70' },
    next: { block: {
      type: 'controls_repeat_ext', inputs: {
        TIMES: numberInput(4),
        DO: { block: { type: 'pen_move', inputs: { STEPS: numberInput(100) }, next: { block: { type: 'pen_turn', inputs: { DEGREES: numberInput(90) } } } } },
      },
    } },
  } } } }] },
};

export function generatePython(workspace: Blockly.Workspace): string {
  const result = compile(workspace);
  if (result.source === null) throw new Error(result.diagnostics.map(d => d.message).join('\n'));
  return result.source;
}

export { Blockly };
