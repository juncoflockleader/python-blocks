import { decodeWave, synthesize, type Clip, type Sound } from './sound';
import { EFFECTS, defaultEffect, makeEffect } from './sound-edit';

/** Library sounds: the Sound editor's effects as designed (seed 1, middle
 * settings), stored in a project as a reference such as `effects/coin@1` and
 * made from code when played, like library art. The number after @ is the
 * effect's version; a change to how one sounds gets a new version. */
export const SOUND_LIBRARY = EFFECTS.map(e => ({ ref: `effects/${e.id}@1`, effect: e.id, name: e.name }));
const byRef = new Map(SOUND_LIBRARY.map(s => [s.ref, s]));
export const isStockSound = (sound: Sound): sound is Clip & { stock: string } => sound.kind === 'clip' && typeof sound.stock === 'string';
export const knownSound = (reference: string) => byRef.has(reference);

/** A library effect as a project sound, with an id that reads well in Python ("coin"). */
export function librarySound(effect: string, id = effect): Clip {
  const entry = SOUND_LIBRARY.find(s => s.effect === effect); if (!entry) throw new Error('Choose an available library sound.');
  return { id, name: entry.name, kind: 'clip', stock: entry.ref };
}

const made = new Map<string, Float32Array>();
/** The samples of any project sound: a recording, a song, or a library effect. */
export function soundSamples(sound: Sound): Float32Array {
  if (sound.kind === 'song') return synthesize(sound);
  if (!isStockSound(sound)) return decodeWave(sound.data!);
  let samples = made.get(sound.stock); if (samples) return samples;
  const entry = byRef.get(sound.stock); if (!entry) throw new Error('This library sound is not available in this version of Python Blocks.');
  samples = makeEffect(defaultEffect(entry.effect)); made.set(sound.stock, samples); return samples;
}
