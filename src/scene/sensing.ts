import { effectNames, effectPixels } from './effects';
import type { SpriteState } from './model';

export interface PixelImage { width: number; height: number; data: Uint8ClampedArray }
interface Mask extends PixelImage { opaque: boolean }

/** Read-only sensing of visible stage pixels; the same transforms as canvas rendering. */
export class PixelSensing {
  private cache = new Map<string, Mask>();
  constructor(private readonly source: (id: string) => PixelImage | undefined) {}
  reset() { this.cache.clear(); }
  private mask(sprite: SpriteState) {
    const key = sprite.costume + ':' + effectNames.map(n => sprite.effects?.[n] ?? 0).join(',');
    const cached = this.cache.get(key);
    if (cached) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    const source = this.source(sprite.costume); if (!source) return;
    const data = Object.values(sprite.effects ?? {}).some(Boolean) ? effectPixels(source.data, source.width, source.height, sprite.effects!) : source.data;
    let opaque = false; for (let i = 3; i < data.length; i += 4) if (data[i]) { opaque = true; break; }
    const mask = { width: source.width, height: source.height, data, opaque }; this.cache.set(key, mask);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    return mask;
  }
  private sample(sprite: SpriteState, mask: Mask, x: number, y: number) {
    const scale = sprite.size / 100, dx = (x - sprite.x) / scale, dy = (sprite.y - y) / scale;
    const angle = !sprite.rotationStyle || sprite.rotationStyle === 'all' ? sprite.direction * Math.PI / 180 : 0;
    const flip = sprite.rotationStyle === 'left-right' && sprite.direction > 90 && sprite.direction < 270 ? -1 : 1;
    const px = Math.floor((dx * Math.cos(angle) + dy * Math.sin(angle)) * flip + mask.width / 2);
    const py = Math.floor(-dx * Math.sin(angle) + dy * Math.cos(angle) + mask.height / 2);
    return px >= 0 && py >= 0 && px < mask.width && py < mask.height && mask.data[(py * mask.width + px) * 4 + 3] > 0;
  }
  point(sprite: SpriteState, x: number, y: number, world = false, camera = { x: 0, y: 0 }) {
    if (!sprite.visible || !world && (x < camera.x - 240 || x >= camera.x + 240 || y <= camera.y - 160 || y > camera.y + 160)) return false;
    const mask = this.mask(sprite); return !!mask?.opaque && this.sample(sprite, mask, x, y);
  }
  overlap(a: SpriteState, b: SpriteState, world = false, camera = { x: 0, y: 0 }) {
    if (!a.visible || !b.visible || a.id === b.id) return false;
    const am = this.mask(a), bm = this.mask(b); if (!am?.opaque || !bm?.opaque) return false;
    const extent = (s: SpriteState, m: Mask) => {
      const angle = !s.rotationStyle || s.rotationStyle === 'all' ? s.direction * Math.PI / 180 : 0;
      const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      return { x: (cos * m.width + sin * m.height) * s.size / 200, y: (cos * m.height + sin * m.width) * s.size / 200 };
    };
    const ae = extent(a, am), be = extent(b, bm);
    const left = Math.max(world ? -Infinity : camera.x - 240, Math.floor(Math.max(a.x - ae.x, b.x - be.x))), right = Math.min(world ? Infinity : camera.x + 240, Math.ceil(Math.min(a.x + ae.x, b.x + be.x)));
    const bottom = Math.max(world ? -Infinity : camera.y - 160, Math.floor(Math.max(a.y - ae.y, b.y - be.y))), top = Math.min(world ? Infinity : camera.y + 160, Math.ceil(Math.min(a.y + ae.y, b.y + be.y)));
    for (let y = bottom + .5; y < top; y++) for (let x = left + .5; x < right; x++) if (this.sample(a, am, x, y) && this.sample(b, bm, x, y)) return true;
    return false;
  }
}
