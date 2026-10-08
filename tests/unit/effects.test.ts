import { describe, expect, it } from 'vitest';
import { effectPixels, validEffects } from '../../src/scene/effects';
import { defaultPen, emptyScene, isSceneCommand, validateScene } from '../../src/scene/model';

describe('graphic effects', () => {
  it('preserves identity pixels, alpha and source ownership', () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 10, 20, 30, 0, 0, 255, 0, 128, 4, 5, 6, 255]);
    const copy = effectPixels(source, 2, 2, {}); expect(copy).toEqual(source); copy[0] = 0; expect(source[0]).toBe(255);
    expect(Array.from(effectPixels(source, 2, 2, { color: 120, ghost: 50 }).slice(0, 4))).toEqual([0, 255, 0, 128]);
    expect(effectPixels(source, 2, 2, { brightness: 100 })[7]).toBe(0);
    expect(Array.from(effectPixels(source, 2, 2, { brightness: -100 }).slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(effectPixels(source, 2, 2, { ghost: 100 }).filter((_, i) => i % 4 === 3).every(v => v === 0)).toBe(true);
  });

  it('pixelates into shared cells and tiles a costume with mosaic', () => {
    const source = new Uint8ClampedArray(8 * 8 * 4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) source.set([x * 30, y * 30, 0, 255], (y * 8 + x) * 4);
    const pixels = effectPixels(source, 8, 8, { pixelate: 4 });
    expect(Array.from(pixels.slice(0, 4))).toEqual([60, 60, 0, 255]);
    expect(Array.from(pixels.slice(3 * 4, 4 * 4))).toEqual([60, 60, 0, 255]);
    expect(Array.from(pixels.slice(4 * 4, 5 * 4))).toEqual([180, 60, 0, 255]);
    const mosaic = effectPixels(source, 8, 8, { mosaic: 1 });
    expect(mosaic.slice(0, 16)).toEqual(mosaic.slice(16, 32));
    expect(mosaic.slice(0, 128)).toEqual(mosaic.slice(128));
  });

  it('whirl and fisheye remap interior pixels without leaking outside the bitmap', () => {
    const source = new Uint8ClampedArray(17 * 17 * 4);
    for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) source.set([x * 15, y * 15, x + y, 255], (y * 17 + x) * 4);
    for (const effects of [{ whirl: 180 }, { fisheye: 100 }, { fisheye: -100 }, { whirl: -360, fisheye: 1000, mosaic: 15, pixelate: 128 }]) {
      const result = effectPixels(source, 17, 17, effects); expect(result).not.toEqual(source);
      expect(result.filter((_, i) => i % 4 === 3).every(v => v === 255)).toBe(true);
    }
    const fish = effectPixels(source, 17, 17, { fisheye: 100 });
    expect(fish.slice(0, 4)).toEqual(source.slice(0, 4)); // Corners outside the lens are unchanged.
    const center = (8 * 17 + 8) * 4; expect(fish.slice(center, center + 4)).toEqual(source.slice(center, center + 4));
  });

  it('validates authored settings and all ink/effect messages', () => {
    expect(validEffects({ color: 200, whirl: -360, ghost: 100 })).toBe(true);
    for (const value of [null, [], { ghost: 101 }, { color: -1 }, { unknown: 0 }, { brightness: NaN }]) expect(validEffects(value)).toBe(false);
    const sprite = { id: 'bird1', name: 'Bird', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird', pen: defaultPen(), effects: { whirl: 30 } };
    expect(() => validateScene({ ...emptyScene(), sprites: [sprite], effects: { ghost: 50 } })).not.toThrow();
    for (const pen of [{ ...defaultPen(), width: 0 }, { ...defaultPen(), opacity: 101 }, { ...defaultPen(), down: 0 }]) expect(() => validateScene({ ...emptyScene(), sprites: [{ ...sprite, pen }] })).toThrow();
    expect(isSceneCommand({ type: 'stamp', sprite })).toBe(true);
    const line = { type: 'pen_line', x1: 0, y1: 0, x2: 50, y2: 10, color: '#abcdef', width: 12, opacity: 60 };
    expect(isSceneCommand(line)).toBe(true); expect(isSceneCommand({ ...line, width: 0 })).toBe(false); expect(isSceneCommand({ ...line, x2: Infinity })).toBe(false);
    expect(isSceneCommand({ type: 'effects', effects: { ghost: true } })).toBe(false); expect(isSceneCommand({ type: 'pen_clear' })).toBe(true);
  });
});
