import { BLUSH, CREAM, INK, LINE, box, curve, ellipse, eyes, limb, line, mouth, shade, shape, type Ctx, type Eyes, type Mouth } from './draw';

/** The library cast: original characters drawn by one rig, facing right, each
 * with the same eight frames. A sprite's left-right rotation style flips them.
 * Costumes are 64 × 64 stage units with the feet on y = 28. */
export const FRAMES = ['idle-1', 'idle-2', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'jump', 'happy'] as const;
export type Frame = typeof FRAMES[number];
export const ANIMATIONS: Record<string, Frame[]> = { idle: ['idle-1', 'idle-2'], walk: ['walk-1', 'walk-2', 'walk-3', 'walk-4'], jump: ['jump'], happy: ['happy'] };
/** Angles are radians from straight down, forward positive. `arms` are the explorers' and the robot's;
 * `paws` are the animals' short arms, [back, front]: at the front of the tummy, swinging when they walk,
 * reaching up in a jump, out in a cheer. */
export interface Pose { bob: number; legs: [number, number]; arms: [number, number]; paws: [number, number]; squash: number; eyes: Eyes; mouth: Mouth; swing: number; flap: number }
const base: Pose = { bob: 0, legs: [0, 0], arms: [0.3, -0.2], paws: [0.3, 0.5], squash: 0, eyes: 'open', mouth: 'smile', swing: 0, flap: 0 };
export const POSES: Record<Frame, Pose> = {
  'idle-1': base,
  'idle-2': { ...base, bob: 0.8, squash: 0.05, arms: [0.36, -0.12], paws: [0.4, 0.62], swing: 0.08, flap: 1 },
  'walk-1': { ...base, bob: -1.4, legs: [0.55, -0.5], arms: [-0.55, 0.6], paws: [-0.3, 1.1], swing: 0.18, flap: 0 },
  'walk-2': { ...base, bob: 0.8, legs: [0.1, -0.05], arms: [0.05, 0.1], paws: [0.35, 0.55], swing: 0.06, flap: 1 },
  'walk-3': { ...base, bob: -1.4, legs: [-0.5, 0.55], arms: [0.6, -0.55], paws: [0.9, -0.15], swing: -0.18, flap: 2 },
  'walk-4': { ...base, bob: 0.8, legs: [-0.05, 0.1], arms: [0.1, 0.05], paws: [0.4, 0.45], swing: -0.06, flap: 3 },
  jump: { ...base, bob: -4, legs: [0.8, 1.15], arms: [-2.3, -1.65], paws: [2.5, 2.2], mouth: 'open', swing: 0.35, flap: 0 },
  happy: { ...base, bob: -2.5, legs: [0.18, -0.18], arms: [2.15, 1.85], paws: [1.9, 1.65], eyes: 'happy', mouth: 'open', swing: 0.25, flap: 2 },
};

