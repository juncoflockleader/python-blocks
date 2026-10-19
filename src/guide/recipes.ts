import * as Blockly from 'blockly/core';
import { handlerState, HAT_KINDS, type HatKind } from '../language/hats';
import { allSymbols, createVariable, refreshSymbols } from '../language/functions';
import { sceneState } from '../scene/state';
import { concepts } from '../assist/catalog';
import { LEVELS, type Level } from '../ui/levels';

/** A recipe is a reviewed, deterministic answer to a child-language wish:
 * a few sentences and a small block fragment. Nothing is generated at runtime.
 * Recipes live in content/recipes/*.json; tests validate and preview them. */
type State = Blockly.serialization.blocks.State;
export const RECIPE_GROUPS = ['move', 'look', 'touch', 'game', 'sound', 'draw', 'data', 'fix'] as const;
export type RecipeGroup = typeof RECIPE_GROUPS[number];
export type SpriteRef = '$sprite' | '$other';
export interface RecipeHandler { kind: HatKind; key?: string; sprite?: SpriteRef; other?: SpriteRef; message?: string; backdrop?: string }
/** One top-level script: a handler made through the hat-block path, holding a stack. */
export interface RecipePart { handler: RecipeHandler; stack: State[] }
/** Input played while recording a preview: hold a key, or click a sprite. */
export type DemoAction = { key: string; ms?: number } | { click: SpriteRef } | { wait: number };
export interface Recipe {
  id: string;
  title: string;
  group: RecipeGroup;
  phrases: string[];
  level: Level;
  concepts: (keyof typeof concepts)[];
  needs?: { sprites?: number; worlds?: number };
  steps: { say: string }[];
  blocks?: RecipePart[];
  variables?: string[];
  tryNext?: string[];
  preview?: string;
  demo?: DemoAction[];
  /** The project its preview is recorded in, when the plain stage would not show the effect:
   * the hero walking into the star, a hero whose clicks score, Space switching the backdrop, or the Music example. */
  previewScene?: PreviewScene;
}
export const PREVIEW_SCENES = ['touch', 'clicker', 'backdrops', 'music'] as const;
export type PreviewScene = typeof PREVIEW_SCENES[number];

const modules = import.meta.glob<Recipe>('../../content/recipes/*.json', { eager: true, import: 'default' });
export const recipes: Recipe[] = Object.values(modules).sort((a, b) => RECIPE_GROUPS.indexOf(a.group) - RECIPE_GROUPS.indexOf(b.group) || a.id.localeCompare(b.id));
export const recipeById = (id: string) => recipes.find(recipe => recipe.id === id);

/** Problems with a recipe's shape and references; an empty list means valid. */
export function recipeProblems(recipe: Recipe, all: Recipe[] = recipes): string[] {
  const problems: string[] = [];
  const need = (ok: unknown, message: string) => { if (!ok) problems.push(`${recipe.id || '(no id)'}: ${message}`); };
  need(/^[a-z][a-z0-9-]{1,40}$/.test(recipe.id ?? ''), 'id must be lowercase words joined by hyphens');
  need(all.filter(r => r.id === recipe.id).length === 1, 'id must be unique');
  need(recipe.previewScene === undefined || PREVIEW_SCENES.includes(recipe.previewScene), 'previewScene must be touch, clicker, backdrops or music');
  need(typeof recipe.title === 'string' && recipe.title.length > 3 && recipe.title.length <= 60, 'title needs 4–60 characters');
  need(RECIPE_GROUPS.includes(recipe.group), 'unknown group');
  need(Array.isArray(recipe.phrases) && recipe.phrases.length >= 3 && recipe.phrases.every(p => typeof p === 'string' && p.trim() === p && p.length > 1), 'needs at least three trimmed phrases');
  need(LEVELS.includes(recipe.level), 'unknown level');
  need(Array.isArray(recipe.concepts) && recipe.concepts.length > 0 && recipe.concepts.every(c => Object.hasOwn(concepts, c)), 'concepts must come from the assist catalog');
  need(Array.isArray(recipe.steps) && recipe.steps.length > 0 && recipe.steps.every(s => typeof s.say === 'string' && s.say.length > 8 && s.say.length < 220), 'needs one or more steps of 9–219 characters');
  need(recipe.group === 'fix' || (Array.isArray(recipe.blocks) && recipe.blocks.length > 0), 'needs blocks unless it is a Fix recipe');
  for (const part of recipe.blocks ?? []) {
    need(HAT_KINDS.includes(part.handler?.kind), 'each part needs a handler kind');
    need(Array.isArray(part.stack) && part.stack.length > 0, 'each part needs a stack');
  }
  for (const id of recipe.tryNext ?? []) need(all.some(r => r.id === id && r.id !== recipe.id), `tryNext refers to unknown recipe ${id}`);
  need(!recipe.blocks || recipe.preview === `${recipe.id}.webm`, 'block recipes need a preview named after the id');
  return problems;
}

