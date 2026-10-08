import { describe, expect, it } from 'vitest';
import { Raster, hexColor, type Color } from '../../src/scene/raster';
import { removeAsset } from '../../src/scene/assets';
import { emptyScene, validateScene, type SceneState } from '../../src/scene/model';
const red: Color = [255, 0, 0, 255], blue: Color = [0, 0, 255, 255], clear: Color = [0, 0, 0, 0];

describe('raster editing', () => {
  it('fills connected pixels without crossing a shape boundary or diagonals', () => {
    const r = new Raster(7, 7); r.shape({ x: 1, y: 1, width: 5, height: 5 }, 'rectangle', red, false, 1); r.fill(2, 2, blue);
    expect(r.color(0, 0)).toEqual(clear); expect(r.color(1, 1)).toEqual(red); expect(r.color(4, 4)).toEqual(blue);
    const corners = new Raster(2, 2); corners.set(0, 1, red); corners.set(1, 0, red); corners.fill(0, 0, blue); expect(corners.color(1, 1)).toEqual(clear);
    r.fill(2, 2, blue); expect(r.color(3, 3)).toEqual(blue);
  });
  it('draws continuous strokes and erases pixels to transparency', () => {
    const r = new Raster(20, 20); r.line(1, 1, 18, 18, red, 1);
    for (let i = 1; i <= 18; i++) expect(r.color(i, i)).toEqual(red);
    r.line(9, 9, 11, 11, clear, 3); expect(r.color(10, 10)).toEqual(clear); expect(r.color(8, 8)).toEqual(red);
    r.shape({ x: 2, y: 2, width: 5, height: 5 }, 'ellipse', blue, true, 1); expect(r.color(4, 4)).toEqual(blue); expect(r.color(2, 2)).toEqual(red);
    const even = new Raster(4, 4); even.line(1, 1, 1, 1, red, 2); expect(even.color(2, 2)).toEqual(red); expect(even.color(0, 0)).toEqual(clear);
  });
  it('moves overlapping selections from a snapshot and preserves other pixels', () => {
    const r = new Raster(5, 2); r.set(0, 0, red); r.set(1, 0, blue); r.set(4, 1, red);
    r.move({ x: 0, y: 0, width: 2, height: 1 }, 1, 0);
    expect(r.color(0, 0)).toEqual(clear); expect(r.color(1, 0)).toEqual(red); expect(r.color(2, 0)).toEqual(blue); expect(r.color(4, 1)).toEqual(red);
  });
  it('flips and rotates only the chosen region with deterministic pixel orientation', () => {
    const r = new Raster(3, 3); for (let i = 0; i < 9; i++) r.set(i % 3, Math.floor(i / 3), [i + 1, 0, 0, 255]);
    r.transform(r.all(), 'rotate'); expect([...r.pixels].filter((_, i) => i % 4 === 0)).toEqual([7, 4, 1, 8, 5, 2, 9, 6, 3]);
    r.transform({ x: 0, y: 0, width: 2, height: 1 }, 'flip-x'); expect(r.color(0, 0)[0]).toBe(4); expect(r.color(2, 0)[0]).toBe(1);
    r.transform(r.all(), 'flip-y'); expect(r.color(0, 0)[0]).toBe(9);
  });
  it('distinguishes canvas resize from image scale and owns independent pixel snapshots', () => {
    const r = new Raster(2, 1); r.set(0, 0, red); r.set(1, 0, blue);
    const cropped = r.resize(4, 2, false), scaled = r.resize(4, 2, true);
    expect(cropped.color(2, 0)).toEqual(clear); expect(scaled.color(1, 1)).toEqual(red); expect(scaled.color(2, 1)).toEqual(blue);
    const copy = r.copy(); copy.clear(); expect(r.color(0, 0)).toEqual(red);
    expect(() => r.resize(481, 320, true)).toThrow(); expect(() => new Raster(1.5, 2)).toThrow(); expect(hexColor('#20abef')).toEqual([32, 171, 239, 255]);
  });
});

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
