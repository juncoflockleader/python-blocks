import * as Blockly from 'blockly/core';
import './paint.css';
import './sound.css';
import { SceneReferenceField } from '../blocks/scene';
import { changeScene, sceneState } from './state';
import { SOUND_RATE, encodeWave, synthesize, synthesizeTone, validSong, validateSounds, type Instrument, type Note, type Song, type Sound } from './sound';
import { SOUND_LIBRARY, librarySound, soundSamples } from './sound-library';
import { MUSIC_LIBRARY, musicSong } from './music-library';
import { EFFECTS, MAX_SAMPLES, defaultEffect, makeEffect, peaks, trimSilence, tune, type EffectSettings, type Range, type Tune } from './sound-edit';

/** The Sound editor: a full-screen editor for every sound in the project, in
 * the same shell as Paint. Record your voice (3, 2, 1, a level meter and the
 * waveform drawing as you speak), tune it with big buttons that work on the
 * selected part, make sound effects, or write a song on a grid. Nothing is
 * saved until Done, which writes every change as one project Undo step, so the
 * editor never asks "Are you sure?"; deleting a sound can be undone. */
const MAX_SOUNDS = 24;
type Mode = 'empty' | 'clip' | 'song' | 'record' | 'effect' | 'library';
type Made = 'recording' | 'effect' | 'import' | 'sound';
interface Draft { id: string; name: string; kind: 'clip' | 'song'; samples: Float32Array | null; song: Song | null; source: Sound | null; edited: boolean; made: Made }
interface Snapshot { drafts: Draft[]; current: string | null }
export interface SoundHost {
  canEdit(): boolean;
  /** After Done, with whether the project's sounds changed. */
  done?(changed: boolean): void;
}
export interface SoundStart {
  /** The sound to show first. */
  sound?: string;
  /** Start making a new sound: `menu` shows the choices. */
  create?: 'menu' | 'record' | 'effect' | 'song' | 'import' | 'library';
  /** Called with the newest sound made in this visit, as part of Done's Undo step (a block's "New sound…"). */
  pick?: (id: string) => void;
}

