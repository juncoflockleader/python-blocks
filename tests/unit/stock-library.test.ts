import { describe, expect, it } from 'vitest';
import { findStock } from '../../src/scene/stock-art';
import { templateLayout, worldTemplates } from '../../src/scene/world-templates';
import { validMap } from '../../src/scene/world';

describe('stock world layouts', () => {
  it.each(worldTemplates)('$name uses available artwork, valid solid tiles and a safe starting view', template => {
    const world = templateLayout(template);
    const costumes = new Set(world.map.tiles.filter((t): t is string => t !== null));
    for (const id of costumes) expect(findStock('costume', id), id).toBeDefined();
    expect(validMap(world.map,costumes)).toBe(true);
    expect(findStock('backdrop', world.backdrop!)).toBeDefined();
    expect(world.map.walls.some(Boolean)).toBe(true);
    expect(world.map.walls[5 * world.map.columns + 7]).toBe(false);
    expect(world.map.tiles.every((tile,i) => !world.map.walls[i] || tile !== null)).toBe(true);
    const copy = templateLayout(template); copy.map.tiles.fill(null); copy.camera.x=200;
    expect(world.map.tiles.some(Boolean)).toBe(true); expect(world.camera.x).toBe(0);
  });
});
