import { paintBuiltinCostume, paintBuiltinBackdrop } from '../scene/assets';
import { builtins, type SceneCommand, type SceneState, type SpriteState, type InkCommand } from '../scene/model';
import { effectNames, effectPixels, type Effects } from '../scene/effects';
import { cameraPosition, defaultCamera, type Tilemap } from '../scene/world';
import type { DrawCommand } from './protocol';

/** Synchronous worker raster, updated before Python can make its next query. */
export class SceneColors {
  private sprites = new Map<string, SpriteState>();
  private background: string;
  private backdrop: string | null;
  private effects: Effects;
  private camera = { x: 0, y: 0 };
  private map?: Tilemap;
  private ink = new OffscreenCanvas(480, 320);
  private composite = new OffscreenCanvas(480, 320);
  private mask = new OffscreenCanvas(480, 320);
  private filtered = new Map<string, OffscreenCanvas>();
  private revision = 0;
  private cached: { revision: number; excluded: string; pixels: Uint8ClampedArray } | null = null;
  constructor(private scene: SceneState, private images: Map<string, OffscreenCanvas>) {
    this.background = scene.background; this.backdrop = scene.backdrop ?? null; this.effects = { ...scene.effects };
    this.sprites = new Map(scene.sprites.filter(s => !s.world || s.world === scene.world).map(s => [s.id, structuredClone(s)]));
    this.world(scene.world ?? null);
  }
  private world(id: string | null) {
    const world = this.scene.worlds?.find(w => w.id === id);
    this.map = world ? structuredClone(world.map) : undefined;
    if (world) { this.background = world.background; this.backdrop = world.backdrop ?? null; }
    this.camera = cameraPosition(world?.camera ?? this.scene.camera ?? defaultCamera(), this.map, this.sprites.get((world?.camera ?? this.scene.camera)?.follow ?? ''));
    this.ink.width = this.map ? this.map.columns * this.map.tileSize : 480;
    this.ink.height = this.map ? this.map.rows * this.map.tileSize : 320;
  }
  accept(command: SceneCommand) {
    if (command.type === 'sprite') this.sprites.set(command.sprite.id, structuredClone(command.sprite));
    else if (command.type === 'delete') this.sprites.delete(command.id);
    else if (command.type === 'background') this.background = command.color;
    else if (command.type === 'backdrop') this.backdrop = command.id;
    else if (command.type === 'effects') this.effects = { ...command.effects };
    else if (command.type === 'world') this.world(command.id);
    else if (command.type === 'camera') this.camera = { x: command.x, y: command.y };
    else if (command.type === 'tile') { const m = this.map; if (m && command.column < m.columns && command.row < m.rows) m.tiles[command.row * m.columns + command.column] = command.costume; }
    else if (command.type === 'pen_clear') this.ink.getContext('2d')!.clearRect(0, 0, this.ink.width, this.ink.height);
    else if (command.type === 'pen_line' || command.type === 'stamp') this.mark(command);
    else return;
    this.revision++;
  }
  draw(command: DrawCommand) { if (command.type === 'move' && command.draw) { this.mark({ ...command, type: 'pen_line', width: 3, opacity: 100 }); this.revision++; } }
  private mark(command: InkCommand) {
    const ctx = this.ink.getContext('2d')!;
    if (command.type === 'stamp') { this.sprite(ctx, command.sprite); return; }
    ctx.save(); ctx.globalAlpha = command.opacity / 100; ctx.strokeStyle = ctx.fillStyle = command.color; ctx.lineWidth = command.width; ctx.lineCap = 'round'; ctx.beginPath();
    if (command.x1 === command.x2 && command.y1 === command.y2) { ctx.arc(240 + command.x1, 160 - command.y1, command.width / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(240 + command.x1, 160 - command.y1); ctx.lineTo(240 + command.x2, 160 - command.y2); ctx.stroke(); }
    ctx.restore();
  }
  private filter(key: string, image: OffscreenCanvas, effects: Effects) {
    if (!Object.values(effects).some(Boolean)) return image;
    key += ':' + effectNames.map(n => effects[n] ?? 0).join(',');
    const found = this.filtered.get(key); if (found) { this.filtered.delete(key); this.filtered.set(key, found); return found; }
    const canvas = new OffscreenCanvas(image.width, image.height), ctx = canvas.getContext('2d')!;
    const data = image.getContext('2d')!.getImageData(0, 0, image.width, image.height);
    ctx.putImageData(new ImageData(effectPixels(data.data, image.width, image.height, effects), image.width, image.height), 0, 0);
    if (this.filtered.size >= 16) this.filtered.delete(this.filtered.keys().next().value!); this.filtered.set(key, canvas); return canvas;
  }
  private sprite(ctx: OffscreenCanvasRenderingContext2D, s: SpriteState) {
    const image = this.images.get(s.costume); if (!image) return;
    ctx.save(); ctx.translate(240 + s.x, 160 - s.y);
    if (!s.rotationStyle || s.rotationStyle === 'all') ctx.rotate(s.direction * Math.PI / 180);
    const flip = s.rotationStyle === 'left-right' && s.direction > 90 && s.direction < 270 ? -1 : 1;
    ctx.scale(flip * s.size / 100, s.size / 100);
    if (Object.values(s.effects ?? {}).some(Boolean)) ctx.drawImage(this.filter('sprite:' + s.costume, image, s.effects!), -image.width / 2, -image.height / 2);
    else if (builtins.some(b => b.id === s.costume)) paintBuiltinCostume(ctx, s.costume);
    else ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }
  private pixels(excluded: string) {
    if (this.cached?.revision === this.revision && this.cached.excluded === excluded) return this.cached.pixels;
    const ctx = this.composite.getContext('2d')!;
    const background = new OffscreenCanvas(480, 320), bg = background.getContext('2d')!;
    bg.fillStyle = this.background; bg.fillRect(0, 0, 480, 320);
    if (this.backdrop) { const image = this.images.get(this.backdrop); if (image) bg.drawImage(image, 0, 0, 480, 320); else paintBuiltinBackdrop(bg, this.backdrop); }
    else { bg.fillStyle = '#d9dfd5'; for (let x = 0; x < 480; x += 20) for (let y = 0; y < 320; y += 20) { bg.beginPath(); bg.arc(x, y, 1, 0, Math.PI * 2); bg.fill(); } }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 480, 320);
    ctx.drawImage(this.filter('background:' + this.background + ':' + this.backdrop, background, this.effects), 0, 0);
    const m = this.map;
    if (m) {
      const size = m.tileSize; ctx.save(); ctx.imageSmoothingEnabled = false;
      for (let r = Math.max(0, Math.floor(-this.camera.y / size)); r < Math.min(m.rows, Math.ceil((320 - this.camera.y) / size)); r++) for (let c = Math.max(0, Math.floor(this.camera.x / size)); c < Math.min(m.columns, Math.ceil((480 + this.camera.x) / size)); c++) {
        const id = m.tiles[r * m.columns + c]; if (!id) continue;
        const image = this.images.get(id); if (!image) continue;
        const x = c * size - this.camera.x, y = r * size + this.camera.y;
        if (builtins.some(b => b.id === id)) { ctx.save(); ctx.translate(x + size / 2, y + size / 2); ctx.scale(size / image.width, size / image.height); paintBuiltinCostume(ctx, id); ctx.restore(); }
        else ctx.drawImage(image, x, y, size, size);
      }
      ctx.restore();
    }
    ctx.drawImage(this.ink, -this.camera.x, this.camera.y);
    ctx.save(); ctx.translate(-this.camera.x, this.camera.y);
    for (const s of [...this.sprites.values()].sort((a,b) => a.layer - b.layer)) if (s.id !== excluded && s.visible) this.sprite(ctx, s);
    ctx.restore();
    const pixels = ctx.getImageData(0, 0, 480, 320).data; this.cached = { revision: this.revision, excluded, pixels }; return pixels;
  }
  touching(sprite: SpriteState, color: string, ownColor: string | null, tolerance: number) {
    if (!sprite.visible || sprite.effects?.ghost === 100) return false;
    const ctx = this.mask.getContext('2d')!; ctx.clearRect(0, 0, 480, 320); ctx.save(); ctx.translate(-this.camera.x, this.camera.y); this.sprite(ctx, sprite); ctx.restore();
    const source = ctx.getImageData(0, 0, 480, 320).data, target = this.pixels(sprite.id);
    const rgb = (c: string) => [1,3,5].map(i => parseInt(c.slice(i, i + 2), 16));
    const match = (pixels: Uint8ClampedArray, offset: number, rgb: number[]) => rgb.every((v, i) => Math.abs(pixels[offset + i] - v) <= tolerance);
    const wanted = rgb(color), own = ownColor ? rgb(ownColor) : null;
    for (let i = 0; i < source.length; i += 4) if (source[i + 3] && (!own || match(source, i, own)) && match(target, i, wanted)) return true;
    return false;
  }
}
