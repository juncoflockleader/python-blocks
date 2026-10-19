import type { Ctx } from './draw';
import { paintStock, stockAsset, stockScale } from './catalog';

/** Paint library art into a box of its stage size at the context's origin
 * (top-left), as a decoded image would be drawn. */
export function paintStockBox(c: Ctx, reference: string) {
  const art = stockAsset(reference); if (!art) throw new Error('This library artwork is not available in this version of Python Blocks.');
  c.save(); if (art.kind === 'costume') c.translate(art.width / 2, art.height / 2); paintStock(c, reference); c.restore();
}
const urls = new Map<string, string>();
/** Library art as a PNG data URL at its page scale, so it loads like any other picture. */
export function stockDataUrl(reference: string) {
  let url = urls.get(reference); if (url) return url;
  const art = stockAsset(reference); if (!art) throw new Error('This library artwork is not available in this version of Python Blocks.');
  const scale = stockScale(art.width, art.height, art.kind), canvas = document.createElement('canvas');
  canvas.width = art.width * scale; canvas.height = art.height * scale;
  const c = canvas.getContext('2d')!; c.scale(scale, scale); paintStockBox(c, reference);
  url = canvas.toDataURL('image/png'); urls.set(reference, url); return url;
}
