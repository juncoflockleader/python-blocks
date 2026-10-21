import { CREAM, INK, LINE, box, curve, ellipse, line, shade, shape, type Ctx } from './draw';
import { ARCADE_PROPS } from './arcade';

/** Library props in the cast's style. Each is drawn centred on the origin in
 * its own size; coins and gems have a six-frame spin, and a brick comes in five
 * colours (`variants`: one picture each, drawn as frames). The game pieces are
 * drawn at the lessons' sizes, so their collisions stay the same. */
export interface Prop { id: string; name: string; width: number; height: number; frames: number; variants?: string[]; draw(c: Ctx, frame: number): void;
  /** What the library says about it, and the animation its frames make (none for a ship's engine off and on). */
  detail?: string; animation?: string | null }

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

function paddle(c: Ctx) {
  box(c, -39, -5.5, 78, 11, 5.5, shade(c, -5.5, 5.5, '#7fd0c4', '#3f9e94'));
  box(c, -39, -5.5, 12, 11, 5.5, '#f2c14e'); box(c, 27, -5.5, 12, 11, 5.5, '#f2c14e');
  line(c, [[-25, -2.6], [25, -2.6]], '#ffffff99', 1.6);
}
function ball(c: Ctx) {
  ellipse(c, 0, 0, 6, 6, shade(c, -6, 6, '#ffffff', '#ffe4a8'));
  ellipse(c, -2, -2.2, 1.6, 1.1, '#ffffff', null, LINE, -0.6);
}
const BRICKS: [string, string, string][] = [['red', '#f08c76', '#d9604c'], ['orange', '#f6b26b', '#e58d40'], ['yellow', '#f8d77a', '#e8b94f'], ['green', '#9fd47f', '#6fb256'], ['blue', '#8fc7e0', '#4f93b8']];
function brick(c: Ctx, colour: number) {
  const [, light, base] = BRICKS[colour];
  box(c, -21, -6, 42, 12, 3, shade(c, -6, 6, light, base));
  line(c, [[-17, -3.4], [17, -3.4]], '#ffffff88', 1.4);
}
/** Two pipes with a 64-unit gap between their lips, as one picture, so a pair moves as one sprite. */
function pipes(c: Ctx) {
  const body = (y0: number, y1: number) => { box(c, -10, y0, 20, y1 - y0, 2, shade(c, y0, y1, '#86cf6d', '#5aa84a')); line(c, [[-5, y0 + 4], [-5, y1 - 4]], '#c6efaa', 2); };
  const lip = (y: number) => { box(c, -12.5, y, 25, 9, 2.5, shade(c, y, y + 9, '#9be07f', '#4f9a40')); line(c, [[-8, y + 2.6], [8, y + 2.6]], '#d6f5bf', 1.4); };
  body(-127, -40); lip(-41); body(40, 127); lip(32);
}
function flag(c: Ctx) {
  box(c, -16, 112, 22, 14, 3, shade(c, 112, 126, '#d6cfbf', '#aaa293'));
  box(c, -7, -112, 4, 226, 2, shade(c, -112, 114, '#e8edf0', '#a9b6bc'));
  ellipse(c, -5, -116, 4.5, 4.5, '#f2c14e');
  c.beginPath(); c.moveTo(-3, -108); c.quadraticCurveTo(10, -104, 19, -96); c.quadraticCurveTo(9, -88, -3, -84); c.closePath();
  c.fillStyle = shade(c, -108, -84, '#f08c76', '#d9604c'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  shape(c, [[4, -100], [5.6, -97], [8.6, -96.6], [6.3, -94.6], [7, -91.6], [4, -93.2], [1, -91.6], [1.7, -94.6], [-0.6, -96.6], [2.4, -97]], CREAM, null);
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
  { id: 'paddle', name: 'Paddle', width: 80, height: 12, frames: 1, draw: paddle },
  { id: 'little-ball', name: 'Little ball', width: 14, height: 14, frames: 1, draw: ball },
  { id: 'brick', name: 'Brick', width: 44, height: 14, frames: 5, variants: BRICKS.map(([name]) => name), draw: brick },
  { id: 'pipes', name: 'Pipe pair', width: 26, height: 255, frames: 1, draw: pipes },
  { id: 'flag', name: 'Flag', width: 40, height: 256, frames: 1, draw: flag },
  ...ARCADE_PROPS.map(prop => ({ ...prop, ...(prop.id === 'ghost' ? { detail: 'Four colours and scared' } : prop.id === 'rock' ? { detail: 'Three shapes' } : prop.frames > 1 ? { detail: 'Engine off and on', animation: null } : {}) })),
];
export function paintProp(c: Ctx, id: string, frame = 0) {
  const prop = PROPS.find(p => p.id === id); if (!prop) throw new Error(`No prop ${id}`);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; prop.draw(c, frame % prop.frames); c.restore();
}
