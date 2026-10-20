import { paintBuiltinBackdrop, paintBuiltinCostume, type AssetKind } from './assets';
import { builtins, builtinBackdrops, isStock, STOCK_LIMITS, type AutoAnimate, type Costume, type SceneState, type SpriteAnimation } from './model';
import { LIBRARY, STOCK_ENTRIES, stockAsset, stockAssetById, stockEntry } from '../art/catalog';
import { paintStockBox } from '../art/raster';

/** The library as the stock dialog and the Paint editor see it: the built-in
 * shapes and backdrops, then the catalogue (src/art). Library art goes into a
 * project as references, not pictures; see includeStockSet. */
export interface StockArtwork { id: string; name: string; category: string; kind: AssetKind; width: number; height: number; builtin?: boolean; detail: string; frames?: number }
const visible = new Set(LIBRARY);
const all: (StockArtwork & { hidden?: boolean })[] = [
  ...builtins.map(a => ({ ...a, kind: 'costume' as const, category: a.id === 'bird' ? 'Characters' : 'Objects', builtin: true, detail: 'Built in' })),
  ...STOCK_ENTRIES.map(e => ({ id: e.id, name: e.name, category: e.category, kind: e.kind, width: e.width, height: e.height, detail: e.frames ? `${e.detail} · ${e.assets.length} pictures` : e.detail, ...(e.frames ? { frames: e.frames.length } : {}), hidden: !visible.has(e) })),
  ...builtinBackdrops.map(a => ({ ...a, kind: 'backdrop' as const, category: 'Backdrops', builtin: true, detail: 'Built in' })),
];
export const stockArtwork: StockArtwork[] = all.filter(a => !a.hidden);
/** Any library entry, including the single tiles world templates use. */
export const findStock = (kind: AssetKind, id: string) => all.find(a => a.kind === kind && a.id === id);

/** A picture of library art at `pixels` pixels per stage unit (thumbnails, Paint). */
export async function stockCanvas(art: StockArtwork, pixels = 1) {
  if (art.builtin) {
    // Built-ins are drawn by code too, so draw them at the size asked for.
    const canvas = document.createElement('canvas'); canvas.width = art.width * pixels; canvas.height = art.height * pixels;
    const c = canvas.getContext('2d')!; c.scale(pixels, pixels);
    if (art.kind === 'backdrop') paintBuiltinBackdrop(c, art.id); else { c.translate(art.width / 2, art.height / 2); paintBuiltinCostume(c, art.id); }
    return canvas;
  }
  const entry = stockEntry(art.kind, art.id); if (!entry) throw new Error('Choose available library artwork.');
  const canvas = document.createElement('canvas'); canvas.width = art.width * pixels; canvas.height = art.height * pixels;
  const c = canvas.getContext('2d')!; c.scale(pixels, pixels); paintStockBox(c, entry.costume);
  return canvas;
}

/** Add library art to a scene as references (each reference once). Returns the
 * asset to show first and, for animated entries, the frames in order, the named
 * animations and, for characters, how they animate while moving. */
export function includeStockSet(scene: SceneState, kind: AssetKind, id: string, only?: 'first'): { costume: string; frames?: string[]; animations?: SpriteAnimation[]; autoAnimate?: AutoAnimate } {
  const art = findStock(kind, id); if (!art) throw new Error('Choose available library artwork.');
  if (art.builtin) return { costume: art.id };
  const entry = stockEntry(kind, id)!, list = kind === 'costume' ? scene.assets : (scene.backdrops ??= []);
  const fresh = (only ? [entry.costume] : entry.assets).map(ref => stockAsset(ref)!).filter(a => !list.some(existing => existing.id === a.id));
  const limit = kind === 'costume' ? STOCK_LIMITS.costumes : STOCK_LIMITS.backdrops;
  if (list.filter(a => isStock(a)).length + fresh.length > limit) throw new Error(`A project can use ${limit} library ${kind === 'costume' ? 'costumes' : 'backdrops'}. Remove some sprites or backdrops it no longer uses.`);
  for (const a of fresh) list.push({ id: a.id, name: a.name, width: a.width, height: a.height, stock: a.ref } satisfies Costume);
  const ids = (refs: string[]) => refs.map(ref => stockAsset(ref)!.id);
  return { costume: stockAsset(entry.costume)!.id, ...(entry.frames && !only ? { frames: ids(entry.frames) } : {}),
    ...(entry.animations && !only ? { animations: entry.animations.map(a => ({ name: a.name, frames: ids(a.frames), ...(a.seconds ? { seconds: a.seconds } : {}) })) } : {}),
    ...(entry.autoAnimate && !only ? { autoAnimate: { ...entry.autoAnimate } } : {}) };
}
/** Add just one picture of an entry (a world template's backdrop); returns its id. */
export async function includeStock(scene: SceneState, kind: AssetKind, id: string) { return includeStockSet(scene, kind, id, 'first').costume; }
/** Add one library picture by its project id (`stock-grass-top`, a tile a template places). */
export function includeStockAsset(scene: SceneState, id: string) {
  const art = stockAssetById(id); if (!art) throw new Error('Choose available library artwork.');
  const list = art.kind === 'costume' ? scene.assets : (scene.backdrops ??= []);
  if (list.some(a => a.id === id)) return id;
  const limit = art.kind === 'costume' ? STOCK_LIMITS.costumes : STOCK_LIMITS.backdrops;
  if (list.filter(a => isStock(a)).length >= limit) throw new Error(`A project can use ${limit} library ${art.kind === 'costume' ? 'costumes' : 'backdrops'}. Remove some sprites or backdrops it no longer uses.`);
  list.push({ id, name: art.name, width: art.width, height: art.height, stock: art.ref } satisfies Costume); return id;
}