export interface Placement { sprite?: string; other?: string; world2?: string; variables: Map<string, string> }
/** Choose sprites for the placeholders: the selected sprite, then another one. */
/** Whether a recipe refers to a second sprite (its target). */
export const usesOther = (recipe: Recipe) => JSON.stringify(recipe.blocks ?? []).includes('"$other"');
export function placement(workspace: Blockly.Workspace, recipe: Recipe, selected: string, target?: string): Placement {
  const scene = sceneState(workspace);
  const sprite = scene.sprites.find(s => s.id === selected) ?? scene.sprites[0];
  const other = scene.sprites.find(s => s.id === target && s.id !== sprite?.id) ?? scene.sprites.find(s => s.id !== sprite?.id);
  const sprites = recipe.needs?.sprites ?? 0, worlds = recipe.needs?.worlds ?? 0;
  if (sprites && scene.sprites.length < sprites) throw new Error(sprites === 1 ? 'Add a sprite first: press Sprites under the stage.' : `This idea needs ${sprites} sprites. Add another with Sprites under the stage.`);
  if (worlds && (scene.worlds?.length ?? 0) < worlds) throw new Error(`This idea needs ${worlds} worlds. Open Worlds & tilemaps in the Sprite tab to add them.`);
  return { sprite: sprite?.id, other: other?.id ?? sprite?.id, world2: scene.worlds?.find(w => w.id !== scene.world)?.id, variables: new Map() };
}

function resolve(state: State, place: Placement): State {
  const fields = state.fields as Record<string, unknown> | undefined;
  if (fields) for (const [name, value] of Object.entries(fields)) {
    if (value === '$sprite' || value === '$other') fields[name] = (value === '$sprite' ? place.sprite : place.other) ?? '';
    else if (value === '$world2') fields[name] = place.world2 ?? '';
    else if (typeof value === 'string' && value.startsWith('$var:')) fields[name] = place.variables.get(value.slice(5)) ?? '';
  }
  for (const input of Object.values(state.inputs ?? {})) { if (input.block) resolve(input.block, place); if (input.shadow) resolve(input.shadow, place); }
  if (state.next?.block) resolve(state.next.block, place);
  return state;
}
const chain = (stack: State[]) => { const blocks = structuredClone(stack); blocks.slice(1).forEach((block, i) => { blocks[i].next = { block }; }); return blocks[0]; };

/** Append a recipe's scripts. Handlers come from the hat-block path, so names,
 * payloads, owners and delivery order follow the Events dialog rules; each part
 * is appended before the next is named, so two parts never share a name. */
export function appendRecipe(workspace: Blockly.Workspace, recipe: Recipe, place: Placement): Blockly.Block[] {
  if (!recipe.blocks?.length) throw new Error('This idea is advice only; follow its steps.');
  for (const name of recipe.variables ?? []) {
    const existing = allSymbols(workspace).find(s => s.kind === 'project' && s.name === name);
    place.variables.set(name, existing?.id ?? createVariable(workspace, name).getId());
  }
  if (recipe.variables?.length) refreshSymbols(workspace);
  const ref = (value?: SpriteRef) => value === '$other' ? place.other : value === '$sprite' ? place.sprite : undefined;
  return recipe.blocks.map(part => {
    const state = handlerState(workspace, { kind: part.handler.kind, key: part.handler.key, sprite: ref(part.handler.sprite ?? '$sprite'), other: ref(part.handler.other), message: part.handler.message, backdrop: part.handler.backdrop });
    const body = resolve(chain(part.stack), place);
    // "Overlaps <other>" starts with an if; the recipe's stack goes inside it.
    const check = state.inputs?.BODY?.block;
    if (check?.type === 'controls_if') check.inputs = { ...check.inputs, DO0: { block: body } };
    else state.inputs = { ...state.inputs, BODY: { block: body } };
    return Blockly.serialization.blocks.append(state, workspace, { recordUndo: true });
  });
}

/** Insert a recipe as one Undo step, placed in view, and return its scripts. */
export function insertRecipe(workspace: Blockly.WorkspaceSvg, recipe: Recipe, selected: string, target?: string): Blockly.BlockSvg[] {
  const place = placement(workspace, recipe, selected, target);
  const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
  try {
    // New scripts go in free space to the right of existing ones, stacked downwards.
    const existing = workspace.getTopBlocks(false).length ? workspace.getBlocksBoundingBox() : null;
    const added = appendRecipe(workspace, recipe, place) as Blockly.BlockSvg[];
    const x = existing ? existing.right + 48 : 40;
    let y = existing ? existing.top : 40;
    for (const block of added) {
      block.moveTo(new Blockly.utils.Coordinate(x, y));
      y += block.getHeightWidth().height + 24;
    }
    added[0]?.select(); if (added[0]) workspace.centerOnBlock(added[0].id);
    return added;
  } finally { Blockly.Events.setGroup(group); }
}
