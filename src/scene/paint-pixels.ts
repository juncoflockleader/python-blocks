/** Pixel operations for the Paint editor that need no canvas: flood fill with a
 * tolerance, gradient fills, the cells a pixel-art line or shape covers, and
 * checks for art that can be stored at 1×. Plain data in, plain data out. */
export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export type RGBA = [number, number, number, number];
export interface Box { x: number; y: number; width: number; height: number }

export const rgba = (hex: string, alpha = 255): RGBA => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), alpha];
export const hex = (c: ArrayLike<number>) => '#' + [c[0], c[1], c[2]].map(v => v.toString(16).padStart(2, '0')).join('');

/** The connected area around (x, y) whose colours are within `tolerance` of it
 * (each channel, alpha included), as a mask of 1s. Transparent pixels all match each other. */
export function floodMask(image: Pixels, x: number, y: number, tolerance = 0): Uint8Array {
  const { width, height, data } = image, mask = new Uint8Array(width * height);
  if (x < 0 || y < 0 || x >= width || y >= height) return mask;
  const start = (y * width + x) * 4, seed = [data[start], data[start + 1], data[start + 2], data[start + 3]];
  const matches = (i: number) => {
    const a = data[i + 3];
    if (seed[3] === 0 && a <= tolerance) return true;
    return Math.abs(data[i] - seed[0]) <= tolerance && Math.abs(data[i + 1] - seed[1]) <= tolerance && Math.abs(data[i + 2] - seed[2]) <= tolerance && Math.abs(a - seed[3]) <= tolerance;
  };
  const queue = new Int32Array(width * height); let read = 0, end = 0;
  queue[end++] = y * width + x; mask[y * width + x] = 1;
  while (read < end) {
    const index = queue[read++], px = index % width, py = (index - px) / width;
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const next = ny * width + nx;
      if (!mask[next] && matches(next * 4)) { mask[next] = 1; queue[end++] = next; }
    }
  }
  return mask;
}

/** The bounding box of a mask's 1s, or null when it is empty. */
export function maskBox(mask: Uint8Array, width: number): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % width, y = (i - x) / width; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export type FillStyle = 'solid' | 'down' | 'glow';
/** Paint the mask: one colour, a fade from the colour at the top to a lighter one
 * at the bottom ('down'), or a lighter centre fading out to the colour ('glow').
 * The fill also covers the half-transparent edge pixels just outside the mask, so smooth outlines get no halo. */
export function fillMask(image: Pixels, mask: Uint8Array, color: RGBA, style: FillStyle = 'solid', edge = true) {
  const { width, height, data } = image, box = maskBox(mask, width); if (!box) return;
  const light: RGBA = [color[0] + (255 - color[0]) * .7, color[1] + (255 - color[1]) * .7, color[2] + (255 - color[2]) * .7, color[3]];
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, reach = Math.hypot(box.width, box.height) / 2 || 1;
  const at = (x: number, y: number): RGBA => {
    if (style === 'solid') return color;
    const t = style === 'down' ? (y - box.y) / Math.max(1, box.height - 1) : Math.min(1, Math.hypot(x - cx, y - cy) / reach);
    const [from, to] = style === 'down' ? [color, light] : [light, color];
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t, color[3]];
  };
  const target = edge ? grow(mask, width, height) : mask;
  for (let i = 0; i < target.length; i++) {
    if (!target[i]) continue;
    const x = i % width, y = (i - x) / width, c = at(x, y), o = i * 4;
    if (mask[i]) { data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3]; continue; }
    // An edge pixel: put the fill behind it, as if it were painted first.
    const a = data[o + 3] / 255, under = c[3] / 255, out = a + under * (1 - a); if (!out) continue;
    for (let k = 0; k < 3; k++) data[o + k] = (data[o + k] * a + c[k] * under * (1 - a)) / out;
    data[o + 3] = out * 255;
  }
}
/** The mask and its four neighbours. */
function grow(mask: Uint8Array, width: number, height: number) {
  const out = new Uint8Array(mask);
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    const x = i % width, y = (i - x) / width;
    if (x > 0) out[i - 1] = 1; if (x < width - 1) out[i + 1] = 1; if (y > 0) out[i - width] = 1; if (y < height - 1) out[i + width] = 1;
  }
  return out;
}

/** The cells a pixel brush of `size` covers along a line (square brush, whole cells). */
export function lineCells(x1: number, y1: number, x2: number, y2: number, size = 1): [number, number][] {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1), seen = new Set<string>(), cells: [number, number][] = [];
  const half = Math.floor((size - 1) / 2);
  for (let i = 0; i <= steps; i++) {
    const cx = Math.round(x1 + (x2 - x1) * i / steps), cy = Math.round(y1 + (y2 - y1) * i / steps);
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
      const key = `${cx - half + dx},${cy - half + dy}`; if (seen.has(key)) continue;
      seen.add(key); cells.push([cx - half + dx, cy - half + dy]);
    }
  }
  return cells;
}
/** The cells of a pixel-art rectangle or ellipse inside `box`, filled or as an outline `size` cells thick. */
export function shapeCells(box: Box, kind: 'rect' | 'ellipse', filled: boolean, size = 1): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
    let inside: boolean;
    if (kind === 'rect') inside = filled || Math.min(x, y, box.width - 1 - x, box.height - 1 - y) < size;
    else {
      const rx = box.width / 2, ry = box.height / 2, ex = x + .5 - rx, ey = y + .5 - ry;
      const outer = ex * ex / (rx * rx) + ey * ey / (ry * ry) <= 1;
      const inner = rx > size && ry > size && ex * ex / ((rx - size) ** 2) + ey * ey / ((ry - size) ** 2) < 1;
      inside = outer && (filled || !inner);
    }
    if (inside) cells.push([box.x + x, box.y + y]);
  }
  return cells;
}

/** True when every k × k block holds one colour, so the image can be stored k times smaller without change. */
export function blocky(image: Pixels, k: number) {
  const { width, height, data } = image; if (width % k || height % k) return false;
  for (let y = 0; y < height; y += k) for (let x = 0; x < width; x += k) {
    const o = (y * width + x) * 4;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
      const p = ((y + dy) * width + x + dx) * 4;
      if (data[p] !== data[o] || data[p + 1] !== data[o + 1] || data[p + 2] !== data[o + 2] || data[p + 3] !== data[o + 3]) return false;
    }
  }
  return true;
}
/** Keep one pixel of each k × k block. */
export function downsample(image: Pixels, k: number): Pixels {
  const width = image.width / k, height = image.height / k, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(image.data.subarray((y * k * image.width + x * k) * 4, (y * k * image.width + x * k) * 4 + 4), (y * width + x) * 4);
  return { width, height, data };
}
/** The box around every pixel that is not fully transparent, or null for an empty image. */
export function contentBox(image: Pixels): Box | null {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = image.data[i * 4 + 3] ? 1 : 0;
  return maskBox(mask, image.width);
}
