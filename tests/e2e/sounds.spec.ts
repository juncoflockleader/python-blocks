import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeWave, synthesizeTone } from '../../src/scene/sound';
const fixture = JSON.parse(readFileSync('src/scene/sound-example.json','utf8'));
const b = (type: string, fields: Record<string, unknown> = {}, inputs: Record<string, any> = {}): any => ({ type, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([k,v]) => [k,{block:v}])) });
const n = (v: number) => b('py_number',{VALUE:String(v)}), t = (v: string) => b('text',{TEXT:v}), none = () => b('py_none');
const actor = () => b('scene_sprite',{SPRITE_ID:'bird'});
const print = (s: string) => b('text_print',{}, {TEXT:t(s)});
const chain = (...blocks: any[]) => { blocks.slice(1).forEach((next,i) => blocks[i].next = {block:next}); return blocks[0]; };
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function setup(page: Page) {
  await page.addInitScript(() => {
    const state = window as any; state.audioMonitors = []; state.stereoMonitors = []; state.micTracks = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      private tapped = false;
      override createGain() {
        const gain = super.createGain();
        if (!this.tapped) { this.tapped = true; const analyser = super.createAnalyser(); analyser.fftSize = 2048; gain.connect(analyser); state.audioMonitors.push(analyser);
          const splitter = super.createChannelSplitter(2), left = super.createAnalyser(), right = super.createAnalyser(); gain.connect(splitter); splitter.connect(left,0); splitter.connect(right,1); state.stereoMonitors.push([left,right]); }
        return gain;
      }
    };
    // Feed actual MediaRecorder a browser-generated stream. No physical microphone is accessed.
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new Native(), destination = ctx.createMediaStreamDestination(), tone = ctx.createOscillator();
      tone.frequency.value = 440; tone.connect(destination); tone.start(); await ctx.resume();
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track); let stopped = false;
        track.stop = () => { stop(); if (!stopped) { stopped = true; tone.stop(); void ctx.close(); } };
      }
      state.micTracks.push(...destination.stream.getTracks()); return destination.stream;
    };
  });
  await page.goto('/');
}
async function rms(page: Page) { return page.evaluate(() => Math.max(0, ...(window as any).audioMonitors.map((a: AnalyserNode) => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((s,x) => s + x*x,0) / data.length); }))); }
async function install(page: Page, handlers?: [string, any][]) {
  const p = structuredClone(fixture);
  if (handlers) {
    p.workspace.procedures = handlers.map(([event],i) => ({id:'h'+i,name:'h_'+i,async:true,parameters:[{id:'p'+i,name:'payload'}],handler:{event,order:i}}));
    p.workspace.blocks.blocks = handlers.map(([,body],i) => ({type:'py_handler',id:'hb'+i,x:40+i*350,y:40,extraState:{functionId:'h'+i},inputs:{BODY:{block:body}}}));
  }
  await page.locator('#project-file').setInputFiles({name:'music.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await expect.poll(async () => (await saved(page)).workspace.pythonScene).toEqual(p.workspace.pythonScene);
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running',{timeout:60_000}); }
async function key(page: Page, key: string) { await page.locator('#stage').focus(); await page.keyboard.press(key); }
test('authors and edits a waveform with atomic persistence, stable identity and local undo', async ({page},info) => {
  await setup(page); await page.locator('#sound-open').click(); await page.locator('#sound-new').click();
  await page.locator('#sound-name').fill('My chime'); await page.locator('#sound-name').press('Tab');
  await page.locator('#sound-from').fill('.1'); await page.locator('#sound-to').fill('.3');
  await page.getByRole('button',{name:'Trim to selection',exact:true}).click(); await expect(page.locator('#sound-duration')).toContainText('0.20 seconds');
  await page.getByRole('button',{name:'Reverse',exact:true}).click(); await page.getByRole('button',{name:'Fade out',exact:true}).click();
  await page.locator('#sound-apply').click(); await expect.poll(async () => (await saved(page)).workspace.pythonScene?.sounds?.length).toBe(1); const original = (await saved(page)).workspace.pythonScene.sounds[0];
  await page.getByRole('button',{name:'Normalize',exact:true}).click(); await page.locator('#sound-undo').click(); await page.locator('#sound-apply').click();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sounds[0]).toEqual(original);
  await page.locator('#sound-preview').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
  await expect(page.locator('#sound-preview-stop')).toHaveAttribute('data-voices','0');
  await page.screenshot({path:info.outputPath('sound-waveform.png')});
  await page.locator('#sound-name').fill('Renamed chime'); await page.locator('#sound-apply').click();
  await page.locator('#sound-close').click(); await page.reload(); await page.locator('#sound-open').click(); await page.locator('#sound-list').selectOption(original.id);
  await expect(page.locator('#sound-name')).toHaveValue('Renamed chime'); expect((await saved(page)).workspace.pythonScene.sounds[0].data).toBe(original.data);
});
test('authors layered melody and rhythm with keyboard grid controls, preview and narrow layout', async ({page},info) => {
  await setup(page); await page.locator('#sound-open').click(); await page.locator('#song-new').click();
  await page.locator('#sound-name').fill('First melody'); await page.locator('#sound-name').press('Tab');
  await page.locator('#song-instrument').selectOption('triangle');
  await page.getByRole('gridcell',{name:'C4, beat 1, triangle',exact:true}).click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Space');
  await page.getByRole('gridcell',{name:'E4, beat 2, triangle',exact:true}).click();
  await page.locator('#song-instrument').selectOption('kick'); await page.getByRole('gridcell',{name:'C4, beat 1, kick',exact:true}).click();
  await page.locator('#song-instrument').selectOption('snare'); await page.getByRole('gridcell',{name:'C4, beat 3, snare',exact:true}).click();
  await expect(page.locator('#song-summary')).toContainText('5 notes across 3 instruments');
  await page.locator('#song-tempo').fill('90'); await page.locator('#song-tempo').press('Tab'); await page.locator('#sound-apply').click();
  await page.locator('#sound-preview').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
  await page.locator('#sound-preview-stop').click(); await expect.poll(() => rms(page)).toBeLessThan(.0001);
  await page.setViewportSize({width:390,height:844}); await page.locator('#song-section').scrollIntoViewIfNeeded();
  expect(await page.locator('.sound-editor').evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
  await page.screenshot({path:info.outputPath('song-mobile.png')});
  await page.locator('#sound-close').click(); await page.reload(); const asset = (await saved(page)).workspace.pythonScene.sounds[0]; expect(asset.notes).toHaveLength(5); expect(asset.tempo).toBe(90);
});
test('imports audio and records a real browser stream, releasing microphone on finish and close', async ({page}) => {
  await setup(page); await page.locator('#sound-open').click();
  const data = encodeWave(synthesizeTone(60, .5, 'sine'));
  await page.locator('#sound-file').setInputFiles({name:'imported.wav',mimeType:'audio/wav',buffer:Buffer.from(data.split(',')[1],'base64')});
  await expect(page.locator('#sound-duration')).toContainText('0.50 seconds'); await page.locator('#sound-apply').click();
  await page.locator('#sound-record').click(); await expect(page.locator('#sound-notice')).toContainText('Recording…'); await page.waitForTimeout(700); await page.locator('#sound-record-stop').click();
  await expect(page.locator('#sound-name')).toHaveValue('My recording'); await expect(page.locator('#sound-apply')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).micTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await page.locator('#sound-apply').click(); await expect.poll(async () => (await saved(page)).workspace.pythonScene.sounds.length).toBe(2);
  await page.locator('#sound-record').click(); await expect(page.locator('#sound-notice')).toContainText('Recording…'); await page.locator('#sound-close').click();
  await expect.poll(() => page.evaluate(() => (window as any).micTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  expect((await saved(page)).workspace.pythonScene.sounds).toHaveLength(2);
});
test('denied and late microphone requests recover without modifying the project or leaving tracks live', async ({page}) => {
  await setup(page); await page.locator('#sound-open').click();
  await page.evaluate(() => { (window as any).originalGetUserMedia = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied','NotAllowedError'); }; });
  await page.locator('#sound-record').click(); await expect(page.locator('#sound-notice')).toContainText('Microphone unavailable'); await expect(page.locator('#song-new')).toBeEnabled();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async options => { const stream = await (window as any).originalGetUserMedia(options); await new Promise(r => setTimeout(r,300)); return stream; }; });
  await page.locator('#sound-record').click(); await page.locator('#sound-close').click();
  await expect.poll(() => page.evaluate(() => (window as any).micTracks.length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).micTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
  await page.locator('#sound-open').click(); await page.locator('#song-new').click(); await expect(page.locator('#song-section')).toBeVisible();
});
test('plays the editable music example with real output, overlap, mute, Stop and restart', async ({page},info) => {
  await setup(page); await page.locator('#sound-example').click(); await run(page);
  await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1'); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
  await key(page,'Space'); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','2');
  await page.locator('#audio-mute').click(); await expect.poll(() => rms(page)).toBeLessThan(.0001); await expect(page.locator('#audio-mute')).toHaveAttribute('aria-pressed','true');
  await page.locator('#audio-mute').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001); await page.screenshot({path:info.outputPath('music-playing.png'),fullPage:true});
  await page.locator('#stop').click(); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0'); await expect.poll(() => rms(page)).toBeLessThan(.0001);
  await run(page); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1'); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
});
test('play-and-wait follows pitch changes and sprite destruction stops only its channel', async ({page}) => {
  await setup(page); await install(page,[
    ['start',chain(b('sound_note',{INSTRUMENT:'sine'},{NOTE:n(69),BEATS:n(8),OWNER:actor()}),print('bird ended'))],
    ['start',chain(b('sound_note',{INSTRUMENT:'triangle'},{NOTE:n(60),BEATS:n(8),OWNER:none()}),print('stage ended'))],
    ['key:d',b('scene_destroy',{}, {SPRITE:actor()})],
    ['key:p',b('sound_set',{FIELD:'pitch'},{VALUE:n(24),OWNER:none()})],
  ]); await run(page); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','2');
  await key(page,'d'); await expect(page.locator('#output')).toContainText('bird ended'); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1');
  await key(page,'p'); await expect(page.locator('#output')).toContainText('stage ended',{timeout:1800}); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0');
});
test('game finish cancels playback and invalid notes give a block-linked error', async ({page}) => {
  await setup(page); await install(page,[['start',chain(b('sound_note',{INSTRUMENT:'sine'},{NOTE:n(69),BEATS:n(16),OWNER:none()}),print('must not continue'))],['key:w',b('game_finish',{WON:'TRUE'},{TEXT:t('Complete')})]]);
  await run(page); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','1'); await key(page,'w');
  await expect(page.locator('#status')).toHaveText('You win!'); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0'); await expect(page.locator('#output')).not.toContainText('must not continue');
  await install(page,[['start',{...b('sound_note',{INSTRUMENT:'triangle'},{NOTE:n(200),BEATS:n(1),OWNER:none()}),id:'bad-note'}]]);
  await page.locator('#run').click(); await expect(page.locator('#output')).toContainText('Note must be between 21 and 108',{timeout:60_000}); await expect(page.locator('.blocklyHighlighted')).toHaveCount(1); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0');
});

test('sound references survive rename, delete and project Undo; malformed audio preserves saved work', async ({page}) => {
  await setup(page); await install(page); await page.locator('#sound-open').click(); await page.locator('#sound-list').selectOption('first_song');
  await page.locator('#sound-name').fill('Renamed song'); await page.locator('#sound-apply').click(); await page.locator('#sound-close').click();
  await expect(page.locator('#python')).toContainText('"first_song"'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#sound-open').click(); await page.locator('#sound-list').selectOption('first_song'); page.once('dialog', d => d.accept()); await page.locator('#sound-delete').click(); await page.locator('#sound-close').click();
  await expect(page.locator('#diagnostics')).toContainText('Choose an available sound'); await expect(page.locator('#run')).toBeDisabled();
  await page.locator('#language-undo').click(); await expect(page.locator('#run')).toBeEnabled();
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sounds[0].name).toBe('Renamed song');
  const before = await saved(page), broken = structuredClone(before); broken.workspace.pythonScene.sounds = [{id:'bad',name:'Bad audio',kind:'clip',data:'data:audio/wav;base64,AAAA'}];
  await page.locator('#project-file').setInputFiles({name:'bad-audio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(broken))});
  await expect(page.locator('#save-state')).toContainText('Invalid sound'); expect(await saved(page)).toEqual(before);
});

test('plays a captured WAV asset and stop-all resumes its waiting activity', async ({page}) => {
  await setup(page);
  const clip = {id:'chime',name:'Chime',kind:'clip',data:encodeWave(synthesizeTone(69,2,'sine'))};
  await install(page,[['start',chain(b('sound_wait',{}, {SOUND:b('text',{TEXT:'chime'}),OWNER:none()}),print('completed'))],['key:s',b('sound_stop_all')]]);
  const current = await saved(page); current.workspace.pythonScene.sounds = [clip];
  await page.locator('#project-file').setInputFiles({name:'clip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(current))});
  await expect.poll(async () => (await saved(page)).workspace.pythonScene.sounds[0].id).toBe('chime');
  await run(page); await expect.poll(() => rms(page)).toBeGreaterThan(.001); await key(page,'s');
  await expect(page.locator('#output')).toContainText('completed'); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices','0'); await expect.poll(() => rms(page)).toBeLessThan(.0001);
});

test('pan, volume and clear effects change real stereo output for a playing channel', async ({page}) => {
  await setup(page);
  const setting = (field: string, value: number) => b('sound_set',{FIELD:field},{VALUE:n(value),OWNER:none()});
  await install(page,[['start',b('sound_note',{INSTRUMENT:'sine'},{NOTE:n(69),BEATS:n(16),OWNER:none()})],['key:l',setting('pan',-100)],['key:r',setting('pan',100)],['key:z',setting('volume',0)],['key:c',chain(setting('volume',75),b('sound_clear',{}, {OWNER:none()}))]]);
  await run(page);
  const stereo = () => page.evaluate(() => ((window as any).stereoMonitors[0] as AnalyserNode[]).map(a => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((s,x) => s+x*x,0)/data.length); }));
  await key(page,'l'); await expect.poll(async () => (await stereo())[0]).toBeGreaterThan(.02); await expect.poll(async () => (await stereo())[1]).toBeLessThan(.0001);
  await key(page,'r'); await expect.poll(async () => (await stereo())[1]).toBeGreaterThan(.02); await expect.poll(async () => (await stereo())[0]).toBeLessThan(.0001);
  await key(page,'z'); await expect.poll(() => rms(page)).toBeLessThan(.0001);
  await key(page,'c'); await expect.poll(async () => Math.min(...await stereo())).toBeGreaterThan(.02);
  const [left,right] = await stereo(); expect(Math.abs(left-right)).toBeLessThan(.001);
});
