export type DrawCommand =
  | { type: 'move'; x1: number; y1: number; x2: number; y2: number; draw: boolean; color: string }
  | { type: 'turn'; heading: number };

export type RunnerEvent =
  | { type: 'status'; message: string }
  | { type: 'draw'; command: DrawCommand }
  | { type: 'stdout'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export function isDrawCommand(value: unknown): value is DrawCommand {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000;
  if (item.type === 'turn') return number(item.heading);
  return item.type === 'move' && [item.x1, item.y1, item.x2, item.y2].every(number)
    && typeof item.draw === 'boolean' && typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color);
}
