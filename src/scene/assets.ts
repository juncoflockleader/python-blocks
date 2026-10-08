import { backdrops, costumes, spriteFrames, type Costume, type SceneState } from './model';
export type AssetKind = 'costume' | 'backdrop';
export type Asset = Pick<Costume, 'id' | 'name' | 'width' | 'height'> & { data?: string };
export const assetsFor = (scene: SceneState, kind: AssetKind): Asset[] => kind === 'costume' ? costumes(scene) : backdrops(scene);
export function paintBuiltinCostume(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, id: string) {
      ctx.strokeStyle = '#fffaf0'; ctx.lineWidth = 2; ctx.beginPath();
      if (id === 'star') {
        ctx.fillStyle = '#e8b94f';
        for (let i = 0; i < 10; i++) { const angle = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? 10 : 22; const x = Math.cos(angle) * r, y = Math.sin(angle) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.closePath();
      } else if (id === 'ball') { ctx.fillStyle = '#9c83ba'; ctx.arc(0, 0, 20, 0, Math.PI * 2); }
      else if (id === 'box') { ctx.fillStyle = '#e58d60'; ctx.roundRect(-22, -22, 44, 44, 8); }
      else {
        ctx.fillStyle = '#478b94'; ctx.ellipse(-3, 2, 19, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, -7); ctx.lineTo(24, -1); ctx.lineTo(12, 3); ctx.fillStyle = '#e8b94f';
      }
      ctx.fill(); ctx.stroke();
      if (id === 'bird') { ctx.fillStyle = '#253e43'; ctx.beginPath(); ctx.arc(8, -4, 2.5, 0, Math.PI * 2); ctx.fill(); }
}
export function paintBuiltinBackdrop(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, id: string) {
  ctx.save();
  if (id === 'backdrop_meadow') {
    ctx.fillStyle = '#bee3ed'; ctx.fillRect(0, 0, 480, 320);
    ctx.fillStyle = '#f5d96b'; ctx.beginPath(); ctx.arc(392, 65, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#83aa70'; ctx.beginPath(); ctx.ellipse(120, 320, 250, 135, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5d925f'; ctx.beginPath(); ctx.ellipse(390, 340, 250, 120, 0, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'backdrop_night') {
    ctx.fillStyle = '#243552'; ctx.fillRect(0, 0, 480, 320);
    ctx.fillStyle = '#f2eac9'; ctx.beginPath(); ctx.arc(380, 70, 29, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 32; i++) { ctx.beginPath(); ctx.arc((i * 137 + 21) % 480, (i * 67 + 11) % 270, i % 3 === 0 ? 2 : 1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#1d2c42'; ctx.fillRect(0, 285, 480, 35);
  }
  ctx.restore();
}
export async function assetCanvas(asset: Asset, kind: AssetKind) {
  const canvas = document.createElement('canvas'); canvas.width = asset.width; canvas.height = asset.height;
  const ctx = canvas.getContext('2d')!;
  if (asset.data) {
    const image = new Image(); image.src = asset.data; await image.decode(); ctx.drawImage(image, 0, 0);
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
    }
  }
  return next;
}
