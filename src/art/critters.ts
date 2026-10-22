import { BLUSH, INK, curve, ellipse, eyes, line, shade, shape, type Ctx } from './draw';
import { ARCADE_CHARACTERS } from './arcade';

/** Library characters with their own poses: a Chick that flaps (for flying
 * games) and a Beetle that walks (an enemy to patrol). Their boxes hug their
 * bodies, since flying and stomping games collide by the box. */
export interface Critter { id: string; name: string; width: number; height: number; frames: string[]; animations: Record<string, string[]>; detail: string; draw(c: Ctx, frame: number): void;
  /** How it animates when added from the library, when not as the chick (flap) or the beetle (walk). */
  autoAnimate?: { moving: string; air: string; still: string; turn: boolean } }

/** A round chick facing right; the wing beats through flap 1–4. 52 × 40. */
function chick(c: Ctx, frame: number) {
  const wing = [0.2, 0.35, -0.9, -0.2, 0.6, -0.2, -1.1, -0.6][frame], bob = [0, 0.8, -1.4, 0, 1.4, 0, -2, -1.5][frame];
  const happy = frame === 7, open = frame >= 6;
  c.save(); c.translate(1.5, bob);
  shape(c, [[-17, 2], [-26, -3], [-24, 4], [-27, 9], [-17, 8]], '#e8a33b');
  ellipse(c, -2, 2, 17, 15, shade(c, -13, 17, '#ffe58f', '#f4c03f'));
  c.save(); c.beginPath(); c.ellipse(-2, 2, 16.3, 14.3, 0, 0, Math.PI * 2); c.clip(); ellipse(c, 1, 12, 13, 7, '#fff1bd', null); c.restore();
  shape(c, [[12, -2], [24, 2], [12, 7]], '#f08c40');
  line(c, [[12.5, 2.5], [21, 2.4]], '#c96a2f', 1);
  if (happy) eyes(c, 6, -4, 'happy', 0.85, 0);
  else { ellipse(c, 6, -4, 4, 4.4, '#ffffff'); ellipse(c, 7.4, -4, 2.1, 2.5, '#253e43', null); ellipse(c, 8, -5, 0.8, 0.8, '#ffffff', null); }
  ellipse(c, 3, 4, 2.6, 1.6, BLUSH, null);
  if (open) shape(c, [[13, 3], [20, 6], [13, 8]], '#c96a2f', null);
  c.save(); c.translate(-6, 3); c.rotate(wing); ellipse(c, -2, 0, 10, 6, shade(c, -6, 6, '#ffe9a6', '#ecb43a')); c.restore();
  c.restore();
}
/** A purple beetle in profile, facing right; its three legs step in two frames. 36 × 30. */
function beetle(c: Ctx, frame: number) {
  const step = frame ? 1 : -1;
  c.save(); c.translate(-1, 0);
  for (const [x, a] of [[-8, 0.3], [0, -0.2], [8, 0.4]] as const) line(c, [[x, 6], [x + step * a * 4 - 1.5, 13]], INK, 2.2);
  ellipse(c, 11, 4, 6, 5.5, '#4a4f6b');
  ellipse(c, -2, 1, 13, 10, shade(c, -9, 11, '#b08fd6', '#7d5fae'));
  line(c, [[-2, -9], [-2, 10.5]], INK, 1.2);
  for (const [x, y] of [[-8, -2], [-5, 5], [4, -3]] as const) ellipse(c, x, y, 1.8, 1.8, '#5d4389', null);
  ellipse(c, -6, -5, 3, 1.6, '#ffffff66', null, 1.4, -0.4);
  eyes(c, 12, 2, 'open', 0.7, 3.4);
  curve(c, [14, -1], [17, -6], [19, -6], INK, 1.2); curve(c, [11, -1], [12, -7], [14, -8], INK, 1.2);
  c.restore();
}

export const CRITTERS: Critter[] = [
  { id: 'chick', name: 'Chick', width: 52, height: 40, frames: ['idle-1', 'idle-2', 'flap-1', 'flap-2', 'flap-3', 'flap-4', 'jump', 'happy'],
    animations: { idle: ['idle-1', 'idle-2'], flap: ['flap-1', 'flap-2', 'flap-3', 'flap-4'], jump: ['jump'], happy: ['happy'] }, detail: 'Idle, flap, jump and happy', draw: chick },
  { id: 'beetle', name: 'Beetle', width: 36, height: 30, frames: ['walk-1', 'walk-2'], animations: { walk: ['walk-1', 'walk-2'] }, detail: 'Walks', draw: beetle },
  // The arcade examples' characters: a muncher that chomps as it moves, three aliens, and a pipe that flaps all the time.
  { ...ARCADE_CHARACTERS[0], autoAnimate: { moving: 'chomp', air: '', still: '', turn: false } },
  { ...ARCADE_CHARACTERS[1], autoAnimate: { moving: '', air: '', still: '', turn: false } },
  { ...ARCADE_CHARACTERS[2], autoAnimate: { moving: 'flap', air: 'flap', still: 'flap', turn: false } },
];
export function paintCritter(c: Ctx, id: string, frame: number) {
  const critter = CRITTERS.find(x => x.id === id); if (!critter) throw new Error(`No character ${id}`);
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; critter.draw(c, frame); c.restore();
}
