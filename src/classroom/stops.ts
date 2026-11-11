import type { Build, BuildStep } from '../guide/builds';

/** A classroom shows a unit as a few short stops instead of one long list of steps: the Story (play
 * it, then the guide's pages), one puzzle stop per level of practice, an optional Bonus, and the Star
 * check; a chapter's big project is one stop. Stops are worked out from what a unit already says
 * about its steps (`tier`, `mastery`, `kind`), so no unit is rewritten to have them. */
export type StopKind = 'story' | 'puzzles' | 'bonus' | 'stars' | 'project';
export interface Stop { kind: StopKind; title: string; first: number; steps: number; required: boolean }

const kindOf = (build: Build, step: BuildStep): { kind: StopKind; key: string } => {
  if (build.unit?.capstone) return { kind: 'project', key: 'project' };
  if (step.mastery) return { kind: 'stars', key: 'stars' };
  if (step.kind === 'challenge') return { kind: 'bonus', key: 'bonus' };
  if (step.tier) return { kind: 'puzzles', key: `puzzles-${step.tier}` };
  return { kind: 'story', key: 'story' };
};
const TITLES: Record<StopKind, string> = { story: 'Story', puzzles: 'Puzzles', bonus: 'Bonus', stars: 'Star check', project: 'Big project' };

/** A unit's stops, in order: steps of the same kind (and, for practice, the same level) that follow one another. */
export function stopsOf(build: Build): Stop[] {
  const stops: Stop[] = []; let last = '';
  build.steps.forEach((step, index) => {
    const { kind, key } = kindOf(build, step);
    if (key === last) { stops.at(-1)!.steps++; return; }
    last = key; stops.push({ kind, title: TITLES[kind], first: index, steps: 1, required: kind !== 'bonus' });
  });
  // Puzzle stops are numbered when a unit has more than one.
  const puzzles = stops.filter(stop => stop.kind === 'puzzles');
  if (puzzles.length > 1) puzzles.forEach((stop, i) => { stop.title = `Puzzles ${i + 1}`; });
  return stops;
}
/** The stop a step is in: which stop it is, and the step's place in it. */
export function stopAt(build: Build, index: number) {
  const stops = stopsOf(build), number = stops.findIndex(stop => index >= stop.first && index < stop.first + stop.steps);
  return number < 0 ? null : { stops, stop: stops[number], number, step: index - stops[number].first };
}