const icon = (d: string, size = 20, fill = false) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const ICONS = {
  music: 'M9 17V5l12-3v12M9 17a3 3 0 1 1-6 0a3 3 0 1 1 6 0M21 14a3 3 0 1 1-6 0a3 3 0 1 1 6 0', undo: 'm9 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3', redo: 'm15 4 6 6-6 6m6-6H10a7 7 0 0 0-7 7v3',
  done: 'm4 12 5 6L21 5', plus: 'M12 4v16M4 12h16', minus: 'M4 12h16', more: 'M5 12h.1M12 12h.1M19 12h.1', play: 'M7 4v16l13-8Z', stop: 'M6 6h12v12H6Z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3', library: 'M3 3h4v18H3Zm7 0h4v18h-4Zm6 1 3-1 3 17-3 1Z', sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  upload: 'M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6', copy: 'M8 8h13v13H8ZM16 4V3H3v13h1', trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15', close: 'm6 6 12 12M18 6 6 18', dice: 'M4 4h16v16H4ZM9 9h.1M15 15h.1M15 9h.1M9 15h.1',
};
const TUNE_BUTTONS: [string, [Tune, string, string][]][] = [
  ['Voice', [['higher', 'Higher', 'M12 19V5M6 11l6-6 6 6'], ['lower', 'Lower', 'M12 5v14M6 13l6 6 6-6'], ['faster', 'Faster', 'm3 6 8 6-8 6Zm10 0 8 6-8 6Z'], ['slower', 'Slower', 'M4 18c0-6 3-10 8-10s8 4 8 10M8 18v2m8-2v2M12 8V5'], ['robot', 'Robot', 'M5 8h14v11H5ZM9 12h.1M15 12h.1M9 16h6M12 4v4'], ['echo', 'Echo', 'M4 12a8 8 0 0 1 8-8M7 12a5 5 0 0 1 5-5M10 12a2 2 0 0 1 2-2M20 12a8 8 0 0 1-8 8']]],
  ['Volume', [['louder', 'Louder', 'M3 9h4l5-4v14l-5-4H3ZM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12'], ['softer', 'Softer', 'M3 9h4l5-4v14l-5-4H3ZM16 10a3 3 0 0 1 0 4'], ['fade-in', 'Fade in', 'M3 19 21 5v14Z'], ['fade-out', 'Fade out', 'M3 5v14h18Z']]],
  ['Edit', [['reverse', 'Reverse', 'M7 7h13M7 7l3-3M7 7l3 3M17 17H4m13 0-3-3m3 3-3 3'], ['keep', 'Keep this', 'M6 2v16h16M2 6h16v16'], ['cut', 'Cut it', 'M6 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6a3 3 0 0 0 0 6ZM8.1 7.9 20 18M8.1 16.1 20 6']]],
];
const MELODY: [Instrument, string, string][] = [['triangle', 'Soft', '#8c67a2'], ['square', 'Game', '#267c70'], ['sine', 'Flute', '#c9922e'], ['sawtooth', 'Buzzy', '#c4532a']];
const DRUMS: [Instrument, string][] = [['kick', 'Kick'], ['snare', 'Snare'], ['hat', 'Hat']];
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const pitchName = (pitch: number) => `${NAMES[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
const seconds = (n: number) => `${(n / SOUND_RATE).toFixed(1)} s`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function installSoundEditor(workspace: Blockly.WorkspaceSvg, host: SoundHost) {
  const dialog = document.createElement('dialog');
  dialog.id = 'sound-dialog'; dialog.setAttribute('aria-labelledby', 'sound-title'); dialog.dataset.playing = 'false';
  const option = (id: string, title: string, text: string, d: string) => `<button type="button" class="paint-option sound-option" data-new="${id}"><span class="paint-option-icon">${icon(d, 22)}</span><strong>${title}</strong><span>${text}</span></button>`;
  const options = option('record', 'Record your voice', '3, 2, 1, then talk. Up to a minute.', ICONS.mic) + option('effect', 'Make an effect', 'Jump, coin, laser, win and more.', ICONS.sparkle)
    + option('song', 'Write a song', 'Tap notes and drums on a grid.', ICONS.music) + option('import', 'Import a sound file', 'A WAV, MP3 or Ogg file up to a minute.', ICONS.upload)
    + option('library', 'Sound library', 'Effects and music loops to start from.', ICONS.library);
  dialog.innerHTML = `
    <header class="paint-top sound-top">
      <h2 id="sound-title" class="visually-hidden">Sounds</h2>
      <div class="paint-chip sound-chip"><span class="sound-chip-icon">${icon(ICONS.music, 18)}</span><span>Sounds</span></div>
      <label class="paint-name" id="sound-name-field"><span id="sound-name-label">Sound</span><input id="sound-name" maxlength="48" autocomplete="off" spellcheck="false"></label>
      <div class="paint-history"><button id="sound-undo" class="paint-icon-button" type="button" aria-label="Undo" title="Undo (Ctrl+Z)">${icon(ICONS.undo, 18)}</button><button id="sound-redo" class="paint-icon-button" type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${icon(ICONS.redo, 18)}</button></div>
      <span class="paint-spacer"></span>
      <button id="sound-done" class="paint-done" type="button">${icon(ICONS.done, 16)}Done</button>
    </header>
    <div class="sound-body">
      <aside class="sound-list-panel" aria-label="Sounds in this project">
        <div class="paint-strip-head"><span>Sounds</span><span id="sound-count"></span></div>
        <div id="sound-cards" class="sound-cards" role="listbox" aria-label="Sounds"></div>
        <button id="sound-new" class="paint-new" type="button" aria-haspopup="dialog">${icon(ICONS.plus, 16)}New</button>
        <p id="sound-limit" class="sound-note" hidden>A project holds up to ${MAX_SOUNDS} sounds. Delete one to add another.</p>
      </aside>
      <section id="sound-main" class="sound-main" aria-label="Sound">
        <div id="sound-empty" class="sound-panel sound-empty"><h3>Make a sound</h3><p class="paint-small">Record your voice, make an effect or write a song. Every sound in the project shows on the left.</p><div class="paint-sheet-options">${options}</div></div>
        <div id="sound-clip" class="sound-panel sound-clip">
          <canvas id="sound-overview" class="sound-overview" role="img" aria-label="The whole sound: tap to look at another part"></canvas>
          <div id="sound-wave-box" class="sound-wave-box">
            <canvas id="sound-wave" class="sound-wave" role="img" aria-label="Waveform: drag across it to select a part, tap to play from there"></canvas>
            <button id="sound-handle-start" class="sound-handle" type="button" aria-label="Start of the selected part" hidden></button>
            <button id="sound-handle-end" class="sound-handle" type="button" aria-label="End of the selected part" hidden></button>
          </div>
          <div class="sound-transport">
            <button id="sound-play" class="sound-play" type="button">${icon(ICONS.play, 16, true)}<span>Play</span></button>
            <button id="sound-play-part" class="paint-plain" type="button" disabled>${icon(ICONS.play, 14, true)}Play the selected part</button>
            <span id="sound-length" class="sound-chip-text"></span><span id="sound-selected" class="sound-chip-text selected" hidden></span>
            <button id="sound-select-all" class="paint-plain" type="button">Select all</button>
            <button id="sound-record-again" class="paint-plain" type="button" hidden>${icon(ICONS.mic, 16)}Record again</button>
            <span class="paint-spacer"></span>
            <div class="paint-zoom sound-zoom" role="group" aria-label="Zoom"><button id="sound-zoom-out" class="paint-icon-button" type="button" aria-label="Zoom out">${icon(ICONS.minus, 18)}</button><span id="sound-zoom-level" class="paint-zoom-level">1×</span><button id="sound-zoom-in" class="paint-icon-button" type="button" aria-label="Zoom in">${icon(ICONS.plus, 18)}</button></div>
          </div>
          <p class="paint-small sound-help">Tap the waveform to play from there. Drag across it to select a part; Tune then changes only that part.</p>
        </div>
        <div id="sound-record" class="sound-panel sound-record">
          <div id="sound-record-ready" class="sound-record-ready">
            <button id="sound-record-button" class="sound-record-button" type="button" aria-label="Record">
              <svg class="sound-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="sound-ring-track"/><circle id="sound-ring" cx="60" cy="60" r="54" class="sound-ring-fill"/></svg>
              <span id="sound-record-face" class="sound-record-face">${icon(ICONS.mic, 40)}</span>
            </button>
            <strong id="sound-record-title" class="sound-record-title">Tap to record</strong>
            <span id="sound-record-time" class="sound-record-time">0:00 / 1:00</span>
            <div class="sound-level" aria-hidden="true"><span id="sound-level"></span></div>
            <canvas id="sound-live" class="sound-live" aria-hidden="true"></canvas>
            <p id="sound-record-note" class="paint-small sound-record-note">Your browser will ask to let Python Blocks hear you. Your voice stays in this project; nothing is sent anywhere.</p>
          </div>
          <div id="sound-mic-problem" class="sound-problem" role="alert" hidden>
            <strong id="sound-problem-title"></strong><p id="sound-problem-text"></p>
            <ol id="sound-problem-steps" hidden><li>Click the icon to the left of the web address.</li><li>Set Microphone to Allow.</li><li>Come back and tap Try again.</li></ol>
            <div class="sound-problem-actions"><button id="sound-mic-retry" class="paint-done" type="button">Try again</button><button id="sound-mic-effect" class="paint-plain" type="button">Make an effect instead</button></div>
          </div>
        </div>
        <div id="sound-effect" class="sound-panel sound-effect">
          <div id="sound-kinds" class="sound-kinds" role="group" aria-label="Kind of effect"></div>
          <canvas id="sound-effect-wave" class="sound-effect-wave" role="img" aria-label="The effect"></canvas>
          <div class="sound-transport"><button id="sound-effect-play" class="sound-play" type="button">${icon(ICONS.play, 16, true)}<span>Play</span></button><button id="sound-effect-another" class="paint-plain" type="button">${icon(ICONS.dice, 16)}Make another</button><span class="paint-spacer"></span><button id="sound-effect-add" class="paint-done" type="button">${icon(ICONS.plus, 16)}Add to my sounds</button></div>
          <p class="paint-small sound-help">Each effect is worked out right here, so it is yours to change. Make another tries a new version of the same kind.</p>
        </div>
        <div id="sound-library" class="sound-panel sound-library">
          <div class="sound-library-head"><h3>Sound library</h3><div class="sound-library-tabs" role="group" aria-label="Kind of sound"><button id="sound-lib-effects" class="paint-plain" type="button" aria-pressed="true">Effects</button><button id="sound-lib-music" class="paint-plain" type="button" aria-pressed="false">Music</button></div></div>
          <p id="sound-library-note" class="paint-small"></p>
          <div id="sound-library-items" class="sound-library-items"></div>
        </div>
        <div id="sound-song" class="sound-panel sound-song">
          <div class="sound-transport">
            <button id="song-play" class="sound-play" type="button">${icon(ICONS.play, 16, true)}<span>Play</span></button>
            <label class="sound-slider">Speed <input id="song-speed" type="range" min="30" max="300" step="5"><span id="song-speed-label"></span></label>
          </div>
          <div id="song-overview" class="song-overview" role="group" aria-label="The whole song: tap to show those beats"></div>
          <div id="song-melody" class="song-grid song-melody" role="grid" aria-label="Melody"></div>
          <div id="song-drums" class="song-grid song-drums" role="grid" aria-label="Drums"></div>
          <p class="paint-small sound-help">Tap a square to add a note; tap it again to remove it. Each column is a quarter of a beat.</p>
        </div>
      </section>
      <aside id="sound-side" class="sound-side">
        <div id="sound-tune" class="sound-tune" aria-label="Tune">
          <div class="sound-side-head"><strong>Tune</strong><span id="sound-tune-scope" class="paint-small"></span></div>
          ${TUNE_BUTTONS.map(([group, buttons]) => `<span class="paint-label">${group}</span><div class="sound-tune-grid">${buttons.map(([id, label, d]) => `<button type="button" class="sound-tune-button" data-tune="${id}">${icon(d, 20)}<span>${label}</span></button>`).join('')}</div>`).join('')}
        </div>
        <div id="sound-effect-controls" class="sound-effect-controls">
          <div class="sound-side-head"><strong>Change it</strong></div>
          ${[['pitch', 'Pitch', 0, 100, 'Low', 'High'], ['length', 'Length', 0, 100, 'Short', 'Long'], ['slide', 'Slide', -100, 100, 'Down', 'Up']].map(([id, label, min, max, low, high]) => `<label class="sound-effect-slider"><span class="paint-label">${label}</span><input id="effect-${id}" type="range" min="${min}" max="${max}" step="1"><span class="sound-slider-ends"><span>${low}</span><span>${high}</span></span></label>`).join('')}
        </div>
        <div id="song-tools" class="song-tools">
          <span class="paint-label">Instrument for new notes</span>
          <div class="song-instruments" role="group" aria-label="Instrument">${MELODY.map(([id, label, color]) => `<button type="button" data-instrument="${id}" aria-pressed="false" style="--note:${color}"><span aria-hidden="true"></span>${label}</button>`).join('')}</div>
          <span class="paint-label">Note length</span>
          <div class="paint-segment wide" role="group" aria-label="Note length">${[[0.25, '¼'], [0.5, '½'], [1, '1'], [2, '2']].map(([beats, label]) => `<button type="button" data-length="${beats}" aria-pressed="false" aria-label="${label} beat">${label}</button>`).join('')}</div>
          <span class="paint-label" id="song-length-label">Length</span>
          <div class="song-octave"><button id="song-shorter" class="paint-icon-button" type="button" aria-label="Shorter">${icon(ICONS.minus, 18)}</button><output id="song-length" aria-labelledby="song-length-label"></output><button id="song-longer" class="paint-icon-button" type="button" aria-label="Longer">${icon(ICONS.plus, 18)}</button></div>
          <span class="paint-label">Notes</span>
          <div class="song-octave"><button id="song-octave-down" class="paint-icon-button" type="button" aria-label="Lower notes">${icon('M12 5v14M6 13l6 6 6-6', 18)}</button><output id="song-octave"></output><button id="song-octave-up" class="paint-icon-button" type="button" aria-label="Higher notes">${icon('M12 19V5M6 11l6-6 6 6', 18)}</button></div>
          <button id="song-sharps" class="paint-toggle" type="button" aria-pressed="false">♯ Show sharps</button>
        </div>
      </aside>
    </div>
    <div id="sound-card-menu" class="paint-menu" role="menu" hidden><button type="button" role="menuitem" data-sound-card="copy">${icon(ICONS.copy, 18)}Duplicate</button><button type="button" role="menuitem" data-sound-card="delete" class="danger">${icon(ICONS.trash, 18)}Delete</button></div>
    <div id="sound-sheet" class="paint-popover paint-sheet" role="dialog" aria-labelledby="sound-sheet-title" hidden>
      <div class="paint-sheet-head"><h3 id="sound-sheet-title">New sound</h3><button id="sound-sheet-close" class="paint-icon-button" type="button" aria-label="Close">${icon(ICONS.close, 18)}</button></div>
      <div class="paint-sheet-options">${options}</div>
    </div>
    <input id="sound-file" type="file" accept="audio/*" hidden>
    <div id="sound-toast" class="paint-toast sound-toast" role="status" hidden><span id="sound-toast-text"></span><button id="sound-toast-undo" type="button" hidden>Undo</button></div>`;
  document.body.append(dialog);
  const saved = document.createElement('div');
  saved.id = 'sound-saved'; saved.className = 'sound-saved'; saved.setAttribute('role', 'status'); saved.hidden = true;
  saved.innerHTML = '<span>Sounds updated</span><button id="sound-saved-undo" type="button">Undo</button>';
  document.body.append(saved);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;

  // ── Session state ──
  let drafts: Draft[] = [], current: string | null = null, mode: Mode = 'empty', recordTarget: string | null = null;
  let undo: Snapshot[] = [], redo: Snapshot[] = [], pick: ((id: string) => void) | null = null, created: string[] = [];
  let selection: Range | null = null, zoom = 1, offset = 0, playhead: number | null = null;
  let effect: EffectSettings = defaultEffect(), effectSamples = makeEffect(effect);
  let page = 0, instrument: Instrument = 'triangle', noteLength = 0.5, octave = 4, sharps = false;
  let toastTimer: ReturnType<typeof setTimeout> | undefined, savedTimer: ReturnType<typeof setTimeout> | undefined, token = 0;
  let context: AudioContext | null = null, master: GainNode | null = null;
  let playing: { source: AudioBufferSourceNode; started: number; from: number; to: number; what: 'clip' | 'song' | 'effect' | 'note' | 'list'; song?: Song } | null = null;
  let recording: { stage: 'asking' | 'counting' | 'recording' | 'decoding'; stream: MediaStream | null; recorder: MediaRecorder | null; analyser: AnalyserNode | null; started: number; levels: number[]; timer?: ReturnType<typeof setTimeout>; count?: ReturnType<typeof setInterval>; limit: boolean; finished: Promise<void> | null } | null = null;
  let frame = 0;

  const draft = () => drafts.find(d => d.id === current) ?? null;
  const identity = () => 'sound_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  function uniqueName(base: string) { const names = new Set(drafts.map(d => d.name)); let n = 1; while (names.has(`${base} ${n}`)) n++; return `${base} ${n}`; }

  // ── Audio ──
  function audio() {
    if (!context) { context = new AudioContext(); master = context.createGain(); master.gain.value = 0.8; master.connect(context.destination); }
    if (context.state === 'suspended') void context.resume();
    return context;
  }
  function stop() {
    if (playing) { const source = playing.source; playing = null; source.onended = null; try { source.stop(); } catch { /* already ended */ } }
    dialog.dataset.playing = 'false'; renderTransport();
  }
  function play(samples: Float32Array, what: NonNullable<typeof playing>['what'], from = 0, to = samples.length, song?: Song) {
    stop(); if (to - from < 1) return;
    const ctx = audio(), buffer = ctx.createBuffer(1, to - from, SOUND_RATE);
    buffer.copyToChannel(samples.slice(from, to), 0);
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(master!); source.start();
    playing = { source, started: ctx.currentTime, from, to, what, song };
    source.onended = () => { if (playing?.source === source) { playing = null; playhead = null; dialog.dataset.playing = 'false'; renderTransport(); drawWave(); renderSongPlayhead(); } };
    dialog.dataset.playing = 'true'; renderTransport(); animate();
  }
  function animate() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (playing && context && (playing.what === 'clip' || playing.what === 'song')) {
        const position = playing.from + (context.currentTime - playing.started) * SOUND_RATE;
        if (playing.what === 'clip') { playhead = Math.min(playing.to, position); drawWave(); } else renderSongPlayhead(position / SOUND_RATE);
      }
      if (recording?.stage === 'recording') drawRecording();
      if (playing || recording?.stage === 'recording') animate();
    });
  }

  // ── Opening and closing ──
  function soundDraft(sound: Sound): Draft {
    return sound.kind === 'clip' ? { id: sound.id, name: sound.name, kind: 'clip', samples: soundSamples(sound), song: null, source: sound, edited: false, made: 'sound' }
      : { id: sound.id, name: sound.name, kind: 'song', samples: null, song: structuredClone(sound), source: sound, edited: false, made: 'sound' };
  }
  function open(start: SoundStart = {}) {
    if (!host.canEdit() || dialog.open) return;
    token++; drafts = (sceneState(workspace).sounds ?? []).map(soundDraft); undo = []; redo = []; created = []; pick = start.pick ?? null;
    current = drafts.find(d => d.id === start.sound)?.id ?? drafts[0]?.id ?? null;
    selection = null; zoom = 1; offset = 0; playhead = null; page = 0;
    show(current ? kindMode() : 'empty');
    hideSaved(); dialog.showModal();
    if (start.create === 'menu') openSheet(); else if (start.create) begin(start.create);
    requestAnimationFrame(() => { drawWave(); drawEffect(); });
  }
  function close() {
    token++; stop(); cancelRecording(); closeMenus(); hideToast();
    if (dialog.open) dialog.close();
    drafts = []; undo = []; redo = []; pick = null; created = [];
  }
  function output(d: Draft): Sound {
    if (d.kind === 'song') return { ...structuredClone(d.song!), id: d.id, name: d.name.trim() || d.id, kind: 'song' };
    if (!d.edited && d.source?.kind === 'clip') return { ...d.source, name: d.name.trim() || d.source.name };
    return { id: d.id, name: d.name.trim() || 'Sound', kind: 'clip', data: encodeWave(d.samples!) };
  }
  async function done() {
    // Done while recording keeps the recording first.
    if (recording?.stage === 'recording') await finishRecording();
    else if (recording?.stage === 'decoding' && recording.finished) await recording.finished;
    else if (recording) cancelRecording();
    if (!dialog.open) return;
    try {
      const scene = sceneState(workspace), next = structuredClone(scene), sounds = drafts.map(output);
      validateSounds(sounds);
      if (sounds.length || scene.sounds) next.sounds = sounds;
      const changed = JSON.stringify(next.sounds ?? []) !== JSON.stringify(scene.sounds ?? []);
      const chosen = pick ? [...created].reverse().find(id => drafts.some(d => d.id === id)) : undefined, callback = pick;
      if (changed || chosen) {
        // One Undo step for the new sounds and the block that picks one.
        const group = Blockly.Events.getGroup(); if (!group) Blockly.Events.setGroup(true);
        try { if (changed) changeScene(workspace, next); if (chosen && callback) callback(chosen); } finally { if (!group) Blockly.Events.setGroup(false); }
      }
      close(); host.done?.(changed); if (changed) showSaved();
    } catch (error) { toast(error instanceof Error ? error.message : String(error)); }
  }

  // ── History ──
  function remember() {
    undo.push({ drafts: [...drafts], current }); redo = [];
    // Keep about 120 MB of old samples (a minute of sound is 5.3 MB); steps share unchanged sounds.
    const bytes = () => { const kept = new Set<Float32Array>(); for (const step of undo) for (const d of step.drafts) if (d.samples) kept.add(d.samples); return [...kept].reduce((n, a) => n + a.byteLength, 0); };
    while (undo.length > 60 || (undo.length > 1 && bytes() > 120_000_000)) undo.shift();
  }
  function stepBack(forward = false) {
    const from = forward ? redo : undo, to = forward ? undo : redo, step = from.pop(); if (!step) return;
    to.push({ drafts: [...drafts], current }); stop();
    drafts = step.drafts; current = step.current && drafts.some(d => d.id === step.current) ? step.current : drafts[0]?.id ?? null;
    selection = null; playhead = null; offset = 0; zoom = Math.min(zoom, maxZoom());
    show(current ? kindMode() : 'empty'); hideToast();
  }
  function replace(next: Draft) { drafts = drafts.map(d => d.id === next.id ? next : d); }
  function add(d: Draft) { remember(); drafts = [...drafts, d]; current = d.id; created.push(d.id); selection = null; zoom = 1; offset = 0; show(kindMode()); }

  // ── Panels ──
  const kindMode = (): Mode => draft()?.kind === 'song' ? 'song' : draft() ? 'clip' : 'empty';
  function show(next: Mode) {
    if (next !== 'record' && recording) cancelRecording();
    mode = next;
    for (const [id, panel] of [['sound-empty', 'empty'], ['sound-clip', 'clip'], ['sound-record', 'record'], ['sound-effect', 'effect'], ['sound-song', 'song'], ['sound-library', 'library']] as const) el(id).hidden = mode !== panel;
    el('sound-tune').hidden = mode !== 'clip'; el('sound-effect-controls').hidden = mode !== 'effect'; el('song-tools').hidden = mode !== 'song';
    el('sound-side').hidden = mode === 'empty' || mode === 'record' || mode === 'library';
    dialog.dataset.mode = mode;
    render();
  }
  function render() {
    const d = draft();
    el('sound-count').textContent = `${drafts.length} of ${MAX_SOUNDS}`;
    el<HTMLButtonElement>('sound-new').disabled = drafts.length >= MAX_SOUNDS; el('sound-limit').hidden = drafts.length < MAX_SOUNDS;
    el<HTMLButtonElement>('sound-undo').disabled = !undo.length; el<HTMLButtonElement>('sound-redo').disabled = !redo.length;
    const naming = (mode === 'clip' || mode === 'song') && !!d;
    el('sound-name-field').hidden = !naming;
    if (naming) { el('sound-name-label').textContent = d!.kind === 'song' ? 'Song' : 'Sound'; if (document.activeElement !== el('sound-name')) el<HTMLInputElement>('sound-name').value = d!.name; }
    renderCards();
    if (mode === 'clip') renderClip(); else if (mode === 'song') renderSong(); else if (mode === 'effect') renderEffect(); else if (mode === 'record') renderRecord(); else if (mode === 'library') renderLibrary();
    renderTransport();
  }
  function meta(d: Draft) {
    if (d.kind === 'song') return `Song · ${d.song!.beats} beats · ${(d.song!.beats * 60 / d.song!.tempo).toFixed(1)} s`;
    return `${{ recording: 'Recording', effect: 'Effect', import: 'Imported', sound: 'Sound' }[d.made]} · ${seconds(d.samples!.length)}`;
  }
  function renderCards() {
    const list = el('sound-cards');
    list.replaceChildren(...drafts.map(d => {
      const card = document.createElement('div'); card.className = 'sound-card'; card.dataset.sound = d.id;
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'sound-card-choose'; choose.setAttribute('role', 'option');
      choose.setAttribute('aria-selected', String(d.id === current && (mode === 'clip' || mode === 'song')));
      const thumb = document.createElement('canvas'); thumb.width = 88; thumb.height = 56; thumb.setAttribute('aria-hidden', 'true'); drawThumb(thumb, d);
      const text = document.createElement('span'); text.className = 'sound-card-text';
      const name = document.createElement('strong'); name.textContent = d.name; const info = document.createElement('span'); info.textContent = meta(d);
      text.append(name, info); choose.append(thumb, text);
      choose.addEventListener('click', () => { if (current !== d.id || mode !== kindMode()) { stop(); current = d.id; selection = null; zoom = 1; offset = 0; page = 0; show(kindMode()); } });
      const more = document.createElement('button'); more.type = 'button'; more.className = 'sound-card-more'; more.innerHTML = icon(ICONS.more, 18);
      more.setAttribute('aria-label', `More for ${d.name}`); more.setAttribute('aria-haspopup', 'menu');
      more.addEventListener('click', event => { event.stopPropagation(); openCardMenu(d.id, more); });
      card.append(choose, more); return card;
    }));
  }
  function drawThumb(canvas: HTMLCanvasElement, d: Draft) {
    const c = canvas.getContext('2d')!; c.clearRect(0, 0, canvas.width, canvas.height);
    if (d.kind === 'clip') {
      const p = peaks(d.samples!, 44); c.fillStyle = '#8c67a2';
      for (let i = 0; i < 44; i++) { const lo = p[i * 2], hi = p[i * 2 + 1]; c.fillRect(i * 2, 28 - hi * 26, 1.4, Math.max(1, (hi - lo) * 26)); }
    } else {
      const song = d.song!; for (const n of song.notes) {
        const drum = DRUMS.some(([id]) => id === n.instrument);
        c.fillStyle = drum ? '#4e5f49' : MELODY.find(([id]) => id === n.instrument)?.[2] ?? '#8c67a2';
        c.fillRect(n.at / song.beats * 88, drum ? 50 : 48 - ((n.pitch - 48) / 36) * 44, Math.max(2, n.beats / song.beats * 88), 3);
      }
    }
  }

  // ── Clip: waveform, selection and playhead ──
  const samples = () => draft()?.samples ?? new Float32Array(1);
  const maxZoom = () => Math.max(1, Math.min(64, 2 ** Math.floor(Math.log2(samples().length / 2000))));
  const span = () => samples().length / zoom;
  function sized(canvas: HTMLCanvasElement) {
    const r = canvas.getBoundingClientRect(), ratio = devicePixelRatio || 1, w = Math.max(1, Math.round(r.width * ratio)), h = Math.max(1, Math.round(r.height * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { c: canvas.getContext('2d')!, w, h, ratio };
  }
  function renderClip() {
    const d = draft(); if (!d?.samples) return;
    const n = d.samples.length;
    el('sound-length').textContent = `Length ${seconds(n)}`;
    const hasSelection = !!selection && selection[1] > selection[0];
    el('sound-selected').hidden = !hasSelection; if (hasSelection) el('sound-selected').textContent = `Selected ${seconds(selection![1] - selection![0])}`;
    el<HTMLButtonElement>('sound-play-part').disabled = !hasSelection;
    el('sound-record-again').hidden = d.made !== 'recording';
    el('sound-tune-scope').textContent = hasSelection ? 'on the selected part' : 'on the whole sound';
    el('sound-zoom-level').textContent = `${zoom}×`;
    el<HTMLButtonElement>('sound-zoom-out').disabled = zoom <= 1; el<HTMLButtonElement>('sound-zoom-in').disabled = zoom >= maxZoom();
    drawWave();
  }
  function drawWave() {
    if (mode !== 'clip' || !dialog.open) return;
    const all = samples(), n = all.length; offset = Math.max(0, Math.min(n - span(), offset));
    const { c, w, h, ratio } = sized(el<HTMLCanvasElement>('sound-wave')), from = offset, to = offset + span(), x = (i: number) => (i - from) / (to - from) * w;
    c.fillStyle = '#fbf9fd'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e6deee'; c.lineWidth = ratio; c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
    if (selection) { c.fillStyle = '#e4d7ef'; c.fillRect(x(selection[0]), 0, x(selection[1]) - x(selection[0]), h); }
    const columns = Math.max(1, Math.floor(w / ratio)), p = peaks(all, columns, from, to), mid = h / 2, scale = h * 0.46;
    for (let i = 0; i < columns; i++) {
      const lo = p[i * 2], hi = p[i * 2 + 1], inside = selection && from + (i + 0.5) / columns * (to - from) >= selection[0] && from + (i + 0.5) / columns * (to - from) < selection[1];
      c.fillStyle = inside ? '#5d3f73' : '#8c67a2'; c.fillRect(i * ratio, mid - hi * scale, Math.max(1, ratio * 0.8), Math.max(ratio, (hi - lo) * scale));
    }
    if (playhead !== null && playhead >= from && playhead <= to) { c.fillStyle = '#d0663a'; c.fillRect(x(playhead) - ratio, 0, 2 * ratio, h); }
    // Handles sit on the selection's edges, 44 px wide for fingers.
    for (const [id, edge] of [['sound-handle-start', selection?.[0]], ['sound-handle-end', selection?.[1]]] as const) {
      const handle = el(id), visible = edge !== undefined && edge >= from && edge <= to;
      handle.hidden = !visible; if (visible) handle.style.left = `${x(edge!) / ratio}px`;
    }
    drawOverview();
  }
  function drawOverview() {
    const all = samples(), n = all.length, { c, w, h, ratio } = sized(el<HTMLCanvasElement>('sound-overview'));
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    const columns = Math.max(1, Math.floor(w / ratio)), p = peaks(all, columns);
    if (selection) { c.fillStyle = '#e4d7ef'; c.fillRect(selection[0] / n * w, 0, (selection[1] - selection[0]) / n * w, h); }
    c.fillStyle = '#b9a3cb'; for (let i = 0; i < columns; i++) c.fillRect(i * ratio, h / 2 - p[i * 2 + 1] * h * 0.45, ratio * 0.8, Math.max(ratio, (p[i * 2 + 1] - p[i * 2]) * h * 0.45));
    if (zoom > 1) { c.strokeStyle = '#267c70'; c.lineWidth = 2 * ratio; c.strokeRect(offset / n * w + ratio, ratio, span() / n * w - 2 * ratio, h - 2 * ratio); }
    if (playhead !== null) { c.fillStyle = '#d0663a'; c.fillRect(playhead / n * w - ratio, 0, 2 * ratio, h); }
  }
  const at = (event: PointerEvent) => { const r = el('sound-wave').getBoundingClientRect(); return Math.round(offset + Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * span()); };
  let drag: { pointer: number; start: number; moved: boolean; edge?: 0 | 1 } | null = null;
  const pinch = new Map<number, number>(); let pinchStart: { distance: number; zoom: number } | null = null;
  el('sound-wave').addEventListener('pointerdown', event => {
    if (mode !== 'clip') return;
    pinch.set(event.pointerId, event.clientX);
    if (pinch.size === 2) { const [a, b] = [...pinch.values()]; pinchStart = { distance: Math.abs(a - b) || 1, zoom }; drag = null; return; }
    el('sound-wave').setPointerCapture(event.pointerId); drag = { pointer: event.pointerId, start: at(event), moved: false };
  });
  for (const [id, edge] of [['sound-handle-start', 0], ['sound-handle-end', 1]] as const) el(id).addEventListener('pointerdown', event => {
    event.stopPropagation(); el(id).setPointerCapture(event.pointerId); drag = { pointer: event.pointerId, start: selection?.[edge === 0 ? 1 : 0] ?? 0, moved: true, edge };
  });
  const move = (event: PointerEvent) => {
    if (pinch.has(event.pointerId)) pinch.set(event.pointerId, event.clientX);
    if (pinchStart && pinch.size === 2) { const [a, b] = [...pinch.values()]; setZoom(Math.round(pinchStart.zoom * Math.abs(a - b) / pinchStart.distance)); return; }
    if (!drag || drag.pointer !== event.pointerId) return;
    const here = at(event);
    if (!drag.moved && Math.abs(here - drag.start) / span() * el('sound-wave').getBoundingClientRect().width < 6) return;
    drag.moved = true; selection = [Math.min(drag.start, here), Math.max(drag.start, here)]; renderClip();
  };
  const up = (event: PointerEvent) => {
    pinch.delete(event.pointerId); if (pinch.size < 2) pinchStart = null;
    if (!drag || drag.pointer !== event.pointerId) return;
    const tapped = !drag.moved; drag = null;
    if (tapped) { selection = null; renderClip(); const from = at(event); play(samples(), 'clip', from); }
    else if (selection && selection[1] - selection[0] < SOUND_RATE * 0.01) { selection = null; renderClip(); }
  };
  for (const target of [el('sound-wave'), el('sound-handle-start'), el('sound-handle-end')]) { target.addEventListener('pointermove', move); target.addEventListener('pointerup', up); target.addEventListener('pointercancel', up); }
  el('sound-wave').addEventListener('wheel', event => {
    if (mode !== 'clip') return; event.preventDefault();
    if (event.ctrlKey || event.metaKey) setZoom(event.deltaY < 0 ? zoom * 2 : zoom / 2);
    else { offset += (event.deltaX || event.deltaY) / el('sound-wave').getBoundingClientRect().width * span(); drawWave(); }
  }, { passive: false });
  const overviewMove = (event: PointerEvent) => { const r = el('sound-overview').getBoundingClientRect(); offset = (event.clientX - r.left) / r.width * samples().length - span() / 2; drawWave(); };
  el('sound-overview').addEventListener('pointerdown', event => { el('sound-overview').setPointerCapture(event.pointerId); overviewMove(event); });
  el('sound-overview').addEventListener('pointermove', event => { if (el('sound-overview').hasPointerCapture(event.pointerId)) overviewMove(event); });
  function setZoom(next: number) {
    const clamped = Math.max(1, Math.min(maxZoom(), 2 ** Math.round(Math.log2(Math.max(1, next)))));
    if (clamped === zoom) return;
    const centre = selection ? (selection[0] + selection[1]) / 2 : playhead ?? offset + span() / 2;
    zoom = clamped; offset = centre - span() / 2; renderClip();
  }
  function applyTune(action: Tune) {
    const d = draft(); if (!d?.samples) return;
    try {
      const result = tune(d.samples, action, selection); remember();
      replace({ ...d, samples: result.samples, edited: true }); selection = result.range; playhead = null;
      zoom = Math.min(zoom, maxZoom()); render();
      // Hear the change straight away.
      const [from, to] = selection ?? [0, result.samples.length]; play(result.samples, 'clip', from, to);
    } catch (error) { toast(error instanceof Error ? error.message : String(error), el(`sound-tune`).querySelector<HTMLElement>(`[data-tune="${action}"]`)!); }
  }

  // ── Recording ──
  function renderRecord() {
    const stage = recording?.stage, live = stage === 'recording';
    el('sound-record-ready').hidden = !el('sound-mic-problem').hidden;
    el('sound-record-button').classList.toggle('live', live);
    el('sound-record-button').setAttribute('aria-label', live ? 'Stop recording' : stage === 'counting' ? 'Cancel' : 'Record');
    el('sound-record-title').textContent = live ? 'Recording… tap to stop' : stage === 'counting' ? 'Get ready…' : stage === 'asking' ? 'Waiting for the microphone…' : stage === 'decoding' ? 'Getting it ready…' : 'Tap to record';
    if (!live && stage !== 'counting') { el('sound-record-face').innerHTML = icon(ICONS.mic, 40); el('sound-ring').style.strokeDashoffset = String(2 * Math.PI * 54); el('sound-record-time').textContent = '0:00 / 1:00'; el('sound-level').style.width = '0'; }
  }
  function problem(kind: 'blocked' | 'missing' | 'failed') {
    cancelRecording(); el('sound-mic-problem').hidden = false; el('sound-record-ready').hidden = true;
    el('sound-problem-title').textContent = kind === 'blocked' ? 'The microphone is blocked' : kind === 'missing' ? 'No microphone found' : 'The microphone did not start';
    el('sound-problem-text').textContent = kind === 'blocked' ? 'Python Blocks can’t hear you until the browser allows it.' : kind === 'missing' ? 'Plug in a headset or turn on the computer’s microphone, then try again. Effects and songs still work without one.' : 'Check that no other app is using it, then try again.';
    el('sound-problem-steps').hidden = kind !== 'blocked';
  }
  async function startRecording() {
    if (recording?.stage === 'recording') { await finishRecording(); return; }
    if (recording?.stage === 'decoding') return;
    if (recording) { cancelRecording(); renderRecord(); return; }
    stop(); const ticket = token;
    el('sound-mic-problem').hidden = true;
    recording = { stage: 'asking', stream: null, recorder: null, analyser: null, started: 0, levels: [], limit: false, finished: null }; renderRecord();
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (error) {
      if (ticket !== token) return;
      const name = error instanceof DOMException ? error.name : '';
      problem(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'missing' : 'failed'); return;
    }
    if (ticket !== token || !recording || mode !== 'record') { stream.getTracks().forEach(t => t.stop()); return; }
    recording.stream = stream; recording.stage = 'counting'; renderRecord();
    let count = 3; el('sound-record-face').innerHTML = `<span class="sound-count">${count}</span>`;
    recording.count = setInterval(() => {
      if (!recording || recording.stage !== 'counting') return;
      count--; if (count > 0) { el('sound-record-face').innerHTML = `<span class="sound-count">${count}</span>`; return; }
      clearInterval(recording.count); capture();
    }, 1000);
    const capture = () => {
      if (!recording?.stream) return;
      const ctx = audio(), sourceNode = ctx.createMediaStreamSource(recording.stream), analyser = ctx.createAnalyser(); analyser.fftSize = 1024; sourceNode.connect(analyser);
      const recorder = new MediaRecorder(recording.stream), chunks: Blob[] = [], entry = recording;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      entry.finished = new Promise<void>(resolve => {
        recorder.onstop = () => { releaseMic(entry); void decodeRecording(new Blob(chunks, { type: recorder.mimeType }), entry.limit).finally(resolve); };
        recorder.onerror = () => { releaseMic(entry); problem('failed'); resolve(); };
      });
      Object.assign(entry, { stage: 'recording', recorder, analyser, started: performance.now() });
      recorder.start(250); el('sound-record-face').innerHTML = icon(ICONS.stop, 36, true);
      entry.timer = setTimeout(() => { if (entry.recorder?.state === 'recording') { entry.limit = true; entry.stage = 'decoding'; entry.recorder.stop(); renderRecord(); } }, 60_000);
      renderRecord(); animate();
    };
  }
  function drawRecording() {
    if (!recording?.analyser) return;
    const data = new Float32Array(recording.analyser.fftSize); recording.analyser.getFloatTimeDomainData(data);
    let peak = 0; for (const x of data) peak = Math.max(peak, Math.abs(x));
    recording.levels.push(peak);
    const elapsed = (performance.now() - recording.started) / 1000;
    el('sound-record-time').textContent = `${clock(elapsed)} / 1:00`;
    el('sound-level').style.width = `${Math.min(100, peak * 140)}%`;
    el('sound-ring').style.strokeDashoffset = String(2 * Math.PI * 54 * (1 - Math.min(1, elapsed / 60)));
    const { c, w, h, ratio } = sized(el<HTMLCanvasElement>('sound-live')), bar = 4 * ratio, count = Math.floor(w / bar), levels = recording.levels.slice(-count);
    c.clearRect(0, 0, w, h); c.fillStyle = '#8c67a2';
    levels.forEach((level, i) => { const height = Math.max(ratio * 2, Math.min(1, level * 1.4) * h * 0.9); c.fillRect(i * bar, (h - height) / 2, bar - ratio, height); });
  }
  async function finishRecording() {
    const entry = recording; if (!entry || entry.stage !== 'recording' || !entry.recorder) return;
    entry.stage = 'decoding'; clearTimeout(entry.timer); renderRecord();
    entry.recorder.stop(); await entry.finished;
  }
  function releaseMic(entry: NonNullable<typeof recording>) { clearTimeout(entry.timer); clearInterval(entry.count); entry.stream?.getTracks().forEach(t => t.stop()); entry.stream = null; }
  function cancelRecording() {
    const entry = recording; if (!entry) return; recording = null;
    if (entry.recorder) { entry.recorder.onstop = null; entry.recorder.ondataavailable = null; entry.recorder.onerror = null; if (entry.recorder.state !== 'inactive') entry.recorder.stop(); }
    releaseMic(entry);
  }
  async function decodeAudio(blob: Blob) {
    const ctx = new OfflineAudioContext(1, 1, SOUND_RATE), buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(Math.min(buffer.length, MAX_SAMPLES));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) { const data = buffer.getChannelData(channel); for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels; }
    return { samples: mono, seconds: buffer.duration };
  }
  async function decodeRecording(blob: Blob, limit: boolean) {
    const ticket = token;
    try {
      const { samples: raw } = await decodeAudio(blob); if (ticket !== token) return;
      const { samples: clip, trimmed, quiet } = trimSilence(raw);
      recording = null;
      const target = recordTarget ? drafts.find(d => d.id === recordTarget) : undefined;
      if (target) { remember(); replace({ ...target, samples: clip, edited: true, made: 'recording' }); current = target.id; selection = null; zoom = 1; offset = 0; show('clip'); }
      else add({ id: identity(), name: uniqueName('Recording'), kind: 'clip', samples: clip, song: null, source: null, edited: true, made: 'recording' });
      recordTarget = null;
      toast(limit ? 'Stopped at 60 seconds, the longest a sound can be. Select the part you want and tap Keep this, or record again.' : quiet ? 'Got it, but it was very quiet: try Louder, or record again closer to the microphone.' : trimmed ? 'Got it. The quiet start and end are trimmed.' : 'Got it.', el('sound-main'));
    } catch { if (ticket === token) problem('failed'); }
  }

  // ── Effects ──
  function renderEffect() {
    const kinds = el('sound-kinds');
    if (!kinds.childElementCount) kinds.append(...EFFECTS.map(kind => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sound-kind'; button.dataset.kind = kind.id;
      const thumb = document.createElement('canvas'); thumb.width = 96; thumb.height = 40; thumb.setAttribute('aria-hidden', 'true');
      const sample = makeEffect(defaultEffect(kind.id)), p = peaks(sample, 48), c = thumb.getContext('2d')!; c.fillStyle = '#8c67a2';
      for (let i = 0; i < 48; i++) c.fillRect(i * 2, 20 - p[i * 2 + 1] * 18, 1.4, Math.max(1, (p[i * 2 + 1] - p[i * 2]) * 18));
      const label = document.createElement('span'); label.textContent = kind.name; button.append(thumb, label);
      button.addEventListener('click', () => { effect = defaultEffect(kind.id); setEffect(); });
      return button;
    }));
    kinds.querySelectorAll<HTMLElement>('[data-kind]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === effect.kind)));
    for (const key of ['pitch', 'length', 'slide'] as const) el<HTMLInputElement>(`effect-${key}`).value = String(effect[key]);
    el<HTMLButtonElement>('sound-effect-add').disabled = drafts.length >= MAX_SOUNDS;
    drawEffect();
  }
  function drawEffect() {
    if (mode !== 'effect' || !dialog.open) return;
    const { c, w, h, ratio } = sized(el<HTMLCanvasElement>('sound-effect-wave')), bars = Math.max(8, Math.floor(w / (6 * ratio))), p = peaks(effectSamples, bars);
    c.fillStyle = '#fbf9fd'; c.fillRect(0, 0, w, h); c.fillStyle = '#8c67a2';
    for (let i = 0; i < bars; i++) { const height = Math.max(ratio * 2, Math.max(-p[i * 2], p[i * 2 + 1]) * h * 0.9); c.fillRect(i * 6 * ratio, (h - height) / 2, 4 * ratio, height); }
  }
  function setEffect(listen = true) { effectSamples = makeEffect(effect); renderEffect(); if (listen) play(effectSamples, 'effect'); }
  for (const key of ['pitch', 'length', 'slide'] as const) {
    el<HTMLInputElement>(`effect-${key}`).addEventListener('input', () => { effect = { ...effect, [key]: Number(el<HTMLInputElement>(`effect-${key}`).value) }; effectSamples = makeEffect(effect); drawEffect(); });
    el<HTMLInputElement>(`effect-${key}`).addEventListener('change', () => play(effectSamples, 'effect'));
  }

  // ── Songs ──
  const song = () => draft()?.song ?? null;
  const pages = (s: Song) => Math.max(1, Math.ceil(s.beats / 4));
  const isDrum = (i: Instrument) => DRUMS.some(([id]) => id === i);
  function rows() {
    const base = (octave + 1) * 12, list: number[] = [];
    for (let p = base + 12; p >= base; p--) if (sharps || !NAMES[p % 12].includes('♯')) list.push(p);
    return list;
  }
  function renderSong() {
    const s = song(); if (!s) return;
    page = Math.max(0, Math.min(pages(s) - 1, page));
    el<HTMLInputElement>('song-speed').value = String(s.tempo); el('song-speed-label').textContent = `${s.tempo} beats a minute`;
    el('song-length').textContent = `${s.beats} beats`;
    el<HTMLButtonElement>('song-shorter').disabled = s.beats <= 1; el<HTMLButtonElement>('song-longer').disabled = !canLengthen(s);
    el('song-octave').textContent = `${pitchName(rows().at(-1)!)}–${pitchName(rows()[0])}`;
    el<HTMLButtonElement>('song-octave-down').disabled = octave <= 1; el<HTMLButtonElement>('song-octave-up').disabled = octave >= 6;
    el('song-sharps').setAttribute('aria-pressed', String(sharps));
    dialog.querySelectorAll<HTMLElement>('[data-instrument]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.instrument === instrument)));
    dialog.querySelectorAll<HTMLElement>('[data-length]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.length) === noteLength)));
    // The whole song, a segment for every four beats.
    el('song-overview').replaceChildren(...Array.from({ length: pages(s) }, (_, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'song-page'; b.dataset.page = String(i);
      b.setAttribute('aria-label', `Beats ${i * 4 + 1} to ${Math.min(s.beats, i * 4 + 4)}`); b.setAttribute('aria-pressed', String(i === page));
      b.classList.toggle('has-notes', s.notes.some(n => n.at >= i * 4 && n.at < i * 4 + 4));
      b.addEventListener('click', () => { page = i; renderSong(); }); return b;
    }));
    grid(el('song-melody'), rows().map(p => [pitchName(p), p]), false);
    grid(el('song-drums'), DRUMS.map(([id, label]) => [label, id]), true);
    renderSongPlayhead();
  }
  function grid(container: HTMLElement, lines: [string, number | Instrument][], drums: boolean) {
    const s = song()!, start = page * 4, focused = container.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.cell : undefined;
    container.style.setProperty('--rows', String(lines.length));
    container.replaceChildren(...lines.flatMap(([label, key], row) => {
      const head = document.createElement('span'); head.className = 'song-row-head'; head.setAttribute('role', 'rowheader'); head.textContent = label;
      if (!drums && NAMES[(key as number) % 12] === 'C') head.classList.add('c');
      if (!drums && NAMES[(key as number) % 12].includes('♯')) head.classList.add('sharp');
      const cells = Array.from({ length: 16 }, (_, col) => {
        const beat = start + col / 4, cell = document.createElement('button'); cell.type = 'button'; cell.className = 'song-cell'; cell.setAttribute('role', 'gridcell'); cell.dataset.cell = `${row}:${col}`; cell.dataset.col = String(col);
        if (col % 4 === 0) cell.classList.add('beat');
        const note = drums ? s.notes.find(n => n.instrument === key && Math.abs(n.at - beat) < 1e-6) : s.notes.find(n => !isDrum(n.instrument) && n.pitch === key && n.at <= beat + 1e-6 && n.at + n.beats > beat + 1e-6);
        if (note) { cell.classList.add(drums ? 'hit' : Math.abs(note.at - beat) < 1e-6 ? 'start' : 'held'); if (!drums) cell.style.setProperty('--note', MELODY.find(([id]) => id === note.instrument)?.[2] ?? '#8c67a2'); }
        cell.disabled = beat >= s.beats - 1e-6;
        cell.setAttribute('aria-label', `${label}, beat ${beat + 1}${note ? `, ${drums ? 'on' : MELODY.find(([id]) => id === note.instrument)?.[1] ?? note.instrument}` : ''}`);
        cell.setAttribute('aria-pressed', String(!!note)); cell.tabIndex = -1;
        cell.addEventListener('click', () => toggle(drums, key, beat, note));
        cell.addEventListener('keydown', event => {
          const d: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
          if (!d[event.key]) return; event.preventDefault();
          const r = Math.max(0, Math.min(lines.length - 1, row + d[event.key][0])), c = Math.max(0, Math.min(15, col + d[event.key][1]));
          container.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)?.focus();
        });
        return cell;
      });
      return [head, ...cells];
    }));
    const target = container.querySelector<HTMLElement>(`[data-cell="${focused ?? ''}"]`) ?? container.querySelector<HTMLElement>('.song-cell:not(:disabled)');
    if (target) target.tabIndex = 0; if (focused && target) target.focus();
  }
  function toggle(drums: boolean, key: number | Instrument, beat: number, note: Note | undefined) {
    const d = draft(), s = song(); if (!d || !s) return;
    let notes: Note[];
    if (note) notes = s.notes.filter(n => n !== note);
    else if (drums) notes = [...s.notes, { at: beat, beats: Math.min(0.25, s.beats - beat), pitch: 60, instrument: key as Instrument, volume: 100 }];
    else notes = [...s.notes, { at: beat, beats: Math.min(noteLength, s.beats - beat), pitch: key as number, instrument, volume: 100 }];
    const next = { ...s, notes };
    if (!validSong(next)) { toast(s.notes.length >= 256 ? 'A song holds up to 256 notes.' : 'Up to 16 notes can play at once.'); return; }
    remember(); replace({ ...d, song: next, edited: true }); render();
    if (!note) play(synthesizeTone(drums ? 60 : key as number, drums ? 0.2 : 0.25, drums ? key as Instrument : instrument), 'note');
  }
  const canLengthen = (s: Song) => Math.min(64, Math.floor(s.beats / 4) * 4 + 4) * 60 / s.tempo <= 60 && s.beats < 64;
  function setSong(change: (s: Song) => Song, anchor: HTMLElement) {
    const d = draft(), s = song(); if (!d || !s) return;
    const next = change(s);
    if (!validSong(next)) { toast('A song can be up to 64 beats and a minute long. Make it faster or shorter first.', anchor); renderSong(); return; }
    remember(); stop(); replace({ ...d, song: next, edited: true }); render();
  }
  const resize = (s: Song, beats: number): Song => ({ ...s, beats, notes: s.notes.filter(n => n.at < beats - 1e-6).map(n => ({ ...n, beats: Math.min(n.beats, beats - n.at) })) });
  function renderSongPlayhead(time?: number) {
    const s = song(); dialog.querySelectorAll('.song-cell.now').forEach(c => c.classList.remove('now'));
    dialog.querySelectorAll('.song-page.now').forEach(c => c.classList.remove('now'));
    if (time === undefined || !s || playing?.what !== 'song') return;
    const beat = time * s.tempo / 60, current = Math.floor(beat / 4);
    if (current !== page && current < pages(s)) { page = current; renderSong(); }
    const col = Math.floor((beat - page * 4) * 4);
    dialog.querySelectorAll(`.song-cell[data-col="${col}"]`).forEach(c => c.classList.add('now'));
    dialog.querySelector(`.song-page[data-page="${current}"]`)?.classList.add('now');
  }

  // ── The sound library: effects as designed (references) and music loops (editable songs) ──
  let shelf: 'effects' | 'music' = 'effects', listening: string | null = null;
  function renderLibrary() {
    el('sound-lib-effects').setAttribute('aria-pressed', String(shelf === 'effects')); el('sound-lib-music').setAttribute('aria-pressed', String(shelf === 'music'));
    el('sound-library-note').textContent = shelf === 'effects' ? 'Tap ▶ to listen first. An effect added from here costs the project nothing; changing it later makes it yours.' : 'Loops for background music. Each one is added as a song you can change in the song editor; start it with “start sound … looping”.';
    const items = shelf === 'effects'
      ? SOUND_LIBRARY.map(e => ({ key: `effect:${e.effect}`, name: e.name, detail: `${(soundSamples(librarySound(e.effect)).length / SOUND_RATE).toFixed(1)} s`, draw: (c: HTMLCanvasElement) => drawPeaks(c, soundSamples(librarySound(e.effect))) }))
      : MUSIC_LIBRARY.map(m => ({ key: `music:${m.id}`, name: m.name, detail: `${m.mood} · ${m.tempo} BPM · ${Math.round(m.beats * 60 / m.tempo)} s`, draw: (c: HTMLCanvasElement) => drawRoll(c, m.notes, m.beats) }));
    el('sound-library-items').replaceChildren(...items.map(item => {
      const card = document.createElement('div'); card.className = 'sound-library-card'; card.dataset.library = item.key;
      const title = document.createElement('strong'); title.textContent = item.name;
      const detail = document.createElement('span'); detail.className = 'paint-small'; detail.textContent = item.detail;
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 64; canvas.setAttribute('aria-hidden', 'true'); item.draw(canvas);
      const listen = document.createElement('button'); listen.type = 'button'; listen.className = 'paint-plain'; listen.dataset.libraryListen = item.key;
      const playingNow = listening === item.key && playing?.what === 'list';
      listen.innerHTML = icon(playingNow ? ICONS.stop : ICONS.play, 14, true); listen.append(playingNow ? 'Stop' : 'Listen'); listen.setAttribute('aria-label', `${playingNow ? 'Stop' : 'Listen to'} ${item.name}`);
      const addButton = document.createElement('button'); addButton.type = 'button'; addButton.className = 'paint-plain sound-library-add'; addButton.dataset.libraryAdd = item.key;
      addButton.innerHTML = icon(ICONS.plus, 14); addButton.append('Add'); addButton.setAttribute('aria-label', `Add ${item.name}`);
      const row = document.createElement('div'); row.className = 'sound-library-actions'; row.append(listen, addButton);
      card.append(title, detail, canvas, row); return card;
    }));
  }
  function drawPeaks(canvas: HTMLCanvasElement, samples: Float32Array) {
    const c = canvas.getContext('2d')!, n = 80, p = peaks(samples, n), mid = canvas.height / 2; c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = '#8c67a2';
    for (let i = 0; i < n; i++) { const lo = p[i * 2], hi = p[i * 2 + 1]; c.fillRect(i * canvas.width / n, mid - hi * mid * 0.9, 2, Math.max(1.5, (hi - lo) * mid * 0.9)); }
  }
  function drawRoll(canvas: HTMLCanvasElement, notes: Note[], beats: number) {
    const c = canvas.getContext('2d')!, melody = notes.filter(n => !DRUMS.some(([id]) => id === n.instrument)), lo = Math.min(...melody.map(n => n.pitch)), hi = Math.max(...melody.map(n => n.pitch));
    c.clearRect(0, 0, canvas.width, canvas.height);
    for (const n of notes) {
      const drum = DRUMS.some(([id]) => id === n.instrument), x = n.at / beats * canvas.width;
      c.fillStyle = drum ? '#4e5f49' : MELODY.find(([id]) => id === n.instrument)?.[2] ?? '#8c67a2';
      if (drum) c.fillRect(x, canvas.height - 5, 3, 3);
      else c.fillRect(x, 6 + (hi - n.pitch) / Math.max(1, hi - lo) * (canvas.height - 18), Math.max(3, n.beats / beats * canvas.width - 1), 4);
    }
  }
  function libraryItem(key: string) {
    const [kind, id] = key.split(':');
    if (kind === 'effect') { const e = SOUND_LIBRARY.find(x => x.effect === id)!; return { name: e.name, samples: () => soundSamples(librarySound(e.effect)), add: () => { const draftId = identity(), name = uniqueName(e.name); add({ id: draftId, name, kind: 'clip', samples: soundSamples(librarySound(e.effect)), song: null, source: { ...librarySound(e.effect, draftId), name }, edited: false, made: 'effect' }); } }; }
    const m = MUSIC_LIBRARY.find(x => x.id === id)!;
    return { name: m.name, samples: () => synthesize(m), add: () => { const draftId = identity(), name = uniqueName(m.name), song = musicSong(m, draftId, name); add({ id: draftId, name, kind: 'song', samples: null, song, source: null, edited: true, made: 'sound' }); } };
  }
  el('sound-library').addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button) return;
    if (button.id === 'sound-lib-effects' || button.id === 'sound-lib-music') { stop(); shelf = button.id === 'sound-lib-effects' ? 'effects' : 'music'; renderLibrary(); return; }
    const key = button.dataset.libraryListen ?? button.dataset.libraryAdd; if (!key) return;
    if (button.dataset.libraryAdd) { stop(); if (drafts.length >= MAX_SOUNDS) { toast(`A project holds up to ${MAX_SOUNDS} sounds. Delete one to add another.`, button); return; } libraryItem(key).add(); return; }
    if (listening === key && playing?.what === 'list') { stop(); renderLibrary(); return; }
    listening = key; play(libraryItem(key).samples(), 'list'); renderLibrary();
  });

  // ── Making new sounds ──
  function begin(kind: 'record' | 'effect' | 'song' | 'import' | 'library') {
    closeMenus();
    if (drafts.length >= MAX_SOUNDS) { toast(`A project holds up to ${MAX_SOUNDS} sounds. Delete one to add another.`, el('sound-new')); return; }
    stop(); recordTarget = null;
    if (kind === 'record') { el('sound-mic-problem').hidden = true; show('record'); }
    else if (kind === 'effect') { effect = defaultEffect(effect.kind); effectSamples = makeEffect(effect); show('effect'); requestAnimationFrame(drawEffect); }
    else if (kind === 'song') add({ id: identity(), name: uniqueName('Song'), kind: 'song', samples: null, song: { id: '', name: '', kind: 'song', tempo: 120, beats: 16, notes: [] }, source: null, edited: true, made: 'sound' });
    else if (kind === 'library') show('library');
    else el<HTMLInputElement>('sound-file').click();
  }
  el<HTMLInputElement>('sound-file').addEventListener('change', async () => {
    const file = el<HTMLInputElement>('sound-file').files?.[0]; el<HTMLInputElement>('sound-file').value = ''; if (!file) return;
    const ticket = token;
    try {
      if (file.size > 10_000_000) throw new Error('Choose a sound file smaller than 10 MB.');
      const { samples: clip, seconds: length } = await decodeAudio(file); if (ticket !== token) return;
      add({ id: identity(), name: file.name.replace(/\.[^.]+$/, '').trim().slice(0, 48) || uniqueName('Sound'), kind: 'clip', samples: clip, song: null, source: null, edited: true, made: 'import' });
      if (length > 60) toast('Only the first minute was kept: a sound can be up to 60 seconds.', el('sound-main'));
    } catch (error) { if (ticket === token) toast(error instanceof Error && error.message.startsWith('Choose') ? error.message : 'This sound file could not be opened. Try a WAV, MP3 or Ogg file.', el('sound-new')); }
  });

  // ── Menus and messages ──
  function openSheet() {
    closeMenus(); if (drafts.length >= MAX_SOUNDS) { toast(`A project holds up to ${MAX_SOUNDS} sounds. Delete one to add another.`, el('sound-new')); return; }
    el('sound-sheet').hidden = false; position(el('sound-sheet'), el('sound-new'), 'right'); el('sound-sheet').querySelector<HTMLElement>('[data-new]')?.focus();
  }
  function openCardMenu(id: string, anchor: HTMLElement) {
    closeMenus(); const menu = el('sound-card-menu'); menu.dataset.sound = id; menu.hidden = false; position(menu, anchor, 'right');
    menu.querySelector<HTMLButtonElement>('[data-sound-card="copy"]')!.disabled = drafts.length >= MAX_SOUNDS; menu.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
  }
  function cardAction(action: string, id: string) {
    closeMenus(); const d = drafts.find(x => x.id === id); if (!d) return;
    if (action === 'copy') {
      const copy: Draft = { ...d, id: identity(), name: `${d.name} copy`.slice(0, 48), source: null, edited: true, song: d.song ? structuredClone(d.song) : null };
      remember(); const at = drafts.indexOf(d) + 1; drafts = [...drafts.slice(0, at), copy, ...drafts.slice(at)]; current = copy.id; created.push(copy.id); selection = null; show(kindMode());
    } else {
      remember(); stop(); const at = drafts.indexOf(d); drafts = drafts.filter(x => x !== d);
      if (current === id) { current = drafts[Math.min(at, drafts.length - 1)]?.id ?? null; selection = null; zoom = 1; offset = 0; }
      show(mode === 'record' || mode === 'effect' ? mode : current ? kindMode() : 'empty');
      toast(`“${d.name}” deleted`, el('sound-cards'), true);
    }
  }
  function closeMenus() { el('sound-card-menu').hidden = true; el('sound-sheet').hidden = true; }
  function position(node: HTMLElement, anchor: HTMLElement, side: 'below' | 'right' | 'inside' = 'below') {
    const a = anchor.getBoundingClientRect(), d = dialog.getBoundingClientRect(); node.style.left = '0px'; node.style.top = '0px';
    const n = node.getBoundingClientRect();
    let left = side === 'right' ? a.right + 8 : a.left + a.width / 2 - n.width / 2, top = side === 'right' ? a.top : side === 'inside' ? a.top + 12 : a.bottom + 8;
    left = Math.max(8, Math.min(d.width - n.width - 8, left)); top = Math.max(64, Math.min(d.height - n.height - 8, top));
    node.style.left = `${left}px`; node.style.top = `${top}px`;
  }
  function toast(message: string, anchor: HTMLElement = el('sound-done'), canUndo = false) {
    const node = el('sound-toast'); el('sound-toast-text').textContent = message; el('sound-toast-undo').hidden = !canUndo; node.hidden = false;
    position(node, anchor, anchor === el('sound-cards') ? 'right' : anchor === el('sound-main') ? 'inside' : 'below');
    clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, canUndo ? 8000 : 6000);
  }
  function hideToast() { el('sound-toast').hidden = true; clearTimeout(toastTimer); }
  function showSaved() { saved.hidden = false; clearTimeout(savedTimer); savedTimer = setTimeout(hideSaved, 6000); }
  function hideSaved() { saved.hidden = true; clearTimeout(savedTimer); }
  function renderTransport() {
    const clip = playing?.what === 'clip' && !(selection && playing.from === selection[0] && playing.to === selection[1]);
    const label = (id: string, on: boolean) => { const b = el(id); b.innerHTML = `${icon(on ? ICONS.stop : ICONS.play, 16, true)}<span>${on ? 'Stop' : 'Play'}</span>`; b.setAttribute('aria-pressed', String(on)); };
    label('sound-play', clip); label('song-play', playing?.what === 'song'); label('sound-effect-play', playing?.what === 'effect');
    if (mode === 'library' && !el('sound-library').hidden) renderLibrary();
  }

  // ── Controls ──
  el('sound-done').addEventListener('click', () => void done());
  el('sound-undo').addEventListener('click', () => stepBack()); el('sound-redo').addEventListener('click', () => stepBack(true));
  el('sound-toast-undo').addEventListener('click', () => stepBack());
  el('sound-new').addEventListener('click', openSheet); el('sound-sheet-close').addEventListener('click', closeMenus);
  dialog.querySelectorAll<HTMLElement>('[data-new]').forEach(b => b.addEventListener('click', () => begin(b.dataset.new as 'record' | 'library')));
  dialog.querySelectorAll<HTMLElement>('[data-sound-card]').forEach(b => b.addEventListener('click', () => cardAction(b.dataset.soundCard!, el('sound-card-menu').dataset.sound!)));
  dialog.querySelectorAll<HTMLElement>('[data-tune]').forEach(b => b.addEventListener('click', () => applyTune(b.dataset.tune as Tune)));
  el<HTMLInputElement>('sound-name').addEventListener('change', () => {
    const d = draft(), name = el<HTMLInputElement>('sound-name').value.trim().slice(0, 48);
    if (!d || !name || name === d.name) { el<HTMLInputElement>('sound-name').value = d?.name ?? ''; return; }
    remember(); replace({ ...d, name }); render();
  });
  el('sound-play').addEventListener('click', () => { if (playing?.what === 'clip') { stop(); playhead = null; drawWave(); } else play(samples(), 'clip'); });
  el('sound-play-part').addEventListener('click', () => { if (selection) play(samples(), 'clip', selection[0], selection[1]); });
  el('sound-select-all').addEventListener('click', () => { selection = [0, samples().length]; renderClip(); });
  el('sound-record-again').addEventListener('click', () => { stop(); recordTarget = current; el('sound-mic-problem').hidden = true; show('record'); });
  el('sound-zoom-in').addEventListener('click', () => setZoom(zoom * 2)); el('sound-zoom-out').addEventListener('click', () => setZoom(zoom / 2));
  el('sound-record-button').addEventListener('click', () => void startRecording());
  el('sound-mic-retry').addEventListener('click', () => { el('sound-mic-problem').hidden = true; renderRecord(); void startRecording(); });
  el('sound-mic-effect').addEventListener('click', () => begin('effect'));
  el('sound-effect-play').addEventListener('click', () => { if (playing?.what === 'effect') stop(); else play(effectSamples, 'effect'); });
  el('sound-effect-another').addEventListener('click', () => { effect = { ...effect, seed: effect.seed + 1 + Math.floor(Math.random() * 1000) }; setEffect(); });
  el('sound-effect-add').addEventListener('click', () => {
    const kind = EFFECTS.find(e => e.id === effect.kind)!, id = identity(), name = uniqueName(kind.name);
    // An effect as designed is kept as a library reference, so it costs the project nothing; changing it later bakes it in.
    const designed = JSON.stringify(effect) === JSON.stringify(defaultEffect(kind.id));
    add({ id, name, kind: 'clip', samples: effectSamples, song: null, source: designed ? { ...librarySound(kind.id, id), name } : null, edited: !designed, made: 'effect' });
  });
  el('song-play').addEventListener('click', () => { const s = song(); if (!s) return; if (playing?.what === 'song') stop(); else play(synthesize(s), 'song', 0, undefined, s); });
  el<HTMLInputElement>('song-speed').addEventListener('input', () => { el('song-speed-label').textContent = `${el<HTMLInputElement>('song-speed').value} beats a minute`; });
  el<HTMLInputElement>('song-speed').addEventListener('change', () => setSong(s => ({ ...s, tempo: Number(el<HTMLInputElement>('song-speed').value) }), el('song-speed')));
  el('song-shorter').addEventListener('click', () => setSong(s => resize(s, s.beats > 4 ? Math.ceil(s.beats / 4) * 4 - 4 : Math.max(1, s.beats - 1)), el('song-shorter')));
  el('song-longer').addEventListener('click', () => setSong(s => resize(s, Math.min(64, Math.floor(s.beats / 4) * 4 + 4)), el('song-longer')));
  dialog.querySelectorAll<HTMLElement>('[data-instrument]').forEach(b => b.addEventListener('click', () => { instrument = b.dataset.instrument as Instrument; renderSong(); }));
  dialog.querySelectorAll<HTMLElement>('[data-length]').forEach(b => b.addEventListener('click', () => { noteLength = Number(b.dataset.length); renderSong(); }));
  el('song-octave-down').addEventListener('click', () => { octave = Math.max(1, octave - 1); renderSong(); });
  el('song-octave-up').addEventListener('click', () => { octave = Math.min(6, octave + 1); renderSong(); });
  el('song-sharps').addEventListener('click', () => { sharps = !sharps; renderSong(); });
  dialog.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement;
    if (!target.closest('.paint-menu, .paint-popover, .sound-card-more, #sound-new')) closeMenus();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!el('sound-card-menu').hidden || !el('sound-sheet').hidden) { closeMenus(); return; }
    if (mode === 'effect' || (mode === 'record' && !recording)) { show(current ? kindMode() : 'empty'); return; }
    void done();
  });
  dialog.addEventListener('keydown', event => {
    const target = event.target as HTMLElement;
    if (target.matches('input:not([type=range])')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); stepBack(event.shiftKey); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); stepBack(true); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === ' ' && !target.matches('button, input')) { event.preventDefault(); if (playing) stop(); else if (mode === 'clip') play(samples(), 'clip', ...(selection ?? [0, samples().length])); else if (mode === 'song') el('song-play').click(); else if (mode === 'effect') play(effectSamples, 'effect'); return; }
    if (mode === 'clip' && selection && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); applyTune('cut'); }
  });
  saved.querySelector('button')!.addEventListener('click', () => { hideSaved(); workspace.undo(false); });
  const resized = new ResizeObserver(() => { drawWave(); drawEffect(); }); resized.observe(el('sound-main'));

  // "Edit sounds" in the palette's Sounds blocks, and "New sound…" in a sound block's menu.
  workspace.registerButtonCallback('PB_EDIT_SOUNDS', () => open());
  SceneReferenceField.newSound = field => open({ create: 'menu', pick: id => field.setValue(id) });

  return {
    open,
    get isOpen() { return dialog.open; },
    close,
    dispose() { close(); resized.disconnect(); SceneReferenceField.newSound = null; dialog.remove(); saved.remove(); void context?.close(); },
  };
}

/** The Sprite tab's list of the project's sounds: play any of them, or open one in the editor. */
export function installSoundList(workspace: Blockly.WorkspaceSvg, after: HTMLElement, edit: (sound?: string) => void) {
  after.insertAdjacentHTML('afterend', `<section class="sprite-sounds" aria-labelledby="sprite-sounds-title"><div class="sprite-sounds-head"><h3 id="sprite-sounds-title">Sounds</h3><button id="sound-open" class="button secondary">Edit sounds</button></div>
    <ul id="sprite-sound-list" class="sprite-sound-list"></ul><p id="sprite-sound-empty" class="tab-note">No sounds yet. Edit sounds to record your voice, make an effect or write a song.</p></section>`);
  const list = document.getElementById('sprite-sound-list')!, empty = document.getElementById('sprite-sound-empty')!;
  let context: AudioContext | null = null, source: AudioBufferSourceNode | null = null, playingId: string | null = null, scheduled = 0, last = '';
  document.getElementById('sound-open')!.addEventListener('click', () => edit());
  function stop() { if (source) { source.onended = null; try { source.stop(); } catch { /* ended */ } source = null; } playingId = null; render(true); }
  function play(sound: Sound) {
    const was = playingId; stop(); if (was === sound.id) return;
    context ??= new AudioContext(); if (context.state === 'suspended') void context.resume();
    const samples = soundSamples(sound), buffer = context.createBuffer(1, samples.length, SOUND_RATE);
    buffer.copyToChannel(new Float32Array(samples), 0); source = context.createBufferSource(); source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = 0.8; source.connect(gain); gain.connect(context.destination); source.start();
    playingId = sound.id; source.onended = () => { source = null; playingId = null; render(true); }; render(true);
  }
  function render(force = false) {
    const sounds = sceneState(workspace).sounds ?? [], key = JSON.stringify(sounds.map(s => [s.id, s.name, s.kind === 'clip' ? s.stock ?? s.data!.length : s.beats])) + playingId;
    if (!force && key === last) return; last = key;
    empty.hidden = sounds.length > 0;
    list.replaceChildren(...sounds.map(sound => {
      const item = document.createElement('li'), playButton = document.createElement('button'), name = document.createElement('button');
      playButton.type = 'button'; playButton.className = 'button secondary sprite-sound-play'; playButton.setAttribute('aria-label', `${playingId === sound.id ? 'Stop' : 'Play'} ${sound.name}`);
      playButton.innerHTML = icon(playingId === sound.id ? ICONS.stop : ICONS.play, 16, true); playButton.addEventListener('click', () => play(sound));
      const length = sound.kind === 'clip' ? (soundSamples(sound).length / SOUND_RATE).toFixed(1) + ' s' : `${sound.beats} beats`;
      name.type = 'button'; name.className = 'sprite-sound-name'; name.innerHTML = '<strong></strong><span></span>';
      name.querySelector('strong')!.textContent = sound.name; name.querySelector('span')!.textContent = `${sound.kind === 'song' ? 'Song' : 'Sound'} · ${length}`;
      name.setAttribute('aria-label', `Edit ${sound.name}`); name.addEventListener('click', () => edit(sound.id));
      item.append(playButton, name); return item;
    }));
  }
  const changed = (event: Blockly.Events.Abstract) => { if (event.isUiEvent) return; cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(() => render()); };
  workspace.addChangeListener(changed); render();
  return { refresh: () => render(true), stop, dispose() { workspace.removeChangeListener(changed); stop(); void context?.close(); document.querySelector('.sprite-sounds')?.remove(); } };
}
