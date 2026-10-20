/** Drawing helpers shared by the library art. Everything is drawn in stage
 * units around the artwork's centre, so the same code paints a 1× thumbnail,
 * a 2× costume or a 4× preview; contexts may be on the page or offscreen. */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The soft outline and the pastel palette shared with the interface. */
export const INK = '#2b4450';
export const LINE = 1.4;
export const CREAM = '#fff4dc';
export const BLUSH = '#f4a68c';

export function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill?: string | CanvasGradient, stroke: string | null = INK, width = LINE, rotation = 0) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function shape(c: Ctx, points: [number, number][], fill?: string | CanvasGradient, stroke: string | null = INK, width = LINE, close = true) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); if (close) c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function box(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke: string | null = INK, width = LINE) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
}
export function line(c: Ctx, points: [number, number][], stroke = INK, width = LINE) {
  c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
}
export function curve(c: Ctx, from: [number, number], control: [number, number], to: [number, number], stroke = INK, width = LINE) {
  c.beginPath(); c.moveTo(...from); c.quadraticCurveTo(...control, ...to); c.strokeStyle = stroke; c.lineWidth = width; c.stroke();
}
/** A vertical gradient from a lighter top to the base colour. */
export function shade(c: Ctx, top: number, bottom: number, light: string, base: string) {
  const g = c.createLinearGradient(0, top, 0, bottom); g.addColorStop(0, light); g.addColorStop(1, base); return g;
}
/** A rounded limb from a joint, swung by `angle` (positive swings forward, to the right). */
export function limb(c: Ctx, x: number, y: number, angle: number, length: number, width: number, fill: string, end?: { rx: number; ry: number; fill: string; dx?: number }) {
  const tx = x + Math.sin(angle) * length, ty = y + Math.cos(angle) * length;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.strokeStyle = INK; c.lineWidth = width + LINE * 2; c.stroke();
  c.beginPath(); c.moveTo(x, y); c.lineTo(tx, ty); c.strokeStyle = fill; c.lineWidth = width; c.stroke();
  if (end) ellipse(c, tx + (end.dx ?? 0), ty, end.rx, end.ry, end.fill);
  return [tx, ty] as const;
}
export type Eyes = 'open' | 'blink' | 'happy';
/** Two eyes looking right, a little apart: the near one larger. */
export function eyes(c: Ctx, x: number, y: number, kind: Eyes, size = 1, gap = 8) {
  for (const [dx, scale] of [[0, 1], [gap, 0.9]] as const) {
    const ex = x + dx * size, r = 2.6 * size * scale;
    if (kind === 'open') { ellipse(c, ex, y, r, r * 1.2, INK, null); ellipse(c, ex + r * 0.35, y - r * 0.45, r * 0.38, r * 0.38, '#ffffff', null); }
    else if (kind === 'blink') line(c, [[ex - r, y], [ex + r, y]], INK, 1.3 * size);
    else curve(c, [ex - r, y + r * 0.4], [ex, y - r * 1.2], [ex + r, y + r * 0.4], INK, 1.4 * size);
  }
}
export type Mouth = 'smile' | 'open' | 'line';
export function mouth(c: Ctx, x: number, y: number, kind: Mouth, size = 1) {
  if (kind === 'open') { c.beginPath(); c.moveTo(x - 2.4 * size, y - 0.5 * size); c.quadraticCurveTo(x, y + 4 * size, x + 2.4 * size, y - 0.5 * size); c.closePath(); c.fillStyle = '#b8454a'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.1 * size; c.stroke(); }
  else if (kind === 'smile') curve(c, [x - 2 * size, y - 0.4 * size], [x, y + 1.8 * size], [x + 2 * size, y - 0.4 * size], INK, 1.1 * size);
  else line(c, [[x - 1.6 * size, y], [x + 1.6 * size, y]], INK, 1.1 * size);
}
