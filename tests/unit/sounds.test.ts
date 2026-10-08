import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { Blockly } from '../../src/blocks';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { compile, blockForLine } from '../../src/language/compiler';
import { defineFunction } from '../../src/blocks/core/functions';
import { exportModule, importModule } from '../../src/language/module-format';
import { moduleCallState } from '../../src/language/modules';
import { pythonExport } from '../../src/project/python-export';
import { decodeWave, encodeWave, SOUND_RATE, synthesize, synthesizeTone, validateSounds, validAudioCommand, defaultSoundSettings, type Song } from '../../src/scene/sound';
import { changeScene, sceneState } from '../../src/scene/state';
import { emptyScene, validateScene } from '../../src/scene/model';
const spaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); spaces.push(w); return w; };
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const block = (w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) => { const b = w.newBlock(type); Object.entries(fields).forEach(([k,v]) => b.setFieldValue(v,k)); return b; };
const plug = (p: Blockly.Block, key: string, c: Blockly.Block) => { p.getInput(key)!.connection!.connect(c.outputConnection ?? c.previousConnection!); return p; };
const song: Song = { id: 'song', name: 'Test', kind: 'song', tempo: 120, beats: 4, notes: [{ at: 0, beats: 1, pitch: 69, volume: 100, instrument: 'sine' }] };

