import type * as Blockly from 'blockly/core';
import { SoundPlayer } from '../runtime/audio';
import { changeScene, sceneState } from './state';
import { decodeWave, defaultSoundSettings, encodeWave, instruments, SOUND_RATE, synthesizeTone, validateSounds, type Instrument, type Sound } from './sound';

export class SoundEditor {
  readonly dialog = document.createElement('dialog');
  private player = new SoundPlayer();
  private draft: Sound | null = null;
  private baseline: string | undefined;
  private history: Sound[] = [];
  private epoch = 0;
  private busy = false;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recordTimer?: ReturnType<typeof setTimeout>;
  private page = 0;
  private disposed = false;
  constructor(private workspace: Blockly.Workspace) {
    this.dialog.className = 'sound-editor'; this.dialog.setAttribute('aria-labelledby', 'sound-title');
    this.dialog.innerHTML = `<header><h2 id="sound-title">Sounds & music</h2><button id="sound-close" class="button secondary">Close</button></header>
      <p>Make a sound, record your voice, or write a melody. Apply saves one project edit; Undo in the workspace restores it.</p>
      <div class="sound-toolbar"><label>Saved sounds <select id="sound-list"><option value="">Choose a sound</option></select></label><button id="sound-new" class="button secondary">New tone</button><button id="song-new" class="button secondary">New song</button><button id="sound-import" class="button secondary">Import audio</button><input id="sound-file" type="file" accept="audio/*" hidden><button id="sound-record" class="button secondary">Record microphone</button><button id="sound-record-stop" class="button secondary" disabled>Finish recording</button></div>
      <p id="sound-notice" role="status">Audio stays in this browser and your saved project. Clips: up to 60 seconds, mono. Songs: up to 64 beats.</p>
      <div id="sound-draft" hidden><div class="sound-toolbar"><label>Name <input id="sound-name" maxlength="48"></label><button id="sound-preview" class="button secondary">Preview</button><button id="sound-preview-stop" class="button secondary">Stop preview</button><button id="sound-undo" class="button secondary">Undo edit</button><button id="sound-copy" class="button secondary">Duplicate</button><button id="sound-delete" class="button secondary">Delete saved sound</button></div>
      <section id="sound-wave-section" aria-label="Waveform editor"><canvas id="sound-wave" width="640" height="160" aria-label="Sound waveform; use selection fields below to choose a range"></canvas><p id="sound-duration"></p><div class="sound-toolbar"><label>Selection start (seconds) <input id="sound-from" type="number" min="0" step=".01" value="0"></label><label>Selection end (seconds) <input id="sound-to" type="number" min="0" step=".01"></label><button id="sound-select-all" class="button secondary">Select all</button></div><div class="sound-toolbar">${['Trim to selection', 'Reverse', 'Fade in', 'Fade out', 'Louder', 'Quieter', 'Normalize'].map((label, i) => `<button data-wave-edit="${i}" class="button secondary">${label}</button>`).join('')}</div><p>Drag on the waveform or enter a range. Effects change the selection; Preview plays it.</p></section>
      <section id="song-section" aria-label="Song editor" hidden><div class="sound-toolbar"><label>Song tempo (BPM) <input id="song-tempo" type="number" min="30" max="300" value="120"></label><label>Song length (beats) <input id="song-length" type="number" min=".25" max="64" step=".25" value="4"></label><label>Instrument <select id="song-instrument">${instruments.map(i => `<option>${i}</option>`).join('')}</select></label><label>Octave <select id="song-octave">${[0,1,2,3,4,5,6,7,8].map(i => `<option ${i === 4 ? 'selected' : ''}>${i}</option>`).join('')}</select></label><label>Note length (beats) <select id="song-note-length">${[.25,.5,1,2,4].map(i => `<option>${i}</option>`).join('')}</select></label></div><p>Each column is ¼ beat. Click to add/remove a note. Instruments layer together. Arrow keys move; Space or Enter toggles.</p><div class="sound-toolbar"><button id="song-prev" class="button secondary">Previous 4 beats</button><span id="song-page"></span><button id="song-next" class="button secondary">Next 4 beats</button><button id="song-clear" class="button secondary">Clear this instrument</button></div><div id="song-grid-wrap"><div id="song-grid" role="grid" aria-label="Melody notes"></div></div><p id="song-summary"></p></section>
      <div class="sound-toolbar"><button id="sound-apply" class="button primary">Apply sound</button><span>Close discards unapplied changes.</span></div></div>`;
    document.body.append(this.dialog);
    const click = (id: string, action: () => void) => this.el(id).addEventListener('click', () => { try { action(); } catch (error) { this.notice(error); } });
    click('sound-close', () => this.close()); this.dialog.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    click('sound-new', () => this.newClip(synthesizeTone(72, .4, 'sine'), 'My sound'));
    click('song-new', () => { if (this.discard()) this.load({ id: this.identity(), name: 'My song', kind: 'song', tempo: 120, beats: 4, notes: [] }); });
    this.el<HTMLSelectElement>('sound-list').addEventListener('change', () => {
      const sound = sceneState(this.workspace).sounds?.find(s => s.id === this.el<HTMLSelectElement>('sound-list').value);
      if (sound && this.discard()) this.load(sound, JSON.stringify(sound));
      else this.el<HTMLSelectElement>('sound-list').value = this.baseline ? this.draft?.id ?? '' : '';
    });
    click('sound-import', () => this.el('sound-file').click());
    this.el<HTMLInputElement>('sound-file').addEventListener('change', () => { const file = this.el<HTMLInputElement>('sound-file').files?.[0]; this.el<HTMLInputElement>('sound-file').value = ''; if (file && this.discard()) void this.import(file, file.name.replace(/\.[^.]+$/, '').slice(0, 48).trim() || 'Imported sound'); });
    click('sound-record', () => { if (this.discard()) void this.record(); });
    click('sound-record-stop', () => { this.recorder?.stop(); this.releaseMic(); });
    click('sound-preview', () => { void this.preview(); }); click('sound-preview-stop', () => { this.epoch++; this.player.stop(); });
    click('sound-undo', () => { const previous = this.history.pop(); if (previous) { this.player.stop(); this.draft = previous; this.render(); } });
    click('sound-copy', () => { if (this.draft) { this.draft = { ...structuredClone(this.draft), id: this.identity(), name: (this.draft.name + ' copy').slice(0, 48) }; this.baseline = undefined; this.history = []; this.render(); } });
    click('sound-delete', () => {
      if (!this.draft || this.baseline === undefined) return;
      if (!confirm(`Delete “${this.draft.name}”? Blocks that use it will stay unresolved until you restore it.`)) return;
      const next = sceneState(this.workspace); this.checkConflict(next.sounds); next.sounds = next.sounds?.filter(s => s.id !== this.draft!.id); changeScene(this.workspace, next); this.draft = null; this.baseline = undefined; this.list(); this.render();
    });
    click('sound-apply', () => this.apply());
    this.el<HTMLInputElement>('sound-name').addEventListener('change', () => { if (this.draft) this.edit({ ...this.draft, name: this.el<HTMLInputElement>('sound-name').value.trim() }); });
    for (const id of ['sound-from', 'sound-to']) this.el(id).addEventListener('input', () => this.wave());
    click('sound-select-all', () => this.selectAll());
    this.dialog.querySelectorAll<HTMLElement>('[data-wave-edit]').forEach(b => b.addEventListener('click', () => { try { this.waveEdit(Number(b.dataset.waveEdit)); } catch (e) { this.notice(e); } }));
    const wave = this.el<HTMLCanvasElement>('sound-wave'); let start: number | null = null;
    const position = (event: PointerEvent) => { const r = wave.getBoundingClientRect(); return Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)) * this.samples().length / SOUND_RATE; };
    wave.addEventListener('pointerdown', event => { if (this.draft?.kind !== 'clip') return; start = position(event); wave.setPointerCapture(event.pointerId); });
    wave.addEventListener('pointermove', event => { if (start === null) return; const end = position(event); this.el<HTMLInputElement>('sound-from').value = Math.min(start, end).toFixed(3); this.el<HTMLInputElement>('sound-to').value = Math.max(start, end).toFixed(3); this.wave(); });
    wave.addEventListener('pointerup', () => { start = null; }); wave.addEventListener('pointercancel', () => { start = null; });
    for (const id of ['song-tempo', 'song-length']) this.el(id).addEventListener('change', () => {
      if (this.draft?.kind !== 'song') return;
      const beats = Number(this.el<HTMLSelectElement>('song-length').value), tempo = Number(this.el<HTMLInputElement>('song-tempo').value);
      const notes = this.draft.notes.filter(n => n.at < beats).map(n => ({ ...n, beats: Math.min(n.beats, beats - n.at) }));
      try { this.edit({ ...this.draft, tempo, beats, notes }); } catch (error) { this.notice(error); this.render(); }
    });
    for (const id of ['song-instrument', 'song-octave']) this.el(id).addEventListener('change', () => this.grid());
    click('song-prev', () => { this.page = Math.max(0, this.page - 1); this.grid(); });
    click('song-next', () => { this.page++; this.grid(); });
    click('song-clear', () => { if (this.draft?.kind === 'song') this.edit({ ...this.draft, notes: this.draft.notes.filter(n => n.instrument !== this.el<HTMLSelectElement>('song-instrument').value) }); });
    this.player.onChange = () => { this.el('sound-preview-stop').dataset.voices = String(this.player.count); };
  }
  private el<T extends HTMLElement = HTMLElement>(id: string): T { return this.dialog.querySelector<T>('#' + id)!; }
  private notice(message: unknown) { this.el('sound-notice').textContent = message instanceof Error ? message.message : String(message); }
  private identity() { return 'sound_' + crypto.randomUUID().slice(0, 12); }
  private discard() { return !this.draft || JSON.stringify(this.draft) === this.baseline || confirm('Discard the unapplied sound changes?'); }
  open() { if (this.disposed) return; this.list(); this.render(); this.dialog.showModal(); }
  close() { this.epoch++; this.cancelRecording(); this.busy = false; this.player.stop(); this.draft = null; this.history = []; this.baseline = undefined; this.dialog.close(); }
  dispose() { this.close(); this.disposed = true; this.player.dispose(); this.dialog.remove(); }
  private list() {
    const select = this.el<HTMLSelectElement>('sound-list'); select.replaceChildren(new Option('Choose a sound', ''));
    for (const s of sceneState(this.workspace).sounds ?? []) select.add(new Option(s.name + (s.kind === 'song' ? ' · song' : ' · audio'), s.id));
    select.value = this.baseline ? this.draft?.id ?? '' : '';
  }
  private load(sound: Sound, baseline?: string) { this.epoch++; this.cancelRecording(); this.player.stop(); this.draft = structuredClone(sound); this.baseline = baseline; this.history = []; this.page = 0; this.busy = false; this.list(); this.render(); this.notice('Edit your sound, then choose Apply sound to save it.'); }
  private newClip(samples: Float32Array, name: string) { if (this.discard()) this.load({ id: this.identity(), name, kind: 'clip', data: encodeWave(samples) }); }
  private checkConflict(sounds: Sound[] = []) { if (JSON.stringify(sounds.find(s => s.id === this.draft?.id)) !== this.baseline) throw new Error('This sound changed outside the editor. Close and reopen it before applying.'); }
  private apply() {
    if (!this.draft) return;
    const next = sceneState(this.workspace); this.checkConflict(next.sounds);
    const sound = { ...this.draft, name: this.el<HTMLInputElement>('sound-name').value.trim() }; validateSounds([sound]);
    next.sounds = [...(next.sounds ?? []).filter(s => s.id !== sound.id), structuredClone(sound)]; changeScene(this.workspace, next);
    this.draft = sound; this.baseline = JSON.stringify(sound); this.history = []; this.list(); this.render(); this.notice('Sound saved in this project. Workspace Undo restores the previous version.');
  }
  private edit(next: Sound) {
    validateSounds([next]); if (!this.draft) return;
    this.player.stop(); this.history.push(this.draft);
    while (this.history.length > 8 || this.history.reduce((size, s) => size + JSON.stringify(s).length, 0) > 16_000_000) this.history.shift();
    this.draft = next; this.render();
  }
  private render() {
    this.el('sound-draft').hidden = !this.draft; this.el('sound-draft').inert = this.busy; this.el<HTMLButtonElement>('sound-record-stop').disabled = !this.recorder;
    for (const id of ['sound-record', 'sound-import', 'sound-new', 'song-new', 'sound-list']) (this.el(id) as HTMLButtonElement).disabled = this.busy;
    if (!this.draft) return;
    this.el<HTMLInputElement>('sound-name').value = this.draft.name;
    this.el<HTMLButtonElement>('sound-undo').disabled = !this.history.length;
    this.el<HTMLButtonElement>('sound-delete').disabled = this.baseline === undefined;
    this.el('sound-wave-section').hidden = this.draft.kind !== 'clip'; this.el('song-section').hidden = this.draft.kind !== 'song';
    if (this.draft.kind === 'clip') this.selectAll();
    else { this.el<HTMLInputElement>('song-tempo').value = String(this.draft.tempo); this.el<HTMLSelectElement>('song-length').value = String(this.draft.beats); this.grid(); }
  }
  private samples() { return this.draft?.kind === 'clip' ? decodeWave(this.draft.data) : new Float32Array(); }
  private selection(samples: Float32Array): [number, number] {
    const from = Number(this.el<HTMLInputElement>('sound-from').value), to = Number(this.el<HTMLInputElement>('sound-to').value);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > samples.length / SOUND_RATE + .001 || to <= from) throw new Error('Choose a nonempty selection inside the sound.');
    return [Math.floor(from * SOUND_RATE), Math.min(samples.length, Math.ceil(to * SOUND_RATE))];
  }
  private selectAll() { const seconds = this.samples().length / SOUND_RATE; this.el<HTMLInputElement>('sound-from').value = '0'; this.el<HTMLInputElement>('sound-to').value = String(seconds); this.el('sound-duration').textContent = `${seconds.toFixed(2)} seconds · mono audio`; this.wave(); }
  private wave() {
    if (this.draft?.kind !== 'clip') return;
    const samples = this.samples(), canvas = this.el<HTMLCanvasElement>('sound-wave'), ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f6f3fa'; ctx.fillRect(0, 0, 640, 160);
    const from = Number(this.el<HTMLInputElement>('sound-from').value), to = Number(this.el<HTMLInputElement>('sound-to').value), scale = 640 * SOUND_RATE / samples.length;
    ctx.fillStyle = '#ddd0e9'; ctx.fillRect(from * scale, 0, (to - from) * scale, 160); ctx.strokeStyle = '#75528c'; ctx.beginPath();
    for (let x = 0; x < 640; x++) { let lo = 0, hi = 0; for (let i = Math.floor(x / 640 * samples.length); i < (x + 1) / 640 * samples.length; i++) { lo = Math.min(lo, samples[i]); hi = Math.max(hi, samples[i]); } ctx.moveTo(x, 80 - hi * 72); ctx.lineTo(x, 80 - lo * 72); } ctx.stroke();
  }
  private waveEdit(action: number) {
    if (this.draft?.kind !== 'clip') return;
    let samples = this.samples(); const [from, to] = this.selection(samples); const count = to - from;
    if (action === 0) samples = samples.slice(from, to);
    else if (action === 1) samples.set(samples.slice(from, to).reverse(), from);
    else { let peak = 0; if (action === 6) for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
      for (let i = from; i < to; i++) { const gain = action === 2 ? (i - from) / Math.max(1, count - 1) : action === 3 ? (to - 1 - i) / Math.max(1, count - 1) : action === 4 ? 1.25 : action === 5 ? .8 : peak ? .95 / peak : 1; samples[i] = Math.max(-1, Math.min(1, samples[i] * gain)); }
    }
    this.edit({ ...this.draft, data: encodeWave(samples) });
  }
  private grid() {
    if (this.draft?.kind !== 'song') return;
    const song = this.draft, instrument = this.el<HTMLSelectElement>('song-instrument').value as Instrument, octave = Number(this.el<HTMLSelectElement>('song-octave').value);
    this.page = Math.max(0, Math.min(Math.ceil(song.beats / 4) - 1, this.page));
    this.el('song-page').textContent = `Beats ${this.page * 4 + 1}–${Math.min(song.beats, this.page * 4 + 4)}`;
    this.el<HTMLButtonElement>('song-prev').disabled = this.page === 0; this.el<HTMLButtonElement>('song-next').disabled = (this.page + 1) * 4 >= song.beats;
    this.el('song-summary').textContent = `${song.notes.length} notes across ${new Set(song.notes.map(n => n.instrument)).size} instruments · ${(song.beats * 60 / song.tempo).toFixed(1)} seconds`;
    const grid = this.el('song-grid'); grid.replaceChildren();
    const header = document.createElement('div'); header.setAttribute('role', 'row');
    header.append(document.createElement('span'));
    for (let col = 0; col < 16; col++) { const label = document.createElement('span'); label.setAttribute('role', 'columnheader'); label.textContent = String(this.page * 4 + 1 + col / 4); header.append(label); }
    grid.append(header);
    const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    for (let row = 0; row < 12; row++) {
      const pitch = (octave + 1) * 12 + 11 - row, line = document.createElement('div'); line.setAttribute('role', 'row');
      const label = document.createElement('span'); label.setAttribute('role', 'rowheader'); label.textContent = names[11 - row] + octave; line.append(label);
      for (let col = 0; col < 16; col++) {
        const at = this.page * 4 + col / 4, note = song.notes.find(n => n.instrument === instrument && n.pitch === pitch && n.at === at);
        const held = song.notes.some(n => n.instrument === instrument && n.pitch === pitch && n.at < at && n.at + n.beats > at);
        const cell = document.createElement('button'); cell.type = 'button'; cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-label', `${names[11 - row]}${octave}, beat ${at + 1}, ${instrument}`); cell.setAttribute('aria-selected', String(!!note)); cell.textContent = note ? '●' : held ? '—' : '·'; cell.className = col % 4 === 0 ? 'beat-start' : ''; cell.tabIndex = row === 11 && col === 0 ? 0 : -1; cell.disabled = at >= song.beats || pitch < 21 || pitch > 108;
        cell.addEventListener('click', () => {
          const notes = note ? song.notes.filter(n => n !== note) : [...song.notes, { at, beats: Math.min(Number(this.el<HTMLSelectElement>('song-note-length').value), song.beats - at), pitch, instrument, volume: 100 }];
          try { this.edit({ ...song, notes }); this.gridFocus(row, col); } catch (error) { this.notice(error); }
        });
        cell.addEventListener('keydown', event => {
          const d: Record<string, [number, number]> = { ArrowLeft: [0,-1], ArrowRight: [0,1], ArrowUp: [-1,0], ArrowDown: [1,0] };
          if (d[event.key]) { event.preventDefault(); this.gridFocus(Math.max(0, Math.min(11, row + d[event.key][0])), Math.max(0, Math.min(15, col + d[event.key][1]))); }
        }); line.append(cell);
      } grid.append(line);
    }
    if (!grid.querySelector('button:not(:disabled)[tabindex="0"]')) { const first = grid.querySelector<HTMLButtonElement>('button:not(:disabled)'); if (first) first.tabIndex = 0; }
  }
  private gridFocus(row: number, col: number) { const buttons = this.el('song-grid').querySelectorAll<HTMLButtonElement>('button'), target = buttons[row * 16 + col]; if (target.disabled) return; buttons.forEach(b => b.tabIndex = -1); target.tabIndex = 0; target.focus(); }
  private async preview() {
    const epoch = ++this.epoch;
    try {
      const enabling = this.player.enable();
      let sound = this.draft && structuredClone(this.draft); if (!sound) return;
      if (sound.kind === 'clip') { const samples = this.samples(), [from, to] = this.selection(samples); sound.data = encodeWave(samples.slice(from, to)); }
      await enabling; if (epoch !== this.epoch || !this.dialog.open) return;
      this.player.begin([sound], (_id, error) => { if (error) this.notice(error); }); this.player.accept({ type: 'play', id: 1, owner: '$stage', sound: sound.id, settings: defaultSoundSettings() });
    } catch (error) { if (epoch === this.epoch) this.notice(error); }
  }
  private async import(blob: Blob, name: string, epoch = ++this.epoch) {
    this.busy = true; this.render(); this.notice('Decoding audio…');
    try {
      if (blob.size > 10_000_000) throw new Error('Choose an audio file smaller than 10 MB.');
      const context = new OfflineAudioContext(1, 1, SOUND_RATE), audio = await context.decodeAudioData(await blob.arrayBuffer());
      if (epoch !== this.epoch || !this.dialog.open) return;
      if (audio.duration > 60) throw new Error('Choose an audio clip of at most 60 seconds.');
      const samples = new Float32Array(audio.length);
      for (let c = 0; c < audio.numberOfChannels; c++) { const channel = audio.getChannelData(c); for (let i = 0; i < samples.length; i++) samples[i] += channel[i] / audio.numberOfChannels; }
      this.load({ id: this.identity(), name, kind: 'clip', data: encodeWave(samples) });
    } catch (error) { if (epoch === this.epoch) this.notice(error instanceof Error ? error : 'This audio format could not be decoded. Try a WAV, MP3 or Ogg file.'); }
    finally { if (epoch === this.epoch) { this.busy = false; this.render(); } }
  }
  private async record() {
    const epoch = ++this.epoch; this.player.stop(); this.busy = true; this.render(); this.notice('Allow microphone access to start recording. Close cancels the request.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (epoch !== this.epoch || !this.dialog.open) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; const recorder = new MediaRecorder(stream), chunks: Blob[] = []; this.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { this.releaseMic(); this.recorder = null; if (epoch === this.epoch) void this.import(new Blob(chunks, { type: recorder.mimeType }), 'My recording', epoch); };
      recorder.onerror = () => { if (epoch === this.epoch) { this.epoch++; this.cancelRecording(); this.busy = false; this.render(); this.notice('Recording failed. Check your microphone and try again.'); } };
      recorder.start(250); this.recordTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); this.releaseMic(); }, 59_500);
      this.render(); this.notice('Recording… Choose Finish recording when ready (up to 60 seconds).');
    } catch (error) { if (epoch === this.epoch) { this.cancelRecording(); this.busy = false; this.render(); this.notice(`Microphone unavailable. You can still import audio or write a song. ${error instanceof Error ? error.message : ''}`); } }
  }
  private releaseMic() { clearTimeout(this.recordTimer); this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; }
  private cancelRecording() { if (this.recorder) { this.recorder.onstop = null; this.recorder.ondataavailable = null; this.recorder.onerror = null; if (this.recorder.state !== 'inactive') this.recorder.stop(); this.recorder = null; } this.releaseMic(); }
}
