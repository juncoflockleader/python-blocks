import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { sceneState } from '../../src/scene/state';
import { builds, buildById, chapterOf, type Build } from '../../src/guide/builds';
import { passes, type Check } from '../../src/guide/checks';
import { GALLERY_KINDS, entries } from '../../src/guide/gallery';
import { appendRecipe, placement, recipeById, recipes, type Recipe } from '../../src/guide/recipes';
import { atLeast, palette, requiredLevel } from '../../src/ui/levels';
import { checkGuidance, concepts, instructionsFor, responseSchemaFor } from '../../src/assist/catalog';
import { paletteWorkspace } from './palette-workspace';
import { knownCategory, knownControl, markupIn, plainText } from '../../src/guide/ui-refs';
import { WORDS, knownWord } from '../../src/guide/words';

const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
function loaded(project: unknown) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify(project)).project);
  return w;
}
const game = (build: Build) => JSON.parse(readFileSync(`content/builds/${build.id}-game.json`, 'utf8'));
const dynamic = (check: Check): boolean => 'ran' in check || 'finished' in check || 'score' in check || 'predicted' in check || ('all' in check && check.all.some(dynamic)) || ('any' in check && check.any.every(dynamic));
const finished = { ran: true, finished: 'won' as const };

describe('guided builds', () => {
  it('are the six planned games and three lessons, each with a minute budget and a next step', () => {
    // Lessons are listed first.
    expect(builds.map(b => b.title)).toEqual(['Brick Breaker', 'Flappy Flight', 'Super Hopper', 'Catch the star', 'Dodge the balls', 'Pen patterns', 'Talking story', 'Jump quest', 'Maze run']);
    for (const build of builds) {
      expect(build.minutes, build.id).toBeGreaterThan(0);
      expect(build.finish.remix, build.id).toHaveLength(3);
      if (build.next) expect(buildById(build.next), build.id).toBeDefined();
      expect(build.steps.length, build.id).toBeGreaterThanOrEqual(4);
    }
    // Every build is reachable by following "next" from the one nothing leads to.
    const roots = builds.filter(b => !builds.some(other => other.next === b.id));
    expect(roots.map(b => b.id)).toEqual(['catch-the-star']);
    const seen = new Set<string>(); for (let b: Build | undefined = roots[0]; b && !seen.has(b.id); b = b.next ? buildById(b.next) : undefined) seen.add(b.id);
    expect(seen.size).toBe(builds.length);
    // One order: "Next" goes through the builds in `order`, which also sorts the list within lessons and builds.
    expect([...seen].map(id => buildById(id)!.order)).toEqual([...seen].map((_, i) => i + 1));
  });

  it('name real controls and palette categories, which show as chips with their icons', () => {
    const texts = [...builds.flatMap(b => [...b.steps.flatMap(s => [s.text, s.why ?? '', ...(s.hints ?? []), ...(s.checklist ?? []).map(c => c.text)]), b.finish.text, ...b.finish.remix]), ...entries.flatMap(e => e.tryChanging)];
    const found = texts.map(markupIn), controls = found.flatMap(f => f.controls), categories = found.flatMap(f => f.categories), words = found.flatMap(f => f.words);
    expect(controls.length + categories.length).toBeGreaterThan(25);
    for (const control of controls) expect(knownControl(control), control).toBe(true);
    for (const category of categories) expect(knownCategory(category), category).toBe(true);
    for (const word of words) expect(knownWord(word), word).toBe(true);
    expect(plainText('Press [[Run code]], then drag from {{Events}}.')).toBe('Press Run code, then drag from Events.');
    expect(plainText('Snap ((Physics|set sprite Bird vy to 300)) and give it <<gravity|ay>>, then tap [space] or [←].')).toBe('Snap set sprite Bird vy to 300 and give it gravity, then tap space or left arrow.');
    expect(Object.values(WORDS).every(word => word.say.split(/(?<=[.!?])\s+/).every(sentence => sentence.split(' ').length <= 22))).toBe(true);
  });

  it('speak to young readers in lessons: a goal per step, short sentences, block pictures, and no programmer words', () => {
    // Words a lesson leaves out of its own sentences (a block picture or a word card may still show them).
    const jargon = /\b(script|scripts|handler|acceleration|velocity|loop|loops|event|variable|boolean|integer|execute|instance|function|parameter|predict)\b/i;
    for (const lesson of builds.filter(b => b.kind === 'lesson')) {
      const texts = [lesson.summary, ...lesson.learn!, ...lesson.chapters!.flatMap(c => [c.title, c.idea]), lesson.finish.text, ...lesson.finish.remix];
      for (const [index, step] of lesson.steps.entries()) {
        const where = `${lesson.id} step ${index + 1}`;
        expect(step.title, where).toBeTruthy(); expect(step.title!.split(' ').length, where).toBeLessThanOrEqual(6);
        texts.push(step.title!, step.text, step.why ?? '', ...(step.hints ?? []), ...(step.checklist ?? []).map(c => c.text));
        if (step.predict) texts.push(step.predict.question, ...step.predict.choices, step.predict.explain);
        if (step.kind !== 'play') expect(`${step.text} ${step.hints?.join(' ')} ${step.checklist?.map(c => c.text).join(' ')}`, `${where} shows a block`).toMatch(/\(\([A-Z][^|]*\|/);
      }
      for (const text of texts) {
        const sentences = plainText(text.replace(/\(\([^)]*\)\)|<<[^>]*>>/g, 'it')).split(/(?<=[.!?:])\s+/);
        expect(text.replace(/\(\([^)]*\)\)|<<[^>]*>>|\[\[[^\]]*\]\]/g, ''), `${lesson.id}: “${text}”`).not.toMatch(jargon);
        for (const sentence of sentences) expect(sentence.split(/\s+/).length, `${lesson.id}: “${sentence}”`).toBeLessThanOrEqual(24);
      }
    }
  });

  it('point at real recipes, sprites and palette categories of their level', () => {
    for (const build of builds) {
      const starter = loaded(build.starter), sprites = new Set(sceneState(starter).sprites.map(s => s.id));
      const categories = new Set(palette[build.level].map(c => c.id));
      for (const [index, step] of build.steps.entries()) {
        const where = `${build.id} step ${index + 1}`;
        if (step.recipe) { expect(recipeById(step.recipe), where).toBeDefined(); expect(atLeast(build.level, recipeById(step.recipe)!.level), `${where} recipe level`).toBe(true); }
        if (step.highlight?.category) expect(categories.has(step.highlight.category), `${where} category ${step.highlight.category}`).toBe(true);
        if (step.select) { const game_ = loaded(game(build)); expect(sprites.has(step.select) || sceneState(game_).sprites.some(s => s.id === step.select), `${where} sprite ${step.select}`).toBe(true); }
      }
    }
  });

  it('start incomplete and end as a finished game that compiles and passes every step', () => {
    for (const build of builds) {
      const starter = loaded(build.starter);
      expect(build.steps.every(step => passes(step.check, starter, finished)), `${build.id} starter already passes`).toBe(false);
      const w = loaded(game(build));
      const result = compile(w);
      expect(result.diagnostics.filter(d => d.severity === 'error'), build.id).toEqual([]);
      expect(result.hasEntry, build.id).toBe(true);
      for (const [index, step] of build.steps.entries()) if (!dynamic(step.check)) expect(passes(step.check, w, finished), `${build.id} step ${index + 1}`).toBe(true);
      expect(atLeast(build.level, requiredLevel(w as Blockly.WorkspaceSvg).level), `${build.id} needs ${requiredLevel(w as Blockly.WorkspaceSvg).level}`).toBe(true);
    }
  });

  it('lessons have chapters, live checklists, hints, sound predictions and repairable plants', () => {
    const lessons = builds.filter(b => b.kind === 'lesson');
    expect(lessons.map(b => b.id)).toEqual(['brick-breaker', 'flappy-flight', 'super-hopper']);
    for (const lesson of lessons) {
      expect(lesson.chapters!.reduce((sum, c) => sum + c.steps, 0), lesson.id).toBe(lesson.steps.length);
      expect(lesson.learn!.length, lesson.id).toBeGreaterThanOrEqual(3);
      const w = loaded(game(lesson));
      for (const [index, step] of lesson.steps.entries()) {
        const where = `${lesson.id} step ${index + 1}`;
        expect(chapterOf(lesson, index), where).not.toBeNull();
        expect(step.why, where).toBeTruthy();
        if (step.kind !== 'play') {
          expect(step.checklist?.length, where).toBeGreaterThan(0);
          expect(step.hints, where).toHaveLength(2);
          expect(step.recipe || step.solution || step.plant, `${where} needs a last rung or a planted puzzle`).toBeTruthy();
          // The finished game ticks every part that does not depend on a run.
          for (const part of step.checklist!) if (!dynamic(part.check)) expect(passes(part.check, w, finished), `${where}: ${part.text}`).toBe(true);
        }
        if (step.predict) {
          expect(step.predict.choices.length, where).toBeGreaterThanOrEqual(3);
          expect(step.predict.choices[step.predict.answer], where).toBeDefined();
        }
        if (step.kind === 'play') expect(dynamic(step.check), where).toBe(true);
        if (step.goal) expect(step.check, where).toEqual({ score: step.goal.score });
        if (step.solution?.replacesPlant !== undefined) expect(lesson.steps[step.solution.replacesPlant].plant, where).toBeDefined();
      }
    }
  });

  it('plant a puzzle that compiles but does not pass, and add solutions that resolve every placeholder', () => {
    for (const lesson of builds.filter(b => b.kind === 'lesson')) for (const [index, step] of lesson.steps.entries()) {
      for (const parts of [step.plant, step.solution?.parts]) {
        if (!parts) continue;
        const w = loaded(lesson.starter);
        const recipe = { id: 'lesson', title: 'Lesson', group: 'game', phrases: [], level: 'pro', concepts: ['event'], steps: [], blocks: parts } as Recipe;
        appendRecipe(w, recipe, placement(w, recipe, step.select ?? '', step.other));
        const where = `${lesson.id} step ${index + 1}`;
        expect(compile(w).diagnostics.filter(d => d.severity === 'error'), where).toEqual([]);
        expect(JSON.stringify(Blockly.serialization.workspaces.save(w)), where).not.toMatch(/"\$(sprite|other)"/);
        if (parts === step.plant) expect(passes(step.check, w, finished), `${where} plant already passes`).toBe(false);
      }
    }
  });

  it('checks block fields, numbers, handler owners, the last block and run scores', () => {
    const w = loaded(game(buildById('brick-breaker')!));
    expect(passes({ field: ['scene_motion_edges', 'MODE', 'bounce'] }, w, finished)).toBe(true);
    expect(passes({ field: ['scene_motion_edges', 'MODE', 'destroy'] }, w, finished)).toBe(false);
    expect(passes({ number: ['scene_control', 'VY', 0] }, w, finished)).toBe(true);
    expect(passes({ number: ['scene_control', 'VY', 180] }, w, finished)).toBe(false);
    expect(passes({ handler: 'overlap', sprite: 'brick', last: 'scene_destroy' }, w, finished)).toBe(true);
    expect(passes({ handler: 'overlap', sprite: 'paddle', last: 'scene_destroy' }, w, finished)).toBe(false);
    expect(passes({ handler: 'update', sprite: 'paddle' }, w, finished)).toBe(false);
    expect(passes({ score: 5 }, w, { ran: true, finished: null, score: 4 })).toBe(false);
    expect(passes({ score: 5 }, w, { ran: true, finished: null, score: 5 })).toBe(true);
    expect(passes({ predicted: true }, w, { ran: true, finished: null })).toBe(false);
  });

  it('checks read run facts and handler kinds, not just block presence', () => {
    const w = loaded(game(buildById('catch-the-star')!));
    expect(passes({ ran: true }, w, { ran: false, finished: null })).toBe(false);
    expect(passes({ finished: 'won' }, w, { ran: true, finished: 'lost' })).toBe(false);
    expect(passes({ finished: 'any' }, w, { ran: true, finished: 'lost' })).toBe(true);
    expect(passes({ handler: 'overlap', contains: ['game_finish'] }, w, finished)).toBe(true);
    expect(passes({ handler: 'key', contains: ['game_finish'] }, w, finished)).toBe(false);
    const pens = loaded(game(buildById('pen-patterns')!));
    expect(passes({ nested: ['controls_repeat_ext', 'controls_repeat_ext'] }, pens, finished)).toBe(true);
    expect(passes({ nested: ['pen_turn', 'pen_move'] }, pens, finished)).toBe(false);
  });
});