describe('sound assets and generated Python', () => {
  it('validates canonical audio and song bounds and renders original notes with envelopes', () => {
    const samples = synthesize(song); expect(samples.length).toBe(2 * SOUND_RATE); expect(samples[0]).toBe(0); expect(Math.max(...samples.slice(0, 1000))).toBeGreaterThan(.15); expect(samples.slice(SOUND_RATE / 2).every(s => s === 0)).toBe(true);
    const data = encodeWave(samples), decoded = decodeWave(data); expect(decoded.length).toBe(samples.length); expect(decoded[123]).toBeCloseTo(samples[123], 4);
    expect(synthesizeTone(60, .0125, 'hat').length).toBe(Math.ceil(.0125 * SOUND_RATE)); expect(synthesizeTone(60, 32, 'kick').length).toBe(32 * SOUND_RATE);
    validateSounds([song, { id: 'clip', name: 'Clip', kind: 'clip', data }]);
    for (const invalid of [{...song,tempo:29}, {...song,beats:64,tempo:30}, {...song,notes:[{...song.notes[0],at:4}]}, {...song,notes:[{...song.notes[0],pitch:NaN}]}, {...song,notes:Array(257).fill(song.notes[0])}, {...song,name:'\u0001bad'}]) expect(() => validateSounds([invalid])).toThrow();
    expect(() => validateSounds([song, song])).toThrow();
    for (const broken of ['', data.slice(0,-4), data.replace('UklGR', 'AAAAA')]) expect(() => decodeWave(broken)).toThrow();
    expect(() => encodeWave(new Float32Array([NaN]))).toThrow();
    const settings = defaultSoundSettings(); expect(validAudioCommand({type:'tone',id:1,owner:'$stage',settings,pitch:60,seconds:.25,instrument:'triangle'})).toBe(true);
    for (const changes of [{id:0}, {seconds:33}, {pitch:60.5}, {instrument:'bad'}, {settings:{...settings,pan:101}}]) expect(validAudioCommand({type:'tone',id:1,owner:'$stage',settings,pitch:60,seconds:.25,instrument:'triangle',...changes})).toBe(false);
  });
  it('compiles and maps the playable music example, migrates version 15 and captures audio assets', () => {
    const w = ws(); restore(w, prepareProject(readFileSync('src/scene/sound-example.json','utf8')).project);
    const result = compile(w); expect(result.diagnostics).toEqual([]); expect(result.requiresSound).toBe(true); expect(result.executionMode).toBe('events');
    expect(result.source).toContain('await _pb_sounds.play_wait("first_song", None)'); expect(result.source).toContain('await _pb_sounds.note(84, 1, "sine",');
    const line = result.source!.split('\n').findIndex(s => s.includes('await _pb_sounds.note')) + 1; expect(w.getBlockById(blockForLine(result,'program.py',line)!)!.type).toBe('sound_note');
    const archive = unzipSync(pythonExport(result).content as Uint8Array); expect(JSON.parse(strFromU8(archive['scene.json'])).sounds).toEqual(result.scene!.sounds);
    const restored = ws(); restore(restored, snapshot(w)); expect(compile(restored).source).toBe(result.source);
    expect(prepareProject(JSON.stringify({...snapshot(w),languageVersion:15})).project.languageVersion).toBe(19);
  });
  it('preserves sound-only projects, stable references, undo and invalid-import recovery', () => {
    const w = ws(); changeScene(w, {...emptyScene(),sounds:[song]});
    const ref = block(w,'sound_asset',{SOUND_ID:'song'}); const renamed = {...emptyScene(),sounds:[{...song,name:'Renamed'}]}; changeScene(w,renamed);
    expect(ref.getField('SOUND_ID')!.getText()).toBe('Renamed');
    const state = snapshot(w); const restored = ws(); restore(restored,state); expect(sceneState(restored)).toEqual(renamed);
    changeScene(w,emptyScene()); expect(ref.getField('SOUND_ID')!.getText()).toContain('unavailable'); expect(ref.getFieldValue('SOUND_ID')).toBe('song');
    changeScene(w,renamed); expect(ref.getField('SOUND_ID')!.getText()).toBe('Renamed');
    expect(() => validateScene({...renamed,sounds:[{...song,notes:null}]})).toThrow(); expect(sceneState(w)).toEqual(renamed);
  });
  it('round-trips clips above the former image-only project limit and exports their exact captured bytes', () => {
    const w = ws(), data = encodeWave(new Float32Array(45 * SOUND_RATE));
    changeScene(w, {...emptyScene(), sounds:[{id:'voice', name:'Narration', kind:'clip', data}]});
    const project = snapshot(w), text = JSON.stringify(project); expect(text.length).toBeGreaterThan(2_000_000);
    const copy = ws(); restore(copy, prepareProject(text).project); expect(sceneState(copy).sounds).toEqual(sceneState(w).sounds);
    plug(block(w,'py_program'),'BODY',plug(plug(block(w,'sound_play'),'SOUND',block(w,'sound_asset',{SOUND_ID:'voice'})),'OWNER',block(w,'py_none')));
    const compiled = compile(w); expect(compiled.diagnostics).toEqual([]); changeScene(w,emptyScene());
    const zip = unzipSync(pythonExport(compiled).content as Uint8Array); expect(JSON.parse(strFromU8(zip['scene.json'])).sounds[0].data).toBe(data);
    expect(() => validateScene({...emptyScene(),sounds:Array.from({length:5},(_,i)=>({id:'clip'+i,name:'Clip',kind:'clip',data}))})).toThrow('12 MB');
  });
  it('enables event execution through reusable sound helpers and requires async wait contexts', () => {
    const m = ws(), fn = defineFunction(m,{id:'tempo',name:'start_music',parameters:[]}); plug(fn,'BODY',plug(block(m,'sound_tempo'),'VALUE',block(m,'py_number',{VALUE:'90'})));
    const w = ws(), binding = importModule(w, exportModule(m,{name:'music',functions:['tempo']}),'music');
    const call = Blockly.serialization.blocks.append(moduleCallState(binding,fn.signature),w); plug(block(w,'py_program'),'BODY',call);
    expect(compile(w).executionMode).toBe('events'); expect(compile(w).requiresSound).toBe(true);
    call.nextConnection!.connect(plug(block(w,'sound_rest'),'BEATS',block(w,'py_number',{VALUE:'1'})).previousConnection!);
    expect(compile(w).diagnostics.some(d => d.code === 'wait-context')).toBe(true);
  });
});
