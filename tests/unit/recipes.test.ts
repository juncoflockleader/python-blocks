import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { changeScene, sceneState } from '../../src/scene/state';
import { prepareProject } from '../../src/project';
import { compile } from '../../src/language/compiler';
import { handlerSignatures } from '../../src/language/functions';
import { appendRecipe, placement, recipeById, recipeProblems, recipes, type Recipe } from '../../src/guide/recipes';
import { rankRecipes, terms } from '../../src/guide/match';
import { rankIdeas } from '../../src/guide/ideas';
import { levelTypes } from '../../src/ui/levels';
import { paletteWorkspace } from './palette-workspace';
import { heldOut } from './recipe-heldout';
import wishSets from './recipe-wishes.json';
import { GALLERY_MANIFEST, LESSON_MANIFEST, PREVIEW_MANIFEST, galleryKey, galleryOutputs, lessonClipId, lessonClipKey, lessonClipOutputs, lessonClips, readManifest, recipeFiles, recipeKey, type GalleryFile } from '../preview-key';

const spaces: Blockly.Workspace[] = [];
afterEach(() => spaces.splice(0).forEach(w => w.dispose()));
const scene = (path: string) => prepareProject(readFileSync(path, 'utf8')).project.workspace.pythonScene!;
/** A project with the example's sprites (and worlds, for recipes that need them) but no blocks. */
function stagedWorkspace(recipe: Recipe) {
  const w = paletteWorkspace(); spaces.push(w);
  changeScene(w, scene(recipe.needs?.worlds ? 'src/scene/world-example.json' : 'src/scene/example.json'));
  return w;
}
const types = (state: Blockly.serialization.blocks.State, into = new Set<string>()) => {
  into.add(state.type);
  for (const input of Object.values(state.inputs ?? {})) { if (input.block) types(input.block, into); if (input.shadow) types(input.shadow, into); }
  if (state.next?.block) types(state.next.block, into);
  return into;
};

