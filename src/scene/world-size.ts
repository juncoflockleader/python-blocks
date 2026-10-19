import type { SceneState } from './model';
import { defaultCamera, MAX_PIXELS, MAX_TILES, newMap, resizeMap, type World } from './world';

/** Worlds are sized in screens for learners: one screen is the 480 × 320 stage.
 * A map always starts at the stage's top-left (x −240, y 160), so screen
 * (column, row) covers x from −240 + 480·column and y from 160 − 320·row. */
export const SCREEN = { width: 480, height: 320 } as const;
export interface WorldBounds { left: number; top: number; width: number; height: number }

/** The current world's bounds in world coordinates (the base stage is one screen). */
export function worldBounds(scene: SceneState): WorldBounds {
  const world = scene.worlds?.find(w => w.id === scene.world);
  if (!world) return { left: -240, top: 160, ...SCREEN };
  return { left: -240, top: 160, width: world.map.columns * world.map.tileSize, height: world.map.rows * world.map.tileSize };
}
/** How many screens wide and tall the current world is (rounded up, at least one). */
export function worldScreens(scene: SceneState) {
  const bounds = worldBounds(scene);
  return { wide: Math.max(1, Math.ceil(bounds.width / SCREEN.width - 1e-9)), tall: Math.max(1, Math.ceil(bounds.height / SCREEN.height - 1e-9)) };
}
/** The most screens the current world's tiles allow in each direction. */
export function screenLimits(scene: SceneState) {
  const tileSize = scene.worlds?.find(w => w.id === scene.world)?.map.tileSize ?? 16;
  const pixels = Math.min(MAX_TILES * tileSize, MAX_PIXELS);
  return { wide: Math.floor(pixels / SCREEN.width), tall: Math.floor(pixels / SCREEN.height) };
}

/** A copy of the scene whose current world is `wide` × `tall` screens. The map
 * keeps its top-left tiles; this world's sprites on a removed screen move onto
 * the nearest remaining one (global sprites too, while it is the only world).
 * Growing the plain stage makes it a world first, keeping its background,
 * backdrop, camera and (global) sprites. */
export function resizeWorld(scene: SceneState, wide: number, tall: number): SceneState {
  const limits = screenLimits(scene);
  if (!Number.isInteger(wide) || !Number.isInteger(tall) || wide < 1 || tall < 1) throw new Error('A world is at least one screen.');
  if (wide > limits.wide || tall > limits.tall) throw new Error(`This world can be up to ${limits.wide} screens wide and ${limits.tall} tall.`);
  const next = structuredClone(scene);
  let world = next.worlds?.find(w => w.id === next.world);
  if (!world) {
    if (wide === 1 && tall === 1) return next;
    const names = new Set((next.worlds ?? []).map(w => w.name)); let name = 'Main world', n = 2;
    while (names.has(name)) name = `Main world ${n++}`;
    world = { id: crypto.randomUUID(), name, background: next.background, backdrop: next.backdrop ?? null, map: newMap(30, 20, 16), camera: structuredClone(next.camera ?? defaultCamera()) } satisfies World;
    (next.worlds ??= []).push(world); next.world = world.id;
  }
  const size = world.map.tileSize;
  world.map = resizeMap(world.map, Math.ceil(wide * SCREEN.width / size), Math.ceil(tall * SCREEN.height / size), size);
  const right = -240 + world.map.columns * size, bottom = 160 - world.map.rows * size;
  // Maps grow and shrink at the right and bottom, so only sprites left beyond those edges move.
  const only = next.worlds!.length === 1;
  for (const sprite of next.sprites) if (sprite.world === world.id || (only && !sprite.world)) {
    if (sprite.x > right) sprite.x = right - 24;
    if (sprite.y < bottom) sprite.y = bottom + 24;
  }
  return next;
}
