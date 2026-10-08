import { defaultCamera, newMap, type World } from './world';
import { includeStock } from './stock-art';
import type { SceneState } from './model';

export const worldTemplates = [
  { id: 'forest', name: 'Forest trail', description: 'A scrolling woodland with grassy ledges and collectible coins.', backdrop: 'forest', background: '#d7e9c3' },
  { id: 'reef', name: 'Coral reef', description: 'An open underwater scene with a sandy floor and scattered gems.', backdrop: 'reef', background: '#57b4ca' },
  { id: 'city', name: 'City park', description: 'A park with stone steps, flower beds and room for a story.', backdrop: 'city', background: '#bddde6' },
  { id: 'space', name: 'Space station', description: 'Metal platforms and floating gems against a planet-filled sky.', backdrop: 'space', background: '#1c274b' },
] as const;
export type WorldTemplate = typeof worldTemplates[number];

/** Pure layout: stock IDs are resolved to project asset IDs before saving. */
export function templateLayout(template: WorldTemplate): World {
  const map = newMap(template.id === 'reef' ? 15 : 24, 10, 32);
  const cell = (c: number, r: number, art: string, solid = false) => { map.tiles[r * map.columns + c] = art; map.walls[r * map.columns + c] = solid; };
  const ledge = (start: number, end: number, row: number, art: string) => { for (let c = start; c <= end; c++) cell(c,row,art,true); };
  const floor = template.id === 'forest' ? 'grass' : template.id === 'reef' ? 'sand' : template.id === 'city' ? 'stone' : 'metal';
  ledge(0,map.columns-1,9,floor);
  if (template.id === 'forest') {
    ledge(5,8,7,'grass'); ledge(12,15,5,'grass'); ledge(19,22,7,'grass');
    for(const [c,r] of [[6,6],[13,4],[20,6]]) cell(c,r,'coin');
    for(const c of [2,10,17]) cell(c,8,'flower');
  } else if (template.id === 'reef') {
    for(const [c,r] of [[3,6],[7,4],[11,6]]) cell(c,r,'gem');
    ledge(0,1,8,'sand'); ledge(13,14,8,'sand');
  } else if (template.id === 'city') {
    ledge(7,9,8,'stone'); ledge(8,9,7,'stone'); ledge(9,9,6,'stone'); ledge(15,18,7,'grass');
    for(const c of [2,3,12,20,21]) cell(c,8,'flower'); cell(17,6,'tree');
  } else {
    ledge(4,7,7,'metal'); ledge(10,13,5,'metal'); ledge(17,21,7,'metal');
    for(const [c,r] of [[5,6],[11,4],[19,6]]) cell(c,r,'gem');
  }
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
  const ids = new Map<string,string>();
  for (const stock of new Set(world.map.tiles.filter((s): s is string => s !== null))) ids.set(stock, await includeStock(scene,'costume',stock));
  world.map.tiles = world.map.tiles.map(id => id === null ? null : ids.get(id)!);
  (scene.worlds ??= []).push(world); scene.world = world.id;
  return world;
}
