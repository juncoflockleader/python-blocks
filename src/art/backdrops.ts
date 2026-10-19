import { INK, ellipse, shade, shape, type Ctx } from './draw';

/** Backdrops, 480 × 320 from the top-left corner: soft layered scenery with a
 * clear floor band near the bottom, so sprites standing at y −120 sit on it. */
export interface Backdrop { id: string; name: string; draw(c: Ctx): void }

function sky(c: Ctx, top: string, bottom: string, at = 320) { c.fillStyle = shade(c, 0, at, top, bottom); c.fillRect(0, 0, 480, 320); }
function cloud(c: Ctx, x: number, y: number, s: number, fill = '#ffffffee') {
  c.fillStyle = fill; c.beginPath();
  for (const [dx, dy, r] of [[-18, 4, 12], [-5, -4, 16], [12, 0, 13], [24, 6, 9], [3, 8, 12]] as const) { c.moveTo(x + dx * s + r * s, y + dy * s); c.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); }
  c.fill();
}
/** A hill line through the given points, filled down to the bottom. */
function hills(c: Ctx, points: [number, number][], fill: string | CanvasGradient) {
  c.beginPath(); c.moveTo(0, 320); c.lineTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; c.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 18, x1, y1); }
  c.lineTo(480, 320); c.closePath(); c.fillStyle = fill; c.fill();
}
function pine(c: Ctx, x: number, y: number, h: number, fill: string, snow?: string) {
  c.fillStyle = '#6b4f3a'; c.fillRect(x - h * 0.05, y - h * 0.2, h * 0.1, h * 0.2);
  for (let i = 0; i < 3; i++) { const t = y - h * 0.15 - i * h * 0.25, w = h * (0.32 - i * 0.07); shape(c, [[x - w, t], [x, t - h * 0.38], [x + w, t]], fill, null); if (snow) shape(c, [[x - w * 0.45, t - h * 0.2], [x, t - h * 0.38], [x + w * 0.45, t - h * 0.2]], snow, null); }
}
function roundTree(c: Ctx, x: number, y: number, s: number, dark: string, light: string) {
  c.fillStyle = '#7d5c41'; c.fillRect(x - 3 * s, y - 14 * s, 6 * s, 16 * s);
  ellipse(c, x, y - 24 * s, 18 * s, 16 * s, dark, null); ellipse(c, x - 4 * s, y - 28 * s, 11 * s, 9 * s, light, null);
}
function stars(c: Ctx, count: number, color: string, height = 220) {
  for (let i = 0; i < count; i++) { const x = (i * 137 + 29) % 480, y = (i * 71 + 13) % height, r = i % 7 === 0 ? 1.8 : i % 3 === 0 ? 1.2 : 0.8; ellipse(c, x, y, r, r, color, null); if (i % 11 === 0) { c.strokeStyle = color; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); } }
}

