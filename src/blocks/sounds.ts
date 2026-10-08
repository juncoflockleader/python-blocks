import * as Blockly from 'blockly/core';
import { SceneReferenceField } from './scene';
import { numberInput } from './core';
import { instruments } from '../scene/sound';
Blockly.Blocks['sound_asset'] = { init(this: Blockly.Block) { this.appendDummyInput().appendField('sound').appendField(new SceneReferenceField('sound'), 'SOUND_ID'); this.setOutput(true); this.setColour('#9470a8'); } };
const value = (name: string) => ({ type: 'input_value', name });
const menu = (name: string, options: string[][]) => ({ type: 'field_dropdown', name, options });
const fields = [['volume %', 'volume'], ['pitch semitones', 'pitch'], ['pan −100 left / 100 right', 'pan']];
const block = (type: string, message0: string, args0: unknown[], output = false, tooltip = '') => ({ type, message0, args0, ...(output ? { output: null } : { previousStatement: null, nextStatement: null }), colour: '#9470a8', inputsInline: false, tooltip });
Blockly.common.defineBlocksWithJsonArray([
  block('sound_play', 'start sound %1 for sprite %2 (None for stage)', [value('SOUND'), value('OWNER')], false, 'Overlaps other playback. Use Stop or destroy its owner to stop it.'),
  block('sound_wait', 'play sound %1 until done for sprite %2 (None for stage)', [value('SOUND'), value('OWNER')], false, 'Waits for actual playback completion, or until this sound is stopped.'),
  block('sound_stop', 'stop sounds for sprite %1 (None for stage)', [value('OWNER')]),
  block('sound_stop_all', 'stop all sounds', []),
  block('sound_set', 'set sound %1 to %2 for sprite %3 (None for stage)', [menu('FIELD', fields), value('VALUE'), value('OWNER')]),
  block('sound_change', 'change sound %1 by %2 for sprite %3 (None for stage)', [menu('FIELD', fields), value('VALUE'), value('OWNER')]),
  block('sound_get', 'sound %1 for sprite %2 (None for stage)', [menu('FIELD', fields), value('OWNER')], true),
  block('sound_clear', 'clear pitch and pan for sprite %1 (None for stage)', [value('OWNER')]),
  block('sound_tempo', 'set tempo to %1 BPM', [value('VALUE')], false, '30–300 beats per minute. Notes/rests capture tempo when they start; saved songs have their own tempo.'),
  block('sound_tempo_get', 'tempo in BPM', [], true),
  block('sound_note', 'play %1 note %2 for %3 beats for sprite %4 (None for stage)', [menu('INSTRUMENT', instruments.map(i => [i, i])), value('NOTE'), value('BEATS'), value('OWNER')], false, 'MIDI note 60 is middle C. Drum instruments use the same beat duration. This action waits.'),
  block('sound_rest', 'rest for %1 beats', [value('BEATS')]),
]);
const owner = { shadow: { type: 'py_none' } };
export const soundsToolbox: Blockly.utils.toolbox.FlyoutItemInfo[] = [
  { kind: 'label', text: 'Create assets with Sounds & music' },
  { kind: 'block', type: 'sound_asset' },
  ...['sound_play', 'sound_wait'].map(type => ({ kind: 'block', type, inputs: { SOUND: { block: { type: 'sound_asset' } }, OWNER: owner } })),
  { kind: 'block', type: 'sound_stop', inputs: { OWNER: owner } }, { kind: 'block', type: 'sound_stop_all' },
  ...['sound_set', 'sound_change'].map(type => ({ kind: 'block', type, inputs: { VALUE: numberInput(type === 'sound_set' ? 100 : -10), OWNER: owner } })),
  { kind: 'block', type: 'sound_get', inputs: { OWNER: owner } }, { kind: 'block', type: 'sound_clear', inputs: { OWNER: owner } },
  { kind: 'label', text: 'Notes & rhythm' },
  { kind: 'block', type: 'sound_note', fields: { INSTRUMENT: 'triangle' }, inputs: { NOTE: numberInput(60), BEATS: numberInput(1), OWNER: owner } },
  { kind: 'block', type: 'sound_rest', inputs: { BEATS: numberInput(1) } },
  { kind: 'block', type: 'sound_tempo', inputs: { VALUE: numberInput(120) } }, { kind: 'block', type: 'sound_tempo_get' },
];
