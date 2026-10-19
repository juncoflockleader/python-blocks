import { describe, expect, it } from 'vitest';
import { SOUND_RATE, synthesizeTone } from '../../src/scene/sound';
import { SOUND_LIBRARY, librarySound, soundSamples } from '../../src/scene/sound-library';
import { validateScene } from '../../src/scene/model';
import { EFFECTS, MAX_SAMPLES, STEP_SEMITONES, defaultEffect, makeEffect, peaks, pitchShift, resample, trimSilence, tune } from '../../src/scene/sound-edit';

const sine = (hz: number, seconds: number, level = 0.5) => Float32Array.from({ length: Math.round(seconds * SOUND_RATE) }, (_, i) => Math.sin(2 * Math.PI * hz * i / SOUND_RATE) * level);
/** Frequency from rising zero crossings in the middle half, away from the ends. */
function frequency(samples: Float32Array) {
  const from = Math.floor(samples.length / 4), to = Math.floor(samples.length * 3 / 4); let crossings = 0;
  for (let i = from + 1; i < to; i++) if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
  return crossings / ((to - from) / SOUND_RATE);
}

describe('Tune actions', () => {
  it('Higher and Lower change the pitch by a whole step and keep the length', () => {
    const tone = sine(440, 0.6);
    const up = pitchShift(tone, STEP_SEMITONES), down = pitchShift(tone, -STEP_SEMITONES);
    expect(up.length).toBe(tone.length); expect(down.length).toBe(tone.length);
    expect(frequency(up) / 440).toBeCloseTo(2 ** (2 / 12), 1);
    expect(frequency(down) / 440).toBeCloseTo(2 ** (-2 / 12), 1);
    expect(up.every(x => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true);
  });

  it('Faster and Slower resample, so the sound gets shorter and higher or longer and lower', () => {
    const tone = sine(300, 0.8), fast = resample(tone, 1.25), slow = resample(tone, 0.8);
    expect(fast.length).toBe(Math.round(tone.length / 1.25)); expect(slow.length).toBe(Math.round(tone.length / 0.8));
    expect(frequency(fast)).toBeCloseTo(375, -1); expect(frequency(slow)).toBeCloseTo(240, -1);
  });

  it('works on the selected part only, and says what to select afterwards', () => {
    const tone = sine(440, 1), range: [number, number] = [SOUND_RATE * 0.25, SOUND_RATE * 0.75];
    const higher = tune(tone, 'higher', range);
    expect(higher.samples.length).toBe(tone.length); expect(higher.range).toEqual(range);
    expect(Array.from(higher.samples.subarray(0, 1000))).toEqual(Array.from(tone.subarray(0, 1000)));
    const faster = tune(tone, 'faster', range);
    expect(faster.samples.length).toBe(tone.length - SOUND_RATE * 0.5 + Math.round(SOUND_RATE * 0.5 / 1.25));
    expect(faster.range).toEqual([range[0], range[0] + Math.round(SOUND_RATE * 0.5 / 1.25)]);
    const quiet = tune(tone, 'softer', null);
    expect(quiet.range).toBeNull(); expect(Math.max(...quiet.samples)).toBeCloseTo(0.35, 2);
  });

  it('Keep this, Cut it, Reverse, fades and Louder', () => {
    const ramp = Float32Array.from({ length: 1000 }, (_, i) => i / 2000);
    expect(tune(ramp, 'keep', [100, 300]).samples).toEqual(ramp.slice(100, 300));
    const cut = tune(ramp, 'cut', [100, 300]);
    expect(cut.samples.length).toBe(800); expect(cut.samples[100]).toBeCloseTo(ramp[300]);
    expect(() => tune(ramp, 'cut', null)).toThrow('Delete the sound instead');
    expect(tune(ramp, 'reverse', null).samples[0]).toBeCloseTo(ramp[999]);
    const faded = tune(ramp, 'fade-in', null).samples; expect(faded[0]).toBe(0); expect(faded[999]).toBeCloseTo(ramp[999]);
    expect(tune(ramp, 'fade-out', null).samples[999]).toBe(0);
    expect(Math.max(...tune(Float32Array.of(0.9, -0.9), 'louder', null).samples)).toBe(1);
  });

  it('Echo repeats the sound four times, a fifth of a second apart, and Robot keeps the length', () => {
    const click = new Float32Array(SOUND_RATE); click[0] = 1;
    const echoed = tune(click, 'echo', null).samples;
    expect(echoed.length).toBe(SOUND_RATE);
    for (let k = 1; k <= 4; k++) expect(echoed[Math.round(SOUND_RATE * 0.2) * k]).toBeCloseTo(0.5 ** k);
    const short = tune(Float32Array.of(1, 0, 0), 'echo', null).samples;
    expect(short.length).toBe(1 + Math.round(SOUND_RATE * 0.2) * 4);
    expect(tune(sine(220, 0.3), 'robot', null).samples.length).toBe(Math.round(0.3 * SOUND_RATE));
  });

  it('never makes a sound longer than 60 seconds', () => {
    const long = new Float32Array(SOUND_RATE * 50).fill(0.1);
    expect(() => tune(long, 'slower', null)).toThrow('longer than 60 seconds');
    expect(tune(long, 'faster', null).samples.length).toBeLessThanOrEqual(MAX_SAMPLES);
    // An echo's tail is cut at 60 seconds instead.
    const full = new Float32Array(MAX_SAMPLES).fill(0.1); expect(tune(full, 'echo', null).samples.length).toBe(MAX_SAMPLES);
  });
});

describe('recordings and drawing', () => {
  it('trims the quiet start and end, leaving a little air', () => {
    const voice = new Float32Array(SOUND_RATE * 2); voice.set(sine(200, 0.5), SOUND_RATE);
    const { samples, trimmed, quiet } = trimSilence(voice);
    expect(trimmed).toBe(true); expect(quiet).toBe(false);
    expect(samples.length).toBeGreaterThan(SOUND_RATE * 0.5); expect(samples.length).toBeLessThan(SOUND_RATE * 0.7);
    expect(trimSilence(new Float32Array(500))).toMatchObject({ trimmed: false, quiet: true });
    expect(trimSilence(sine(200, 0.2))).toMatchObject({ trimmed: false, quiet: false });
  });

  it('finds the lowest and highest sample for each column', () => {
    const p = peaks(Float32Array.of(0.1, -0.5, 0.2, 0.9), 2);
    expect(Array.from(p)).toEqual([Math.fround(-0.5), Math.fround(0.1), 0, Math.fround(0.9)]);
  });
});

describe('sound effects', () => {
  it('makes every kind as finite, bounded samples, the same each time', () => {
    for (const effect of EFFECTS) {
      const settings = defaultEffect(effect.id), samples = makeEffect(settings);
      expect(samples.length, effect.id).toBeGreaterThan(SOUND_RATE * 0.05);
      expect(samples.every(x => Number.isFinite(x) && Math.abs(x) <= 1), effect.id).toBe(true);
      expect(Math.max(...samples.map(Math.abs)), effect.id).toBeGreaterThan(0.05);
      expect(makeEffect(settings), effect.id).toEqual(samples);
      expect(makeEffect({ ...settings, seed: 2 }), effect.id).not.toEqual(samples);
    }
  });

  it('Length, Pitch and Slide change the sound as their names say', () => {
    const jump = defaultEffect('blip');
    expect(makeEffect({ ...jump, length: 100 }).length).toBeCloseTo(makeEffect(jump).length * 2, -1);
    expect(frequency(makeEffect({ ...jump, pitch: 75, length: 100 }))).toBeGreaterThan(frequency(makeEffect({ ...jump, length: 100 })) * 1.8);
    expect(makeEffect({ ...jump, slide: 100 })).not.toEqual(makeEffect(jump));
    expect(synthesizeTone(60, 0.1, 'sine').length).toBeGreaterThan(0);
  });
});

describe('Library sounds', () => {
  const scene = (sounds: unknown[]) => ({ version: 1, background: '#ffffff', sprites: [], assets: [], sounds });
  it('are references to the effects as designed, made the same every time', () => {
    expect(SOUND_LIBRARY.map(s => s.effect)).toEqual(EFFECTS.map(e => e.id));
    const coin = librarySound('coin');
    expect(coin).toEqual({ id: 'coin', name: 'Coin', kind: 'clip', stock: 'effects/coin@1' });
    expect(Array.from(soundSamples(coin))).toEqual(Array.from(makeEffect(defaultEffect('coin'))));
    expect(() => validateScene(scene([coin, librarySound('win', 'cheer')]))).not.toThrow();
  });
  it('are rejected when unknown, or when they also carry recorded data', () => {
    expect(() => validateScene(scene([{ id: 'x', name: 'X', kind: 'clip', stock: 'effects/kazoo@1' }]))).toThrow(/newer version/);
    expect(() => validateScene(scene([{ id: 'x', name: 'X', kind: 'clip', stock: 'effects/coin@1', data: 'data:audio/wav;base64,AAAA' }]))).toThrow(/known reference/);
    expect(() => validateScene(scene([{ id: 'x', name: 'X', kind: 'clip', stock: '../coin' }]))).toThrow(/known reference/);
    expect(() => soundSamples({ id: 'x', name: 'X', kind: 'clip', stock: 'effects/kazoo@1' })).toThrow(/not available/);
  });
});
