import { SOUND_RATE, SOUND_SECONDS } from './sound';

/** Sound editing without the page: Tune actions on mono samples, trimming the
 * quiet ends of a recording, waveform peaks, and original sound effects made
 * from a few numbers. Everything works on 22,050 Hz Float32Arrays and returns
 * new arrays, so the editor can keep old ones for Undo. */
export const MAX_SAMPLES = SOUND_RATE * SOUND_SECONDS;
/** Sample indices, from inclusive to exclusive. */
export type Range = [number, number];
export const TUNES = ['higher', 'lower', 'faster', 'slower', 'robot', 'echo', 'louder', 'softer', 'fade-in', 'fade-out', 'reverse', 'keep', 'cut'] as const;
export type Tune = typeof TUNES[number];
/** A tap of Higher or Lower moves this many semitones: enough to hear on the first tap. */
export const STEP_SEMITONES = 2;

const clamp = (x: number) => x > 1 ? 1 : x < -1 ? -1 : x;
function fit(samples: Float32Array) {
  if (samples.length > MAX_SAMPLES) throw new Error('That would make the sound longer than 60 seconds.');
  if (!samples.length) throw new Error('A sound needs something left in it. Delete the sound instead.');
  return samples;
}
function splice(samples: Float32Array, [from, to]: Range, part: Float32Array) {
  const out = new Float32Array(samples.length - (to - from) + part.length);
  out.set(samples.subarray(0, from)); out.set(part, from); out.set(samples.subarray(to), from + part.length);
  return out;
}
/** Read between samples, so slower and faster sound smooth. */
function at(samples: Float32Array, position: number) {
  const i = Math.floor(position), f = position - i;
  if (i < 0 || i >= samples.length) return 0;
  return i + 1 < samples.length ? samples[i] + (samples[i + 1] - samples[i]) * f : samples[i];
}
/** Play faster (factor above 1, shorter and higher) or slower. */
export function resample(samples: Float32Array, factor: number) {
  const out = new Float32Array(Math.max(1, Math.round(samples.length / factor)));
  for (let i = 0; i < out.length; i++) out[i] = at(samples, i * factor);
  return out;
}
/** Make a sound longer or shorter without changing its pitch: 46 ms frames are
 * laid down half overlapping, each taken from near where it belongs in the
 * input at the spot whose wave lines up best with the frame before it, so the
 * waves join without the warble of plain overlap-add. */
export function stretch(samples: Float32Array, factor: number) {
  const size = 1024, hop = size / 2, step = hop / factor, search = 160;
  const length = Math.max(1, Math.round(samples.length * factor));
  const out = new Float32Array(length + size), weight = new Float32Array(length + size), window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size);
  let previous = 0;
  for (let k = 0; k * hop < length; k++) {
    const ideal = Math.round(k * step); let best = ideal;
    if (k > 0) {
      const target = previous + hop; let score = -Infinity;
      for (let d = -search; d <= search; d++) {
        const candidate = ideal + d; if (candidate < 0 || candidate + hop > samples.length) continue;
        let sum = 0; for (let i = 0; i < hop; i += 2) sum += samples[candidate + i] * at(samples, target + i);
        if (sum > score) { score = sum; best = candidate; }
      }
    }
    for (let i = 0; i < size; i++) { const o = k * hop + i; out[o] += at(samples, best + i) * window[i]; weight[o] += window[i]; }
    previous = best;
  }
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) result[i] = weight[i] > 1e-3 ? clamp(out[i] / weight[i]) : 0;
  return result;
}
/** Change pitch but keep the timing: stretch, then play it back faster or slower. */
export function pitchShift(samples: Float32Array, semitones: number) {
  const ratio = 2 ** (semitones / 12), stretched = stretch(samples, ratio), out = new Float32Array(samples.length);
  for (let i = 0; i < out.length; i++) out[i] = at(stretched, i * stretched.length / samples.length);
  return out;
}
/** A metallic robot voice: ring modulation and a very short echo. */
function robot(samples: Float32Array) {
  const out = new Float32Array(samples.length), delay = Math.round(SOUND_RATE * 0.008);
  for (let i = 0; i < out.length; i++) {
    const ring = samples[i] * Math.sin(2 * Math.PI * 50 * i / SOUND_RATE) * 1.6;
    out[i] = clamp(ring + (i >= delay ? out[i - delay] * 0.45 : 0));
  }
  return out;
}
/** Apply a Tune action to the selected part (or the whole sound). Returns the
 * new samples and what to select afterwards. */
