/** Shared control lets the UI interrupt synchronous Python without rewriting it.
 * Slot 0 is the request; slot 1 is the worker's pause gate. */
export const debugCommands = { resume: 0, pause: 1, into: 2, over: 3, out: 4 } as const;
export type DebugAction = keyof typeof debugCommands;
export interface DebugValue { name: string; value: string }
export interface DebugFrame { file: string; line: number; name: string; locals: DebugValue[]; globals: DebugValue[] }
export interface DebugSnapshot { frames: DebugFrame[]; truncated: boolean }
export interface DebugOptions { lines: Record<string, number[]> }
export function debugAvailable() { return globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer !== 'undefined'; }
