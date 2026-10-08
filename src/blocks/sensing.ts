import * as Blockly from 'blockly/core';
const value = (name: string) => ({ type: 'input_value', name });
const block = (type: string, message0: string, args0: unknown[], output = false, tooltip = '') => ({ type, message0, args0, ...(output ? { output: null } : { previousStatement: null, nextStatement: null }), colour: '#477a85', inputsInline: false, tooltip });
Blockly.common.defineBlocksWithJsonArray([
  block('scene_touching_color', 'sprite %1 touches color %2 tolerance %3 ?', [value('SPRITE'), value('COLOR'), value('TOLERANCE')], true, 'Compare visible stage pixels without this sprite. Tolerance is 0–255 per RGB channel. Includes sprites, tiles, backdrops and pen marks.'),
  block('scene_color_touching', 'sprite %1 color %2 touches color %3 tolerance %4 ?', [value('SPRITE'), value('OWN_COLOR'), value('COLOR'), value('TOLERANCE')], true, 'Only test this sprite’s pixels matching the first color after its graphic effects.'),
  block('input_timer', 'timer seconds', [], true, 'Elapsed monotonic seconds since Run or Reset timer. World changes and focus loss keep it running.'),
  block('input_timer_reset', 'reset timer', []),
  block('input_ask', 'ask %1 and wait', [value('TEXT')], false, 'Questions queue in order. The last-answer block changes on submission. Cancel keeps the previous answer.'),
  block('input_ask_value', 'answer to question %1 (wait)', [value('TEXT')], true, 'Returns this question’s text answer, or None if cancelled. Capture it in a variable when asking concurrently.'),
  block('input_answer', 'last answer', [], true),
  block('input_cancel_questions', 'cancel all questions', [], false, 'Resume pending ask calls with None; leave the last submitted answer unchanged.'),
]);
