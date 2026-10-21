export interface Camera { x: number; y: number; follow?: string | null; clamp: boolean }
export interface Tilemap { columns: number; rows: number; tileSize: number; tiles: (string | null)[]; walls: boolean[] }
export interface World { id: string; name: string; background: string; backdrop?: string | null; map: Tilemap; camera: Camera }
export const defaultCamera = (): Camera => ({ x: 0, y: 0, follow: null, clamp: true });
/** Up to 256 tiles a side, and never more than 4096 pixels: the pen layer follows the map. */
export const MAX_TILES = 256, MAX_PIXELS = 4096;
const fits = (n: number, tileSize: number) => Number.isInteger(n) && n >= 1 && n <= MAX_TILES && n * tileSize <= MAX_PIXELS;
export const newMap = (columns = 30, rows = 20, tileSize = 16): Tilemap => ({ columns, rows, tileSize, tiles: Array(columns * rows).fill(null), walls: Array(columns * rows).fill(false) });
export function validCamera(value: unknown): value is Camera {
  const c = value as Camera;
  return !!c && [c.x, c.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 999000) && typeof c.clamp === 'boolean' && (c.follow == null || typeof c.follow === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(c.follow));
}
export function validMap(value: unknown, assets?: Set<string>): value is Tilemap {
  const m = value as Tilemap;
  return !!m && [8, 16, 32, 64].includes(m.tileSize) && [m.columns, m.rows].every(n => fits(n, m.tileSize)) && Array.isArray(m.tiles) && m.tiles.length === m.columns * m.rows && m.tiles.every(t => t === null || typeof t === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(t) && (!assets || assets.has(t))) && Array.isArray(m.walls) && m.walls.length === m.tiles.length && m.walls.every(w => typeof w === 'boolean');
}
export function resizeMap(old: Tilemap, columns: number, rows: number, tileSize: number): Tilemap {
  if (![8, 16, 32, 64].includes(tileSize) || ![columns, rows].every(n => fits(n, tileSize))) throw new Error(`Maps need 1–${MAX_TILES} columns and rows, tiles of 8, 16, 32 or 64 pixels, and at most ${MAX_PIXELS} pixels a side.`);
  const next = newMap(columns, rows, tileSize);
  for (let r = 0; r < Math.min(rows, old.rows); r++) for (let c = 0; c < Math.min(columns, old.columns); c++) { next.tiles[r * columns + c] = old.tiles[r * old.columns + c]; next.walls[r * columns + c] = old.walls[r * old.columns + c]; }
  return next;
}
export function cameraPosition(camera: Camera, map?: Tilemap, target?: { x: number; y: number }) {
  let { x, y } = target ?? camera;
  if (camera.clamp && map) {
    const width = map.columns * map.tileSize, height = map.rows * map.tileSize;
    x = width < 480 ? (width - 480) / 2 : Math.max(0, Math.min(width - 480, x));
    y = height < 320 ? (320 - height) / 2 : Math.max(320 - height, Math.min(0, y));
  }
  return { x, y };
}
/** The next name in a numbered series ("Level 2" is followed by "Level 3", the next one free), or "World 1", "World 2"… */
export function copyName(names: string[], from: string) {
  const numbered = /^(.*?)(\d{1,6})$/.exec(from.trim());
  const [prefix, start] = numbered ? [numbered[1], Number(numbered[2]) + 1] : ['World ', 1];
  let n = start;
  while (names.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`.slice(0, 48);
}
interface WorldScene { world?: string | null; worlds?: World[]; sprites: { id: string; name: string; world?: string }[] }
/** Copy the starting world, its map, camera and its own sprites (with new ids), into a new world after the others,
 * and make it the starting world. The world editor's Duplicate world and a lesson's Show me how both use this. */
export function duplicateWorld(state: WorldScene, makeId: () => string = () => crypto.randomUUID()): World {
  const old = state.worlds?.find(w => w.id === state.world);
  if (!old) throw new Error('Choose a world to duplicate.');
  const world = structuredClone(old); world.id = makeId(); world.name = copyName(state.worlds!.map(w => w.name), old.name);
  const names = new Set(state.sprites.map(s => s.name));
  for (const original of state.sprites.filter(s => s.world === old.id)) {
    const sprite = structuredClone(original); sprite.id = makeId(); sprite.world = world.id;
    let n = 1; while (names.has(`${original.name.slice(0, 30)} copy ${n}`)) n++;
    sprite.name = `${original.name.slice(0, 30)} copy ${n}`; names.add(sprite.name); state.sprites.push(sprite);
    if (world.camera.follow === original.id) world.camera.follow = sprite.id;
  }
  state.worlds!.push(world); state.world = world.id;
  return world;
}
