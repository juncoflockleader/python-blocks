import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { sameAnswer } from '../../src/guide/checker';
import { markupIn } from '../../src/guide/ui-refs';
import { numberOf, findBlock, categoryItems } from '../../src/ui/levels';
import { captioned } from '../../src/ui/block-captions';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore, snapshot } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { builds } from '../../src/guide/builds';
import { passes, type Check } from '../../src/guide/checks';
import { appendRecipe, placement, recipeById, type Recipe, type RecipePart } from '../../src/guide/recipes';
import { paletteWorkspace } from './palette-workspace';

/** Each lesson, built step by step the way "Show me how" builds it: the
 * lesson's planted blocks, then each step's own blocks (or its idea card) on
 * top of the steps before. Every step must pass its own check once its blocks
 * are in, and the project after a step with a clip is the one the preview
 * suite records that clip from (tests/fixtures/lessons, kept by a file snapshot). */
const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const dynamic = (check: Check): boolean => 'ran' in check || 'finished' in check || 'score' in check || 'predicted' in check || 'solved' in check || ('all' in check && check.all.some(dynamic)) || ('any' in check && check.any.every(dynamic));
const settled = { ran: true, finished: 'won' as const, predicted: true };
/** The parts of a check that do not depend on a run. */
const still = (check: Check): Check | null => 'all' in check ? { all: check.all.filter(part => !dynamic(part)) } : dynamic(check) ? null : check;
/** The project as text with Blockly's random ids (blocks, scripts, parameters, variables) renumbered in order of
 * appearance, so the same steps give the same file. Sprite and picture ids are the lesson's own and stay. */
function stable(project: ReturnType<typeof snapshot>, prefix: string) {
  const ids: string[] = [], seen = (id?: unknown) => { if (typeof id === 'string' && !ids.includes(id)) ids.push(id); };
  const blocks = (state: unknown): void => {
    if (!state || typeof state !== 'object') return;
    const block = state as { type?: unknown; id?: unknown };
    if (typeof block.type === 'string') seen(block.id);
    for (const value of Object.values(state)) blocks(value);
  };
  const workspace = project.workspace as { blocks?: unknown; procedures?: { id: string; parameters?: { id: string }[] }[]; variables?: { id: string }[] };
  blocks(workspace.blocks);
  for (const procedure of workspace.procedures ?? []) { seen(procedure.id); procedure.parameters?.forEach(p => seen(p.id)); }
  for (const variable of workspace.variables ?? []) seen(variable.id);
  let text = JSON.stringify(project, null, 1);
  ids.forEach((id, n) => { text = text.split(JSON.stringify(id)).join(`"${prefix}-${n + 1}"`); });
  return text + '\n';
}

describe('lessons, built step by step', () => {
  for (const lesson of builds.filter(b => b.kind === 'lesson')) it(`${lesson.id}: every step passes once its blocks are in, and clip steps keep their project`, async () => {
    const w = paletteWorkspace(); spaces.push(w);
    restore(w, prepareProject(JSON.stringify(lesson.starter)).project);
    const planted: Record<number, string[]> = {};
    const add = (parts: RecipePart[] | Recipe, select?: string, other?: string, variables?: string[]) => {
      const recipe = Array.isArray(parts) ? { id: 'lesson', title: lesson.title, group: 'game', phrases: [], level: 'pro', concepts: ['event'], steps: [], blocks: parts, ...(variables?.length ? { variables } : {}) } as Recipe : parts;
      return appendRecipe(w, recipe, placement(w, recipe, select ?? '', other)).map(block => block.id);
    };
    for (const [index, step] of lesson.steps.entries()) {
      const where = `${lesson.id} step ${index + 1}`;
      if (step.plant) planted[index] = add(step.plant, step.select, step.other);
      if (step.solution) {
        if (step.solution.replacesPlant !== undefined) for (const id of planted[step.solution.replacesPlant] ?? []) w.getBlockById(id)?.dispose(false);
        add(step.solution.parts, step.select, step.other, step.solution.variables);
      } else if (step.recipe) add(recipeById(step.recipe)!, step.select, step.other);
      const check = still(step.check);
      // An idea card's numbers are the learner's to change (win at 10, not its 5), so only its blocks are checked.
      if (check && !step.recipe) expect(passes(check, w, settled), where).toBe(true);
      const compiled = compile(w);
      expect(compiled.diagnostics.filter(d => d.severity === 'error'), where).toEqual([]);
      // A puzzle's own answer, run by Python on every test, prints every answer wanted.
      if (step.puzzle) {
        expect(compiled.executionMode, where).toBe('sequential');
        for (const [n, test] of step.puzzle.tests.entries()) {
          const printed = execFileSync('python3', ['-c', compiled.source!], { input: test.input, encoding: 'utf8' });
          expect(sameAnswer(printed, test.output), `${where} test ${n + 1}: printed ${JSON.stringify(printed)}`).toBe(true);
        }
      }
      if (step.clip) await expect(stable(snapshot(w), lesson.id)).toMatchFileSnapshot(`../fixtures/lessons/${lesson.id}-${index + 1}.json`);
    }
  });

  // Every block picture in a lesson names its block, so it shows the block's number in that category's picker.
  for (const lesson of builds.filter(b => b.kind === 'lesson')) it(`${lesson.id}: block pictures carry their picker numbers`, () => {
    const w = paletteWorkspace(); spaces.push(w);
    restore(w, prepareProject(JSON.stringify(lesson.starter)).project);
    const texts = lesson.steps.flatMap(step => [step.text, step.why ?? '', ...(step.hints ?? []), ...(step.checklist ?? []).map(c => c.text)]);
    const blocks = texts.flatMap(text => markupIn(text).blocks);
    expect(blocks.length, lesson.id).toBeGreaterThan(10);
    for (const { category, ref } of blocks) {
      // At the lesson's level the block is in the category the lesson names; at Pro it is somewhere in the palette.
      expect(numberOf(w as never, lesson.level, category, ref), `${lesson.id}: ${category} ${ref}`).toBeGreaterThan(0);
      expect(findBlock(w as never, 'pro', category, ref), `${lesson.id} at Pro: ${category} ${ref}`).toBeDefined();
    }
    // The picker's captions number its blocks 1, 2, 3… in order.
    const items = captioned(categoryItems(w as never, lesson.level, 'Physics'));
    const captions = items.filter(item => item.kind === 'label' && (item as { 'web-class'?: string })['web-class'] === 'block-caption').map(item => (item as { text: string }).text);
    expect(captions.map(text => Number(text.split('\u2002')[0]))).toEqual(captions.map((_, i) => i + 1));
    expect(captions.length).toBe(items.filter(item => item.kind === 'block').length);
  });
});
