import { decodeWave, SOUND_RATE, synthesize, synthesizeTone, validAudioCommand, type AudioCommand, type Sound, type SoundSettings } from '../scene/sound';

export interface AudioHost {
  begin(sounds: Sound[], complete: (id: number, error?: string) => void): void;
  accept(command: AudioCommand): void;
  stop(): void;
}
interface Voice { owner: string; source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode }

/** The worker owns semantics; this host owns actual browser playback and completion. */
export class SoundPlayer implements AudioHost {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices = new Map<number, Voice>();
  private sounds = new Map<string, Sound>();
  private buffers = new Map<string, AudioBuffer>();
  private complete: (id: number, error?: string) => void = () => {};
  private muted = false;
  onChange: () => void = () => {};
  get count() { return this.voices.size; }
  get state() { return this.context?.state ?? 'idle'; }
  get isMuted() { return this.muted; }

  /** Call directly from Run/Preview/Enable audio, before any asynchronous work. */
  async enable(): Promise<void> {
    if (!this.context) {
      this.context = new AudioContext(); this.master = this.context.createGain();
      // Headroom for overlapping voices; no gain ever bypasses the mute control.
      this.master.gain.value = this.muted ? 0 : .5;
      this.master.connect(this.context.destination);
      this.context.onstatechange = () => this.onChange();
    }
    if (this.context.state !== 'running') await this.context.resume();
    this.onChange();
  }
  mute(value: boolean) { this.muted = value; if (this.master && this.context) this.master.gain.setTargetAtTime(value ? 0 : .5, this.context.currentTime, .005); this.onChange(); }
  begin(sounds: Sound[], complete: (id: number, error?: string) => void) {
    this.stop(); this.sounds = new Map(sounds.map(s => [s.id, structuredClone(s)])); this.buffers.clear(); this.complete = complete;
  }
  accept(command: AudioCommand) {
    if (!validAudioCommand(command)) throw new Error('Invalid sound command.');
    if (command.type === 'stop') { for (const [id, v] of this.voices) if (command.owner === null || v.owner === command.owner) this.end(id, true); return; }
    if (command.type === 'cancel') { this.end(command.id, true); return; }
    if (command.type === 'settings') { for (const v of this.voices.values()) if (v.owner === command.owner) this.settings(v, command.settings); return; }
    try {
      if (!this.context || this.context.state !== 'running') throw new Error('Audio is suspended. Click Enable audio, then run again.');
      if (this.voices.size >= 32) throw new Error('Too many overlapping sounds (limit 32). Wait or stop sounds before starting more.');
      if (this.voices.has(command.id)) throw new Error('Duplicate sound playback ID.');
      let buffer = command.type === 'play' ? this.buffers.get(command.sound) : undefined;
      if (!buffer) {
        let samples: Float32Array;
        if (command.type === 'tone') samples = synthesizeTone(command.pitch, command.seconds, command.instrument);
        else {
          const sound = this.sounds.get(command.sound); if (!sound) throw new Error('This sound is unavailable. Choose a sound from Sounds & music.');
          samples = sound.kind === 'clip' ? decodeWave(sound.data) : synthesize(sound);
        }
        buffer = this.context.createBuffer(1, samples.length, SOUND_RATE); buffer.copyToChannel(new Float32Array(samples), 0);
        if (command.type === 'play') { if (this.buffers.size >= 8) this.buffers.delete(this.buffers.keys().next().value!); this.buffers.set(command.sound, buffer); }
      }
      const source = this.context.createBufferSource(), gain = this.context.createGain(), pan = this.context.createStereoPanner();
      source.buffer = buffer; source.connect(gain); gain.connect(pan); pan.connect(this.master!);
      const voice = { owner: command.owner, source, gain, pan }; this.settings(voice, command.settings);
      this.voices.set(command.id, voice); source.onended = () => this.end(command.id, false); source.start(); this.onChange();
    } catch (error) { this.end(command.id, true, false); this.complete(command.id, error instanceof Error ? error.message : String(error)); }
  }
  private settings(v: Voice, s: SoundSettings) {
    const now = this.context!.currentTime;
    v.gain.gain.setTargetAtTime(s.volume / 100, now, .005);
    v.pan.pan.setTargetAtTime(s.pan / 100, now, .005);
    v.source.playbackRate.setValueAtTime(2 ** (s.pitch / 12), now);
  }
  private end(id: number, stop: boolean, notify = true) {
    const v = this.voices.get(id); if (!v) return;
    this.voices.delete(id); v.source.onended = null;
    if (stop) v.source.stop();
    v.source.disconnect(); v.gain.disconnect(); v.pan.disconnect();
    if (notify) this.complete(id); this.onChange();
  }
  stop() { for (const id of this.voices.keys()) this.end(id, true, false); this.complete = () => {}; this.sounds.clear(); this.buffers.clear(); }
  dispose() { this.stop(); if (this.context) { this.context.onstatechange = null; void this.context.close(); } this.context = null; this.master = null; }
}