describe('recipes', () => {
  it('set every variable they read, at the start or earlier in the same script', () => {
    // A variable read before anything sets it stops the program with a NameError (Remember the best score once did).
    type Node = { type?: string; fields?: Record<string, string>; inputs?: Record<string, { block?: Node; shadow?: Node }>; next?: { block?: Node } };
    for (const recipe of recipes) {
      const startSets = new Set<string>();
      const walk = (node: Node | undefined, visit: (n: Node) => void) => { if (!node) return; visit(node); for (const input of Object.values(node.inputs ?? {})) walk(input.block ?? input.shadow, visit); walk(node.next?.block, visit); };
      for (const part of recipe.blocks ?? []) if (part.handler.kind === 'start') for (const top of part.stack as Node[]) walk(top, n => { if (n.type === 'py_set') startSets.add(n.fields!.SYMBOL); });
      for (const part of recipe.blocks ?? []) {
        const set = new Set(startSets);
        // Statements run in order; a value is read before the set it feeds, so visit inputs before the set itself.
        const run = (node: Node | undefined) => {
          for (let n = node; n; n = n.next?.block) {
            for (const [name, input] of Object.entries(n.inputs ?? {})) if (!/^(DO\d*|ELSE|STACK)$/.test(name)) walk(input.block ?? input.shadow, m => {
              if (m.type === 'py_get' && m.fields!.SYMBOL.startsWith('$var:')) expect(set.has(m.fields!.SYMBOL), `${recipe.id} reads ${m.fields!.SYMBOL} before setting it`).toBe(true);
            });
            // A set, or a for-each loop's own variable, makes the name readable from here on.
            if (n.type === 'py_set' || n.type === 'py_for_each') set.add(n.fields!.SYMBOL);
            for (const [name, input] of Object.entries(n.inputs ?? {})) if (/^(DO\d*|ELSE|STACK)$/.test(name)) run(input.block);
          }
        };
        for (const top of part.stack as Node[]) run(top);
      }
    }
  });

  it('cover every group with valid, reviewed content', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(40);
    expect(recipes.flatMap(recipe => recipeProblems(recipe))).toEqual([]);
    expect(new Set(recipes.map(r => r.group))).toEqual(new Set(['move', 'look', 'touch', 'game', 'sound', 'draw', 'data', 'fix']));
  });

  it('use only blocks their level’s palette offers', () => {
    const w = paletteWorkspace(); spaces.push(w);
    const sets = { starter: levelTypes(w, 'starter'), builder: levelTypes(w, 'builder'), pro: levelTypes(w, 'pro') };
    for (const recipe of recipes) for (const part of recipe.blocks ?? []) for (const block of part.stack) for (const type of types(block)) {
      expect(sets[recipe.level].has(type), `${recipe.id} uses ${type} above ${recipe.level}`).toBe(true);
    }
  });

  it('insert as handlers that compile without errors and target the chosen sprites', () => {
    for (const recipe of recipes.filter(r => r.blocks)) {
      const w = stagedWorkspace(recipe), selected = sceneState(w).sprites[0]?.id ?? '';
      const blocks = appendRecipe(w, recipe, placement(w, recipe, selected));
      expect(blocks.map(b => b.type), recipe.id).toEqual(recipe.blocks!.map(() => 'py_handler'));
      const result = compile(w);
      expect(result.diagnostics.filter(d => d.severity === 'error'), recipe.id).toEqual([]);
      expect(result.source, recipe.id).not.toBeNull();
      expect(handlerSignatures(w), recipe.id).toHaveLength(recipe.blocks!.length);
      expect(JSON.stringify(Blockly.serialization.workspaces.save(w)), recipe.id).not.toMatch(/"\$(sprite|other|world2|var:)/);
    }
  });

  it('chase points the selected enemy at the other sprite and moves it', () => {
    const recipe = recipeById('chase')!, w = stagedWorkspace(recipe);
    appendRecipe(w, recipe, placement(w, recipe, 'friend'));
    const source = compile(w).source!;
    expect(source).toContain('_pb_scene.on("friend", "update", on_friend_update)');
    expect(source).toContain('(_pb_scene.current_sprite).point_towards((_pb_sprites.named("Player")).x, (_pb_sprites.named("Player")).y)');
    expect(source).toContain('.move(3)');
  });

  it('explain what is missing instead of inserting a half-working idea', () => {
    const w = paletteWorkspace(); spaces.push(w);
    expect(() => placement(w, recipeById('chase')!, '')).toThrow(/needs 2 sprites/);
    const example = scene('src/scene/example.json'); changeScene(w, { ...sceneState(w), assets: example.assets, sprites: example.sprites.slice(0, 1) });
    expect(() => placement(w, recipeById('chase')!, '')).toThrow(/needs 2 sprites/);
    expect(() => placement(w, recipeById('next-level')!, '')).toThrow(/needs 2 sprites|needs 2 worlds/);
    expect(placement(w, recipeById('draw-square')!, '').sprite).toBe('player');
  });

  it('reuse an existing project variable instead of making a duplicate', () => {
    const recipe = recipeById('count-how-many')!, w = stagedWorkspace(recipe);
    appendRecipe(w, recipe, placement(w, recipe, 'player'));
    appendRecipe(w, recipe, placement(w, recipe, 'player'));
    expect(w.getVariableMap().getAllVariables().filter(v => v.getName() === 'count')).toHaveLength(1);
    expect(compile(w).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });
});

describe('previews', () => {
  it('ship for every block recipe and gallery entry, rendered by the browser suite from current inputs', () => {
    const previews = readManifest(PREVIEW_MANIFEST), thumbnails = readManifest(GALLERY_MANIFEST);
    const stale = [
      ...recipeFiles().filter(r => r.blocks && (previews[r.id] !== recipeKey(r) || !existsSync(`public/recipes/${r.preview}`))).map(r => `recipe ${r.id}`),
      ...JSON.parse(readFileSync('content/gallery.json', 'utf8')).filter((e: GalleryFile) => thumbnails[e.id] !== galleryKey(e) || !Object.values(galleryOutputs(e.id)).every(file => existsSync(file))).map((e: { id: string }) => `gallery ${e.id}`),
      ...lessonClips().filter(clip => readManifest(LESSON_MANIFEST)[lessonClipId(clip)] !== lessonClipKey(clip) || !Object.values(lessonClipOutputs(clip)).every(file => existsSync(file))).map(clip => `lesson clip ${lessonClipId(clip)}`),
    ];
    expect(stale, 'run tests/e2e/previews.spec.ts locally to re-render').toEqual([]);
  });
});

describe('local recipe matching', () => {
  const first20 = Object.keys(heldOut);
  it('has ten held-out wishes for each of the first twenty intents, none copied from a recipe', () => {
    expect(first20).toHaveLength(20);
    const phrases = new Set(recipes.flatMap(r => [r.title, ...r.phrases]).map(p => p.toLowerCase()));
    for (const [id, wishes] of Object.entries(heldOut)) {
      expect(recipeById(id), id).toBeDefined();
      expect(wishes, id).toHaveLength(10);
      for (const wish of wishes) expect(phrases.has(wish.toLowerCase()), wish).toBe(false);
    }
  });

  it('suggests the intended recipe for every held-out wish, with no AI key', () => {
    // The helper shows up to three idea cards. Every wish must surface its recipe
    // among them; as a regression floor, at least 90% must rank it first (186 of
    // 200 today). The implementer wrote these and tuned against them, so they are
    // development data; the separately written sets below measure generalization.
    const outside: string[] = []; let first = 0;
    for (const [id, wishes] of Object.entries(heldOut)) for (const wish of wishes) {
      const ranked = rankRecipes(wish, recipes).map(m => m.recipe.id);
      if (ranked[0] === id) first++;
      if (!ranked.includes(id)) outside.push(`${wish} → ${ranked.join(', ') || 'nothing'} (wanted ${id})`);
    }
    expect(outside).toEqual([]);
    expect(first).toBeGreaterThanOrEqual(180);
  });

  it('keeps its measured rate on wishes written separately by other authors', () => {
    // Floors are the measured results (see the record in docs/learner-experience-plan.md, section 3.8).
    const floors: Record<string, { first: number; shown: number }> = { A: { first: 175, shown: 196 }, B: { first: 173, shown: 196 }, C: { first: 164, shown: 189 } };
    for (const set of wishSets.sets) {
      let first = 0, shown = 0, empty = 0;
      expect(Object.keys(set.wishes), set.name).toEqual(Object.keys(heldOut));
      for (const [id, wishes] of Object.entries(set.wishes)) for (const wish of wishes) {
        const ranked = rankRecipes(wish, recipes).map(m => m.recipe.id);
        if (ranked[0] === id) first++; if (ranked.includes(id)) shown++; if (!ranked.length) empty++;
      }
      expect({ first, shown }, set.name).toEqual({ first: Math.max(first, floors[set.name].first), shown: Math.max(shown, floors[set.name].shown) });
      if (set.use === 'blind') expect(empty, set.name).toBe(0);
    }
  });

  it('matches its own phrases and ignores empty or unrelated wishes', () => {
    for (const recipe of recipes) for (const phrase of recipe.phrases) expect(rankRecipes(phrase, recipes).map(m => m.recipe.id), `${recipe.id}: ${phrase}`).toContain(recipe.id);
    expect(rankRecipes('', recipes)).toEqual([]);
    expect(rankRecipes('the a of', recipes)).toEqual([]);
    expect(rankRecipes('photosynthesis', recipes)).toEqual([]);
    expect(terms('Chasing the Énemy’s ghosts')).toEqual(['chase', 'enemy', 'enemy']);
  });

  it('ranks same-level ideas ahead of above-level ones only in a near tie', () => {
    const ids = (wish: string, level: 'starter' | 'builder' | 'pro') => rankIdeas(wish, level).map(r => r.id);
    // A clear above-level fit still comes first.
    expect(ids('camera follow me', 'starter')[0]).toBe('camera-follow');
    expect(ids('I want my bird to hop when I press space', 'starter')[0]).toBe('jump-gravity');
    // A toss-up between a Starter and a Builder idea goes to the Starter one at Starter, and to the Builder one at Builder.
    expect(ids('jump', 'starter').slice(0, 2)).toEqual(['jump-sound', 'jump-gravity']);
    expect(ids('jump', 'builder')[0]).toBe('jump-gravity');
    // At Pro nothing is demoted, so the order is the matcher's.
    expect(ids('chase', 'pro')).toEqual(rankRecipes('chase', recipes).map(m => m.recipe.id));
    expect(ids('photosynthesis', 'starter')).toEqual([]);
  });
});
