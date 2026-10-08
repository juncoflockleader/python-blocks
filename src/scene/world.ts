export interface Camera { x: number; y: number; follow?: string | null; clamp: boolean }
export interface Tilemap { columns: number; rows: number; tileSize: number; tiles: (string | null)[]; walls: boolean[] }
export interface World { id: string; name: string; background: string; backdrop?: string | null; map: Tilemap; camera: Camera }
export const defaultCamera = (): Camera => ({ x: 0, y: 0, follow: null, clamp: true });
export const newMap = (columns = 30, rows = 20, tileSize = 16): Tilemap => ({ columns, rows, tileSize, tiles: Array(columns * rows).fill(null), walls: Array(columns * rows).fill(false) });
export function validCamera(value: unknown): value is Camera {
  const c = value as Camera;
  return !!c && [c.x, c.y].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 999000) && typeof c.clamp === 'boolean' && (c.follow == null || typeof c.follow === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(c.follow));
}
export function validMap(value: unknown, assets?: Set<string>): value is Tilemap {
  const m = value as Tilemap;
  return !!m && [m.columns, m.rows].every(n => Number.isInteger(n) && n >= 1 && n <= 64) && [8, 16, 32, 64].includes(m.tileSize) && Array.isArray(m.tiles) && m.tiles.length === m.columns * m.rows && m.tiles.every(t => t === null || typeof t === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(t) && (!assets || assets.has(t))) && Array.isArray(m.walls) && m.walls.length === m.tiles.length && m.walls.every(w => typeof w === 'boolean');
}
export function resizeMap(old: Tilemap, columns: number, rows: number, tileSize: number): Tilemap {
  if (![columns, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 64) || ![8, 16, 32, 64].includes(tileSize)) throw new Error('Maps need 1–64 columns/rows and tiles of 8, 16, 32 or 64 pixels.');
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
