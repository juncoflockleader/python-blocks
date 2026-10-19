import type { Ctx } from './draw';
import { CAST, FRAMES, paintCharacter, type Frame } from './cast';
import { PROPS, paintProp } from './props';
import { PIECES, PIECE_NAMES, THEMES, THEME_NAMES, paintTile, type Piece, type Theme } from './tiles';
import { BACKDROPS, paintBackdrop } from './backdrops';
import { paintLegacyBackdrop } from './legacy';

/** The library catalogue. Every piece of library art has a reference such as
 * `cast/fox-walk-1@1` that a project can store instead of a picture: the app
 * draws it from code, so the library's art costs a project almost nothing and
 * a whole animated cast fits beside the learner's own 24 costumes. The number
 * after @ is the drawing's version; a redrawing that changes how a project
 * looks gets a new version. All of it is original, made for Python Blocks. */
export const LICENSE = { license: 'Original artwork made for Python Blocks', author: 'Python Blocks' } as const;
export interface StockAsset { ref: string; id: string; name: string; kind: 'costume' | 'backdrop'; width: number; height: number; license: string; author: string; paint(c: Ctx): void }
export type StockCategory = 'Characters' | 'Objects' | 'Tiles' | 'Backdrops';
/** What the library shows: one entry may add several assets (a character's frames, a tile set). */
export interface StockEntry { id: string; name: string; category: StockCategory; kind: 'costume' | 'backdrop'; width: number; height: number; assets: string[]; costume: string; frames?: string[]; detail: string }

const FRAME_NAMES: Record<Frame, string> = { 'idle-1': 'idle 1', 'idle-2': 'idle 2', 'walk-1': 'walk 1', 'walk-2': 'walk 2', 'walk-3': 'walk 3', 'walk-4': 'walk 4', jump: 'jump', happy: 'happy' };
const assets: StockAsset[] = [];
const entries: StockEntry[] = [];
const add = (ref: string, id: string, name: string, kind: StockAsset['kind'], width: number, height: number, paint: (c: Ctx) => void) => { assets.push({ ref, id, name, kind, width, height, ...LICENSE, paint }); return ref; };
const ref = (path: string) => `${path}@1`;

for (const character of CAST) {
  const refs = FRAMES.map(frame => add(ref(`cast/${character.id}-${frame}`), `stock-${character.id}-${frame}`, `${character.name} ${FRAME_NAMES[frame]}`, 'costume', 64, 64, c => paintCharacter(c, character.id, frame)));
  entries.push({ id: character.id, name: character.name, category: 'Characters', kind: 'costume', width: 64, height: 64, assets: refs, costume: refs[0], frames: refs.slice(2, 6), detail: 'Idle, walk, jump and happy' });
}
for (const prop of PROPS) {
  const refs = Array.from({ length: prop.frames }, (_, f) => prop.frames > 1
    ? add(ref(`props/${prop.id}-${f + 1}`), `stock-${prop.id}-${f + 1}`, `${prop.name} ${f + 1}`, 'costume', prop.width, prop.height, c => paintProp(c, prop.id, f))
    : add(ref(`props/${prop.id}`), `stock-${prop.id}`, prop.name, 'costume', prop.width, prop.height, c => paintProp(c, prop.id)));
  entries.push({ id: prop.id, name: prop.name, category: 'Objects', kind: 'costume', width: prop.width, height: prop.height, assets: refs, costume: refs[0], ...(refs.length > 1 ? { frames: refs } : {}), detail: refs.length > 1 ? (prop.id === 'rocket' ? 'Flame flickers' : 'Spins') : 'Object' });
}
for (const theme of THEMES) {
  const refs = PIECES.map(piece => add(ref(`tiles/${theme}-${piece}`), `stock-${theme}-${piece}`, `${THEME_NAMES[theme]} ${PIECE_NAMES[piece]}`, 'costume', 32, 32, c => paintTile(c, theme, piece)));
  entries.push({ id: `${theme}-tiles`, name: `${THEME_NAMES[theme]} tiles`, category: 'Tiles', kind: 'costume', width: 32, height: 32, assets: refs, costume: refs[1], detail: 'Edges, corners, a platform and a block' });
}
for (const backdrop of BACKDROPS.filter(b => b.id !== 'meadow' && b.id !== 'night')) {
  const r = add(ref(`backdrops/${backdrop.id}`), `stock-${backdrop.id}`, backdrop.name, 'backdrop', 480, 320, c => paintBackdrop(c, backdrop.id));
  entries.push({ id: backdrop.id, name: backdrop.name, category: 'Backdrops', kind: 'backdrop', width: 480, height: 320, assets: [r], costume: r, detail: 'Backdrop' });
}
for (const [id, name] of [['forest', 'Forest'], ['reef', 'Coral reef'], ['city', 'City park'], ['space', 'Space']] as const) {
  const r = add(ref(`backdrops/${id}`), `stock-${id}`, name, 'backdrop', 480, 320, c => paintLegacyBackdrop(c, id));
  entries.push({ id, name, category: 'Backdrops', kind: 'backdrop', width: 480, height: 320, assets: [r], costume: r, detail: 'Backdrop' });
}
/** Library ids that world templates and older code use for a single tile. */
const SINGLE: Record<string, [Theme, Piece]> = { grass: ['grass', 'top'], stone: ['castle', 'middle'], sand: ['sand', 'top'], metal: ['metal', 'block'] };
for (const [id, [theme, piece]] of Object.entries(SINGLE)) {
  const r = ref(`tiles/${theme}-${piece}`);
  entries.push({ id, name: `${THEME_NAMES[theme]} ${PIECE_NAMES[piece]}`, category: 'Tiles', kind: 'costume', width: 32, height: 32, assets: [r], costume: r, detail: 'Tile' });
}

export const STOCK_ASSETS: readonly StockAsset[] = assets;
export const STOCK_ENTRIES: readonly StockEntry[] = entries;
/** The entries the library dialog lists (single tiles for templates are not listed). */
export const LIBRARY = entries.filter(e => !(e.id in SINGLE));
const byRef = new Map(assets.map(a => [a.ref, a])), byId = new Map(assets.map(a => [a.id, a]));
export const stockAsset = (reference: string) => byRef.get(reference);
/** One picture by its project id (`stock-grass-top`), as world templates and examples place them. */
export const stockAssetById = (id: string) => byId.get(id);
export const stockEntry = (kind: StockEntry['kind'], id: string) => entries.find(e => e.kind === kind && e.id === id);
/** How many pixels per stage unit library art is rendered at on the page: 4 for
 * costumes up to 128 units (sharp even in Large stage on a 2× screen), 2 for
 * larger costumes and backdrops. Pixel sensing draws it at 1× directly. */
export function stockScale(width: number, height: number, kind: 'costume' | 'backdrop') { return kind === 'backdrop' || Math.max(width, height) > 128 ? 2 : 4; }
/** Paint library art: costumes around the origin, backdrops from the top-left corner. */
export function paintStock(c: Ctx, reference: string) {
  const asset = byRef.get(reference); if (!asset) throw new Error('This library artwork is not available in this version of Python Blocks.');
  c.save(); asset.paint(c); c.restore();
}
