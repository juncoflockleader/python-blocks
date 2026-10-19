import { describe, expect, it } from 'vitest';
// Painting itself is covered by paint-pixels.test.ts and the Paint editor browser tests.
import { removeAsset } from '../../src/scene/assets';
import { emptyScene, validateScene, type SceneState } from '../../src/scene/model';
function asset(id: string, width = 1, height = 1) {
  const bytes = Buffer.alloc(24); bytes.set([137,80,78,71,13,10,26,10]); bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return { id, name: id, width, height, data: 'data:image/png;base64,' + bytes.toString('base64') };
}
const state = (): SceneState => ({ ...emptyScene(), backdrop: 'sky', backdrops: [asset('sky', 480, 320)], assets: [asset('frame')], sprites: [{ id: 'actor', name: 'Actor', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'frame', costumes: ['frame', 'bird'], frameSeconds: 0.2 }] });
describe('artwork persistence', () => {
  it('validates backdrop dimensions, IDs, frame references and frame durations', () => {
    expect(() => validateScene(state())).not.toThrow();
    for (const mutate of [(s: SceneState) => { s.backdrop = 'missing'; }, (s: SceneState) => { s.backdrops = [asset('sky', 481, 320)]; }, (s: SceneState) => { s.backdrops = [asset('frame')]; }, (s: SceneState) => { s.sprites[0].costumes = []; }, (s: SceneState) => { s.sprites[0].costumes = ['sky']; }, (s: SceneState) => { s.sprites[0].frameSeconds = 0; }]) { const next = state(); mutate(next); expect(() => validateScene(next)).toThrow(); }
  });
  it('removes artwork atomically, repairs authored starting state and preserves unrelated data', () => {
    const initial = state(); const next = removeAsset(initial, 'costume', 'frame'); validateScene(next);
    expect(next.sprites[0].costume).toBe('bird'); expect(next.sprites[0].costumes).toEqual(['bird']); expect(initial.sprites[0].costume).toBe('frame');
    const noBackdrop = removeAsset(next, 'backdrop', 'sky'); validateScene(noBackdrop); expect(noBackdrop.backdrop).toBeNull(); expect(noBackdrop.backdrops).toEqual([]);
    expect(() => removeAsset(initial, 'costume', 'bird')).toThrow('Built-in');
  });
});