describe('gallery', () => {
  it('keeps the ten examples and adds the nine guided-build and lesson games, with three things to try', () => {
    expect(entries).toHaveLength(19);
    expect(new Set(entries.map(e => e.id)).size).toBe(19);
    for (const id of ['scene-example', 'scene-motion-example', 'scene-story-example', 'scene-drawing-example', 'scene-behavior-example', 'scene-game-example', 'scene-world-example', 'scene-star-game', 'sound-example', 'scene-input-example']) expect(entries.some(e => e.id === id), id).toBe(true);
    for (const entry of entries) {
      expect(entry.tryChanging, entry.id).toHaveLength(3);
      expect(GALLERY_KINDS, `${entry.id} kind`).toContain(entry.kind);
      for (const tag of entry.tags) expect(Object.hasOwn(concepts, tag), `${entry.id} ${tag}`).toBe(true);
      if (entry.build) expect(buildById(entry.build), entry.id).toBeDefined();
    }
  });

  it('labels each entry with the level its project needs', () => {
    for (const entry of entries) {
      const w = loaded(JSON.parse(readFileSync(entry.project, 'utf8')));
      expect(entry.level, entry.id).toBe(requiredLevel(w as Blockly.WorkspaceSvg).level);
    }
  });
});

describe('AI routing contract', () => {
  const ideas = recipes.slice(0, 3).map(r => ({ id: r.id, title: r.title }));
  it('lets the model choose only a reviewed idea ID, or none', () => {
    const base = { concept: 'event', question: 'clarify', line: 0 };
    expect(checkGuidance(base, 0, ideas)).toEqual(base);
    expect(checkGuidance({ ...base, recipe: null }, 0, ideas).recipe).toBeNull();
    expect(checkGuidance({ ...base, recipe: ideas[1].id }, 0, ideas).recipe).toBe(ideas[1].id);
    for (const recipe of ['unknown-idea', 'print("hi")', 7, '__proto__']) expect(() => checkGuidance({ ...base, recipe }, 0, ideas), String(recipe)).toThrow('unsupported');
    expect(() => checkGuidance({ ...base, recipe: ideas[0].id }, 0, [])).toThrow('unsupported');
    expect(() => checkGuidance({ ...base, recipe: null, code: 'x' }, 0, ideas)).toThrow('unsupported');
  });
  it('constrains the schema and names the ideas in the instructions', () => {
    const schema = responseSchemaFor(ideas) as { required: string[]; properties: { recipe: { enum: unknown[] } } };
    expect(schema.required).toContain('recipe');
    expect(schema.properties.recipe.enum).toEqual([...ideas.map(i => i.id), null]);
    expect(instructionsFor(ideas)).toContain(`${ideas[0].id} = ${ideas[0].title}`);
    expect(responseSchemaFor([]).required).not.toContain('recipe');
  });
});
