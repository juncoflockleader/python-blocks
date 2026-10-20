import { defaultCamera, newMap, type World } from './world';
import { includeStock, includeStockAsset } from './stock-art';
import type { Piece, Theme } from '../art/tiles';
import type { SceneState } from './model';

export const worldTemplates = [
  { id: 'forest', name: 'Forest trail', description: 'A scrolling woodland with grassy ledges and collectible coins.', backdrop: 'forest', background: '#d7e9c3' },
  { id: 'reef', name: 'Coral reef', description: 'An open underwater scene with a sandy floor and scattered gems.', backdrop: 'reef', background: '#57b4ca' },
  { id: 'city', name: 'City park', description: 'A park with stone steps, flower beds and room for a story.', backdrop: 'city', background: '#bddde6' },
  { id: 'space', name: 'Space station', description: 'Metal platforms and floating gems against a planet-filled sky.', backdrop: 'space', background: '#1c274b' },
] as const;
export type WorldTemplate = typeof worldTemplates[number];

/** Pick each ground tile's piece from its neighbours, so a run of tiles reads as
 * one shape: a one-row ledge is a platform, a ground mass gets a grassy (or
 * snowy, or stone) top and edges only where it is open. The world's border
 * counts as ground below and to the sides, so floors run cleanly off the map. */
export function groundPieces(columns: number, rows: number, themes: (Theme | null)[]) {
  const solid = (c: number, r: number) => c < 0 || c >= columns || r >= rows || (r >= 0 && themes[r * columns + c] !== null);
  return themes.map((theme, i) => {
    if (!theme) return null;
    const c = i % columns, r = Math.floor(i / columns), up = solid(c, r - 1), down = solid(c, r + 1), left = solid(c - 1, r), right = solid(c + 1, r);
    const piece: Piece = !up && !down ? 'platform' : up ? (left && right ? 'middle' : left ? 'right' : right ? 'left' : 'middle')
      : left && right ? 'top' : left ? 'top-right' : right ? 'top-left' : 'block';
    return `stock-${theme}-${piece}`;
  });
}

/** Pure layout, in library picture ids (`stock-grass-top`); the backdrop is a library entry id. */
export function templateLayout(template: WorldTemplate): World {
  const map = newMap(template.id === 'reef' ? 15 : 24, 10, 32), ground: (Theme | null)[] = Array(map.columns * map.rows).fill(null);
  const ledge = (start: number, end: number, row: number, theme: Theme) => { for (let c = start; c <= end; c++) ground[row * map.columns + c] = theme; };
  const thing = (c: number, r: number, art: string) => { map.tiles[r * map.columns + c] = art; };
  const floor: Theme = template.id === 'forest' ? 'grass' : template.id === 'reef' ? 'sand' : template.id === 'city' ? 'castle' : 'metal';
  ledge(0, map.columns - 1, 9, floor);
  if (template.id === 'forest') {
    ledge(5, 8, 7, 'grass'); ledge(12, 15, 5, 'grass'); ledge(19, 22, 7, 'grass');
    for (const [c, r] of [[6, 6], [13, 4], [20, 6]]) thing(c, r, 'stock-coin-1');
    for (const c of [2, 10, 17]) thing(c, 8, 'stock-flower');
  } else if (template.id === 'reef') {
    for (const [c, r] of [[3, 6], [7, 4], [11, 6]]) thing(c, r, 'stock-gem-1');
    ledge(0, 1, 8, 'sand'); ledge(13, 14, 8, 'sand');
  } else if (template.id === 'city') {
    ledge(7, 10, 8, 'castle'); ledge(8, 10, 7, 'castle'); ledge(9, 10, 6, 'castle'); ledge(15, 18, 7, 'grass');
    for (const c of [2, 3, 13, 20, 21]) thing(c, 8, 'stock-flower'); thing(17, 6, 'stock-tree');
  } else {
    ledge(4, 7, 7, 'metal'); ledge(10, 13, 5, 'metal'); ledge(17, 21, 7, 'metal');
    for (const [c, r] of [[5, 6], [11, 4], [19, 6]]) thing(c, r, 'stock-gem-1');
  }
  groundPieces(map.columns, map.rows, ground).forEach((art, i) => { if (art) { map.tiles[i] = art; map.walls[i] = true; } });
  return { id: template.id, name: template.name, background: template.background, backdrop: template.backdrop, map, camera: defaultCamera() };
}

export async function includeWorldTemplate(scene: SceneState, id: string) {
  const template = worldTemplates.find(t => t.id === id);
  if (!template) throw new Error('Choose an available world template.');
  if ((scene.worlds?.length ?? 0) >= 8) throw new Error('This project already has 8 worlds. Remove a world before adding another.');
  const world = templateLayout(template); world.id = crypto.randomUUID();
  const names = new Set(scene.worlds?.map(w => w.name)); let n = 2;
  while (names.has(world.name)) world.name = `${template.name} ${n++}`;
  world.backdrop = await includeStock(scene,'backdrop',template.backdrop);
  for (const id of new Set(world.map.tiles.filter((s): s is string => s !== null))) includeStockAsset(scene, id);
  (scene.worlds ??= []).push(world); scene.world = world.id;
  return world;
}
