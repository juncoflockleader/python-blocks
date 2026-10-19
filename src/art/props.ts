import { CREAM, INK, LINE, box, curve, ellipse, line, shade, shape, type Ctx } from './draw';

/** Library props in the cast's style. Each is drawn centred on the origin in
 * its own size; coins and gems have a six-frame spin. */
export interface Prop { id: string; name: string; width: number; height: number; frames: number; draw(c: Ctx, frame: number): void }

/** How wide a spinning thing looks in each of six frames. */
const SPIN = [1, 0.72, 0.22, 0.22, 0.72, 1];
function coin(c: Ctx, frame: number) {
  const w = SPIN[frame], edge = frame === 2 || frame === 3;
  ellipse(c, 0, 0, 11 * w + (edge ? 1.5 : 0), 12, edge ? '#c98e2e' : shade(c, -12, 12, '#ffe28a', '#efb43f'));
  if (!edge) {
    ellipse(c, 0, 0, 7.6 * w, 8.6, undefined, '#d49a33', 1.4);
    box(c, -1.6 * w, -5, 3.2 * w, 10, 1.5 * w, '#d49a33', null);
    if (frame < 2) curve(c, [-6.5 * w, -4], [-6 * w, -8], [-3 * w, -9.5], '#ffffffcc', 1.6);
  } else line(c, [[0, -9], [0, 9]], '#ffe28a', 1.2);
}
function gem(c: Ctx, frame: number) {
  const w = SPIN[frame], flip = frame >= 3 ? -1 : 1;
  const left = -12 * w, right = 12 * w, mid = 3 * w * flip;
  shape(c, [[left * 0.6, -9], [right * 0.6, -9], [right, -3], [0, 13], [left, -3]], '#5aa3c4');
  shape(c, [[left * 0.6, -9], [mid, -3], [left, -3]], '#a8e0ec', null);
  shape(c, [[right * 0.6, -9], [mid, -3], [right, -3]], '#7cc4dc', null);
  shape(c, [[left, -3], [mid, -3], [0, 13]], '#7cc4dc', null);
  shape(c, [[left * 0.6, -9], [right * 0.6, -9], [right, -3], [0, 13], [left, -3]], undefined);
  line(c, [[left, -3], [right, -3]], INK, 1);
  if (frame < 2) ellipse(c, left * 0.25, -6, 1.6 * w + 0.4, 1.2, '#ffffff', null);
}
function heart(c: Ctx) {
  c.beginPath(); c.moveTo(0, 11); c.bezierCurveTo(-16, 1, -12, -13, 0, -5); c.bezierCurveTo(12, -13, 16, 1, 0, 11); c.closePath();
  c.fillStyle = shade(c, -11, 11, '#f58a8f', '#e0505c'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  ellipse(c, -6, -4, 2.6, 1.8, '#ffffffaa', null, 0, -0.6);
}
function key(c: Ctx) {
  ellipse(c, -6, 0, 7, 7, shade(c, -7, 7, '#ffe28a', '#e8b03c')); ellipse(c, -6, 0, 3, 3, '#fffaf0');
  box(c, 0, -2, 14, 4, 1.5, '#e8b03c'); box(c, 8, 1, 3, 5, 1, '#e8b03c'); box(c, 12, 1, 3, 4, 1, '#e8b03c');
}
function door(c: Ctx) {
  c.beginPath(); c.moveTo(-17, 31); c.lineTo(-17, -16); c.arc(0, -16, 17, Math.PI, 0); c.lineTo(17, 31); c.closePath();
  c.fillStyle = '#7d8b8f'; c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  c.beginPath(); c.moveTo(-13, 31); c.lineTo(-13, -15); c.arc(0, -15, 13, Math.PI, 0); c.lineTo(13, 31); c.closePath();
  c.fillStyle = shade(c, -28, 31, '#b9845a', '#8c5a39'); c.fill(); c.stroke();
  for (const x of [-6.5, 0, 6.5]) line(c, [[x, -26 + Math.abs(x) * 0.4], [x, 31]], '#6d4329', 1.1);
  for (const yy of [-6, 18]) box(c, -13, yy, 26, 3, 1, '#5b6668', INK, 1);
  ellipse(c, 8.5, 6, 1.8, 1.8, '#f2c14e');
}
function spikes(c: Ctx) {
  box(c, -16, 10, 32, 6, 1.5, '#7d8b8f');
  for (let i = 0; i < 4; i++) shape(c, [[-16 + i * 8, 10], [-12 + i * 8, -14], [-8 + i * 8, 10]], shade(c, -14, 10, '#eef2f2', '#a9b6b8'));
}
function platform(c: Ctx) {
  box(c, -47, -10, 94, 20, 6, shade(c, -10, 10, '#c79a6b', '#9c6d45'));
  box(c, -47, -10, 94, 7, 4, '#6fbf4e');
  for (const x of [-30, -6, 18]) ellipse(c, x, 4, 2.2, 1.5, '#7c5634', null);
  for (const x of [-38, -16, 8, 30]) shape(c, [[x, -3], [x + 3, 1], [x + 6, -3]], '#6fbf4e', null);
}
function crate(c: Ctx) {
  box(c, -15, -15, 30, 30, 3, shade(c, -15, 15, '#d8a467', '#b47b45'));
  box(c, -11, -11, 22, 22, 1, undefined, '#8c5a39', 1.4);
  line(c, [[-11, -11], [11, 11]], '#8c5a39', 3); line(c, [[-11, -11], [11, 11]], '#d8a467', 1.2);
  for (const [x, y] of [[-12.5, -12.5], [12.5, -12.5], [-12.5, 12.5], [12.5, 12.5]] as const) ellipse(c, x, y, 1.2, 1.2, '#6d4329', null);
}
function tree(c: Ctx) {
  box(c, -4, 6, 8, 25, 3, shade(c, 6, 31, '#a77a52', '#86603e'));
  ellipse(c, -11, -2, 14, 13, '#4f9468'); ellipse(c, 12, -1, 13, 12, '#3f8059'); ellipse(c, 0, -14, 16, 14, shade(c, -28, 0, '#86c387', '#5ba574'));
  ellipse(c, -4, -18, 5, 3, '#a6d79a', null);
}
function flower(c: Ctx) {
  line(c, [[0, 2], [0, 30]], '#4f8a5f', 2.4); ellipse(c, -7, 20, 7, 3, '#79b07e', INK, 1, -0.4); ellipse(c, 7, 25, 7, 3, '#79b07e', INK, 1, 0.4);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ellipse(c, Math.cos(a) * 9, -8 + Math.sin(a) * 9, 7, 7, '#ec9ab3'); }
  ellipse(c, 0, -8, 6.5, 6.5, '#f5d26a'); ellipse(c, -2, -10, 2, 1.4, CREAM, null);
}
function rocket(c: Ctx, frame: number) {
  const flame = frame % 2 ? 1.2 : 1;
  shape(c, [[-7, 19], [0, 19 + 12 * flame], [7, 19]], '#f2a541'); shape(c, [[-4, 19], [0, 19 + 7 * flame], [4, 19]], CREAM, null);
  shape(c, [[-9, 3], [-20, 20], [-9, 17]], '#e0846a'); shape(c, [[9, 3], [20, 20], [9, 17]], '#e0846a');
  c.beginPath(); c.moveTo(-10, 19); c.quadraticCurveTo(-15, -10, 0, -28); c.quadraticCurveTo(15, -10, 10, 19); c.closePath();
  c.fillStyle = shade(c, -28, 19, '#ffffff', '#d9e3e2'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  ellipse(c, 0, -5, 6.5, 6.5, '#5d9ba7'); ellipse(c, -2, -7, 2, 1.5, '#d6f0f3', null);
  box(c, -10, 14, 20, 5, 2, '#e0846a');
}

export const PROPS: Prop[] = [
  { id: 'coin', name: 'Coin', width: 32, height: 32, frames: 6, draw: coin },
  { id: 'gem', name: 'Gem', width: 32, height: 32, frames: 6, draw: gem },
  { id: 'heart', name: 'Heart', width: 32, height: 32, frames: 1, draw: heart },
  { id: 'key', name: 'Key', width: 32, height: 32, frames: 1, draw: key },
  { id: 'door', name: 'Door', width: 48, height: 64, frames: 1, draw: door },
  { id: 'spikes', name: 'Spikes', width: 32, height: 32, frames: 1, draw: spikes },
  { id: 'platform', name: 'Platform', width: 96, height: 24, frames: 1, draw: platform },
  { id: 'crate', name: 'Crate', width: 32, height: 32, frames: 1, draw: crate },
  { id: 'tree', name: 'Tree', width: 64, height: 64, frames: 1, draw: tree },
  { id: 'flower', name: 'Flower', width: 64, height: 64, frames: 1, draw: flower },
  { id: 'rocket', name: 'Rocket', width: 64, height: 64, frames: 2, draw: rocket },
];
export function paintProp(c: Ctx, id: string, frame = 0) {
  const prop = PROPS.find(p => p.id === id); if (!prop) throw new Error(`No prop ${id}`);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; prop.draw(c, frame % prop.frames); c.restore();
}
