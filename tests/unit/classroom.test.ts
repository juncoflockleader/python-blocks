import { afterEach, describe, expect, it } from 'vitest';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore, snapshot } from '../../src/project';
import { builds, version, type BuildStep } from '../../src/guide/builds';
import { appendRecipe, placement, type Recipe, type RecipePart } from '../../src/guide/recipes';
import { stopAt, stopsOf } from '../../src/classroom/stops';
import { missingBlocks, offered, stepBlockNumber, stepToolbox, typesIn, YOUR_BLOCKS } from '../../src/classroom/toolbox';
import { isLocked, lockScript, unlockAll } from '../../src/classroom/locks';
import { HAT_TYPE } from '../../src/language/hats';
import { paletteWorkspace } from './palette-workspace';

/** Classrooms (src/classroom): a unit's steps as a few stops, each step's own short list of blocks,
 * and the locks on blocks a step makes for the learner. The content tests keep narrowing honest:
 * a step's answer can always be built from the blocks the step offers. */
const units = builds.filter(build => build.kind === 'unit');
const rooms = units.filter(unit => unit.classroom);
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
function open(step: BuildStep, parts: RecipePart[] | undefined = step.plant) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify(step.project)).project);
  if (!parts?.length) return { w, tops: [] as Blockly.Block[] };
  const recipe = { id: 'unit', title: 'unit', group: 'game', phrases: [], level: 'pro', concepts: ['event'], steps: [], blocks: parts } as Recipe;
  return { w, tops: appendRecipe(w, recipe, placement(w, recipe, step.select ?? '', step.other)) };
}
const versions = (step: BuildStep) => Array.from({ length: (step.variants?.length ?? 0) + 1 }, (_, v) => version(step, v));

describe('classroom stops', () => {
  it('a unit is six stops: the Story, three puzzle stops by level, a Bonus that can be skipped, and the Star check', () => {
    for (const unit of units.filter(unit => !unit.unit?.capstone)) {
      expect(stopsOf(unit).map(stop => [stop.title, stop.steps, stop.required]), unit.id).toEqual([
        ['Story', 5, true], ['Puzzles 1', 3, true], ['Puzzles 2', 3, true], ['Puzzles 3', 3, true], ['Bonus', 1, false], ['Star check', 3, true]]);
    }
  });
  it('a big project is one stop, so Chapter 1 is 19 stops and 16 of them are needed', () => {
    const chapter = units.filter(unit => unit.unit?.chapter === 1).flatMap(unit => stopsOf(unit));
    expect(units.find(unit => unit.unit?.capstone)!).toBeDefined();
    expect(stopsOf(units.find(unit => unit.unit?.capstone)!).map(stop => stop.kind)).toEqual(['project']);
    expect(chapter).toHaveLength(19);
    expect(chapter.filter(stop => stop.required)).toHaveLength(16);
  });
  it('every step is in exactly one stop, and a step knows its place in it', () => {
    for (const unit of units) {
      const stops = stopsOf(unit);
      expect(stops.reduce((sum, stop) => sum + stop.steps, 0), unit.id).toBe(unit.steps.length);
      stops.forEach((stop, i) => expect(stop.first).toBe(stops.slice(0, i).reduce((sum, s) => sum + s.steps, 0)));
    }
    const unit = units.find(unit => unit.id === 'unit-1-1')!;
    expect(stopAt(unit, 0)).toMatchObject({ number: 0, step: 0, stop: { title: 'Story' } });
    expect(stopAt(unit, 9)).toMatchObject({ number: 2, step: 1, stop: { title: 'Puzzles 2' } });
    expect(stopAt(unit, 17)).toMatchObject({ number: 5, step: 2, stop: { title: 'Star check' } });
    expect(stopAt(unit, 18)).toBeNull();
  });
});

