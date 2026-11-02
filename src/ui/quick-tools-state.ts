import * as Blockly from 'blockly/core';

/** What Quick tools (quick-tools.ts) keeps for a learner: where the floating panel sits, whether it is
 * minimized, and their favourite blocks. One browser key, synced to the learner's account (SYNCED_KEYS)
 * like the level and the view, so the panel is where they left it on every device. */
export const QUICK_TOOLS_KEY = 'python-blocks.quick-tools.v1';
export const MAX_FAVOURITES = 6;
/** One favourite's saved form, as JSON; a block with a whole script plugged into it is not a favourite. */
const MAX_FAVOURITE_SIZE = 20_000;

type State = Blockly.serialization.blocks.State;
export interface QuickToolsState {
  /** Where the panel sits in the space it may use, 0 to 1 across and down (1, 1 is the bottom right corner),
   * so it keeps to the same corner or edge on any screen and when it is minimized. */
  x: number; y: number;
  minimized: boolean;
  /** Each favourite as a block to paste: the block and what is plugged into it, without ids or a place. */
  favourites: State[];
}
export const defaultQuickTools = (): QuickToolsState => ({ x: 1, y: 1, minimized: false, favourites: [] });

const unit = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
const isFavourite = (value: unknown): value is State =>
  !!value && typeof value === 'object' && typeof (value as State).type === 'string' && !!Blockly.Blocks[(value as State).type]
  && JSON.stringify(value).length <= MAX_FAVOURITE_SIZE;
export const sameFavourite = (a: State, b: State) => JSON.stringify(a) === JSON.stringify(b);
/** Blockly keeps a shadow block's id even when asked not to save ids; a favourite has none, so the same block is the same favourite. */
function withoutIds(state: State): State {
  delete state.id;
  for (const input of Object.values(state.inputs ?? {})) {
    if (input.block) withoutIds(input.block);
    if (input.shadow) withoutIds(input.shadow);
  }
  return state;
}

/** The saved Quick tools, with the defaults for anything missing or unreadable; favourites of
 * block types this app does not have are left out. */
export function readQuickTools(raw: string | null): QuickToolsState {
  const fresh = defaultQuickTools();
  let saved: Partial<QuickToolsState> | null;
  try { saved = raw ? JSON.parse(raw) as Partial<QuickToolsState> : null; } catch { saved = null; }
  if (!saved || typeof saved !== 'object') return fresh;
  const favourites: State[] = [];
  for (const state of Array.isArray(saved.favourites) ? saved.favourites : []) {
    if (!isFavourite(state) || favourites.length >= MAX_FAVOURITES) continue;
    withoutIds(state);
    if (!favourites.some(other => sameFavourite(other, state))) favourites.push(state);
  }
  return { x: unit(saved.x, fresh.x), y: unit(saved.y, fresh.y), minimized: saved.minimized === true, favourites };
}

/** A block as a favourite: the block and what is plugged into it, as Duplicate copies it, but not the
 * blocks under it, its place, or whether it is collapsed or turned off. */
export function favouriteOf(block: Blockly.Block): State | null {
  const state = Blockly.serialization.blocks.save(block, { addCoordinates: false, addNextBlocks: false, saveIds: false });
  if (!state) return null;
  delete state.collapsed; delete state.disabledReasons; delete state.enabled;
  return isFavourite(state) ? withoutIds(state) : null;
}
/** The favourites with `state` added at the end: the same list when it is there already, null when the list is full. */
export function withFavourite(favourites: State[], state: State): State[] | null {
  if (favourites.some(other => sameFavourite(other, state))) return favourites;
  return favourites.length < MAX_FAVOURITES ? [...favourites, state] : null;
}

/** The space the panel may use, in pixels from the top left of the blocks panel. */
export interface Area { left: number; top: number; right: number; bottom: number }
/** The top left corner for a panel of this size at x, y (0 to 1) in the area. A panel larger than the
 * area keeps to its top left, so its grip and minimize button stay on screen. */
export function placeIn(area: Area, width: number, height: number, x: number, y: number) {
  const spanX = Math.max(0, area.right - area.left - width), spanY = Math.max(0, area.bottom - area.top - height);
  return { left: Math.round(area.left + x * spanX), top: Math.round(area.top + y * spanY) };
}
/** Where a panel moved to `left`, `top` sits in the area (0 to 1 each way), kept inside it. Along a way
 * the area has no room to move, the panel keeps its place (`from`). */
export function placeOf(area: Area, width: number, height: number, left: number, top: number, from: { x: number; y: number }) {
  const spanX = area.right - area.left - width, spanY = area.bottom - area.top - height;
  return {
    x: spanX > 0 ? unit((left - area.left) / spanX, from.x) : from.x,
    y: spanY > 0 ? unit((top - area.top) / spanY, from.y) : from.y,
  };
}
