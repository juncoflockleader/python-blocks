/** Small deterministic bitmap operations shared by the paint tools and tests. */
export type Color = [number, number, number, number];
export interface Rect { x: number; y: number; width: number; height: number }
export const hexColor = (hex: string): Color => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
export class Raster {
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  constructor(readonly width: number, readonly height: number, pixels?: ArrayLike<number>) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 480 || height > 320) throw new Error('Artwork dimensions must fit 480 × 320 pixels.');
    if (pixels && pixels.length !== width * height * 4) throw new Error('Artwork pixel dimensions do not match.');
    this.pixels = pixels ? Uint8ClampedArray.from(pixels) : new Uint8ClampedArray(width * height * 4);
  }
  copy() { return new Raster(this.width, this.height, this.pixels); }
  all(): Rect { return { x: 0, y: 0, width: this.width, height: this.height }; }
  color(x: number, y: number): Color { return [...this.pixels.slice((y * this.width + x) * 4, (y * this.width + x) * 4 + 4)] as Color; }
  set(x: number, y: number, color: Color) { if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.pixels.set(color, (y * this.width + x) * 4); }
  clear(rect = this.all()) { for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) this.set(x, y, [0, 0, 0, 0]); }
  line(x1: number, y1: number, x2: number, y2: number, color: Color, size = 1) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1), radius = (size - 1) / 2, reach = Math.ceil(radius), offset = size % 2 === 0 ? .5 : 0;
    for (let i = 0; i <= steps; i++) {
      const cx = Math.round(x1 + (x2 - x1) * i / steps), cy = Math.round(y1 + (y2 - y1) * i / steps);
      for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) if ((x - offset) ** 2 + (y - offset) ** 2 <= radius * radius + 0.25) this.set(cx + x, cy + y, color);
    }
  }
  fill(x: number, y: number, color: Color) {
    const old = this.color(x, y); if (old.every((c, i) => c === color[i])) return;
    const seen = new Uint8Array(this.width * this.height), queue = new Int32Array(this.width * this.height); let read = 0, end = 1;
    queue[0] = y * this.width + x; seen[queue[0]] = 1;
    while (read < end) {
      const index = queue[read++], px = index % this.width, py = Math.floor(index / this.width);
      if (!this.color(px, py).every((c, i) => c === old[i])) continue;
      this.set(px, py, color);
      for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) {
        const next = ny * this.width + nx; if (!seen[next]) { seen[next] = 1; queue[end++] = next; }
      }
    }
  }
  shape(rect: Rect, kind: 'rectangle' | 'ellipse', color: Color, filled: boolean, size: number) {
    for (let y = rect.y; y < rect.y + rect.height; y++) for (let x = rect.x; x < rect.x + rect.width; x++) {
      const dx = x - rect.x, dy = y - rect.y;
      if (kind === 'rectangle') {
        if (filled || Math.min(dx, dy, rect.width - dx - 1, rect.height - dy - 1) < size) this.set(x, y, color);
      } else {
        const rx = rect.width / 2, ry = rect.height / 2, ex = dx + 0.5 - rx, ey = dy + 0.5 - ry;
        const outer = ex * ex / (rx * rx) + ey * ey / (ry * ry) <= 1;
        const inner = rx > size && ry > size && ex * ex / ((rx - size) ** 2) + ey * ey / ((ry - size) ** 2) < 1;
        if (outer && (filled || !inner)) this.set(x, y, color);
      }
    }
  }
  move(rect: Rect, dx: number, dy: number) {
    const before = this.copy(); this.clear(rect);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) this.set(rect.x + dx + x, rect.y + dy + y, before.color(rect.x + x, rect.y + y));
  }
  transform(rect: Rect, kind: 'flip-x' | 'flip-y' | 'rotate') {
    const before = this.copy(); this.clear(rect);
    for (let y = 0; y < rect.height; y++) for (let x = 0; x < rect.width; x++) {
      const nx = kind === 'flip-x' ? rect.width - 1 - x : kind === 'rotate' ? Math.floor((rect.width + rect.height) / 2) - 1 - y : x;
      const ny = kind === 'flip-y' ? rect.height - 1 - y : kind === 'rotate' ? Math.floor((rect.height - rect.width) / 2) + x : y;
      this.set(rect.x + nx, rect.y + ny, before.color(rect.x + x, rect.y + y));
    }
  }
  resize(width: number, height: number, scale: boolean) {
    const next = new Raster(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = scale ? Math.floor(x * this.width / width) : x, sy = scale ? Math.floor(y * this.height / height) : y;
      if (sx < this.width && sy < this.height) next.set(x, y, this.color(sx, sy));
    }
    return next;
  }
}