function meadow(c: Ctx) {
  sky(c, '#8fd3ef', '#e2f4ef', 260);
  ellipse(c, 392, 62, 40, 40, '#fff3b380', null); ellipse(c, 392, 62, 27, 27, '#ffe98a', null);
  cloud(c, 90, 66, 1.1); cloud(c, 250, 44, 0.85); cloud(c, 330, 120, 0.6);
  hills(c, [[0, 210], [140, 180], [300, 214], [480, 176]], '#a9d99a');
  hills(c, [[0, 246], [170, 226], [330, 250], [480, 230]], '#82c172');
  for (const [x, s] of [[60, 1.1], [104, 0.8], [402, 1], [446, 0.75]] as const) roundTree(c, x, 238 - s * 4, s, '#4f9a5f', '#79bb72');
  c.fillStyle = shade(c, 262, 320, '#6fbf4e', '#5aa441'); c.fillRect(0, 262, 480, 58);
  c.fillStyle = '#97da70'; c.fillRect(0, 262, 480, 3);
  c.fillStyle = '#e4cf98'; c.beginPath(); c.moveTo(196, 320); c.quadraticCurveTo(232, 290, 250, 262); c.lineTo(268, 262); c.quadraticCurveTo(262, 292, 290, 320); c.fill();
  for (let i = 0; i < 14; i++) { const x = (i * 97 + 20) % 470 + 5, y = 276 + (i * 37) % 38; if (x > 190 && x < 300) continue; ellipse(c, x, y, 2.6, 2.6, ['#f39ab5', '#fff4a8', '#ffffff'][i % 3], null); ellipse(c, x, y, 1, 1, '#f5c14e', null); }
}
function night(c: Ctx) {
  sky(c, '#16233f', '#3b4a78', 290);
  stars(c, 70, '#f6efcf');
  ellipse(c, 380, 72, 44, 44, '#f2eac933', null); ellipse(c, 380, 72, 29, 29, '#f4ecc8', null);
  for (const [x, y, r] of [[370, 64, 5], [389, 82, 4], [391, 62, 2.5]] as const) ellipse(c, x, y, r, r, '#dcd3ad', null);
  hills(c, [[0, 226], [150, 196], [300, 230], [480, 200]], '#24365a');
  for (const x of [40, 70, 420, 452]) pine(c, x, 248, 54, '#1b2a45');
  c.fillStyle = shade(c, 262, 320, '#22344f', '#17253a'); c.fillRect(0, 262, 480, 58);
  c.fillStyle = '#2f4566'; c.fillRect(0, 262, 480, 3);
  for (let i = 0; i < 9; i++) { const x = (i * 113 + 40) % 460 + 10, y = 200 + (i * 29) % 70; ellipse(c, x, y, 5, 5, '#f8e48a33', null); ellipse(c, x, y, 1.6, 1.6, '#fff1a6', null); }
}
function cave(c: Ctx) {
  sky(c, '#2c2440', '#4a3e62');
  for (let i = 0; i < 6; i++) { const x = 40 + i * 82, y = 70 + (i % 2) * 40; ellipse(c, x, y, 70, 46, '#3a3052', null); }
  c.fillStyle = '#211a31'; c.fillRect(0, 0, 480, 26);
  for (let i = 0; i < 12; i++) { const x = i * 42 + 10, h = 30 + (i * 23) % 40; shape(c, [[x - 12, 24], [x, 24 + h], [x + 12, 24]], '#2a2240', null); }
  for (const [x, y, s] of [[70, 212, 1], [150, 236, 0.7], [370, 222, 1.2], [430, 244, 0.7]] as const) {
    ellipse(c, x, y, 22 * s, 22 * s, '#7ce0e840', null);
    for (const [dx, h, w] of [[-6, 22, 5], [0, 32, 6], [7, 20, 5]] as const) shape(c, [[x + dx * s - w * s, y + 10 * s], [x + dx * s, y + (10 - h) * s], [x + dx * s + w * s, y + 10 * s]], '#9de0e8', INK, 1);
  }
  c.fillStyle = shade(c, 262, 320, '#5a5070', '#3e3652'); c.fillRect(0, 262, 480, 58);
  c.fillStyle = '#7a6f94'; c.fillRect(0, 262, 480, 3);
  for (let i = 0; i < 10; i++) { const x = (i * 89 + 16) % 470, h = 14 + (i * 13) % 20; shape(c, [[x - 9, 264], [x, 264 - h], [x + 9, 264]], '#4a4060', null); }
}
function snow(c: Ctx) {
  sky(c, '#bfe0f2', '#eef7fb', 260);
  cloud(c, 120, 60, 0.9, '#ffffffcc'); cloud(c, 360, 40, 1.1, '#ffffffcc');
  for (const [x, w, h] of [[110, 160, 150], [300, 200, 175], [440, 150, 130]] as const) {
    shape(c, [[x - w / 2, 250], [x, 250 - h], [x + w / 2, 250]], '#9fbdd1', null);
    shape(c, [[x - w * 0.18, 250 - h * 0.64], [x, 250 - h], [x + w * 0.18, 250 - h * 0.64], [x + w * 0.06, 250 - h * 0.58], [x - w * 0.05, 250 - h * 0.66]], '#ffffff', null);
  }
  hills(c, [[0, 236], [160, 216], [320, 240], [480, 222]], '#e6f2f8');
  for (const [x, h] of [[44, 64], [80, 50], [400, 60], [446, 46]] as const) pine(c, x, 254, h, '#3f7a63', '#ffffff');
  c.fillStyle = shade(c, 262, 320, '#ffffff', '#dbeaf2'); c.fillRect(0, 262, 480, 58);
  c.fillStyle = '#c9dde8'; c.fillRect(0, 262, 480, 2);
  for (let i = 0; i < 40; i++) ellipse(c, (i * 131 + 7) % 480, (i * 59 + 9) % 250, i % 4 ? 1.4 : 2.2, i % 4 ? 1.4 : 2.2, '#ffffff', null);
}
function castle(c: Ctx) {
  sky(c, '#a7d4ee', '#f3e7cf', 260);
  cloud(c, 80, 56, 0.9); cloud(c, 420, 84, 0.7);
  hills(c, [[0, 232], [150, 212], [320, 236], [480, 214]], '#9fcf8c');
  const wall = '#c9c2b3', dark = '#a59d8e';
  const tower = (x: number, w: number, h: number) => {
    c.fillStyle = wall; c.fillRect(x - w / 2, 246 - h, w, h); c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(x - w / 2, 246 - h, w, h);
    for (let i = 0; i < 3; i++) { c.fillStyle = wall; c.fillRect(x - w / 2 + i * (w / 3) + 1, 246 - h - 8, w / 3 - 5, 8); c.strokeRect(x - w / 2 + i * (w / 3) + 1, 246 - h - 8, w / 3 - 5, 8); }
    shape(c, [[x - 4, 246 - h - 8], [x - 4, 246 - h - 30], [x + 12, 246 - h - 25], [x - 4, 246 - h - 20]], '#e0605a', INK, 1);
    c.fillStyle = '#5a4a62'; c.beginPath(); c.roundRect(x - 4, 246 - h + 18, 8, 12, [4, 4, 0, 0]); c.fill();
  };
  c.fillStyle = wall; c.fillRect(150, 160, 180, 86); c.strokeStyle = INK; c.lineWidth = 1.2; c.strokeRect(150, 160, 180, 86);
  for (let x = 152; x < 330; x += 18) { c.fillStyle = wall; c.fillRect(x, 150, 11, 10); c.strokeRect(x, 150, 11, 10); }
  c.strokeStyle = dark; c.lineWidth = 1; for (let y = 172; y < 246; y += 12) { c.beginPath(); c.moveTo(151, y); c.lineTo(329, y); c.stroke(); }
  c.fillStyle = '#6d4c3d'; c.beginPath(); c.roundRect(222, 200, 36, 46, [18, 18, 0, 0]); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  tower(150, 46, 130); tower(330, 46, 130); tower(240, 40, 150);
  c.fillStyle = shade(c, 262, 320, '#8fc778', '#73ad5f'); c.fillRect(0, 246, 480, 74);
  c.fillStyle = '#d8cfba'; c.beginPath(); c.moveTo(214, 246); c.lineTo(266, 246); c.lineTo(300, 320); c.lineTo(180, 320); c.fill();
  c.fillStyle = '#a9db8a'; c.fillRect(0, 262, 180, 3); c.fillRect(300, 262, 180, 3);
}
function desert(c: Ctx) {
  sky(c, '#f6c98a', '#fbead0', 240);
  ellipse(c, 360, 80, 50, 50, '#fff1c455', null); ellipse(c, 360, 80, 32, 32, '#fff3c4', null);
  for (const [x, w, h] of [[80, 120, 70], [400, 150, 90]] as const) { c.fillStyle = '#d99b6a'; c.beginPath(); c.moveTo(x - w / 2, 236); c.lineTo(x - w / 2 + 14, 236 - h); c.lineTo(x + w / 2 - 14, 236 - h); c.lineTo(x + w / 2, 236); c.fill(); c.fillStyle = '#c4845a'; c.fillRect(x - w / 2 + 14, 236 - h, w - 28, 8); }
  hills(c, [[0, 240], [140, 222], [300, 246], [480, 226]], '#efc98d');
  const cactus = (x: number, h: number) => {
    const g = '#5fa56e';
    c.fillStyle = g; c.beginPath(); c.roundRect(x - 6, 262 - h, 12, h, 6); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    c.beginPath(); c.roundRect(x - 18, 262 - h * 0.7, 8, h * 0.35, 4); c.fill(); c.stroke(); c.beginPath(); c.roundRect(x - 13, 262 - h * 0.42, 9, 6, 3); c.fill();
    c.beginPath(); c.roundRect(x + 10, 262 - h * 0.85, 8, h * 0.4, 4); c.fill(); c.stroke(); c.beginPath(); c.roundRect(x + 5, 262 - h * 0.5, 9, 6, 3); c.fill();
  };
  cactus(60, 70); cactus(420, 56);
  c.fillStyle = shade(c, 262, 320, '#f3d39c', '#e2b878'); c.fillRect(0, 262, 480, 58);
  c.fillStyle = '#f8e2b4'; c.fillRect(0, 262, 480, 3);
  c.strokeStyle = '#d9a967'; c.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const y = 280 + i * 7; c.beginPath(); c.moveTo((i * 70) % 300, y); c.quadraticCurveTo((i * 70) % 300 + 40, y - 4, (i * 70) % 300 + 80, y); c.stroke(); }
}

export const BACKDROPS: Backdrop[] = [
  { id: 'meadow', name: 'Meadow', draw: meadow }, { id: 'night', name: 'Night', draw: night },
  { id: 'cave', name: 'Cave', draw: cave }, { id: 'snow', name: 'Snow', draw: snow },
  { id: 'castle', name: 'Castle', draw: castle }, { id: 'desert', name: 'Desert', draw: desert },
];
export function paintBackdrop(c: Ctx, id: string) {
  const backdrop = BACKDROPS.find(b => b.id === id); if (!backdrop) throw new Error(`No backdrop ${id}`);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; backdrop.draw(c); c.restore();
}