describe('classroom blocks', () => {
  it('Unit 1.1 is a classroom, and every step of a classroom says which blocks it offers', () => {
    expect(rooms.map(unit => unit.id)).toContain('unit-1-1');
    for (const unit of rooms) for (const [i, step] of unit.steps.entries()) expect(Array.isArray(step.toolbox), `${unit.id} step ${i + 1}`).toBe(true);
  });
  it('a step offers at most six blocks, each one a block the picker has, in one numbered list', () => {
    for (const unit of rooms) for (const [i, base] of unit.steps.entries()) for (const step of versions(base)) {
      const { w } = open(step), where = `${unit.id} step ${i + 1}`;
      expect(step.toolbox!.length, where).toBeLessThanOrEqual(6);
      expect(new Set(step.toolbox).size, where).toBe(step.toolbox!.length);
      expect(missingBlocks(w as never, [unit.level], step.toolbox!), where).toEqual([]);
    }
    const unit = rooms.find(unit => unit.id === 'unit-1-1')!, step = unit.steps[4], { w } = open(step);
    const items = stepToolbox(w as never, [unit.level], step.toolbox!);
    expect(items[0]).toMatchObject({ kind: 'label', text: YOUR_BLOCKS });
    expect(items.filter(item => item.kind === 'label').slice(1).map(item => (item as { text: string }).text)).toEqual(['1 when a key is pressed', '2 when clicked', '3 say for seconds']);
    expect(items.filter(item => item.kind === 'block').map(item => (item as { type: string }).type)).toEqual([HAT_TYPE, HAT_TYPE, 'scene_say_for']);
    // Lesson text shows a block's number in this list, not in its category.
    expect(stepBlockNumber(w as never, [unit.level], step.toolbox!, 'scene_say_for')).toBe(3);
    expect(stepBlockNumber(w as never, [unit.level], step.toolbox!, 'hat:key')).toBe(1);
    expect(stepBlockNumber(w as never, [unit.level], step.toolbox!, 'scene_glide')).toBeUndefined();
  });
  it('every answer can be built from the step’s own blocks and the blocks already on its workspace, in every version', () => {
    let built = 0;
    for (const unit of rooms) for (const [i, base] of unit.steps.entries()) for (const [v, step] of versions(base).entries()) {
      if (!step.solution) continue;
      const where = `${unit.id} step ${i + 1}${v ? ` version ${v + 1}` : ''}`, { w } = open(step);
      const have = offered(w as never, [unit.level], step.toolbox!);
      // What the step put on the workspace is there to use too: its blocks, and its "when …" blocks.
      for (const type of typesIn((step.plant ?? []).map(part => part.stack))) have.types.add(type);
      const planted = new Set((step.plant ?? []).map(part => part.handler.kind));
      const needs = step.solution.parts.filter(part => part.handler.kind !== 'loose' && part.handler.kind !== 'program');
      for (const part of needs) expect(have.hats.has(part.handler.kind as never) || planted.has(part.handler.kind), `${where}: a "when ${part.handler.kind}" block`).toBe(true);
      expect([...typesIn(step.solution.parts.map(part => part.stack))].filter(type => !have.types.has(type)), `${where}: blocks the answer needs that the step does not offer`).toEqual([]);
      built++;
    }
    expect(built).toBeGreaterThan(8);
  });
  it('a step that is watched, guessed or mended offers no blocks, and a step with no blocks on its workspace offers some', () => {
    for (const unit of rooms) for (const [i, step] of unit.steps.entries()) {
      const where = `${unit.id} step ${i + 1}`;
      if (step.kind === 'predict' || step.kind === 'quiz' || step.kind === 'play') expect(step.toolbox, where).toEqual([]);
      if (step.solution && !step.plant?.length) expect(step.toolbox!.length, where).toBeGreaterThan(0);
    }
  });
});

describe('classroom locks', () => {
  const unit = rooms.find(unit => unit.id === 'unit-1-1')!;
  const flags = (block: Blockly.Block) => [block.isMovable(), block.isDeletable(), block.isEditable()];
  // A shadow (the text in a say block) is never moved or deleted on its own; a lock only adds that it cannot be typed in.
  const real = (top: Blockly.Block) => top.getDescendants(false).filter(block => !block.isShadow());
  it('a frozen script cannot be moved, deleted or changed; a locked "when" block stays put with free blocks under it', () => {
    const { tops } = open(unit.steps[0]);
    lockScript(tops[0], true);
    for (const block of real(tops[0])) { expect(flags(block), block.type).toEqual([false, false, false]); expect(isLocked(block)).toBe(true); }
    for (const block of tops[0].getDescendants(false)) expect(block.isEditable(), block.type).toBe(false);
    expect(flags(tops[1])).toEqual([true, true, true]);
    lockScript(tops[1], 'hat');
    expect(flags(tops[1])).toEqual([false, false, true]);
    for (const block of real(tops[1]).slice(1)) { expect(flags(block), block.type).toEqual([true, true, true]); expect(isLocked(block)).toBe(false); }
  });
  it('locks are saved with the step’s work, and leaving the classroom takes off only the locks it put on', () => {
    const { w, tops } = open(unit.steps[0]);
    lockScript(tops[0], true); lockScript(tops[1], 'hat');
    tops[2].setDeletable(false);   // not a classroom lock
    const again = paletteWorkspace(); spaces.push(again);
    restore(again, prepareProject(JSON.stringify(snapshot(w))).project);
    const [first, second, third] = again.getTopBlocks(true);
    expect(flags(first)).toEqual([false, false, false]); expect(flags(second)).toEqual([false, false, true]);
    unlockAll(again);
    for (const block of [...real(first), second]) expect(flags(block), block.type).toEqual([true, true, true]);
    for (const block of first.getDescendants(false)) expect(block.isEditable(), block.type).toBe(true);
    expect(again.getAllBlocks(false).some(isLocked)).toBe(false);
    expect(third.isDeletable()).toBe(false);
  });
  it('Unit 1.1 locks what it makes: scripts to read are frozen, scripts to finish keep their "when" block, loose blocks stay free', () => {
    const lock = (step: BuildStep) => (step.plant ?? []).map(part => part.handler.kind === 'loose' ? 'loose' : part.locked ?? false);
    expect(lock(unit.steps[0])).toEqual([true, true, true]);
    expect(lock(unit.steps[6])).toEqual(['hat', 'loose']);
    expect(lock(unit.steps[9])).toEqual(['hat']);
    for (const [i, base] of unit.steps.entries()) for (const step of versions(base)) {
      if (step.kind === 'predict' || step.kind === 'quiz' || step.kind === 'play') expect(lock(step).every(mode => mode === true), `step ${i + 1}`).toBe(true);
    }
  });
});
