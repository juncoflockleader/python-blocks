import { INK, LINE, ellipse, shape, type Ctx } from './draw';

/** World tiles: four themes, each with the pieces a level is built from. A
 * tile is 32 × 32 stage units centred on the origin; outlines are drawn only on
 * a piece's outside edges, so neighbouring tiles join without seams. */
export const THEMES = ['grass', 'snow', 'cave', 'castle', 'sand', 'metal'] as const;
export type Theme = typeof THEMES[number];
export const PIECES = ['top-left', 'top', 'top-right', 'left', 'middle', 'right', 'platform', 'block'] as const;
export type Piece = typeof PIECES[number];
export const PIECE_NAMES: Record<Piece, string> = { 'top-left': 'top left', top: 'top', 'top-right': 'top right', left: 'left', middle: 'middle', right: 'right', platform: 'platform', block: 'block' };
export const THEME_NAMES: Record<Theme, string> = { grass: 'Grass', snow: 'Snow', cave: 'Cave', castle: 'Castle', sand: 'Sand', metal: 'Metal' };
interface Look { body: [string, string]; surface: string; surfaceLight: string; dot: string; edge: string }
const LOOKS: Record<Theme, Look> = {
  grass: { body: ['#b68856', '#8f663f'], surface: '#6fbf4e', surfaceLight: '#97da70', dot: '#7a5534', edge: '#6b4a2c' },
  snow: { body: ['#a9c7d6', '#7ea3b8'], surface: '#f7fcff', surfaceLight: '#ffffff', dot: '#6d93a8', edge: '#5d8299' },
  cave: { body: ['#6f6585', '#544b68'], surface: '#8d84a6', surfaceLight: '#aaa2c0', dot: '#463e58', edge: '#3b344c' },
  castle: { body: ['#c9c2b3', '#aaa293'], surface: '#ddd6c6', surfaceLight: '#efe9dc', dot: '#8f887a', edge: '#7c7568' },
  sand: { body: ['#e6c98e', '#cfae6e'], surface: '#f3dfae', surfaceLight: '#fbefcf', dot: '#c29a5c', edge: '#a8834a' },
  metal: { body: ['#7f9ea8', '#62818b'], surface: '#a9c3c8', surfaceLight: '#cfe0e2', dot: '#41606a', edge: '#3a5560' },
};
const has = (piece: Piece) => ({
  top: ['top-left', 'top', 'top-right', 'platform', 'block'].includes(piece),
  left: ['top-left', 'left', 'platform', 'block'].includes(piece),
  right: ['top-right', 'right', 'platform', 'block'].includes(piece),
  bottom: ['platform', 'block'].includes(piece),
});

export function paintTile(c: Ctx, theme: Theme, piece: Piece) {
  const look = LOOKS[theme], edge = has(piece), r = 5;
  const left = -16, right = 16, top = -16, bottom = piece === 'platform' ? 2 : 16;
  const rounded = (corner: boolean) => corner ? r : 0;
  const outline = () => { c.beginPath(); c.roundRect(left, top, right - left, bottom - top, [rounded(edge.top && edge.left), rounded(edge.top && edge.right), rounded(edge.bottom && edge.right), rounded(edge.bottom && edge.left)]); };
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  // A flat body, so stacked tiles show no bands; only a real bottom edge gets a shadow.
  outline(); c.fillStyle = look.body[0]; c.fill();
  c.save(); outline(); c.clip();
  if (edge.bottom) { c.fillStyle = look.body[1]; c.fillRect(left, bottom - 4, right - left, 4); }
  // The texture of each theme, the same in every piece so they tile.
  if (theme === 'castle') {
    c.strokeStyle = look.dot; c.lineWidth = 1;
    for (const y of [-8, 0, 8]) { c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.stroke(); }
    for (const [x, y0] of [[-8, -16], [8, -16], [0, -8], [-8, 0], [8, 0], [0, 8]] as const) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 + 8); c.stroke(); }
  } else if (theme === 'metal') {
    c.strokeStyle = look.dot; c.lineWidth = 1.2; c.strokeRect(-11, -11, 22, 22);
    for (const [x, y] of [[-8, -8], [8, -8], [-8, 8], [8, 8]] as const) ellipse(c, x, y, 1.4, 1.4, '#d6e4e4', null);
  } else if (theme === 'cave') {
    for (const [x, y, rr] of [[-8, -2, 3], [6, 6, 4], [-2, 11, 2.5], [10, -6, 2]] as const) ellipse(c, x, y, rr, rr * 0.7, look.dot, null);
    if (piece === 'middle' || piece === 'block') { shape(c, [[-3, 4], [-1, -3], [1, 4]], '#9de0e8', INK, 0.8); shape(c, [[1, 5], [3, 0], [5, 5]], '#c6f0f4', INK, 0.8); }
  } else {
    for (const [x, y] of [[-9, -1], [7, 3], [-2, 9], [10, 12], [-11, 12]] as const) ellipse(c, x, y, 2, 1.4, look.dot, null);
  }
  if (edge.left) c.fillStyle = '#ffffff22', c.fillRect(left, top, 3, bottom - top);
  if (edge.right) c.fillStyle = '#0000001a', c.fillRect(right - 3, top, 3, bottom - top);
  // The surface: grass with blades, snow with soft drips, a mossy cave lip, castle coping.
  if (edge.top) {
    const depth = theme === 'castle' ? 6 : 8;
    c.fillStyle = look.surface; c.beginPath(); c.moveTo(left, top); c.lineTo(right, top); c.lineTo(right, top + depth - 2);
    for (let x = right; x >= left; x -= 4) c.quadraticCurveTo(x - 2, top + depth + (theme === 'snow' ? (x % 8 ? 3 : 1) : 2), x - 4, top + depth - 2);
    c.closePath(); c.fill();
    c.fillStyle = look.surfaceLight; c.fillRect(left, top, right - left, 2.5);
    if (theme === 'grass') for (const x of [-11, -1, 9]) shape(c, [[x, top + 2], [x + 1, top - 1.5], [x + 2, top + 2]], '#4f9a3d', null);
    if (theme === 'castle') { c.strokeStyle = look.dot; c.lineWidth = 1; c.beginPath(); c.moveTo(left, top + depth); c.lineTo(right, top + depth); c.stroke(); }
  }
  c.restore();
  // Outlines on the outside edges only.
  c.strokeStyle = INK; c.lineWidth = LINE;
  if (edge.top && edge.left && edge.right && edge.bottom) { outline(); c.stroke(); }
  else {
    c.beginPath();
    if (edge.top) { c.moveTo(left + (edge.left ? r : 0), top + 0.7); c.lineTo(right - (edge.right ? r : 0), top + 0.7); }
    if (edge.left) { c.moveTo(left + 0.7, top + (edge.top ? r : 0)); c.lineTo(left + 0.7, bottom); }
    if (edge.right) { c.moveTo(right - 0.7, top + (edge.top ? r : 0)); c.lineTo(right - 0.7, bottom); }
    c.stroke();
    if (edge.top && edge.left) { c.beginPath(); c.arc(left + r + 0.7, top + r + 0.7, r, Math.PI, Math.PI * 1.5); c.stroke(); }
    if (edge.top && edge.right) { c.beginPath(); c.arc(right - r - 0.7, top + r + 0.7, r, Math.PI * 1.5, Math.PI * 2); c.stroke(); }
  }
  c.restore();
}
