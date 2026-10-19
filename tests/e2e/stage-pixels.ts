/** Stage pixels in 480 × 320 stage coordinates, whatever resolution the canvas is
 * drawn at (it follows the screen, 1× to 4×). Use with `locator.evaluate`:
 * `page.locator('#stage').evaluate(stagePixels, [x, y, width, height])`. */
export function stagePixels(canvas: Element, [x, y, width, height]: number[]) {
  const copy = document.createElement('canvas'); copy.width = 480; copy.height = 320;
  const ctx = copy.getContext('2d')!; ctx.imageSmoothingEnabled = false; ctx.drawImage(canvas as HTMLCanvasElement, 0, 0, 480, 320);
  return Array.from(ctx.getImageData(x, y, width, height).data);
}
