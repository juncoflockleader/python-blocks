import { describe, expect, it } from 'vitest';
import { findStock } from '../../src/scene/stock-art';
import { groundPieces, templateLayout, worldTemplates } from '../../src/scene/world-templates';
import { stockAssetById } from '../../src/art/catalog';
import { validMap } from '../../src/scene/world';

describe('stock world layouts', () => {
  it.each(worldTemplates)('$name uses available artwork, valid solid tiles and a safe starting view', template => {
    const world = templateLayout(template);
    const costumes = new Set(world.map.tiles.filter((t): t is string => t !== null));
    for (const id of costumes) expect(stockAssetById(id)?.kind, id).toBe('costume');
    expect(validMap(world.map,costumes)).toBe(true);
    expect(findStock('backdrop', world.backdrop!)).toBeDefined();
    expect(world.map.walls.some(Boolean)).toBe(true);
    expect(world.map.walls[5 * world.map.columns + 7]).toBe(false);
    expect(world.map.tiles.every((tile,i) => !world.map.walls[i] || tile !== null)).toBe(true);
    const copy = templateLayout(template); copy.map.tiles.fill(null); copy.camera.x=200;
    expect(world.map.tiles.some(Boolean)).toBe(true); expect(world.camera.x).toBe(0);
  });
  it('joins ground tiles into shapes: tops, edges, platforms and blocks', () => {
    // A floating tile, a ledge that widens into a step, a one-tile column and a floor, in a 6 × 4 map.
    const g = null, G = 'grass' as const;
    const pieces = groundPieces(6, 4, [
      g, g, g, g, g, G,
      G, G, G, g, g, g,
      g, G, G, g, G, g,
      G, G, G, G, G, G,
    ]).map(id => id?.replace('stock-grass-', '') ?? '.');
    expect(pieces).toEqual([
      '.', '.', '.', '.', '.', 'platform',
      'platform', 'top', 'top-right', '.', '.', '.',
      '.', 'left', 'right', '.', 'block', '.',
      'top', 'middle', 'middle', 'top', 'middle', 'top',
    ]);
  });
});
