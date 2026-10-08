import * as Blockly from 'blockly/core';
import { numberInput } from './core';
const value = (name: string) => ({ type: 'input_value', name });
const menu = (name: string, options: string[][]) => ({ type: 'field_dropdown', name, options });
const fields = [['score', 'score'], ['lives', 'lives']];
const action = () => menu('ACTION', [['end game (lose)', 'lose'], ['send game event', 'event']]);
const block = (type: string, message0: string, args0: unknown[], output = false, tooltip = '') => ({ type, message0, args0, ...(output ? { output: null } : { previousStatement: null, nextStatement: null }), colour: '#9a6c3e', inputsInline: false, tooltip });
Blockly.common.defineBlocksWithJsonArray([
  block('game_set', 'set %1 to %2', [menu('FIELD', fields), value('VALUE')]),
  block('game_change', 'change %1 by %2', [menu('FIELD', fields), value('VALUE')]),
  block('game_get', 'game %1', [menu('FIELD', [...fields, ['seconds remaining (None before countdown)', 'seconds']])], true),
  block('game_show', '%1 %2 on HUD', [menu('SHOW', [['show', 'TRUE'], ['hide', 'FALSE']]), menu('FIELD', [...fields, ['countdown', 'countdown']])]),
  block('game_message', 'HUD message %1', [value('TEXT')], false, 'Up to 120 characters, fixed to the screen. Empty text clears it.'),
  block('game_lives_rule', 'when lives reach zero %1', [action()], false, 'Event mode sends game:lives_zero once per positive-to-zero transition.'),
  block('game_countdown', 'count down %1 seconds then %2', [value('SECONDS'), action()], false, 'Event mode sends game:countdown once. Starting again replaces the timer.'),
  block('game_countdown_stop', 'stop countdown', [], false, 'Freeze the remaining time. Hide the countdown separately if desired.'),
  block('game_finish', 'finish game %1 message %2', [menu('WON', [['win', 'TRUE'], ['lose', 'FALSE']]), value('TEXT')], false, 'Stops every activity immediately. Play again restores this run’s original project.'),
  block('game_effect', '%1 burst at sprite %2 (None for screen) for %3 seconds', [menu('KIND', [['confetti', 'confetti'], ['sparkles', 'sparkles'], ['rings', 'rings']]), value('SPRITE'), value('SECONDS')]),
  block('game_effect_clear', 'clear game bursts', []),
]);
const text = (s: string) => ({ shadow: { type: 'text', fields: { TEXT: s } } });
export const gameToolbox: Blockly.utils.toolbox.FlyoutItemInfo[] = [
  { kind: 'label', text: 'Score, lives & screen HUD' },
  { kind: 'block', type: 'game_set', inputs: { VALUE: numberInput(0) } },
  { kind: 'block', type: 'game_set', fields: { FIELD: 'lives' }, inputs: { VALUE: numberInput(3) } },
  { kind: 'block', type: 'game_change', inputs: { VALUE: numberInput(1) } },
  { kind: 'block', type: 'game_get' }, { kind: 'block', type: 'game_show' },
  { kind: 'block', type: 'game_message', inputs: { TEXT: text('Collect the stars!') } },
  { kind: 'label', text: 'Timer & game rules' },
  { kind: 'block', type: 'game_countdown', inputs: { SECONDS: numberInput(30) } },
  { kind: 'block', type: 'game_countdown_stop' }, { kind: 'block', type: 'game_lives_rule' },
  { kind: 'block', type: 'game_finish', inputs: { TEXT: text('You did it!') } },
  { kind: 'label', text: 'Visual bursts' },
  { kind: 'block', type: 'game_effect', inputs: { SPRITE: { shadow: { type: 'py_none' } }, SECONDS: numberInput(1) } },
  { kind: 'block', type: 'game_effect_clear' },
];
