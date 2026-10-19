import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeWave, synthesizeTone } from '../../src/scene/sound';
import { reveal } from './shell';
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
const mode = (page: Page) => page.locator('#sound-dialog').getAttribute('data-mode');
const sounds = async (page: Page) => (await saved(page)).workspace.pythonScene?.sounds ?? [];
const micEnded = (page: Page) => page.evaluate(() => (window as any).micTracks.every((t: MediaStreamTrack) => t.readyState === 'ended'));
async function openSounds(page: Page) { await page.locator('#tray-sounds').click(); await expect(page.locator('#sound-dialog')).toBeVisible(); }
async function newSound(page: Page, kind: 'record' | 'effect' | 'song' | 'import') {
  if (await page.locator('#sound-empty').isVisible()) await page.locator(`#sound-empty [data-new="${kind}"]`).click();
  else { await page.locator('#sound-new').click(); await page.locator(`#sound-sheet [data-new="${kind}"]`).click(); }
}
async function record(page: Page, ms = 700) {
  await page.locator('#sound-record-button').click();
  await expect(page.locator('#sound-record-title')).toHaveText('Recording… tap to stop', { timeout: 8000 });
  await page.waitForTimeout(ms);
}
async function selectPart(page: Page, from: number, to: number) {
  const box = (await page.locator('#sound-wave').boundingBox())!;
  await page.mouse.move(box.x + box.width * from, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
}
const seconds = async (page: Page) => Number((await page.locator('#sound-length').textContent())!.match(/[\d.]+/)![0]);

test('records with a countdown, tunes the selected part, and Done saves every change as one Undo step', async ({ page }, info) => {
  await setup(page); await openSounds(page); expect(await mode(page)).toBe('empty');
  await newSound(page, 'record'); await expect(page.locator('#sound-record-note')).toContainText('nothing is sent anywhere');
  await page.locator('#sound-record-button').click(); await expect(page.locator('.sound-count')).toHaveText('3');
  await expect(page.locator('#sound-record-title')).toHaveText('Recording… tap to stop', { timeout: 8000 }); await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('recording.png') });
  await page.locator('#sound-record-button').click();
  await expect.poll(() => mode(page)).toBe('clip'); await expect(page.locator('#sound-name')).toHaveValue('Recording 1');
  await expect(page.locator('#sound-toast-text')).toContainText('Got it'); expect(await micEnded(page)).toBe(true);
  const recorded = await seconds(page); expect(recorded).toBeGreaterThan(.4);
  // Tune works on the selected part, plays it straight away, and each tap is one Undo.
  await selectPart(page, .25, .75); await expect(page.locator('#sound-selected')).toBeVisible();
  await expect(page.locator('#sound-tune-scope')).toHaveText('on the selected part');
  await page.locator('[data-tune="faster"]').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
  expect(await seconds(page)).toBeLessThan(recorded);
  await page.locator('[data-tune="higher"]').click(); await page.locator('[data-tune="echo"]').click();
  await page.locator('#sound-undo').click(); await page.locator('#sound-undo').click(); await page.locator('#sound-undo').click();
  expect(await seconds(page)).toBe(recorded); await page.locator('#sound-redo').click(); expect(await seconds(page)).toBeLessThan(recorded);
  await page.locator('#sound-name').fill('Hello'); await page.locator('#sound-name').press('Tab');
  await page.screenshot({ path: info.outputPath('tuned.png') });
  // Done: one project edit, and its Undo removes it again.
  await page.locator('#sound-done').click(); await expect(page.locator('#sound-dialog')).toBeHidden();
  await expect.poll(async () => (await sounds(page)).map((s: any) => [s.name, s.kind])).toEqual([['Hello', 'clip']]);
  await expect(page.locator('#sound-saved')).toBeVisible(); await page.locator('#sound-saved button').click();
  await expect.poll(async () => (await sounds(page)).length).toBe(0);
});

