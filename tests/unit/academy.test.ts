import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { builds, version, type Build, type BuildStep } from '../../src/guide/builds';
import { appendRecipe, placement, type Recipe, type RecipePart } from '../../src/guide/recipes';
import { aboutTheRun, passes, type Check } from '../../src/guide/checks';
import { knownCategory, knownControl, markupIn } from '../../src/guide/ui-refs';
import { knownWord } from '../../src/guide/words';
import { numberOf } from '../../src/ui/levels';
import type { GameStep } from '../../src/guide/checker';
import chapters from '../../content/academy/chapters.json';
import { paletteWorkspace } from './palette-workspace';

/** Academy units (content/academy): every problem checked by playing the game fails as it
 * starts and passes with its answer, in every version, judged by the same scripted player
 * the browser uses (src/runtime/checks.py, run here by tests/python/scene_check.py). */
const units = builds.filter(build => build.kind === 'unit');
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));

/** A problem's project with its own scripts, or with `parts` (its answer) instead. */
function open(step: BuildStep, parts?: RecipePart[]) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify(step.project)).project);
  const scripts = parts ?? step.plant;
  if (scripts?.length) {
    const recipe = { id: 'unit', title: 'unit', group: 'game', phrases: [], level: 'pro', concepts: ['event'], steps: [], blocks: scripts } as Recipe;
    appendRecipe(w, recipe, placement(w, recipe, step.select ?? '', step.other));
  }
  return w;
}
function play(w: Blockly.Workspace, script: GameStep[], where: string) {
  const compiled = compile(w);
  expect(compiled.diagnostics.filter(d => d.severity === 'error'), where).toEqual([]);
  const out = execFileSync('python3', ['tests/python/scene_check.py'], { input: JSON.stringify({ source: compiled.source, scene: compiled.scene, steps: script, files: compiled.files }), encoding: 'utf8' });
  return JSON.parse(out) as { result: { type: string; message?: string }; reports: { index: number; ok: boolean; got: unknown }[] };
}
const still = (check: Check): Check | null => 'all' in check ? { all: check.all.filter(part => !aboutTheRun(part)) } : aboutTheRun(check) ? null : check;

