import type * as Blockly from 'blockly/core';
import { handlerSignatures, type FunctionBlock } from '../language/functions';
import { sceneState } from '../scene/state';

/** Guided-build checks: static predicates over the authored project plus two
 * facts the runner already knows (a run started, a game finished). */
export type HandlerKind = 'start' | 'key' | 'release' | 'click' | 'overlap' | 'update' | 'countdown' | 'message' | 'backdrop' | 'world' | 'stage';
export type Check =
  | { all: Check[] } | { any: Check[] }
  | { sprites: number }
  | { costume: string }
  /** A handler of this kind (owned by `sprite`, when given) holding these blocks;
   * `last`: a block of that type with nothing after it, such as a destroy. */
  | { handler: HandlerKind; sprite?: string; contains?: string[]; last?: string }
  | { blocks: string[] }
  | { nested: [string, string] }
  | { count: [string, number] }
  | { worlds: number }
  | { walls: number }
  | { frames: number }
  | { backdrop: true }
  | { variable: string }
  /** An active block of this type whose field has this value, e.g. edges set to bounce. */
  | { field: [string, string, string] }
  /** An active block of this type whose input holds this number. */
  | { number: [string, string, number] }
  | { ran: true }
  | { finished: 'won' | 'lost' | 'any' }
  /** The highest score reached in a run during this step. */
  | { score: number }
  /** The learner chose an answer to the step's prediction. */
  | { predicted: true };
export interface RunFacts { ran: boolean; finished: null | 'won' | 'lost'; score?: number; predicted?: boolean }

export function handlerKind(event: string): HandlerKind {
  if (event === 'start') return 'start';
  if (event.startsWith('key:')) return 'key';
  if (event.startsWith('release:')) return 'release';
  if (event === 'click' || event.startsWith('click:')) return 'click';
  if (event === 'overlap') return 'overlap';
  if (event === 'update') return 'update';
  if (event === 'game:countdown') return 'countdown';
  if (event.startsWith('backdrop:')) return 'backdrop';
  if (event.startsWith('world:')) return 'world';
  if (event.startsWith('stage:')) return 'stage';
  return 'message';
}
function typesBelow(block: Blockly.Block) {
  const types = new Set<string>();
  for (const child of block.getDescendants(false)) if (child !== block && child.isEnabled()) types.add(child.type);
  return types;
}

/** True when the workspace and run facts satisfy the check. */
export function passes(check: Check, workspace: Blockly.Workspace, facts: RunFacts): boolean {
  if ('all' in check) return check.all.every(c => passes(c, workspace, facts));
  if ('any' in check) return check.any.some(c => passes(c, workspace, facts));
  if ('ran' in check) return facts.ran;
  if ('finished' in check) return check.finished === 'any' ? !!facts.finished : facts.finished === check.finished;
  if ('score' in check) return (facts.score ?? 0) >= check.score;
  if ('predicted' in check) return !!facts.predicted;
  const scene = sceneState(workspace);
  if ('sprites' in check) return scene.sprites.length >= check.sprites;
  if ('costume' in check) {
    const wanted = check.costume.toLowerCase();
    return scene.sprites.some(s => s.costume === check.costume || scene.assets.find(a => a.id === s.costume)?.name.toLowerCase() === wanted);
  }
  if ('worlds' in check) return (scene.worlds?.length ?? 0) >= check.worlds;
  if ('walls' in check) return (scene.worlds ?? []).some(w => w.map.walls.filter(Boolean).length >= check.walls);
  if ('frames' in check) return scene.sprites.some(s => (s.costumes?.length ?? 1) >= check.frames);
  if ('backdrop' in check) return !!(scene.backdrop || scene.worlds?.some(w => w.backdrop));
  if ('variable' in check) return workspace.getVariableMap().getAllVariables().some(v => v.getName() === check.variable);
  const roots = workspace.getTopBlocks(false).filter(b => b.isEnabled() && (b.type === 'py_handler' || b.type === 'py_program'));
  if ('handler' in check) {
    const handlers = handlerSignatures(workspace).filter(h => handlerKind(h.handler!.event) === check.handler && (!check.sprite || h.handler!.sprite === check.sprite));
    return handlers.some(h => {
      const block = roots.find(b => b.type === 'py_handler' && (b as FunctionBlock).functionId === h.id);
      if (!block) return false;
      const types = typesBelow(block);
      if (check.last && !block.getDescendants(false).some(b => b.type === check.last && b.isEnabled() && !b.getNextBlock())) return false;
      return (check.contains ?? []).every(type => types.has(type));
    });
  }
  const activeBlocks = () => roots.flatMap(root => root.getDescendants(false)).filter(b => b.isEnabled());
  if ('field' in check) return activeBlocks().some(b => b.type === check.field[0] && String(b.getFieldValue(check.field[1])) === check.field[2]);
  if ('number' in check) return activeBlocks().some(b => {
    if (b.type !== check.number[0]) return false;
    const value = b.getInputTargetBlock(check.number[1]);
    return value?.type === 'py_number' && Number(value.getFieldValue('VALUE')) === check.number[2];
  });
  const active = new Set(roots.flatMap(root => [...typesBelow(root)]));
  if ('blocks' in check) return check.blocks.every(type => active.has(type));
  if ('count' in check) return roots.flatMap(root => root.getDescendants(false)).filter(b => b.type === check.count[0] && b.isEnabled()).length >= check.count[1];
  if ('nested' in check) {
    const [outer, inner] = check.nested;
    // Inside means within the outer block's inputs, not in the blocks after it.
    const inside = (b: Blockly.Block) => b.inputList.flatMap(input => input.connection?.targetBlock()?.getDescendants(false) ?? []);
    return roots.some(root => root.getDescendants(false).some(b => b.type === outer && b.isEnabled() && inside(b).some(d => d.type === inner && d.isEnabled())));
  }
  return false;
}
