import { SceneColors } from './colors';
import { paintBuiltinCostume, paintBuiltinBackdrop } from '../scene/assets';
import { builtinBackdrops, builtins, emptyScene, isColor, validSprite, type SceneState, type SpriteState } from '../scene/model';
import { PixelSensing, type PixelImage } from '../scene/sensing';

export async function createSensing(scene?: SceneState) {
  const images = new Map<string, PixelImage>(), canvases = new Map<string, OffscreenCanvas>();
  await Promise.all([...builtins, ...builtinBackdrops, ...(scene?.assets ?? []), ...(scene?.backdrops ?? [])].map(async asset => {
    const canvas = new OffscreenCanvas(asset.width, asset.height), ctx = canvas.getContext('2d')!;
    if ('data' in asset) {
      const bytes = Uint8Array.from(atob(asset.data.slice(22)), c => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      try { ctx.drawImage(image, 0, 0); } finally { image.close(); }
    } else if (builtinBackdrops.some(a => a.id === asset.id)) paintBuiltinBackdrop(ctx, asset.id);
    else { ctx.translate(asset.width / 2, asset.height / 2); paintBuiltinCostume(ctx, asset.id); }
    canvases.set(asset.id, canvas);
    images.set(asset.id, { width: asset.width, height: asset.height, data: ctx.getImageData(0, 0, asset.width, asset.height).data });
  }));
  const sensing = new PixelSensing(id => images.get(id));
  const colors = new SceneColors(scene ?? emptyScene(), canvases);
  const query = (json: string) => {
    const q = JSON.parse(json) as { kind: string; color?: string; ownColor?: string | null; tolerance?: number; world?: boolean; camera?: { x: number; y: number }; a: SpriteState; b?: SpriteState; x?: number; y?: number };
    if (q.camera && ![q.camera.x, q.camera.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 999000)) throw new Error('Pixel sensing needs a valid camera.');
    if (!validSprite(q.a)) throw new Error('Pixel sensing needs a valid sprite.');
    if (q.kind === 'color' && isColor(q.color) && (q.ownColor == null || isColor(q.ownColor)) && typeof q.tolerance === 'number' && Number.isFinite(q.tolerance) && q.tolerance >= 0 && q.tolerance <= 255) return colors.touching(q.a, q.color, q.ownColor ?? null, q.tolerance);
    if (q.kind === 'overlap' && validSprite(q.b)) return sensing.overlap(q.a, q.b, q.world === true, q.camera);
    if (q.kind === 'point' && typeof q.x === 'number' && typeof q.y === 'number' && Number.isFinite(q.x) && Number.isFinite(q.y)) return sensing.point(q.a, q.x, q.y, q.world === true, q.camera);
    throw new Error('Invalid pixel sensing query.');
  };
  return { query, accept: (command: import('../scene/model').SceneCommand) => colors.accept(command), draw: (command: import('./protocol').DrawCommand) => colors.draw(command) };
}
