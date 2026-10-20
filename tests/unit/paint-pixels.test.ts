import { describe, expect, it } from 'vitest';
import { blocky, contentBox, downsample, fillMask, floodMask, lineCells, rgba, shapeCells, type Pixels } from '../../src/scene/paint-pixels';

const image = (width: number, height: number): Pixels => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
const set = (img: Pixels, x: number, y: number, c: number[]) => img.data.set(c, (y * img.width + x) * 4);
const get = (img: Pixels, x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));

describe('paint pixels', () => {
  it('flood fills a connected area inside an outline, not across it or through diagonals', () => {
    const img = image(7, 7);
    for (const [x, y] of shapeCells({ x: 1, y: 1, width: 5, height: 5 }, 'rect', false)) set(img, x, y, [0, 0, 0, 255]);
    const inside = floodMask(img, 3, 3);
    expect(inside.reduce((n, v) => n + v, 0)).toBe(9); // the 3 × 3 middle
    expect(inside[0]).toBe(0);
    const outside = floodMask(img, 0, 0); expect(outside[3 * 7 + 3]).toBe(0); expect(outside.reduce((n, v) => n + v, 0)).toBe(49 - 25);
  });

  it('matches near colours within the tolerance, so smooth art fills without gaps', () => {
    const img = image(4, 1); set(img, 0, 0, [200, 0, 0, 255]); set(img, 1, 0, [210, 10, 5, 255]); set(img, 2, 0, [60, 0, 0, 255]); set(img, 3, 0, [200, 0, 0, 255]);
    expect(Array.from(floodMask(img, 0, 0, 0))).toEqual([1, 0, 0, 0]);
    expect(Array.from(floodMask(img, 0, 0, 16))).toEqual([1, 1, 0, 0]);
  });

  it('fills solid, fades down, and slips the fill under half-transparent edge pixels', () => {
    const img = image(3, 4); set(img, 2, 0, [0, 0, 0, 128]);
    const mask = floodMask(img, 0, 0); expect(mask[2]).toBe(0);
    fillMask(img, mask, rgba('#204080'), 'down');
    expect(get(img, 0, 0)).toEqual([32, 64, 128, 255]);
    const bottom = get(img, 0, 3); expect(bottom[0]).toBeGreaterThan(150); expect(bottom[3]).toBe(255); // lighter towards the bottom
    const edge = get(img, 2, 0); expect(edge[3]).toBe(255); expect(edge[0]).toBeLessThan(32); // dark edge over the fill
  });

  it('gives pixel-art lines and shapes whole cells', () => {
    expect(lineCells(0, 0, 3, 0)).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(lineCells(1, 1, 1, 1, 2)).toEqual([[1, 1], [2, 1], [1, 2], [2, 2]]);
    expect(shapeCells({ x: 0, y: 0, width: 3, height: 3 }, 'rect', true)).toHaveLength(9);
    expect(shapeCells({ x: 0, y: 0, width: 3, height: 3 }, 'rect', false)).toHaveLength(8);
    const ring = shapeCells({ x: 0, y: 0, width: 9, height: 9 }, 'ellipse', false);
    expect(ring.some(([x, y]) => x === 4 && y === 4)).toBe(false); expect(ring.some(([x, y]) => x === 4 && y === 0)).toBe(true);
  });

  it('stores blocky art at 1× and finds the drawing on the canvas', () => {
    const img = image(4, 4);
    for (const [x, y] of [[2, 0], [3, 0], [2, 1], [3, 1]]) set(img, x, y, [9, 9, 9, 255]);
    expect(blocky(img, 2)).toBe(true);
    expect(downsample(img, 2)).toMatchObject({ width: 2, height: 2 }); expect(Array.from(downsample(img, 2).data.slice(4, 8))).toEqual([9, 9, 9, 255]);
    set(img, 0, 3, [1, 1, 1, 255]); expect(blocky(img, 2)).toBe(false);
    expect(contentBox(img)).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(contentBox(image(3, 3))).toBeNull();
  });
});
