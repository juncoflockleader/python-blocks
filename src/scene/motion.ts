export const motionNumbers = {
  vx: [-2000, 2000], vy: [-2000, 2000], ax: [-10000, 10000], ay: [-10000, 10000],
  dragX: [0, 10000], dragY: [0, 10000], speedX: [0, 2000], speedY: [0, 2000], lifetime: [0, 3600],
} as const;
export interface Motion {
  body: 'off' | 'moving' | 'wall'; vx: number; vy: number; ax: number; ay: number; dragX: number; dragY: number;
  response: 'slide' | 'stop' | 'bounce' | 'destroy'; edges: 'none' | 'stop' | 'bounce' | 'destroy';
  controller: 'none' | 'arrows' | 'wasd'; speedX: number; speedY: number; lifetime: number; autoDestroy: boolean;
}
export const defaultMotion = (): Motion => ({ body: 'off', vx: 0, vy: 0, ax: 0, ay: 0, dragX: 0, dragY: 0, response: 'slide', edges: 'none', controller: 'none', speedX: 120, speedY: 120, lifetime: 0, autoDestroy: false });
export function validKind(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 32 && value.trim() === value && !/[\x00-\x1f]/.test(value); }
export function validMotion(value: unknown): value is Partial<Motion> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const defaults = defaultMotion(), enums: Record<string, string[]> = { body: ['off', 'moving', 'wall'], response: ['slide', 'stop', 'bounce', 'destroy'], edges: ['none', 'stop', 'bounce', 'destroy'], controller: ['none', 'arrows', 'wasd'] };
  return Object.entries(value).every(([key, v]) => {
    if (!Object.hasOwn(defaults, key)) return false;
    if (key === 'autoDestroy') return typeof v === 'boolean';
    if (enums[key]) return enums[key].includes(v);
    const limits = motionNumbers[key as keyof typeof motionNumbers];
    return typeof v === 'number' && Number.isFinite(v) && v >= limits[0] && v <= limits[1];
  });
}
