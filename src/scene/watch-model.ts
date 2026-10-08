import type { SpriteState } from './model';
export const watchProperties = ['x','y','direction','size','visible','costume','kind','layer','vx','vy','grounded','data'] as const;
export interface Watch { id: string; sprite: string; property: typeof watchProperties[number]; key?: string }
export interface WatchValue { id: string; text: string; state: 'value' | 'missing' | 'inactive' | 'unavailable' }
const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(v);
export function validWatches(value: unknown): value is Watch[] {
  return Array.isArray(value) && value.length <= 12 && new Set(value.map(w => w?.id)).size === value.length && value.every(w => w && id(w.id) && id(w.sprite) && watchProperties.includes(w.property) && (w.property === 'data' ? typeof w.key === 'string' && w.key.length <= 128 : w.key === undefined));
}
export function validWatchValues(value: unknown): value is WatchValue[] {
  return Array.isArray(value) && value.length <= 12 && new Set(value.map(w => w?.id)).size === value.length && value.every(w => w && id(w.id) && typeof w.text === 'string' && w.text.length <= 240 && ['value','missing','inactive','unavailable'].includes(w.state));
}
function preview(value: unknown, depth = 0): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') { const chars = Array.from(value); return chars.slice(0,80).join('') + (chars.length > 80 ? '…' : ''); }
  if (value && typeof value === 'object') {
    if (depth >= 3) return '…';
    const list = Array.isArray(value), entries = list ? value : Object.entries(value);
    const parts = entries.slice(0,4).map(v => list ? preview(v,depth+1) : preview(v[0],depth+1)+': '+preview(v[1],depth+1));
    if (entries.length > 4) parts.push('…'); return (list ? '[' : '{') + parts.join(', ') + (list ? ']' : '}');
  }
  return '<object>';
}
export function initialWatch(watch: Watch, sprite: SpriteState | undefined): WatchValue {
  if (!sprite) return {id:watch.id,text:'Sprite unavailable',state:'unavailable'};
  let value: unknown;
  if (watch.property === 'data') { if (!Object.hasOwn(sprite.data ?? {},watch.key!)) return {id:watch.id,text:'Key not set',state:'missing'}; value = sprite.data![watch.key!]; }
  else if (watch.property === 'grounded') return {id:watch.id,text:'Available during Run',state:'unavailable'};
  else if (watch.property === 'vx' || watch.property === 'vy') value = sprite.motion?.[watch.property] ?? 0;
  else value = sprite[watch.property] ?? (watch.property === 'kind' ? 'sprite' : '');
  const text = Array.from(preview(value));
  return {id:watch.id,text:text.length > 120 ? text.slice(0,119).join('')+'…' : text.join(''),state:'value'};
}