test('makes effects and songs, deletes without asking, and Undo brings a deleted sound back', async ({ page }, info) => {
  page.on('dialog', dialog => { throw new Error(`Unexpected browser dialog: ${dialog.message()}`); });
  await setup(page); await openSounds(page);
  await newSound(page, 'effect'); expect(await mode(page)).toBe('effect');
  await page.locator('.sound-kind[data-kind="laser"]').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001);
  await page.locator('#sound-effect-another').click(); await page.locator('#sound-effect-add').click();
  await expect.poll(() => mode(page)).toBe('clip'); await expect(page.locator('#sound-name')).toHaveValue('Laser 1');
  await newSound(page, 'song'); expect(await mode(page)).toBe('song');
  for (const name of ['C4, beat 1', 'E4, beat 2', 'Kick, beat 1']) await page.getByRole('gridcell', { name, exact: true }).click();
  await page.locator('[data-instrument="square"]').click(); await page.getByRole('gridcell', { name: 'G4, beat 3', exact: true }).click();
  await expect(page.getByRole('gridcell', { name: 'G4, beat 3, Game', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#song-speed').evaluate((input: HTMLInputElement) => { input.value = '90'; input.dispatchEvent(new Event('change')); });
  await page.locator('#song-longer').click(); await expect(page.locator('#song-length')).toHaveText('20 beats');
  await page.locator('#song-play').click(); await expect.poll(() => rms(page)).toBeGreaterThan(.001); await page.locator('#song-play').click();
  await page.screenshot({ path: info.outputPath('song.png') });
  // Delete takes effect at once and offers Undo.
  await page.locator('.sound-card[data-sound]').first().locator('.sound-card-more').click();
  await page.locator('#sound-card-menu [data-sound-card="delete"]').click();
  await expect(page.locator('.sound-card')).toHaveCount(1); await expect(page.locator('#sound-toast-text')).toHaveText('“Laser 1” deleted');
  await page.locator('#sound-toast-undo').click(); await expect(page.locator('.sound-card')).toHaveCount(2);
  expect(await page.locator('#sound-dialog').evaluate(d => d.scrollWidth <= d.clientWidth + 1 && d.scrollHeight <= d.clientHeight + 1)).toBe(true);
  await page.locator('#sound-done').click();
  await expect.poll(async () => (await sounds(page)).length).toBe(2);
  const [laser, song] = await sounds(page);
  expect(laser).toMatchObject({ name: 'Laser 1', kind: 'clip' }); expect(song).toMatchObject({ name: 'Song 1', kind: 'song', tempo: 90, beats: 20 }); expect(song.notes).toHaveLength(4);
});

test('opens from the tray, the Sprite tab, the palette and a sound block, whose New sound… picks the new sound', async ({ page }) => {
  await setup(page); await install(page);
  // The Sprite tab lists every sound: play one, or open it.
  await reveal(page, '#sound-open'); await page.getByRole('button', { name: 'Play Little steps', exact: true }).click();
  await expect.poll(() => rms(page)).toBeGreaterThan(.001); await page.getByRole('button', { name: 'Stop Little steps', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Little steps', exact: true }).click();
  expect(await mode(page)).toBe('song'); await expect(page.locator('#sound-name')).toHaveValue('Little steps'); await page.locator('#sound-done').click();
  // Edit sounds at the top of the palette's Sounds blocks.
  await page.getByRole('treeitem', { name: 'Sounds', exact: true }).click();
  await page.locator('.blocklyFlyoutButton', { hasText: 'Edit sounds' }).click(); await expect(page.locator('#sound-dialog')).toBeVisible();
  await page.locator('#sound-done').click();
  // A sound block's menu ends with New sound…; after Done the block uses it, and one Undo takes both back.
  const field = page.locator('.blocklyWorkspace > .blocklyBlockCanvas .blocklyEditableField', { hasText: 'Little steps' }).first();
  await field.click(); await page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: 'New sound…' }).click();
  await expect(page.locator('#sound-sheet')).toBeVisible(); await page.locator('#sound-sheet [data-new="effect"]').click();
  await page.locator('.sound-kind[data-kind="coin"]').click(); await page.locator('#sound-effect-add').click(); await page.locator('#sound-done').click();
  await expect.poll(async () => (await sounds(page)).map((s: any) => s.name)).toEqual(['Little steps', 'Coin 1']);
  const coin = (await sounds(page))[1].id;
  await expect(page.locator('#python')).toContainText(`"${coin}"`);
  await page.locator('#language-undo').click();
  await expect.poll(async () => (await sounds(page)).length).toBe(1); await expect(page.locator('#python')).toContainText('"first_song"');
});

test('microphone problems explain what to do, and Done keeps a recording in progress', async ({ page }) => {
  await setup(page); await openSounds(page);
  await page.evaluate(() => { (window as any).originalGetUserMedia = navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); }; });
  await newSound(page, 'record'); await page.locator('#sound-record-button').click();
  await expect(page.locator('#sound-problem-title')).toHaveText('The microphone is blocked'); await expect(page.locator('#sound-problem-steps')).toBeVisible();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('None', 'NotFoundError'); }; });
  await page.locator('#sound-mic-retry').click(); await expect(page.locator('#sound-problem-title')).toHaveText('No microphone found');
  await page.locator('#sound-mic-effect').click(); expect(await mode(page)).toBe('effect');
  // A permission that arrives after leaving is released at once.
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async options => { const stream = await (window as any).originalGetUserMedia(options); await new Promise(r => setTimeout(r, 300)); return stream; }; });
  await newSound(page, 'record'); await page.locator('#sound-record-button').click(); await page.locator('#sound-done').click();
  await expect.poll(() => page.evaluate(() => (window as any).micTracks.length)).toBeGreaterThan(0); await expect.poll(() => micEnded(page)).toBe(true);
  expect(await sounds(page)).toHaveLength(0);
  // Done while recording stops and keeps the recording.
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = (window as any).originalGetUserMedia; });
  await openSounds(page); await newSound(page, 'record'); await record(page);
  await page.locator('#sound-done').click(); await expect(page.locator('#sound-dialog')).toBeHidden();
  await expect.poll(async () => (await sounds(page)).map((s: any) => s.name)).toEqual(['Recording 1']); await expect.poll(() => micEnded(page)).toBe(true);
});