it('the map lists every unit once, and every unit it lists exists', () => {
  const listed = chapters.flatMap(chapter => chapter.units.flatMap(unit => 'id' in unit && unit.id ? [unit.id] : []));
  expect(listed.sort()).toEqual(units.map(unit => unit.id).sort());
  expect(chapters.map(chapter => chapter.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  for (const unit of units) expect(chapters[unit.unit!.chapter - 1].units[unit.unit!.number - 1]).toMatchObject({ id: unit.id });
});

describe('academy units', () => {
  for (const unit of units) {
    it(`${unit.id}: its parts add up to its steps, mastery is three one-try problems (a big project has none), and every quiz's answer is one of its choices`, () => {
      expect(unit.chapters!.reduce((sum, part) => sum + part.steps, 0)).toBe(unit.steps.length);
      const mastery = unit.steps.filter(step => step.mastery);
      expect(mastery).toHaveLength(unit.unit!.capstone ? 0 : 3);
      expect(chapters[unit.unit!.chapter - 1].units[unit.unit!.number - 1].capstone ?? false).toBe(unit.unit!.capstone ?? false);
      for (const step of mastery) { expect(step.check).toEqual({ tried: true }); expect(step.hints ?? []).toEqual([]); }
      for (const [i, base] of unit.steps.entries()) for (let v = 0; v <= (base.variants?.length ?? 0); v++) {
        const quiz = version(base, v).quiz;
        if (quiz) { expect(quiz.answer, `${unit.id} step ${i + 1}`).toBeGreaterThanOrEqual(0); expect(quiz.answer).toBeLessThan(quiz.choices.length); }
      }
    });

    it(`${unit.id}: every game problem fails as it starts and passes with its answer, in every version`, () => {
      let checked = 0;
      for (const [i, base] of unit.steps.entries()) for (let v = 0; v <= (base.variants?.length ?? 0); v++) {
        const step = version(base, v), where = `${unit.id} step ${i + 1}${v ? ` version ${v + 1}` : ''}`;
        if (!step.game) continue;
        expect(step.solution, `${where} needs an answer`).toBeDefined();
        const wanted = step.game.script.filter(part => 'expect' in part).length;
        const starting = play(open(step), step.game.script, where);
        expect(starting.result.type, where).toBe('done');
        expect(starting.reports.some(report => !report.ok), `${where}: the problem should not already be solved`).toBe(true);
        const answered = play(open(step, step.solution!.parts), step.game.script, `${where} answer`);
        expect(answered.result, `${where} answer`).toEqual({ type: 'done' });
        expect(answered.reports.filter(report => report.ok), `${where} answer: ${JSON.stringify(answered.reports)}`).toHaveLength(wanted);
        checked++;
      }
      expect(checked).toBeGreaterThan(unit.unit!.capstone ? -1 : 5);
    });

    // A big project builds one card a step at a time: each step's answer goes on top of the ones before, and its check passes.
    if (unit.unit?.capstone) it(`${unit.id}: built step by step, every step passes once its blocks are in`, () => {
      let w: Blockly.Workspace | null = null, base: BuildStep | null = null;
      for (const [i, step] of unit.steps.entries()) {
        if (step.project) { w = open(step); base = step; }
        if (!w || !base || i === 0 || !step.solution) continue;
        const recipe = { id: 'unit', title: 'unit', group: 'game', phrases: [], level: 'pro', concepts: ['event'], steps: [], blocks: step.solution.parts } as Recipe;
        appendRecipe(w, recipe, placement(w, recipe, step.select ?? '', step.other));
        const check = still(step.check);
        if (check) expect(passes(check, w, { ran: true, finished: 'won', predicted: true }), `${unit.id} step ${i + 1}`).toBe(true);
        expect(compile(w).diagnostics.filter(d => d.severity === 'error'), `${unit.id} step ${i + 1}`).toEqual([]);
      }
      // The finished card ticks every item of Make it yours.
      const last = unit.steps.at(-1)!;
      for (const item of last.checklist ?? []) expect(passes(item.check, w!, { ran: true, finished: null }), `${unit.id}: ${item.text}`).toBe(true);
    });

    it(`${unit.id}: guide and build steps pass with their answers, and block pictures carry picker numbers`, () => {
      for (const [i, step] of unit.steps.entries()) {
        if (step.solution && !step.game && step.project) {
          const check = still(step.check);
          if (check) expect(passes(check, open(step, step.solution.parts), { ran: true, finished: 'won', predicted: true }), `${unit.id} step ${i + 1}`).toBe(true);
        }
      }
      // Sprite blocks ("when Fox clicked") are in the picker once the unit's sprites are.
      const w = paletteWorkspace(); spaces.push(w); restore(w, prepareProject(JSON.stringify(unit.starter)).project);
      const texts = unit.steps.flatMap(step => [step, ...(step.variants ?? []).map(v => version(step, step.variants!.indexOf(v) + 1))])
        .flatMap(step => [step.text, step.why ?? '', ...(step.hints ?? []), ...(step.checklist ?? []).map(c => c.text)]);
      // Controls, categories and words named in the text are real, so each shows as its chip or card.
      for (const text of texts) {
        const found = markupIn(text);
        for (const control of found.controls) expect(knownControl(control), `${unit.id}: control ${control}`).toBe(true);
        for (const category of found.categories) expect(knownCategory(category), `${unit.id}: category ${category}`).toBe(true);
        for (const word of found.words) expect(knownWord(word), `${unit.id}: word ${word}`).toBe(true);
      }
      const blocks = texts.flatMap(text => markupIn(text).blocks);
      expect(blocks.length).toBeGreaterThan(5);
      const missing = blocks.filter(({ category, ref }) => !numberOf(w as never, unit.level, category, ref)).map(({ category, ref }) => `${category} ${ref}`);
      expect(missing, `${unit.id}: block pictures not in the picker at ${unit.level}`).toEqual([]);
    });
  }
});

export type { Build };
