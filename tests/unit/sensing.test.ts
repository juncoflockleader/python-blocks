import { describe, expect, it } from 'vitest';
import { PixelSensing, type PixelImage } from '../../src/scene/sensing';
import type { SpriteState } from '../../src/scene/model';

const sprite = (values: Partial<SpriteState> = {}): SpriteState => ({ id: 'a', name: 'A', x: 0, y: 0, size: 100, direction: 0, visible: true, layer: 0, costume: 'mask', ...values });
function mask(rows: string[]): PixelImage {
  return { width: rows[0].length, height: rows.length, data: new Uint8ClampedArray(rows.flatMap(row => [...row].flatMap(v => [255, 0, 0, v === '#' ? 255 : v === '+' ? 1 : 0]))) };
}
describe('visible costume pixel sensing', () => {
  it('rejects transparent holes, handles partial alpha and tests actual intersecting pixels', () => {
    const images = { ring: mask(['####', '#..#', '#..#', '####']), dot: mask(['+']) };
    const sensing = new PixelSensing(id => images[id as keyof typeof images]), ring = sprite({ costume: 'ring' }), dot = sprite({ id: 'b', costume: 'dot', x: .5, y: .5 });
    expect(sensing.point(ring, 0, 0)).toBe(false); expect(sensing.point(ring, 1.5, .5)).toBe(true);
    expect(sensing.overlap(ring, dot)).toBe(false); dot.x = 1.5;
    expect(sensing.overlap(ring, dot)).toBe(true); expect(sensing.overlap(dot, ring)).toBe(true);
    expect(sensing.overlap(ring, ring)).toBe(false);
  });
  it('inverts translation, scale, rotation and left/right rotation styles', () => {
    const sensing = new PixelSensing(() => mask(['#...', '....']));
    const actor = sprite({ x: 10, y: 20, size: 200 });
    expect(sensing.point(actor, 7, 21)).toBe(true); expect(sensing.point(actor, 13, 21)).toBe(false);
    actor.direction = 90; expect(sensing.point(actor, 11, 23)).toBe(true); expect(sensing.point(actor, 7, 21)).toBe(false);
    actor.rotationStyle = 'none'; expect(sensing.point(actor, 7, 21)).toBe(true);
    actor.rotationStyle = 'left-right'; actor.direction = 180;
    expect(sensing.point(actor, 13, 21)).toBe(true); expect(sensing.point(actor, 7, 21)).toBe(false);
  });
  it('honors visibility, ghost effects and stage clipping', () => {
    const sensing = new PixelSensing(() => mask(['####', '####', '####', '####']));
    const a = sprite(), b = sprite({ id: 'b' });
    expect(sensing.overlap(a, b)).toBe(true); a.effects = { ghost: 100 };
    expect(sensing.overlap(a, b)).toBe(false); expect(sensing.point(a, 0, 0)).toBe(false);
    a.effects = { ghost: 99 }; expect(sensing.overlap(a, b)).toBe(true);
    a.visible = false; expect(sensing.overlap(a, b)).toBe(false); a.visible = true;
    a.x = b.x = 242; expect(sensing.overlap(a, b)).toBe(false);
    expect(sensing.overlap(a, b, true)).toBe(true); expect(sensing.overlap(a, b, false, { x: 400, y: 0 })).toBe(true); expect(sensing.point(a, 242, 0, false, { x: 400, y: 0 })).toBe(true); expect(sensing.point(a, 242, 0, true)).toBe(true);
    a.x = b.x = 241; expect(sensing.overlap(a, b)).toBe(true); expect(sensing.point(a, 241, 0)).toBe(false);
    a.x = b.x = 0; a.y = b.y = -162; expect(sensing.overlap(a, b)).toBe(false);
  });
  it('refreshes effect masks, caches boundedly and retries missing images', () => {
    let image: PixelImage | undefined; let reads = 0;
    const sensing = new PixelSensing(() => { reads++; return image; }), actor = sprite();
    expect(sensing.point(actor, .5, -.5)).toBe(false); image = mask(['....', '....', '..#.', '....']);
    expect(sensing.point(actor, .5, -.5)).toBe(true); expect(sensing.point(actor, .5, -.5)).toBe(true); expect(reads).toBe(2);
    actor.effects = { mosaic: 1 }; expect(sensing.point(actor, .5, -.5)).toBe(false);
    actor.effects = {}; expect(sensing.point(actor, .5, -.5)).toBe(true);
    for (let color = 1; color < 40; color++) { actor.effects = { color }; sensing.point(actor, 0, 0); }
    actor.effects = {}; const before = reads; sensing.point(actor, 0, 0); expect(reads).toBe(before + 1);
    sensing.reset(); sensing.point(actor, 0, 0); expect(reads).toBe(before + 2);
  });
});
