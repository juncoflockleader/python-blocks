import { CREAM, INK, LINE, box, curve, ellipse, line, shade, shape, type Ctx } from './draw';

/** Library art for the arcade examples (a maze muncher, defenders, a rock
 * blaster, a snake and a moon lander), in the cast's soft style. Everything is
 * original: the games are only modelled on old arcade games. */

/** A round muncher facing right; its mouth opens wide, half and shut (chomp 1–3). 30 × 30. */
export function muncher(c: Ctx, frame: number) {
  const open = [0.78, 0.42, 0.05][frame];
  c.beginPath(); c.moveTo(-1, 0); c.arc(0, 0, 13, open, Math.PI * 2 - open); c.closePath();
  c.fillStyle = shade(c, -13, 13, '#ffe98a', '#f5bd2e'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  c.beginPath(); c.arc(0, 0, 9.5, Math.PI * 1.15, Math.PI * 1.45); c.strokeStyle = '#ffffffb0'; c.lineWidth = 2.2; c.stroke();
}

const GHOSTS: [string, string, string][] = [['red', '#ff8a7a', '#e8504f'], ['pink', '#ffc2dc', '#f283b4'], ['cyan', '#a8eef2', '#46c3d3'], ['orange', '#ffc583', '#f0913a'], ['scared', '#8fa1ff', '#4f5fd0']];
export const GHOST_COLOURS = GHOSTS.map(([name]) => name);
/** A ghost with a wavy hem, looking right; `scared` is blue, with a wobbly mouth. 28 × 28. */
export function ghost(c: Ctx, colour: number) {
  const [name, light, base] = GHOSTS[colour], scared = name === 'scared';
  c.beginPath(); c.moveTo(-12, 12); c.lineTo(-12, -1); c.arc(0, -1, 12, Math.PI, 0); c.lineTo(12, 12);
  for (let i = 0; i < 4; i++) { const x = 12 - i * 6; c.quadraticCurveTo(x - 1.5, 7, x - 3, 10); c.quadraticCurveTo(x - 4.5, 13.5, x - 6, 12); }
  c.closePath(); c.fillStyle = shade(c, -13, 13, light, base); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  if (scared) {
    for (const x of [-4.5, 4.5]) ellipse(c, x, -3, 2, 2.2, CREAM, null);
    line(c, [[-7, 6], [-4.5, 4], [-2, 6], [0.5, 4], [3, 6], [5.5, 4], [8, 6]], CREAM, 1.4);
    return;
  }
  for (const x of [-4.5, 4.5]) { ellipse(c, x, -3, 3.6, 4.4, '#ffffff', INK, 1); ellipse(c, x + 1.6, -2.4, 1.9, 2.2, '#2f4fa8', null); }
}

/** Three small aliens for the defenders game, each with two poses: a squid, a crab and an octopus. 30 × 22. */
export const ALIEN_FRAMES = ['squid-1', 'squid-2', 'crab-1', 'crab-2', 'octopus-1', 'octopus-2'];
export function alien(c: Ctx, frame: number) {
  const kind = Math.floor(frame / 2), pose = frame % 2, eye = (x: number, y: number) => { ellipse(c, x, y, 2.4, 2.6, '#ffffff', null); ellipse(c, x + 0.5, y + 0.4, 1.2, 1.4, INK, null); };
  if (kind === 0) {
    const legs = pose ? [[-7, 6, -9, 10], [-3, 7, -2, 11], [3, 7, 2, 11], [7, 6, 9, 10]] : [[-7, 6, -5, 10], [-3, 7, -5, 11], [3, 7, 5, 11], [7, 6, 5, 10]];
    for (const [x0, y0, x1, y1] of legs) line(c, [[x0, y0], [x1, y1]], '#7a54c8', 2.6);
    c.beginPath(); c.moveTo(0, -10); c.quadraticCurveTo(11, -6, 9, 6); c.lineTo(-9, 6); c.quadraticCurveTo(-11, -6, 0, -10); c.closePath();
    c.fillStyle = shade(c, -10, 6, '#d9c2ff', '#9b74e4'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
    eye(-3.5, -1); eye(3.5, -1);
  } else if (kind === 1) {
    const claw = pose ? -1 : 1;
    for (const s of [-1, 1]) { line(c, [[s * 9, -2], [s * 13, -2 - claw * 4]], '#4fae73', 2.6); ellipse(c, s * 13.5, -2 - claw * 5.5, 2.2, 2.2, '#8fe0a8'); }
    for (const s of [-1, 1]) curve(c, [s * 3, -7], [s * 4, -10], [s * 6, -11], INK, 1.2);
    box(c, -10, -7, 20, 13, 6, shade(c, -7, 6, '#bff0c9', '#6cc78b'));
    for (const x of [-6, -2, 2, 6]) line(c, [[x, 6], [x + (pose ? 1.5 : -1.5), 10]], '#4fae73', 2.2);
    eye(-3.5, -1.5); eye(3.5, -1.5);
  } else {
    const spread = pose ? 2 : -1;
    for (const x of [-9, -4.5, 0, 4.5, 9]) curve(c, [x * 0.8, 4], [x + spread * Math.sign(x || 1), 8], [x * 1.1 + spread * Math.sign(x || 1), 10], '#e2765a', 2.4);
    ellipse(c, 0, -1, 12, 8.5, shade(c, -9, 7, '#ffd0b8', '#f28f6c'));
    for (const x of [-7, 0, 7]) ellipse(c, x, -6.5, 1.4, 1, '#ffffff99', null);
    eye(-4, 0); eye(4, 0);
  }
}

/** The defenders' cannon, pointing up. 36 × 22. */
export function cannon(c: Ctx) {
  box(c, -3, -11, 6, 9, 2, shade(c, -11, -2, '#e8f7f4', '#9fd3cb'));
  shape(c, [[-17, 10], [-13, -1], [13, -1], [17, 10]], shade(c, -1, 10, '#7fd0c4', '#3f9e94'));
  box(c, -8, -5, 16, 6, 3, shade(c, -5, 1, '#b8ebe3', '#5fb8ad'));
  for (const x of [-10, 0, 10]) ellipse(c, x, 6, 1.6, 1.6, '#f2c14e', null);
}
/** A laser bolt going up. 6 × 16. */
export function laser(c: Ctx) {
  box(c, -2.5, -7.5, 5, 15, 2.5, '#fff7a8', '#f2c14e', 1);
  line(c, [[0, -5], [0, 5]], '#ffffff', 1.4);
}
/** A zigzag bomb falling down. 8 × 16. */
export function bomb(c: Ctx) {
  line(c, [[0, -7], [3, -3.5], [-3, 0], [3, 3.5], [0, 7]], '#c94a4a', 4);
  line(c, [[0, -7], [3, -3.5], [-3, 0], [3, 3.5], [0, 7]], '#ff9e8a', 1.8);
}

/** A little spaceship pointing right (direction 0); the second frame fires its engine. 32 × 26. */
export function ship(c: Ctx, frame: number) {
  if (frame) { shape(c, [[-11, -4], [-21, 0], [-11, 4]], '#f2a541'); shape(c, [[-11, -2], [-16, 0], [-11, 2]], CREAM, null); }
  shape(c, [[-12, -11], [-6, -3], [-6, 3], [-12, 11], [-8, 11], [0, 4], [0, -4], [-8, -11]], '#e0846a');
  c.beginPath(); c.moveTo(15, 0); c.quadraticCurveTo(4, -9, -10, -6); c.lineTo(-10, 6); c.quadraticCurveTo(4, 9, 15, 0); c.closePath();
  c.fillStyle = shade(c, -8, 8, '#ffffff', '#d3dfde'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  ellipse(c, 3, 0, 3.6, 3, '#5d9ba7'); ellipse(c, 2.4, -1, 1.2, 0.9, '#d6f0f3', null);
}
/** Space rocks: three lumpy shapes, drawn big (48 × 48) to be shrunk as they split. */
export const ROCKS = ['big', 'lumpy', 'round'];
export function rock(c: Ctx, variant: number) {
  const outlines = [
    [[-20, -8], [-12, -19], [2, -21], [14, -16], [21, -4], [19, 10], [8, 20], [-7, 19], [-18, 11]],
    [[-21, -2], [-15, -16], [-3, -15], [5, -21], [18, -12], [20, 3], [13, 16], [0, 21], [-14, 17], [-19, 8]],
    [[-19, -11], [-6, -20], [9, -19], [19, -8], [20, 7], [11, 18], [-4, 20], [-16, 13], [-21, 1]],
  ][variant] as [number, number][];
  shape(c, outlines, shade(c, -21, 21, '#c9b8a6', '#8e7a68'));
  for (const [x, y, r] of [[-8, -6, 4.5], [7, 6, 5.5], [8, -10, 3], [-7, 10, 3]] as const) { ellipse(c, x, y, r, r * 0.85, '#7d6a5a', null); ellipse(c, x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.45, '#a8957f', null); }
  curve(c, [-13, -12], [-6, -17], [2, -17], '#ffffff70', 2);
}

/** A snake's head looking right, and one round body piece. 20 × 20 each. */
export function snakeHead(c: Ctx) {
  shape(c, [[9, 0], [13, -1.5], [12, 0], [13, 1.5]], '#d9534f', null);
  box(c, -9, -8.5, 18, 17, 7, shade(c, -9, 9, '#b6eb8e', '#5cb85c'));
  ellipse(c, 3, -4, 2.4, 2.6, '#ffffff'); ellipse(c, 3.6, -3.8, 1.1, 1.3, INK, null);
  ellipse(c, 3, 4, 2.4, 2.6, '#ffffff'); ellipse(c, 3.6, 4.2, 1.1, 1.3, INK, null);
}
export function snakeBody(c: Ctx) {
  box(c, -8.5, -8.5, 17, 17, 6, shade(c, -9, 9, '#a6e07e', '#4fa64f'));
  ellipse(c, -2, -2, 2.6, 2.2, '#c9f2a8', null);
}
/** A red apple with a leaf. 20 × 20. */
export function apple(c: Ctx) {
  c.beginPath(); c.moveTo(0, -5); c.bezierCurveTo(-11, -10, -11, 8, -3, 9); c.quadraticCurveTo(0, 8, 3, 9); c.bezierCurveTo(11, 8, 11, -10, 0, -5); c.closePath();
  c.fillStyle = shade(c, -8, 9, '#ff8f80', '#d9443f'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  line(c, [[0, -5], [1, -9]], INK, 1.6);
  ellipse(c, 4, -8, 3.4, 1.7, '#7cc96c', INK, 1, -0.5);
  ellipse(c, -4.5, -2, 1.8, 1.2, '#ffffffaa', null, 0, -0.5);
}

/** A moon lander on four legs; the second frame fires its engine. 40 × 44. */
export function lander(c: Ctx, frame: number) {
  if (frame) { shape(c, [[-5, 10], [0, 22], [5, 10]], '#f2a541'); shape(c, [[-2.6, 10], [0, 16], [2.6, 10]], CREAM, null); }
  for (const s of [-1, 1]) { line(c, [[s * 8, 4], [s * 16, 17]], INK, 2.6); line(c, [[s * 8, 4], [s * 16, 17]], '#b9c4c8', 1.4); box(c, s * 16 - 4, 16, 8, 3, 1.5, '#9aa6aa'); }
  box(c, -5, 5, 10, 6, 1.5, '#7d8b8f');
  box(c, -11, -4, 22, 11, 3, shade(c, -4, 7, '#ffe38a', '#e0a93a'));
  for (const x of [-6, 0, 6]) line(c, [[x, -3], [x, 6]], '#c99234', 1);
  c.beginPath(); c.moveTo(-9, -4); c.lineTo(-7, -16); c.quadraticCurveTo(0, -22, 7, -16); c.lineTo(9, -4); c.closePath();
  c.fillStyle = shade(c, -20, -4, '#ffffff', '#cfdadb'); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  ellipse(c, 0, -11, 4, 3.4, '#5d9ba7'); ellipse(c, -1, -12, 1.4, 1, '#d6f0f3', null);
  line(c, [[0, -20], [0, -24]], INK, 1.2); ellipse(c, 0, -24.5, 1.4, 1.4, '#e0846a');
}
/** A landing pad with lights. 64 × 12. */
export function pad(c: Ctx) {
  box(c, -31, -4, 62, 8, 3, shade(c, -4, 4, '#d6dfe1', '#9aa6aa'));
  for (const x of [-26, -13, 0, 13, 26]) ellipse(c, x, 0, 1.8, 1.8, x === 0 ? '#7fd0c4' : '#f2c14e', null);
  box(c, -24, 4, 6, 4, 1, '#7d8b8f'); box(c, 18, 4, 6, 4, 1, '#7d8b8f');
}

/** Maze walls: a hollow blue line from the tile's middle to each side it joins (N 1, E 2, S 4, W 8),
 * so walls painted side by side connect. The hollow is the maze's floor colour. */
export const MAZE_FLOOR = '#141a3c';
export function mazeWall(c: Ctx, joins: number) {
  const sides: [number, number][] = [[0, -16], [16, 0], [0, 16], [-16, 0]];
  for (const [width, colour] of [[18, '#6f8cff'], [10, MAZE_FLOOR]] as const) {
    c.lineCap = 'butt'; c.strokeStyle = colour; c.lineWidth = width;
    sides.forEach(([x, y], i) => { if (joins & (1 << i)) { c.beginPath(); c.moveTo(0, 0); c.lineTo(x, y); c.stroke(); } });
    c.beginPath(); c.arc(0, 0, width / 2, 0, Math.PI * 2); c.fillStyle = colour; c.fill();
  }
}
/** A dot to eat, or a big power dot. 32 × 32. */
export function mazeDot(c: Ctx, power: boolean) {
  if (power) { ellipse(c, 0, 0, 7, 7, shade(c, -7, 7, '#fff6c8', '#f5c64a'), null); ellipse(c, -2, -2.5, 2, 1.5, '#ffffff', null); }
  else ellipse(c, 0, 0, 2.6, 2.6, '#ffe7b0', null);
}

/** The moon: a dark sky with stars and the Earth, over grey ground that is flat at stage y −100. 480 × 320. */
export function moon(c: Ctx) {
  c.fillStyle = shade(c, 0, 320, '#0b1029', '#26305a'); c.fillRect(0, 0, 480, 320);
  for (let i = 0; i < 70; i++) { const x = (i * 97) % 480, y = (i * 53) % 230, r = i % 7 === 0 ? 1.4 : 0.8; ellipse(c, x, y, r, r, i % 5 ? '#ffffffb0' : '#ffe9a8', null); }
  ellipse(c, 400, 62, 26, 26, shade(c, 36, 88, '#8fd0f0', '#3c86c4'), null);
  for (const [x, y, rx, ry] of [[392, 52, 9, 6], [410, 70, 7, 5], [388, 74, 5, 3]] as const) ellipse(c, x, y, rx, ry, '#6fbf6a', null);
  ellipse(c, 400, 62, 26, 26, undefined, '#ffffff40', 2);
  c.fillStyle = shade(c, 260, 320, '#b9bfc8', '#7f8794'); c.fillRect(0, 260, 480, 60);
  c.fillStyle = '#d3d8de'; c.fillRect(0, 258, 480, 4);
  for (const [x, y, r] of [[40, 286, 14], [140, 300, 9], [250, 282, 11], [330, 304, 16], [430, 288, 10], [95, 270, 5], [205, 312, 6]] as const) {
    ellipse(c, x, y, r, r * 0.38, '#8d95a2', null); ellipse(c, x, y - r * 0.1, r * 0.75, r * 0.26, '#a7aeb9', null);
  }
}

/** The lightweight records the catalogue reads: id, name, size, frames or variants, and the drawing. */
export const ARCADE_CHARACTERS: { id: string; name: string; width: number; height: number; frames: string[]; animations: Record<string, string[]>; detail: string; draw(c: Ctx, frame: number): void }[] = [
  { id: 'muncher', name: 'Muncher', width: 30, height: 30, frames: ['chomp-1', 'chomp-2', 'chomp-3'], animations: { chomp: ['chomp-1', 'chomp-2', 'chomp-3', 'chomp-2'] }, detail: 'Chomps', draw: muncher },
  { id: 'alien', name: 'Alien', width: 30, height: 22, frames: ALIEN_FRAMES, animations: { squid: ['squid-1', 'squid-2'], crab: ['crab-1', 'crab-2'], octopus: ['octopus-1', 'octopus-2'] }, detail: 'Three aliens, two poses each', draw: alien },
];
export const ARCADE_PROPS = [
  { id: 'ghost', name: 'Ghost', width: 28, height: 28, frames: GHOSTS.length, variants: GHOST_COLOURS, draw: ghost },
  { id: 'cannon', name: 'Cannon', width: 36, height: 22, frames: 1, draw: cannon },
  { id: 'laser', name: 'Laser', width: 6, height: 16, frames: 1, draw: laser },
  { id: 'bomb', name: 'Bomb', width: 8, height: 16, frames: 1, draw: bomb },
  { id: 'spaceship', name: 'Spaceship', width: 32, height: 26, frames: 2, draw: ship },
  { id: 'rock', name: 'Space rock', width: 48, height: 48, frames: ROCKS.length, variants: ROCKS, draw: rock },
  { id: 'snake-head', name: 'Snake head', width: 20, height: 20, frames: 1, draw: snakeHead },
  { id: 'snake-body', name: 'Snake body', width: 20, height: 20, frames: 1, draw: snakeBody },
  { id: 'apple', name: 'Apple', width: 20, height: 20, frames: 1, draw: apple },
  { id: 'lander', name: 'Moon lander', width: 40, height: 44, frames: 2, draw: lander },
  { id: 'landing-pad', name: 'Landing pad', width: 64, height: 12, frames: 1, draw: pad },
];