interface Animal { fur: string; light: string; dark: string; belly: string; ears: 'pointed' | 'long' | 'round'; earInner: string; tail: 'bushy' | 'thin' | 'puff'; tailTip?: string; muzzle?: string; nose: string; stripes?: string; socks?: string }
/** A four-legged friend standing up, cartoon style: big head, round body, short legs. */
function animal(c: Ctx, a: Animal, p: Pose) {
  const y = p.bob, hipY = 15 + y, headX = 3, headY = -7 + y + p.squash * 6, legLength = 9;
  // tail, behind everything
  c.save(); c.translate(-10, 12 + y); c.rotate(-0.35 + p.swing);
  if (a.tail === 'bushy') {
    const tail = () => { c.beginPath(); c.moveTo(1, 1); c.bezierCurveTo(-8, 4, -17, -2, -17, -12); c.bezierCurveTo(-17, -19, -12, -23, -8, -21); c.bezierCurveTo(-11, -15, -8, -6, 2, -5); c.closePath(); };
    tail(); c.fillStyle = shade(c, -22, 4, a.light, a.fur); c.fill();
    if (a.tailTip) { c.save(); tail(); c.clip(); ellipse(c, -13, -19, 7, 6, a.tailTip, null); c.restore(); }
    tail(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  }
  else if (a.tail === 'thin') { c.lineCap = 'round'; curve(c, [0, 0], [-12, -2], [-12, -16], INK, 5.6); curve(c, [0, 0], [-12, -2], [-12, -16], a.fur, 3.2); }
  else ellipse(c, -2, -2, 5, 5, a.light);
  c.restore();
  // back leg and arm
  const foot = { rx: 3.4, ry: 2.4, fill: a.socks ?? a.dark, dx: 1 };
  limb(c, -4, hipY, p.legs[0], legLength, 5, a.dark, foot);
  limb(c, -2, 7.5 + y, p.paws[0], 4.5, 3.6, a.dark, { rx: 2.3, ry: 2.3, fill: a.socks ?? a.dark });
  // body
  ellipse(c, 0, 10 + y + p.squash * 3, 11 - p.squash * 2, 10 + p.squash * 3, shade(c, 0, 20 + y, a.light, a.fur));
  ellipse(c, 2, 12 + y + p.squash * 3, 6, 6.5, a.belly, null);
  if (a.stripes) for (const dx of [-6, -2]) curve(c, [dx, 2 + y], [dx - 2, 6 + y], [dx, 10 + y], a.stripes, 1.6);
  // front leg
  limb(c, 4, hipY, p.legs[1], legLength, 5, a.fur, { ...foot, fill: a.socks ?? a.fur });
  // Ears sit on the head's outline, both behind it, so the head hides their bases.
  const headRy = 13.5 - p.squash * 2;
  const ear = (near: boolean) => {
    const at = (a.ears === 'long' ? 0.3 : 0.6) * (near ? 1 : -0.85), size = near ? 1 : 0.9;
    c.save(); c.translate(headX + Math.sin(at) * 13, headY - Math.cos(at) * (headRy - 1.5)); c.rotate(at * 0.8 - p.swing * 0.3); c.scale(size, size);
    if (a.ears === 'pointed') { shape(c, [[-5.5, 4], [0, -10], [5.5, 4]], a.fur); shape(c, [[-2.8, 2.5], [0, -5.5], [2.8, 2.5]], a.earInner, null); }
    else if (a.ears === 'long') { ellipse(c, 0, -9, 4, 11, a.fur); ellipse(c, 0, -9, 2, 7.5, a.earInner, null); }
    else { ellipse(c, 0, -1, 5, 5, a.fur); ellipse(c, 0, -1, 2.8, 2.8, a.earInner, null); }
    c.restore();
  };
  ear(false); ear(true);
  ellipse(c, headX, headY, 14.5, headRy, shade(c, headY - 13, headY + 13, a.light, a.fur));
  if (a.stripes) for (const dx of [-3, 1]) line(c, [[headX + dx, headY - 13], [headX + dx + 0.6, headY - 9]], a.stripes, 1.6);
  if (a.muzzle) ellipse(c, headX + 6, headY + 5, 7.5, 5.5, a.muzzle, null);
  eyes(c, headX + 1, headY - 1, p.eyes, 1, 8.5);
  ellipse(c, headX + 6, headY + 2.6, 2, 1.5, a.nose, null);
  mouth(c, headX + 6, headY + 6, p.mouth, 0.9);
  ellipse(c, headX - 4.5, headY + 4, 2.3, 1.4, BLUSH, null);
  // front arm: a short arm from the shoulder under the chin
  limb(c, 6, 7.5 + y, p.paws[1], 4.5, 3.6, a.fur, { rx: 2.4, ry: 2.4, fill: a.socks ?? a.fur });
}

interface Kid { skin: string; hair: string; top: string; topLight: string; trousers: string; shoes: string; style: 'hood' | 'ponytail' }
/** A young explorer: big head, small body, backpack. */
function kid(c: Ctx, k: Kid, p: Pose) {
  const y = p.bob, hipY = 15 + y, headX = 2, headY = -10 + y + p.squash * 5;
  if (k.style === 'ponytail') { c.save(); c.translate(headX - 12, headY - 4); c.rotate(-0.2 + p.swing * 1.5); ellipse(c, -4, 4, 5, 8, k.hair); c.restore(); }
  box(c, -14, 0 + y, 8, 13, 3, '#e8913f');
  limb(c, -3, hipY, p.legs[0], 9, 5, k.trousers, { rx: 4, ry: 2.6, fill: k.shoes, dx: 1.5 });
  limb(c, -4, 4 + y, p.arms[0], 8, 4.2, k.top, { rx: 2.3, ry: 2.3, fill: k.skin });
  box(c, -9, -1 + y + p.squash * 3, 18, 18 - p.squash * 3, 7, shade(c, y, 17 + y, k.topLight, k.top));
  limb(c, 3, hipY, p.legs[1], 9, 5, k.trousers, { rx: 4, ry: 2.6, fill: k.shoes, dx: 1.5 });
  ellipse(c, headX, headY, 12.5, 12 - p.squash * 2, k.skin);
  if (k.style === 'hood') {
    c.beginPath(); c.arc(headX, headY, 12.5, Math.PI * 0.92, Math.PI * 2.06); c.strokeStyle = k.top; c.lineWidth = 4.2; c.stroke();
    c.beginPath(); c.arc(headX, headY, 14.6, Math.PI * 0.92, Math.PI * 2.06); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  } else {
    c.beginPath(); c.moveTo(headX - 12.5, headY + 1); c.quadraticCurveTo(headX - 12, headY - 14, headX + 2, headY - 13); c.quadraticCurveTo(headX + 12, headY - 12, headX + 12, headY - 4);
    c.quadraticCurveTo(headX + 4, headY - 8, headX - 4, headY - 6); c.quadraticCurveTo(headX - 8, headY - 3, headX - 8, headY + 2); c.closePath();
    c.fillStyle = k.hair; c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  }
  eyes(c, headX + 3, headY + 1, p.eyes, 0.95, 6.5);
  ellipse(c, headX + 1.5, headY + 6, 2, 1.3, BLUSH, null); ellipse(c, headX + 10.5, headY + 6, 1.4, 1.1, BLUSH, null);
  mouth(c, headX + 6.5, headY + 6.5, p.mouth, 0.85);
  limb(c, 3, 4 + y, p.arms[1], 8, 4.2, k.topLight, { rx: 2.4, ry: 2.4, fill: k.skin });
}

/** A friendly robot: a screen for a face, an antenna that sways. */
function robot(c: Ctx, p: Pose) {
  const y = p.bob, metal = '#8ec5c8', light = '#c3e3e2', dark = '#4f8f9b';
  const foot = { rx: 4, ry: 2.5, fill: '#335561', dx: 1 };
  limb(c, -4, 16 + y, p.legs[0], 8, 5, dark, foot);
  limb(c, -7, 6 + y, p.arms[0], 8, 4, dark, { rx: 2.6, ry: 2.6, fill: '#e8b94f' });
  box(c, -9, -1 + y + p.squash * 3, 18, 18 - p.squash * 3, 5, shade(c, y, 17 + y, light, metal));
  box(c, -4, 4 + y, 8, 6, 2, '#335561'); ellipse(c, 0, 7 + y, 1.6, 1.6, p.flap % 2 ? '#e0846a' : '#f2d974', null);
  limb(c, 3, 16 + y, p.legs[1], 8, 5, metal, foot);
  const top = -23 + y + p.squash * 4;
  line(c, [[1, top], [1 + p.swing * 6, top - 6]], INK, 1.6); ellipse(c, 1 + p.swing * 6, top - 7, 2.4, 2.4, '#e0846a');
  box(c, -11, top, 24, 21, 7, shade(c, top, top + 21, light, metal));
  box(c, -5, top + 4, 16, 12, 4, '#263f4b', INK, 1);
  const glow = '#f2d974';
  if (p.eyes === 'happy') for (const ex of [-1, 6]) curve(c, [ex - 2, top + 10], [ex, top + 6.5], [ex + 2, top + 10], glow, 1.6);
  else for (const ex of [-1, 6]) box(c, ex - 1.4, top + 7, 2.8, p.eyes === 'blink' ? 1 : 4, 1.2, glow, null);
  if (p.mouth === 'open') box(c, 0.5, top + 12.5, 5, 2, 1, '#e0846a', null); else line(c, [[0.8, top + 13.5], [5, top + 13.5]], glow, 1.2);
  ellipse(c, -11, top + 11, 2, 3.5, dark);
  limb(c, 5, 6 + y, p.arms[1], 8, 4, metal, { rx: 2.7, ry: 2.7, fill: '#e8b94f' });
}
/** A turtle walking on four short legs, seen from the side. */
function turtle(c: Ctx, p: Pose) {
  const y = p.bob, skin = '#a9c47f', skinDark = '#86a65e', shell = '#4d8e73';
  const leg = (x: number, angle: number, fill: string) => limb(c, x, 18 + y, angle * 0.7, 6.5, 5.5, fill, { rx: 3.4, ry: 2.2, fill, dx: 0.8 });
  shape(c, [[-15, 17 + y], [-21, 20 + y], [-14, 21 + y]], skin);
  leg(-9, p.legs[1], skinDark); leg(7, p.legs[0], skinDark);
  // neck and head, reaching forward
  const hx = 16 + p.swing * 2, hy = 8 + y - (p.eyes === 'happy' ? 3 : 0) + p.squash * 3;
  shape(c, [[8, 12 + y], [hx - 2, hy + 2], [hx - 1, hy + 7], [9, 19 + y]], skin);
  ellipse(c, hx, hy, 8, 7, shade(c, hy - 7, hy + 7, '#c6dc9c', skin));
  eyes(c, hx + 1, hy - 1.5, p.eyes, 0.8, 5);
  mouth(c, hx + 4, hy + 3.5, p.mouth, 0.7);
  ellipse(c, hx - 2, hy + 2.5, 1.8, 1.1, BLUSH, null);
  // shell: a dome with plates and a rim
  c.beginPath(); c.moveTo(-15, 19 + y); c.bezierCurveTo(-16, 2 + y, -6, -6 + y, 0, -6 + y); c.bezierCurveTo(7, -6 + y, 15, 2 + y, 13, 19 + y); c.closePath();
  c.fillStyle = shade(c, -6 + y, 19 + y, '#6fae8e', shell); c.fill(); c.strokeStyle = INK; c.lineWidth = LINE; c.stroke();
  for (const [x, w] of [[-9, 6], [-1.5, 7], [6, 5.5]] as const) box(c, x - w / 2, 2 + y, w, 9, 3, '#8cc79f', '#3a7360', 1.1);
  box(c, -16, 16 + y, 30, 4.5, 2.2, '#e6cf8f');
  leg(-5, p.legs[0], skin); leg(10, p.legs[1], skin);
}
/** A bee that hovers: its "walk" is flying, its wings beat in every frame. */
function bee(c: Ctx, p: Pose) {
  const y = p.bob * 1.3 - 4, beat = [0.35, -0.2, 0.15, -0.35][p.flap];
  // wings behind and in front of the body
  const wing = (x: number, angle: number, alpha: string) => { c.save(); c.translate(x, -4 + y); c.rotate(angle); ellipse(c, 0, -8, 6, 10, alpha, INK, 1.1); c.restore(); };
  wing(-4, -0.45 + beat, '#d9eef0cc');
  for (const [x, a] of [[-6, -0.3], [-1, -0.1], [4, 0.15]] as const) limb(c, x, 13 + y, a + p.legs[0] * 0.3, 5, 1.6, INK);
  shape(c, [[-15, 5 + y], [-21, 7 + y], [-15, 9 + y]], INK, INK, 1);
  ellipse(c, -2, 6 + y, 14, 10.5, shade(c, -4 + y, 16 + y, '#f7d777', '#ecb53c'));
  c.save(); c.beginPath(); c.ellipse(-2, 6 + y, 14, 10.5, 0, 0, Math.PI * 2); c.clip();
  for (const x of [-9, -2]) box(c, x, -6 + y, 3.6, 24, 0, '#3a3a46', null);
  c.restore(); ellipse(c, -2, 6 + y, 14, 10.5, undefined);
  // head
  const hx = 13, hy = 2 + y;
  curve(c, [hx - 2, hy - 7], [hx - 2, hy - 13], [hx - 5 + p.swing * 4, hy - 15], INK, 1.2); ellipse(c, hx - 5 + p.swing * 4, hy - 15, 1.6, 1.6, INK, null);
  curve(c, [hx + 2, hy - 7], [hx + 3, hy - 13], [hx + 3 + p.swing * 4, hy - 15], INK, 1.2); ellipse(c, hx + 3 + p.swing * 4, hy - 15, 1.6, 1.6, INK, null);
  ellipse(c, hx, hy, 8.5, 8, shade(c, hy - 8, hy + 8, '#f7d777', '#ecb53c'));
  eyes(c, hx, hy - 1, p.eyes, 0.85, 5);
  mouth(c, hx + 3, hy + 4, p.mouth, 0.75); ellipse(c, hx - 3, hy + 3, 1.8, 1.1, BLUSH, null);
  wing(0, 0.25 + beat, '#eef9faaa');
}
/** A fish that swims: its tail beats as it moves. */
function fish(c: Ctx, p: Pose) {
  const y = p.bob - 2, body = '#e8875b', light = '#f6b07f', fin = '#f2c14e', tail = 0.35 * Math.sin(p.flap * Math.PI / 2) + p.swing;
  c.save(); c.translate(-14, 4 + y); c.rotate(tail); shape(c, [[2, 0], [-10, -10], [-7, 0], [-10, 10]], fin); c.restore();
  shape(c, [[-4, -6 + y], [2, -14 + y], [9, -6 + y]], fin);
  ellipse(c, 2, 4 + y + p.squash * 2, 17, 12 - p.squash * 2, shade(c, -8 + y, 16 + y, light, body));
  c.save(); c.beginPath(); c.ellipse(2, 4 + y, 17, 12, 0, 0, Math.PI * 2); c.clip();
  ellipse(c, 4, 13 + y, 14, 6, '#fde2c4', null);
  for (const [x, yy] of [[-8, 0], [-3, 4], [-8, 8], [2, -2]] as const) curve(c, [x, yy - 2 + y], [x + 3, yy + y], [x, yy + 2 + y], '#c96a43', 1);
  c.restore(); ellipse(c, 2, 4 + y + p.squash * 2, 17, 12 - p.squash * 2, undefined);
  c.save(); c.translate(1, 8 + y); c.rotate(0.5 + 0.25 * Math.sin(p.flap * Math.PI / 2)); ellipse(c, -4, 0, 5, 2.6, fin); c.restore();
  eyes(c, 9, 0 + y, p.eyes, 1, 6);
  mouth(c, 16, 7 + y, p.mouth, 0.8); ellipse(c, 10, 6 + y, 1.8, 1.1, BLUSH, null);
  if (p.eyes === 'happy' || p.mouth === 'open') for (const [x, yy, r] of [[22, -6, 1.6], [25, -11, 1.1]] as const) ellipse(c, x, yy + y, r, r, '#d6f0f3', INK, 0.9);
}

export interface Character { id: string; name: string; draw(c: Ctx, pose: Pose): void }
export const CAST: Character[] = [
  { id: 'fox', name: 'Fox', draw: (c, p) => animal(c, { fur: '#e2783f', light: '#f09a5f', dark: '#c4602f', belly: CREAM, muzzle: CREAM, ears: 'pointed', earInner: '#5b3a2e', tail: 'bushy', tailTip: CREAM, nose: INK, socks: '#5b3a2e' }, p) },
  { id: 'cat', name: 'Cat', draw: (c, p) => animal(c, { fur: '#e9b04f', light: '#f6cb73', dark: '#cf9536', belly: CREAM, ears: 'pointed', earInner: '#f0a9b4', tail: 'thin', nose: '#d9737f', stripes: '#c47f2a' }, p) },
  { id: 'rabbit', name: 'Rabbit', draw: (c, p) => animal(c, { fur: '#dfe3ea', light: '#f4f6f9', dark: '#bcc3cf', belly: '#ffffff', muzzle: '#ffffff', ears: 'long', earInner: '#f0a9b4', tail: 'puff', nose: '#d9737f' }, p) },
  { id: 'robot', name: 'Robot', draw: robot },
  { id: 'turtle', name: 'Turtle', draw: turtle },
  { id: 'bee', name: 'Bee', draw: bee },
  { id: 'fish', name: 'Fish', draw: fish },
  { id: 'explorer-sam', name: 'Sam', draw: (c, p) => kid(c, { skin: '#ffe0bd', hair: '#5a3a24', top: '#2f8579', topLight: '#46b0a2', trousers: '#3e5c86', shoes: '#7a4f36', style: 'hood' }, p) },
  { id: 'explorer-ruby', name: 'Ruby', draw: (c, p) => kid(c, { skin: '#a8714f', hair: '#2b1d16', top: '#d9653a', topLight: '#ef8a54', trousers: '#3b4f7a', shoes: '#4a3328', style: 'ponytail' }, p) },
];
/** Paint one frame of a character into a 64 × 64 box centred on the context's origin. */
export function paintCharacter(c: Ctx, id: string, frame: Frame) {
  const character = CAST.find(x => x.id === id); if (!character) throw new Error(`No character ${id}`);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; character.draw(c, POSES[frame]); c.restore();
}
