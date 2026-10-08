/** Portable sound assets: canonical mono PCM WAV or an editable note score. */
export const SOUND_RATE = 22050;
export const SOUND_SECONDS = 60;
export const instruments = ['sine', 'triangle', 'square', 'sawtooth', 'kick', 'snare', 'hat'] as const;
export type Instrument = typeof instruments[number];
export interface Note { at: number; beats: number; pitch: number; instrument: Instrument; volume: number }
export interface Clip { id: string; name: string; kind: 'clip'; data: string }
export interface Song { id: string; name: string; kind: 'song'; tempo: number; beats: number; notes: Note[] }
export type Sound = Clip | Song;
export interface SoundSettings { volume: number; pitch: number; pan: number }
export const defaultSoundSettings = (): SoundSettings => ({ volume: 100, pitch: 0, pan: 0 });
const finite = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
export const validSoundSettings = (s: SoundSettings) => !!s && finite(s.volume, 0, 100) && finite(s.pitch, -24, 24) && finite(s.pan, -100, 100);
export function validSong(s: Song): boolean {
  if (!(finite(s.tempo, 30, 300) && finite(s.beats, .25, 64) && s.beats * 60 / s.tempo <= SOUND_SECONDS && Array.isArray(s.notes) && s.notes.length <= 256 && s.notes.every(n => !!n && finite(n.at, 0, s.beats) && finite(n.beats, .0625, 16) && n.at + n.beats <= s.beats && Number.isInteger(n.pitch) && finite(n.pitch, 21, 108) && instruments.includes(n.instrument) && finite(n.volume, 0, 100)))) return false;
  // Bound rendering cost as well as authored event count. Endings precede starts.
  const edges = s.notes.flatMap(n => [[n.at, 1], [n.at + n.beats, -1]]).sort((a,b) => a[0] - b[0] || a[1] - b[1]);
  let voices = 0; return edges.every(([, delta]) => (voices += delta) <= 16);
}
export function validateSounds(sounds: unknown): asserts sounds is Sound[] {
  if (!Array.isArray(sounds) || sounds.length > 24) throw new Error('Use at most 24 sounds and songs.');
  const ids = new Set<string>();
  for (const s of sounds) {
    if (!s || typeof s.id !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(s.id) || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim() || s.name !== s.name.trim() || s.name.length > 48 || /[\x00-\x1f]/.test(s.name)) throw new Error('Sounds need distinct IDs and names of 1–48 characters.');
    if (s.kind === 'clip') decodeWave(s.data);
    else if (s.kind !== 'song' || !validSong(s)) throw new Error('Songs need a tempo of 30–300 BPM, up to 64 beats / 60 seconds and 256 notes (up to 16 simultaneous).');
    ids.add(s.id);
  }
}
export function encodeWave(samples: Float32Array): string {
  if (!samples.length || samples.length > SOUND_RATE * SOUND_SECONDS || samples.some(n => !Number.isFinite(n))) throw new Error('Sounds need finite samples and a duration up to 60 seconds.');
  const bytes = new Uint8Array(44 + samples.length * 2), v = new DataView(bytes.buffer);
  const word = (offset: number, text: string) => [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  word(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SOUND_RATE, true); v.setUint32(28, SOUND_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  word(36, 'data'); v.setUint32(40, samples.length * 2, true);
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 32767), true));
  let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:audio/wav;base64,' + btoa(binary);
}
export function decodeWave(data: string): Float32Array {
  if (typeof data !== 'string' || data.length > 3_529_000 || !/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Use an imported or recorded WAV sound of up to 60 seconds.');
  const bytes = Uint8Array.from(atob(data.slice(22)), c => c.charCodeAt(0)), v = new DataView(bytes.buffer);
  const word = (offset: number, text: string) => [...text].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (bytes.length < 46 || !word(0, 'RIFF') || v.getUint32(4, true) !== bytes.length - 8 || !word(8, 'WAVE') || !word(12, 'fmt ') || v.getUint32(16, true) !== 16 || v.getUint16(20, true) !== 1 || v.getUint16(22, true) !== 1 || v.getUint32(24, true) !== SOUND_RATE || v.getUint32(28, true) !== SOUND_RATE * 2 || v.getUint16(32, true) !== 2 || v.getUint16(34, true) !== 16 || !word(36, 'data') || v.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2 || bytes.length > 44 + SOUND_RATE * SOUND_SECONDS * 2) throw new Error('Invalid sound data. Import it through Sounds to convert it to the project format.');
  return Float32Array.from({ length: (bytes.length - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true) / 32768);
}
/** Deterministic original instruments, mixed at a modest per-note level. */
export function synthesize(song: Pick<Song, 'tempo' | 'beats' | 'notes'>): Float32Array {
  if (!validSong(song as Song)) throw new Error('Invalid melody.');
  return renderSong(song);
}
export function synthesizeTone(pitch: number, seconds: number, instrument: Instrument): Float32Array {
  return renderSong({ tempo: 60, beats: seconds, notes: [{ at: 0, beats: seconds, pitch, instrument, volume: 100 }] });
}
function renderSong(song: Pick<Song, 'tempo' | 'beats' | 'notes'>): Float32Array {
  const samples = new Float32Array(Math.ceil(song.beats * 60 / song.tempo * SOUND_RATE));
  for (const note of song.notes) {
    const start = Math.round(note.at * 60 / song.tempo * SOUND_RATE), duration = note.beats * 60 / song.tempo;
    const length = Math.min(samples.length - start, Math.round(duration * SOUND_RATE)), hz = 440 * 2 ** ((note.pitch - 69) / 12);
    let noise = 1234567 + start;
    for (let i = 0; i < length; i++) {
      const t = i / SOUND_RATE, phase = (t * hz) % 1;
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const random = noise / 2147483648;
      let value: number;
      if (note.instrument === 'kick') value = Math.sin(2 * Math.PI * (48 * t + 10 * (1 - Math.exp(-35 * t)))) * Math.exp(-10 * t);
      else if (note.instrument === 'snare') value = (random * .8 + Math.sin(2 * Math.PI * 180 * t) * .2) * Math.exp(-20 * t);
      else if (note.instrument === 'hat') value = random * Math.exp(-50 * t);
      else if (note.instrument === 'triangle') value = 1 - 4 * Math.abs(phase - .5);
      else if (note.instrument === 'square') value = phase < .5 ? 1 : -1;
      else if (note.instrument === 'sawtooth') value = 2 * phase - 1;
      else value = Math.sin(2 * Math.PI * phase);
      const envelope = Math.min(1, t / .005, (duration - t) / .03);
      samples[start + i] += value * Math.max(0, envelope) * note.volume / 100 * .2;
    }
  }
  return samples.map(x => Math.max(-1, Math.min(1, x)));
}
export type AudioCommand =
  | { type: 'play'; id: number; owner: string; settings: SoundSettings; sound: string }
  | { type: 'tone'; id: number; owner: string; settings: SoundSettings; pitch: number; seconds: number; instrument: Instrument }
  | { type: 'settings'; owner: string; settings: SoundSettings }
  | { type: 'stop'; owner: string | null }
  | { type: 'cancel'; id: number };
export function validAudioCommand(v: unknown): v is AudioCommand {
  if (!v || typeof v !== 'object') return false;
  const c = v as AudioCommand;
  const owner = 'owner' in c && typeof c.owner === 'string' && c.owner.length > 0 && c.owner.length <= 48;
  const identity = 'id' in c && Number.isSafeInteger(c.id) && c.id > 0;
  if (c.type === 'stop') return c.owner === null || owner;
  if (c.type === 'cancel') return identity;
  if (!owner || !validSoundSettings(c.settings)) return false;
  if (c.type === 'settings') return true;
  if (!identity) return false;
  if (c.type === 'play') return typeof c.sound === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(c.sound);
  return c.type === 'tone' && finite(c.seconds, .005, 32) && Number.isInteger(c.pitch) && finite(c.pitch, 21, 108) && instruments.includes(c.instrument);
}