export function tune(samples: Float32Array, action: Tune, range: Range | null): { samples: Float32Array; range: Range | null } {
  const [from, to] = range && range[1] > range[0] ? range : [0, samples.length];
  const part = samples.subarray(from, to), whole = from === 0 && to === samples.length;
  const replace = (next: Float32Array) => ({ samples: fit(splice(samples, [from, to], next)), range: whole ? null : [from, from + next.length] as Range });
  const map = (f: (x: number, i: number, n: number) => number) => replace(Float32Array.from(part, (x, i) => clamp(f(x, i, part.length))));
  switch (action) {
    case 'higher': return replace(pitchShift(part, STEP_SEMITONES));
    case 'lower': return replace(pitchShift(part, -STEP_SEMITONES));
    case 'faster': return replace(resample(part, 1.25));
    case 'slower': return replace(resample(part, 0.8));
    case 'robot': return replace(robot(part));
    case 'louder': return map(x => x * 1.4);
    case 'softer': return map(x => x * 0.7);
    case 'fade-in': return map((x, i, n) => x * (n > 1 ? i / (n - 1) : 1));
    case 'fade-out': return map((x, i, n) => x * (n > 1 ? (n - 1 - i) / (n - 1) : 1));
    case 'reverse': return replace(Float32Array.from(part).reverse());
    case 'keep': return { samples: fit(Float32Array.from(part)), range: null };
    case 'cut': {
      if (whole) throw new Error('A sound needs something left in it. Delete the sound instead.');
      return { samples: fit(splice(samples, [from, to], new Float32Array())), range: null };
    }
    case 'echo': {
      // Four repeats, each a fifth of a second later and half as loud, laid over what follows.
      const delay = Math.round(SOUND_RATE * 0.2), repeats = 4;
      let last = part.length - 1; while (last > 0 && Math.abs(part[last]) < 1e-4) last--;
      // A tail that would pass 60 seconds is cut there.
      const out = new Float32Array(Math.min(MAX_SAMPLES, Math.max(samples.length, from + last + 1 + delay * repeats)));
      out.set(samples);
      for (let k = 1; k <= repeats; k++) for (let i = 0; i < part.length && from + i + delay * k < out.length; i++) out[from + i + delay * k] += part[i] * 0.5 ** k;
      for (let i = 0; i < out.length; i++) out[i] = clamp(out[i]);
      return { samples: fit(out), range: whole ? null : [from, Math.min(out.length, to + delay * repeats)] };
    }
  }
}

/** Remove the quiet start and end of a recording, leaving a little air.
 * `quiet` means nothing at all was louder than the threshold. */
export function trimSilence(samples: Float32Array, threshold = 0.02) {
  const pad = Math.round(SOUND_RATE * 0.06);
  let first = 0, last = samples.length - 1;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
  while (last > first && Math.abs(samples[last]) < threshold) last--;
  if (first >= samples.length) return { samples, trimmed: false, quiet: true };
  const from = Math.max(0, first - pad), to = Math.min(samples.length, last + 1 + pad);
  return { samples: from === 0 && to === samples.length ? samples : samples.slice(from, to), trimmed: from > 0 || to < samples.length, quiet: false };
}

