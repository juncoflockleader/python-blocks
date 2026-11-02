import { afterEach, describe, expect, it } from 'vitest';
import { Blockly } from '../../src/blocks';
import { createWorkspace } from '../../src/project';
import { isSyncedKey } from '../../src/account/shared';
import { MAX_FAVOURITES, QUICK_TOOLS_KEY, defaultQuickTools, favouriteOf, placeIn, placeOf, readQuickTools, sameFavourite, withFavourite } from '../../src/ui/quick-tools-state';

/** Quick tools (src/ui/quick-tools-state.ts): where the floating panel sits, whether it is minimized and the
 * learner's favourite blocks, kept in one synced browser key that never stops the editor opening. */
const workspaces: Blockly.Workspace[] = [];
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const block = (state: Blockly.serialization.blocks.State) => {
  const w = createWorkspace(); workspaces.push(w);
  return Blockly.serialization.blocks.append(state, w);
};
const move = { type: 'pen_move', inputs: { STEPS: { shadow: { type: 'py_number', fields: { VALUE: '100' } } } } };
const turn = { type: 'pen_turn', inputs: { DEGREES: { shadow: { type: 'py_number', fields: { VALUE: '90' } } } } };

describe('quick tools state', () => {
  it('starts in the bottom right corner, open, with no favourites', () => {
    expect(readQuickTools(null)).toEqual({ x: 1, y: 1, minimized: false, favourites: [] });
    expect(readQuickTools('not json')).toEqual(defaultQuickTools());
    expect(readQuickTools('"a string"')).toEqual(defaultQuickTools());
  });

  it('follows the learner to their account, like the level and the view', () => {
    expect(isSyncedKey(QUICK_TOOLS_KEY)).toBe(true);
  });

  it('keeps a saved place inside the space, and minimized only when it says so', () => {
    expect(readQuickTools(JSON.stringify({ x: 0.25, y: 0.75, minimized: true }))).toMatchObject({ x: 0.25, y: 0.75, minimized: true });
    expect(readQuickTools(JSON.stringify({ x: -3, y: 9, minimized: 'yes' }))).toMatchObject({ x: 0, y: 1, minimized: false });
    expect(readQuickTools(JSON.stringify({ x: 'left', y: null }))).toMatchObject({ x: 1, y: 1 });
  });

  it('reads favourites of known blocks, once each and at most six, without ids', () => {
    const withId = { ...structuredClone(move), id: 'abc', inputs: { STEPS: { shadow: { ...move.inputs.STEPS.shadow, id: 'shadow-1' } } } };
    const many = ['pen_color', 'pen_lift', 'py_wait', 'controls_if', 'scene_say', 'scene_turn', 'pen_turn'].map(type => ({ type }));
    const read = readQuickTools(JSON.stringify({ favourites: [withId, move, { type: 'no_such_block' }, 'move', null, ...many] })).favourites;
    expect(read).toHaveLength(MAX_FAVOURITES);
    expect(read[0]).toEqual(move);
    expect(read.map(state => state.type)).not.toContain('no_such_block');
    expect(JSON.stringify(read)).not.toContain('"id"');
  });

  it('keeps a block with what is plugged into it, not the blocks under it, its place or its ids', () => {
    const stack = block({ ...move, x: 40, y: 80, collapsed: true, next: { block: turn } });
    const saved = favouriteOf(stack)!;
    expect(saved).toEqual(move);
    expect(sameFavourite(saved, favouriteOf(block(move))!)).toBe(true);
    expect(sameFavourite(saved, favouriteOf(block(turn))!)).toBe(false);
  });

  it('adds a favourite once, and refuses a seventh', () => {
    const one = withFavourite([], move)!;
    expect(one).toEqual([move]);
    expect(withFavourite(one, structuredClone(move))).toBe(one);
    const full = Array.from({ length: MAX_FAVOURITES }, (_, i) => ({ type: 'pen_move', inputs: { STEPS: { shadow: { type: 'py_number', fields: { VALUE: String(i) } } } } }));
    expect(withFavourite(full, turn)).toBeNull();
  });
});

describe('quick tools place', () => {
  const area = { left: 100, top: 50, right: 900, bottom: 650 };
  it('puts the panel at a corner, an edge or between them, the same way at any size', () => {
    expect(placeIn(area, 300, 200, 0, 0)).toEqual({ left: 100, top: 50 });
    expect(placeIn(area, 300, 200, 1, 1)).toEqual({ left: 600, top: 450 });
    expect(placeIn(area, 44, 44, 1, 1)).toEqual({ left: 856, top: 606 });
    expect(placeIn(area, 300, 200, 0.5, 0.5)).toEqual({ left: 350, top: 250 });
  });

  it('keeps a panel larger than the space at its top left, so its grip stays on screen', () => {
    expect(placeIn({ left: 10, top: 10, right: 210, bottom: 110 }, 300, 200, 1, 1)).toEqual({ left: 10, top: 10 });
  });

  it('turns a drop back into a place, kept inside the space', () => {
    const from = { x: 0.3, y: 0.3 };
    expect(placeOf(area, 300, 200, 350, 250, from)).toEqual({ x: 0.5, y: 0.5 });
    expect(placeOf(area, 300, 200, -500, 2000, from)).toEqual({ x: 0, y: 1 });
    const at = placeIn(area, 300, 200, 0.2, 0.9), back = placeOf(area, 300, 200, at.left, at.top, from);
    expect(back.x).toBeCloseTo(0.2, 2); expect(back.y).toBeCloseTo(0.9, 2);
    // No room to move across: the panel keeps its place that way.
    expect(placeOf({ ...area, right: 400 }, 300, 200, 120, 250, from)).toEqual({ x: 0.3, y: 0.5 });
  });
});
