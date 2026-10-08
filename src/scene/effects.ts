export const effectLimits = {
  color: [0, 360], brightness: [-100, 100], ghost: [0, 100],
  whirl: [-360, 360], fisheye: [-100, 1000], pixelate: [0, 128], mosaic: [0, 15],
} as const;
export type Effect = keyof typeof effectLimits;
export type Effects = Partial<Record<Effect, number>>;
export const effectNames = Object.keys(effectLimits) as Effect[];
export const effectOptions = effectNames.map(name => [name === 'color' ? 'color (hue °)' : name, name]);
export function validEffects(value: unknown): value is Effects {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, n]) => key in effectLimits && typeof n === 'number' && Number.isFinite(n) && n >= effectLimits[key as Effect][0] && n <= effectLimits[key as Effect][1]);
}

/** Original bitmap effects. Geometry samples within the costume; transparent pixels stay transparent. */
export function effectPixels(source: Uint8ClampedArray, width: number, height: number, effects: Effects) {
  const out = new Uint8ClampedArray(source.length);
  const hue = (effects.color ?? 0) / 360, light = (effects.brightness ?? 0) * 2.55, alpha = 1 - (effects.ghost ?? 0) / 100;
  const tiles = 1 + Math.floor(effects.mosaic ?? 0), cell = Math.max(1, Math.round(effects.pixelate ?? 0));
  const power = Math.max(.01, 1 + (effects.fisheye ?? 0) / 100), whirl = (effects.whirl ?? 0) * Math.PI / 180;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let u = ((x + .5) / width * tiles) % 1, v = ((y + .5) / height * tiles) % 1;
    let dx = u * 2 - 1, dy = v * 2 - 1;
    const radius = Math.hypot(dx, dy);
    if (radius > 0 && radius < 1) {
      const turn = whirl * (1 - radius) ** 2, scale = radius ** (power - 1);
      const cos = Math.cos(turn), sin = Math.sin(turn);
      [dx, dy] = [(dx * cos - dy * sin) * scale, (dx * sin + dy * cos) * scale];
    }
    u = Math.max(0, Math.min(width - 1, Math.floor((dx + 1) / 2 * width / cell) * cell + Math.floor(cell / 2)));
    v = Math.max(0, Math.min(height - 1, Math.floor((dy + 1) / 2 * height / cell) * cell + Math.floor(cell / 2)));
    const from = (v * width + u) * 4, to = (y * width + x) * 4;
    let r = source[from], g = source[from + 1], b = source[from + 2];
    if (hue) {
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      if (delta) {
        const h = (((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) / 6 + hue) % 1 + 1) % 1 * 6;
        const second = delta * (1 - Math.abs(h % 2 - 1));
        [r, g, b] = h < 1 ? [delta, second, 0] : h < 2 ? [second, delta, 0] : h < 3 ? [0, delta, second] : h < 4 ? [0, second, delta] : h < 5 ? [second, 0, delta] : [delta, 0, second];
        r += min; g += min; b += min;
      }
    }
    out[to] = r + light; out[to + 1] = g + light; out[to + 2] = b + light; out[to + 3] = source[from + 3] * alpha;
  }
  return out;
}
