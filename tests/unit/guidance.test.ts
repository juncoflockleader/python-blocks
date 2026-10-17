import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { prepareProject, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { sceneState } from '../../src/scene/state';
import { builds, buildById, type Build } from '../../src/guide/builds';
import { passes, type Check } from '../../src/guide/checks';
import { GALLERY_KINDS, entries } from '../../src/guide/gallery';
import { recipeById, recipes } from '../../src/guide/recipes';
import { atLeast, palette, requiredLevel } from '../../src/ui/levels';
import { checkGuidance, concepts, instructionsFor, responseSchemaFor } from '../../src/assist/catalog';
import { paletteWorkspace } from './palette-workspace';

const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
function loaded(project: unknown) {
  const w = paletteWorkspace(); spaces.push(w);
  restore(w, prepareProject(JSON.stringify(project)).project);
  return w;
}
const game = (build: Build) => JSON.parse(readFileSync(`content/builds/${build.id}-game.json`, 'utf8'));
const dynamic = (check: Check): boolean => 'ran' in check || 'finished' in check || ('all' in check && check.all.some(dynamic)) || ('any' in check && check.any.every(dynamic));
const finished = { ran: true, finished: 'won' as const };

describe('guided builds', () => {
  it('are the six planned games, each with a minute budget and a next step', () => {
    expect(builds.map(b => b.title)).toEqual(['Catch the star', 'Dodge the balls', 'Pen patterns', 'Maze run', 'Jump quest', 'Talking story']);
    for (const build of builds) {
      expect(build.minutes, build.id).toBeGreaterThan(0);
      expect(build.finish.remix, build.id).toHaveLength(3);
      if (build.next) expect(buildById(build.next), build.id).toBeDefined();
      expect(build.steps.length, build.id).toBeGreaterThanOrEqual(4);
    }
    // Every build is reachable by following "next" from the first one.
    const seen = new Set<string>(); for (let b: Build | undefined = builds[0]; b && !seen.has(b.id); b = b.next ? buildById(b.next) : undefined) seen.add(b.id);
    expect(seen.size).toBe(builds.length);
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
  it('keeps the ten examples and adds the six guided-build games, with three things to try', () => {
    expect(entries).toHaveLength(16);
    expect(new Set(entries.map(e => e.id)).size).toBe(16);
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
