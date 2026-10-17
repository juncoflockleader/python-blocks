import * as Blockly from 'blockly/core';
import 'blockly/blocks';
import * as En from 'blockly/msg/en';
import './core';
import './core/functions';
import './core/collections';
import './core/modules';
import './core/function-values';
import './core/lambdas';
import './scene';
import './sensing';
import './sounds';
import './game';
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

// The palette for each level is defined in src/ui/levels.ts.

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