/** The lowest and highest sample in each of `columns` slices of [from, to). */
export function peaks(samples: Float32Array, columns: number, from = 0, to = samples.length) {
  const out = new Float32Array(columns * 2), span = (to - from) / columns;
  for (let c = 0; c < columns; c++) {
    const a = Math.floor(from + c * span), b = Math.max(a + 1, Math.floor(from + (c + 1) * span));
    let lo = 0, hi = 0;
    // Very long slices are sampled, so drawing a minute of sound stays quick.
    const stride = Math.max(1, Math.floor((b - a) / 256));
    for (let i = a; i < b && i < samples.length; i += stride) { const x = samples[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
    out[c * 2] = lo; out[c * 2 + 1] = hi;
  }
  return out;
}

// ── Sound effects ────────────────────────────────────────────────────────────
// Original effects worked out from a handful of numbers, in the spirit of the
// classic game-sound makers: a wave, a pitch that slides or steps, an envelope.
type Wave = 'square' | 'saw' | 'triangle' | 'sine' | 'noise';
interface Recipe { wave: Wave; hz: number; seconds: number; slide: number; steps?: number[]; noise?: number; vibrato?: number; decay?: number }
export const EFFECTS: { id: string; name: string; base: Recipe }[] = [
  { id: 'jump', name: 'Jump', base: { wave: 'square', hz: 330, seconds: 0.26, slide: 12 } },
  { id: 'coin', name: 'Coin', base: { wave: 'square', hz: 990, seconds: 0.32, slide: 0, steps: [0, 7] } },
  { id: 'hit', name: 'Hit', base: { wave: 'noise', hz: 160, seconds: 0.2, slide: -14, noise: 0.85 } },
  { id: 'laser', name: 'Laser', base: { wave: 'saw', hz: 1300, seconds: 0.24, slide: -30 } },
  { id: 'powerup', name: 'Power-up', base: { wave: 'square', hz: 400, seconds: 0.62, slide: 10, steps: [0, 4, 7, 12], vibrato: 0.04 } },
  { id: 'pop', name: 'Pop', base: { wave: 'sine', hz: 700, seconds: 0.09, slide: -22 } },
  { id: 'whoosh', name: 'Whoosh', base: { wave: 'noise', hz: 500, seconds: 0.5, slide: 10, noise: 1, decay: 0.6 } },
  { id: 'win', name: 'Win', base: { wave: 'triangle', hz: 523, seconds: 0.8, slide: 0, steps: [0, 4, 7, 12], decay: 0.4 } },
  { id: 'lose', name: 'Lose', base: { wave: 'saw', hz: 392, seconds: 0.9, slide: -3, steps: [0, -4, -7, -12], decay: 0.4 } },
  { id: 'blip', name: 'Blip', base: { wave: 'square', hz: 880, seconds: 0.07, slide: 0 } },
];
export interface EffectSettings { kind: string; pitch: number; length: number; slide: number; seed: number }
export const defaultEffect = (kind = 'jump'): EffectSettings => ({ kind, pitch: 50, length: 50, slide: 0, seed: 1 });
/** A small deterministic random sequence, so "Make another" can be undone and redone exactly. */
function random(seed: number) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0; s ^= s >>> 12; return (s >>> 0) / 4294967296; }; }
/** Turn a kind and the three sliders (0–100, slide −100–100) into samples. */
export function makeEffect(settings: EffectSettings): Float32Array {
  const kind = EFFECTS.find(e => e.id === settings.kind) ?? EFFECTS[0], rand = random(settings.seed * 7919 + kind.id.length);
  // Seed 1 is the kind as designed; other seeds vary it a little.
  const vary = (amount: number) => settings.seed === 1 ? 0 : (rand() * 2 - 1) * amount;
  const hz = kind.base.hz * 2 ** ((settings.pitch - 50) / 25 + vary(0.35));
  const seconds = Math.min(3, kind.base.seconds * 2 ** ((settings.length - 50) / 50 + vary(0.25)));
  const slide = kind.base.slide + settings.slide / 4 + vary(6);   // semitones over the whole sound
  const length = Math.max(1, Math.round(seconds * SOUND_RATE)), out = new Float32Array(length);
  const steps = kind.base.steps, noise = random(settings.seed + 99);
  let phase = 0, held = 0, low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length, time = i / SOUND_RATE;
    const step = steps ? steps[Math.min(steps.length - 1, Math.floor(t * steps.length))] : 0;
    const vibrato = kind.base.vibrato ? Math.sin(2 * Math.PI * 9 * time) * kind.base.vibrato : 0;
    const f = hz * 2 ** ((step + slide * t) / 12 + vibrato);
    const previous = phase; phase = (phase + f / SOUND_RATE) % 1;
    let value: number;
    switch (kind.base.wave) {
      case 'square': value = phase < 0.5 ? 0.6 : -0.6; break;
      case 'saw': value = (2 * phase - 1) * 0.7; break;
      case 'triangle': value = 1 - 4 * Math.abs(phase - 0.5); break;
      case 'sine': value = Math.sin(2 * Math.PI * phase); break;
      default: if (phase < previous) held = noise() * 2 - 1; value = held;
    }
    if (kind.base.noise) {
      // Noise through a low-pass filter whose opening follows the pitch.
      const white = noise() * 2 - 1, k = Math.min(1, f / 4000);
      low += (white - low) * k; value = value * (1 - kind.base.noise) + low * kind.base.noise * 1.6;
    }
    const attack = Math.min(1, time / 0.004), decay = kind.base.decay ? (1 - t) ** (1 / kind.base.decay) : 1 - t;
    out[i] = clamp(value * attack * decay * 0.55);
  }
  return out;
}
