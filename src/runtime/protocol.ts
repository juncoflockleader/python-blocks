import type { WatchValue } from '../scene/watch-model';
import type { QuestionCommand, QuestionReply } from '../scene/questions';
import type { AudioCommand } from '../scene/sound';
import type { SceneCommand, SceneInput, SceneState } from '../scene/model';
import eventLimits from './event-limits.json';
export { eventLimits };
export type ExecutionMode = 'sequential' | 'events';
export type RunnerCommand =
  | { type: 'run'; code: string; mode: ExecutionMode; runtimeURL?: string; files?: Record<string, string>; scene?: SceneState }
  | { type: 'input'; id: number; input: SceneInput }
  | { type: 'answer'; reply: QuestionReply }
  | { type: 'audio-ended'; id: number; error?: string }
  | { type: 'ping'; id: number }
  | { type: 'event'; id: number; message: string };

export type DrawCommand =
  | { type: 'move'; x1: number; y1: number; x2: number; y2: number; draw: boolean; color: string }
  | { type: 'turn'; heading: number };

export type RunnerEvent =
  | { type: 'watch-values'; values: WatchValue[] }
  | { type: 'status'; message: string }
  | { type: 'question'; command: QuestionCommand }
  | { type: 'audio'; command: AudioCommand }
  | { type: 'draw'; command: DrawCommand }
  | { type: 'scene'; command: SceneCommand }
  | { type: 'stdout'; text: string }
  | { type: 'started' }
  | { type: 'ready' }
  | { type: 'pong'; id: number }
  | { type: 'event-ack'; id: number; accepted: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string; exceptionType?: string; frames?: { file: string; line: number; name: string }[]; originFrames?: { file: string; line: number; name: string }[]; details?: string };

/** Host inputs use the same bounded value contract as Python emissions. */
export function encodeHostEvent(name: string, payload: unknown): string {
  if (!name || [...name].length > eventLimits.eventNameLength) throw new Error(`Event names need 1–${eventLimits.eventNameLength} characters.`);
  if (name === 'start') throw new Error('The "start" event is sent once by the runtime; choose another event name.');
  let nodes = 0;
  const ancestors = new Set<object>();
  const encoder = new TextEncoder();
  const visit = (value: unknown, depth: number) => {
    if (++nodes > eventLimits.payloadNodes || depth > eventLimits.payloadDepth) throw new Error('The event payload has too many values or nested levels.');
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (encoder.encode(value).length > eventLimits.payloadBytes) throw new Error('The event payload is too large.');
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return;
    if (!value || typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) || Object.getOwnPropertySymbols(value).length) throw new Error('Event payloads need JSON-compatible values and exactly representable numbers.');
    if (ancestors.has(value)) throw new Error('Event payloads cannot contain circular references.');
    ancestors.add(value);
    if (Array.isArray(value)) for (const child of value) visit(child, depth + 1);
    else for (const [key, child] of Object.entries(value)) { visit(key, depth + 1); visit(child, depth + 1); }
    ancestors.delete(value);
  };
  visit(payload, 0);
  const encoded = JSON.stringify(payload);
  if (encoder.encode(encoded).length > eventLimits.payloadBytes) throw new Error('The event payload is too large.');
  return `{"name":${JSON.stringify(name)},"payload":${encoded}}`;
}

export function isDrawCommand(value: unknown): value is DrawCommand {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const number = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1_000_000;
  if (item.type === 'turn') return number(item.heading);
  return item.type === 'move' && [item.x1, item.y1, item.x2, item.y2].every(number)
    && typeof item.draw === 'boolean' && typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color);
}
