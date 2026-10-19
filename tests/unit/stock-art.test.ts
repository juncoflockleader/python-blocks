import { describe, expect, it } from 'vitest';
import { FRAMES } from '../../src/art/cast';
import { LIBRARY, STOCK_ASSETS, STOCK_ENTRIES, stockAsset } from '../../src/art/catalog';
import { emptyScene, isStock, STOCK_LIMITS, validateScene, type SceneState } from '../../src/scene/model';
import { includeStockSet, stockArtwork } from '../../src/scene/stock-art';

const scene = (): SceneState => structuredClone(emptyScene());

describe('library catalogue', () => {
  it('gives every piece of art a unique reference, id, size and licence', () => {
    expect(new Set(STOCK_ASSETS.map(a => a.ref)).size).toBe(STOCK_ASSETS.length);
    expect(new Set(STOCK_ASSETS.map(a => a.id)).size).toBe(STOCK_ASSETS.length);
    for (const a of STOCK_ASSETS) {
      expect(a.ref, a.id).toMatch(/^(cast|props|tiles|backdrops)\/[a-z0-9-]+@\d+$/);
      expect(a.id, a.ref).toMatch(/^stock-[a-z0-9-]{1,40}$/);
      expect(a.license.length, a.ref).toBeGreaterThan(10); expect(a.author, a.ref).toBe('Python Blocks');
      expect(a.width, a.ref).toBeGreaterThan(0); expect(a.height, a.ref).toBeLessThanOrEqual(a.kind === 'costume' ? 256 : 320);
    }
    for (const e of STOCK_ENTRIES) for (const ref of [...e.assets, e.costume, ...(e.frames ?? [])]) expect(stockAsset(ref), `${e.id} ${ref}`).toBeDefined();
  });

  it('has the cast with eight poses each, spinning props, six tile sets and eight backdrops', () => {
    const characters = LIBRARY.filter(e => e.category === 'Characters');
    expect(characters.map(e => e.name)).toEqual(['Fox', 'Cat', 'Rabbit', 'Robot', 'Turtle', 'Bee', 'Fish', 'Sam', 'Ruby']);
    for (const c of characters) { expect(c.assets).toHaveLength(FRAMES.length); expect(c.frames).toHaveLength(4); }
    expect(LIBRARY.find(e => e.id === 'coin')!.frames).toHaveLength(6);
    expect(LIBRARY.filter(e => e.category === 'Tiles').map(e => e.id)).toEqual(['grass-tiles', 'snow-tiles', 'cave-tiles', 'castle-tiles', 'sand-tiles', 'metal-tiles']);
    expect(LIBRARY.filter(e => e.category === 'Backdrops')).toHaveLength(8);
    // The dialog also lists the built-in shapes and backdrops.
    expect(stockArtwork.filter(a => a.builtin).map(a => a.id)).toEqual(['bird', 'star', 'ball', 'box', 'backdrop_meadow', 'backdrop_night']);
  });
});

describe('library art in a project', () => {
  it('is added as references, once each, with the walk cycle as frames', () => {
    const s = scene(), fox = includeStockSet(s, 'costume', 'fox');
    expect(fox.costume).toBe('stock-fox-idle-1'); expect(fox.frames).toEqual(['stock-fox-walk-1', 'stock-fox-walk-2', 'stock-fox-walk-3', 'stock-fox-walk-4']);
    expect(s.assets).toHaveLength(8); expect(s.assets.every(a => isStock(a) && !a.data)).toBe(true);
    expect(s.assets[0]).toEqual({ id: 'stock-fox-idle-1', name: 'Fox idle 1', width: 64, height: 64, stock: 'cast/fox-idle-1@1' });
    includeStockSet(s, 'costume', 'fox'); expect(s.assets).toHaveLength(8);
    expect(includeStockSet(s, 'backdrop', 'cave')).toEqual({ costume: 'stock-cave' }); expect(s.backdrops).toHaveLength(1);
    expect(includeStockSet(s, 'costume', 'bird')).toEqual({ costume: 'bird' });
    s.sprites.push({ id: 'fox', name: 'Fox', x: 0, y: 0, direction: 0, size: 100, layer: 0, visible: true, costume: fox.costume, costumes: fox.frames });
    s.backdrop = 'stock-cave';
    expect(() => validateScene(s)).not.toThrow();
  });

  it('does not count toward the 24 costumes, and only known references of the right size are accepted', () => {
    const s = scene();
    for (const id of ['fox', 'cat', 'rabbit', 'robot']) includeStockSet(s, 'costume', id);
    expect(s.assets).toHaveLength(32); expect(() => validateScene(s)).not.toThrow();
    const unknown = scene(); unknown.assets.push({ id: 'stock-x', name: 'X', width: 64, height: 64, stock: 'cast/dragon-idle-1@1' });
    expect(() => validateScene(unknown)).toThrow('reference this version');
    const resized = scene(); resized.assets.push({ id: 'stock-fox-idle-1', name: 'Fox', width: 32, height: 32, stock: 'cast/fox-idle-1@1' });
    expect(() => validateScene(resized)).toThrow('reference this version');
    const backdrop = scene(); backdrop.assets.push({ id: 'stock-cave', name: 'Cave', width: 480, height: 320, stock: 'backdrops/cave@1' });
    expect(() => validateScene(backdrop)).toThrow();
    const both = scene(); both.assets.push({ id: 'stock-fox-idle-1', name: 'Fox', width: 64, height: 64, stock: 'cast/fox-idle-1@1', data: 'data:image/png;base64,AAAA' });
    expect(() => validateScene(both)).toThrow('reference this version');
    const full = scene(); for (let i = 0; i <= STOCK_LIMITS.costumes; i++) full.assets.push({ id: `stock-${i}`, name: `S${i}`, width: 64, height: 64, stock: 'cast/fox-idle-1@1' });
    expect(() => validateScene(full)).toThrow(`up to ${STOCK_LIMITS.costumes} from the library`);
  });
});
