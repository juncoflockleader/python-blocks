import type { Build } from '../guide/builds';
import type { Progress } from '../academy/progress';
import { stopsOf, type Stop } from './stops';

/** A chapter as a path: its units' stops in order, one after another, each done, open or locked.
 * The path is worked out from what the Academy already keeps (which steps are done), so nothing new
 * is recorded for it. One stop is "now": the first needed stop that is not done; needed stops after
 * it are locked. A Bonus opens when the stop before it is done and never holds the path up. A stop
 * that is done stays open, to play again. */
export type StopState = 'done' | 'now' | 'open' | 'locked';
export interface PathStop extends Stop {
  unit: Build;
  state: StopState;
  /** How many of the stop's steps are done. */
  done: number;
  /** The step to open: the first not done, or the stop's first step when all are. */
  next: number;
  /** Its place among the path's needed stops (a Bonus has the place of the stop before it). */
  slot: number;
}
export interface ChapterPath {
  stops: PathStop[];
  /** The stop to do next; null once every needed stop is done. */
  now: PathStop | null;
  /** Needed stops, and how many of them are done. */
  needed: number;
  done: number;
}

export function chapterPath(units: readonly Build[], progress: Progress): ChapterPath {
  const stops: PathStop[] = []; let now: PathStop | null = null, slot = -1, before = true;
  for (const unit of units) for (const stop of stopsOf(unit)) {
    const steps = Array.from({ length: stop.steps }, (_, i) => stop.first + i), record = progress.units[unit.id];
    const done = steps.filter(i => record?.steps[i]?.done).length, complete = done === stop.steps;
    const next = complete ? stop.first : steps.find(i => !record?.steps[i]?.done)!;
    if (stop.required) slot++;
    let state: StopState;
    if (complete) state = 'done';
    else if (!stop.required) state = before ? 'open' : 'locked';
    else if (!now) state = 'now';
    else state = 'locked';
    const entry: PathStop = { ...stop, unit, state, done, next, slot: Math.max(slot, 0) };
    if (state === 'now') now = entry;
    // A Bonus looks only at the needed stop before it.
    if (stop.required) before = complete;
    stops.push(entry);
  }
  const needed = stops.filter(stop => stop.required);
  return { stops, now, needed: needed.length, done: needed.filter(stop => stop.state === 'done').length };
}
/** The stop a step of a unit is in. */
export const stopOf = (path: ChapterPath, unit: string, index: number) => path.stops.find(stop => stop.unit.id === unit && index >= stop.first && index < stop.first + stop.steps);
