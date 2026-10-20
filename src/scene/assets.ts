import { backdrops, costumes, isStock, spriteFrames, type Costume, type SceneState } from './model';
import { stockDataUrl } from '../art/raster';
import { paintBuiltin } from '../art/builtins';
import { paintBackdrop } from '../art/backdrops';
export type AssetKind = 'costume' | 'backdrop';
export type Asset = Pick<Costume, 'id' | 'name' | 'width' | 'height'> & { data?: string; stock?: string };
/** A picture's data URL: embedded artwork as stored, library art rendered from the catalogue. */
export const assetData = (asset: object) => isStock(asset) ? stockDataUrl(asset.stock) : (asset as { data?: string }).data;
export const assetsFor = (scene: SceneState, kind: AssetKind): Asset[] => kind === 'costume' ? costumes(scene) : backdrops(scene);
/** The four built-in costumes and two built-in backdrops, drawn by the library art
 * (src/art) every time, so they are sharp at any size. */
export function paintBuiltinCostume(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, id: string) { paintBuiltin(ctx, id); }
export function paintBuiltinBackdrop(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, id: string) { paintBackdrop(ctx, id === 'backdrop_night' ? 'night' : 'meadow'); }
export async function assetCanvas(asset: Asset, kind: AssetKind) {
  const canvas = document.createElement('canvas'); canvas.width = asset.width; canvas.height = asset.height;
  const ctx = canvas.getContext('2d')!;
  const data = assetData(asset);
  if (data) {
    const image = new Image(); image.src = data; await image.decode(); ctx.drawImage(image, 0, 0, asset.width, asset.height);
  } else if (kind === 'backdrop') paintBuiltinBackdrop(ctx, asset.id);
  else { ctx.translate(asset.width / 2, asset.height / 2); paintBuiltinCostume(ctx, asset.id); }
  return canvas;
}
export function removeAsset(scene: SceneState, kind: AssetKind, id: string): SceneState {
  const next = structuredClone(scene);
  const list = kind === 'costume' ? next.assets : next.backdrops ?? [];
  if (!list.some(a => a.id === id)) throw new Error('Built-in artwork stays available. Duplicate it to make your own version.');
  if (kind === 'backdrop') { next.backdrops = list.filter(a => a.id !== id); if (next.backdrop === id) next.backdrop = null; for (const world of next.worlds ?? []) if (world.backdrop === id) world.backdrop = null; }
  else {
    next.assets = list.filter(a => a.id !== id);
    for (const world of next.worlds ?? []) world.map.tiles.forEach((tile, i) => { if (tile === id) { world.map.tiles[i] = null; world.map.walls[i] = false; } });
    for (const sprite of next.sprites) {
      const frames = spriteFrames(sprite).filter(frame => frame !== id);
      if (sprite.costumes) sprite.costumes = frames.length ? frames : ['bird'];
      if (sprite.costume === id) sprite.costume = frames[0] ?? 'bird';
      // Animations lose the costume too; one left with no costumes goes, and so does auto-animation's use of it.
      if (sprite.animations) {
        sprite.animations = sprite.animations.map(a => ({ ...a, frames: a.frames.filter(f => f !== id) })).filter(a => a.frames.length);
        if (!sprite.animations.length) delete sprite.animations;
        const auto = sprite.autoAnimate, kept = (n: string) => n === '' || n === 'frames' || !!sprite.animations?.some(a => a.name === n);
        if (auto) sprite.autoAnimate = { ...auto, moving: kept(auto.moving) ? auto.moving : '', air: kept(auto.air) ? auto.air : '', still: kept(auto.still) ? auto.still : '' };
      }
    }
  }
  return next;
}
