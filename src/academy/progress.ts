import type { Build } from '../guide/builds';

/** Academy progress: one small record per browser, next to the autosave, that a
 * family can export as a file and import on another device. No account, no upload.
 * Each unit keeps, per step, whether it is done, how many tries and right answers
 * it took, the hints used and the time spent (docs/learner-experience-plan.md §4.5). */
export interface StepRecord { done?: boolean; tries?: number; right?: number; ok?: boolean; hints?: number; ms?: number; at?: number }
export interface UnitRecord { started: number; updated: number; steps: Record<string, StepRecord>; finished?: number }
export interface Progress { format: 'python-blocks-academy'; version: 1; learner: { id: string; name: string }; units: Record<string, UnitRecord> }
export const PROGRESS_KEY = 'python-blocks.academy.v1';
export type ProgressEvent = { build: Build; index: number; type: 'done' | 'tried'; ok?: boolean; hints: number; ms: number };

const fresh = (): Progress => ({ format: 'python-blocks-academy', version: 1, learner: { id: crypto.randomUUID?.() ?? String(Date.now()), name: '' }, units: {} });
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** A progress record from a file or storage, or null when it is not one. */
export function readProgress(text: string): Progress | null {
  try {
    const value = JSON.parse(text) as Partial<Progress>;
    if (value?.format !== 'python-blocks-academy' || value.version !== 1 || typeof value.learner?.name !== 'string' || typeof value.learner.id !== 'string' || !value.units || typeof value.units !== 'object') return null;
    for (const unit of Object.values(value.units)) {
      if (!count(unit?.started) || !count(unit?.updated) || !unit.steps || typeof unit.steps !== 'object') return null;
      for (const step of Object.values(unit.steps)) if (!step || typeof step !== 'object' || ['tries', 'right', 'hints', 'ms', 'at'].some(key => key in step && !count((step as Record<string, unknown>)[key]))) return null;
    }
    return { format: 'python-blocks-academy', version: 1, learner: { id: value.learner.id.slice(0, 80), name: value.learner.name.slice(0, 40) }, units: value.units as Progress['units'] };
  } catch { return null; }
}
export function loadProgress(): Progress {
  try { return readProgress(localStorage.getItem(PROGRESS_KEY) ?? '') ?? fresh(); } catch { return fresh(); }
}
export function saveProgress(progress: Progress) {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* progress stays for this visit */ }
}

/** Fold one event from the unit runtime into the record. */
export function record(progress: Progress, event: ProgressEvent, now = Date.now()) {
  if (event.build.kind !== 'unit') return;
  const unit = progress.units[event.build.id] ??= { started: now, updated: now, steps: {} };
  const step = unit.steps[event.index] ??= {};
  unit.updated = now;
  step.hints = Math.max(step.hints ?? 0, event.hints);
  step.ms = Math.max(step.ms ?? 0, Math.round(event.ms));
  if (event.type === 'tried') { step.tries = (step.tries ?? 0) + 1; step.ok = !!event.ok; if (event.ok) step.right = (step.right ?? 0) + 1; }
  else { if (!step.done) step.at = now; step.done = true; }
}
export function finishUnit(progress: Progress, build: Build, now = Date.now()) {
  const unit = progress.units[build.id]; if (unit) { unit.finished = now; unit.updated = now; }
}

/** A unit's parts (Play, Guide, Practice…) with how many of their steps are done, and whether it is mastered. */
export function unitStatus(build: Build, unit: UnitRecord | undefined) {
  let first = 0;
  const parts = (build.chapters ?? []).map(part => {
    const steps = Array.from({ length: part.steps }, (_, i) => first + i); first += part.steps;
    return { title: part.title, total: part.steps, done: steps.filter(i => unit?.steps[i]?.done).length };
  });
  const tries = build.steps.flatMap((step, i) => step.mastery ? [unit?.steps[i]] : []);
  const right = tries.filter(step => step?.ok).length;
  const mastered = tries.length > 0 && tries.every(step => step?.tries) && right >= Math.min(2, tries.length);
  const done = parts.reduce((sum, part) => sum + part.done, 0);
  // The first step not yet done is where Continue goes.
  const next = build.steps.findIndex((_, i) => !unit?.steps[i]?.done);
  return { parts, done, total: build.steps.length, mastered, finished: !!unit?.finished, started: !!unit, next: next < 0 ? 0 : next, hints: Object.values(unit?.steps ?? {}).reduce((sum, step) => sum + (step.hints ?? 0), 0), ms: Object.values(unit?.steps ?? {}).reduce((sum, step) => sum + (step.ms ?? 0), 0) };
}
/** Time on steps finished in the last seven days. */
export function weekTime(progress: Progress, now = Date.now()) {
  let ms = 0;
  for (const unit of Object.values(progress.units)) for (const step of Object.values(unit.steps)) if (step.at && now - step.at < 7 * 24 * 3600_000) ms += step.ms ?? 0;
  return ms;
}