test('imports a sound file, and the 24-sound limit is explained', async ({ page }) => {
  await setup(page); await openSounds(page);
  const data = encodeWave(synthesizeTone(60, .5, 'sine'));
  await page.locator('#sound-file').setInputFiles({ name: 'imported.wav', mimeType: 'audio/wav', buffer: Buffer.from(data.split(',')[1], 'base64') });
  await expect(page.locator('#sound-name')).toHaveValue('imported'); expect(await seconds(page)).toBe(.5);
  await page.locator('#sound-done').click(); await expect.poll(async () => (await sounds(page)).length).toBe(1);
  const current = await saved(page), clip = current.workspace.pythonScene.sounds[0];
  current.workspace.pythonScene.sounds = Array.from({ length: 24 }, (_, i) => ({ ...clip, id: `s${i}`, name: `Sound ${i + 1}` }));
  await page.locator('#project-file').setInputFiles({ name: 'full.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(current)) });
  await expect.poll(async () => (await sounds(page)).length).toBe(24);
  await openSounds(page); await expect(page.locator('#sound-new')).toBeDisabled(); await expect(page.locator('#sound-limit')).toBeVisible();
  await page.locator('.sound-card').first().locator('.sound-card-more').click(); await page.locator('#sound-card-menu [data-sound-card="delete"]').click();
  await expect(page.locator('#sound-new')).toBeEnabled();
});

test('plays the editable music example with real output, overlap, mute, Stop and restart', async ({page},info) => {
  await setup(page); await (await reveal(page, '#sound-example')).click(); await run(page);
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
  await setup(page); await install(page); await reveal(page, '#sound-open'); await page.getByRole('button', { name: 'Edit Little steps', exact: true }).click();
  await page.locator('#sound-name').fill('Renamed song'); await page.locator('#sound-name').press('Tab'); await page.locator('#sound-done').click();
  await expect(page.locator('#python')).toContainText('"first_song"'); await expect(page.locator('#run')).toBeEnabled();
  await reveal(page, '#sound-open'); await page.getByRole('button', { name: 'Edit Renamed song', exact: true }).click();
  await page.locator('.sound-card-more').first().click(); await page.locator('#sound-card-menu [data-sound-card="delete"]').click(); await page.locator('#sound-done').click();
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
