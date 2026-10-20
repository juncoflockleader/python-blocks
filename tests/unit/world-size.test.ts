import { describe, expect, it } from 'vitest';
import { emptyScene, validateScene, type SceneState } from '../../src/scene/model';
import { resizeWorld, screenLimits, worldBounds, worldScreens } from '../../src/scene/world-size';
import { newMap } from '../../src/scene/world';

const sprite = (id: string, x: number, y: number, world?: string) => ({ id, name: id, x, y, direction: 0, size: 100, layer: 0, visible: true, costume: 'bird', ...(world ? { world } : {}) });
function withWorld(columns: number, rows: number, tileSize = 16): SceneState {
  const scene = emptyScene();
  scene.worlds = [{ id: 'meadow', name: 'Meadow', background: '#bee3ed', map: newMap(columns, rows, tileSize), camera: { x: 0, y: 0, follow: null, clamp: true } }];
  scene.world = 'meadow';
  return scene;
}

describe('worlds sized in screens', () => {
  it('measure the plain stage as one screen and maps by their pixels', () => {
    expect(worldScreens(emptyScene())).toEqual({ wide: 1, tall: 1 });
    expect(worldBounds(emptyScene())).toEqual({ left: -240, top: 160, width: 480, height: 320 });
    expect(worldScreens(withWorld(40, 10, 32))).toEqual({ wide: 3, tall: 1 }); // 1280 px is 2.7 screens
    expect(screenLimits(withWorld(30, 20, 16))).toEqual({ wide: 8, tall: 12 });
    expect(screenLimits(withWorld(15, 10, 32))).toEqual({ wide: 8, tall: 12 });
    expect(screenLimits(withWorld(60, 40, 8))).toEqual({ wide: 4, tall: 6 });
  });

  it('turn the plain stage into a world when it grows, keeping its look, camera and sprites', () => {
    const scene = emptyScene(); scene.background = '#22394a'; scene.sprites = [sprite('hero', 100, 50)];
    const grown = resizeWorld(scene, 3, 2);
    expect(grown.worlds).toHaveLength(1);
    const world = grown.worlds![0];
    expect(grown.world).toBe(world.id); expect(world.name).toBe('Main world'); expect(world.background).toBe('#22394a');
    expect([world.map.columns * world.map.tileSize, world.map.rows * world.map.tileSize]).toEqual([1440, 640]);
    expect(grown.sprites[0]).toEqual(scene.sprites[0]);
    expect(() => validateScene(grown)).not.toThrow();
    expect(resizeWorld(scene, 1, 1)).toEqual(scene);
  });

  it('keep the top-left tiles and move only the sprites left beyond the new edges', () => {
    const scene = withWorld(90, 40); // 3 × 2 screens of 16 px tiles
    scene.worlds![0].map.tiles[0] = 'box';
    scene.sprites = [sprite('near', -200, 140, 'meadow'), sprite('far', 900, -400, 'meadow'), sprite('global', 900, -400)];
    const smaller = resizeWorld(scene, 2, 1);
    expect(smaller.worlds![0].map.columns).toBe(60); expect(smaller.worlds![0].map.rows).toBe(20);
    expect(smaller.worlds![0].map.tiles[0]).toBe('box');
    expect(smaller.sprites.find(s => s.id === 'near')).toMatchObject({ x: -200, y: 140 });
    expect(smaller.sprites.find(s => s.id === 'far')).toMatchObject({ x: 696, y: -136 });
    // With one world, global sprites live in it too and move with it.
    expect(smaller.sprites.find(s => s.id === 'global')).toMatchObject({ x: 696, y: -136 });
    expect(() => validateScene(smaller)).not.toThrow();
    // Global sprites belong to every world, so with several worlds one world's size never moves them.
    scene.worlds!.push({ ...structuredClone(scene.worlds![0]), id: 'cave', name: 'Cave' });
    expect(resizeWorld(scene, 2, 1).sprites.find(s => s.id === 'global')).toMatchObject({ x: 900, y: -400 });
  });

  it('refuse sizes below one screen or beyond what the tiles allow', () => {
    expect(() => resizeWorld(withWorld(30, 20), 0, 1)).toThrow('at least one screen');
    expect(() => resizeWorld(withWorld(30, 20), 9, 1)).toThrow('up to 8 screens wide');
    expect(() => resizeWorld(withWorld(60, 40, 8), 5, 1)).toThrow('up to 4 screens wide');
    expect(resizeWorld(withWorld(30, 20), 8, 1).worlds![0].map.columns).toBe(240);
  });
});
