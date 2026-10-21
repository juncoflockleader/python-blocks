import { paintStock, stockAsset } from '../art/catalog';
import { INK } from '../art/draw';

/** A puzzle's picture, laid over the stage while its step is open: a backdrop,
 * library art placed in stage units from the top-left (480 × 320), labels or a
 * speech bubble, and the Chick as the judge in the corner, who cheers once every
 * test passes. Puzzles do not use the stage, so the picture shows the story. */
export interface PuzzlePicture {
  backdrop: string;
  /** Library art: reference, centre x, centre y, and scale. */
  art?: [string, number, number, number?][];
  /** Text: words, centre x, centre y, and `say` for a speech bubble. */
  labels?: [string, number, number, 'say'?][];
}
const JUDGE: [number, number, number] = [418, 236, 1.5];

/** `judge`: the Chick in the corner, for a puzzle; a guide panel is the cast alone. */
export function paintPuzzle(canvas: HTMLCanvasElement, picture: PuzzlePicture, cheering = false, judge = true) {
  const scale = canvas.width / 480, c = canvas.getContext('2d'); if (!c) return;
  c.save(); c.clearRect(0, 0, canvas.width, canvas.height); c.scale(scale, scale); c.lineJoin = 'round'; c.lineCap = 'round';
  paintStock(c, picture.backdrop);
  const place = (ref: string, x: number, y: number, k = 1) => { const a = stockAsset(ref); if (!a) return; c.save(); c.translate(x, y); c.scale(k, k); paintStock(c, ref); c.restore(); };
  for (const [ref, x, y, k] of picture.art ?? []) place(ref, x, y, k);
  for (const [text, x, y, say] of picture.labels ?? []) {
    c.save(); c.font = '700 26px "DM Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 26;
    c.fillStyle = say ? '#fffef8' : '#fffef8d9'; c.beginPath(); c.roundRect(x - w / 2, y - 21, w, 42, say ? 14 : 11); c.fill();
    if (say) { c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke(); }
    c.fillStyle = '#26382f'; c.fillText(text, x, y + 1); c.restore();
  }
  if (judge) place(cheering ? 'cast/chick-happy@1' : 'cast/chick-idle-1@1', ...JUDGE);
  c.restore();
}
