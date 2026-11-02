import * as Blockly from 'blockly/core';
import { blockLook } from './block-icons';
import { iconMarkup, iconSvg, type IconName } from './icon-art';
import { HAT_TYPE } from '../language/hats';
import { MAX_FAVOURITES, QUICK_TOOLS_KEY, favouriteOf, placeIn, placeOf, readQuickTools, sameFavourite, withFavourite, type Area, type QuickToolsState } from './quick-tools-state';
import './quick-tools.css';

type State = Blockly.serialization.blocks.State;
type Scope = Blockly.ContextMenuRegistry.Scope;
type Item = Blockly.ContextMenuRegistry.RegistryItem & { callback?: (scope: Scope, open: Event, select: Event, at: Blockly.utils.Coordinate) => void };

/** Room left between the panel and the edges of the space it may use. */
const GAP = 10;
/** A press that moves less than this is a tap, not a drag. */
const SLOP = 6;

const controls = new WeakMap<Blockly.Workspace, { favourite(block: Blockly.Block): void; isFavourite(block: Blockly.Block): boolean }>();
const mainWorkspace = (block: Blockly.Block): Blockly.Workspace => (block.isInFlyout ? (block.workspace as Blockly.WorkspaceSvg).targetWorkspace : null) ?? block.workspace;
// Long-press (or right-click) a block, in the workspace or the palette, to keep it in Quick tools.
Blockly.ContextMenuRegistry.registry.register({
  id: 'pbQuickFavourite',
  scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
  displayText: scope => scope.block && controls.get(mainWorkspace(scope.block))?.isFavourite(scope.block) ? 'Remove from favourite blocks' : 'Add to favourite blocks',
  preconditionFn: scope => scope.block && !scope.block.isShadow() && controls.has(mainWorkspace(scope.block)) ? 'enabled' : 'hidden',
  callback: scope => { if (scope.block) controls.get(mainWorkspace(scope.block))?.favourite(scope.block); },
  weight: 8,
});

const html = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
function svg(icon: IconName) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) node.setAttribute(key, value);
  node.innerHTML = iconMarkup(icon); // Trusted, local SVG constants only.
  return node;
}
const countTypes = (state: State, counts: Record<string, number> = {}) => {
  counts[state.type] = (counts[state.type] ?? 0) + 1;
  for (const input of Object.values(state.inputs ?? {})) if (input.block) countTypes(input.block, counts);
  return counts;
};

/** Quick tools: a small floating panel over the blocks with the editing actions a learner reaches for
 * most (Undo, Redo, Duplicate and Delete the selected block, Tidy up, Find blocks) and a row of their
 * favourite blocks to add with a tap. It is moved by its grip (or the arrow keys), minimized to one
 * button that can be moved too, and kept inside the workspace beside the palette, below the script
 * tabs and above the corner buttons, so it never covers the stage, the palette, a tab or the zoom
 * buttons. It sits under the palette's flyout and
 * fades while a block is dragged, so it never stands in the way of building. Where it sits, whether it
 * is minimized and the favourites are kept per learner (quick-tools-state.ts). */
export function installQuickTools(workspace: Blockly.WorkspaceSvg, host: { find(): void }) {
  const area = document.querySelector<HTMLElement>('.blocks-panel')!;
  // Undo, Redo and Find blocks are also in the top bar and the workspace corner: these are named for
  // Quick tools, so a name (spoken to voice control, say) still means one button.
  const actions: [string, string, string][] = [
    ['quick-undo', 'Undo (Quick tools)', 'Undo'], ['quick-redo', 'Redo (Quick tools)', 'Redo'],
    ['quick-duplicate', 'Duplicate', 'Duplicate the selected block'], ['quick-delete', 'Delete', 'Delete the selected block'],
    ['quick-tidy', 'Tidy up', 'Tidy up: line up the scripts in this tab'], ['quick-find', 'Find blocks (Quick tools)', 'Find blocks'],
  ];
  const panel = document.createElement('section');
  panel.id = 'quick-tools'; panel.className = 'quick-tools'; panel.setAttribute('aria-label', 'Quick tools');
  panel.innerHTML = `<div class="quick-tools-bar"><button id="quick-tools-grip" class="quick-tools-grip" type="button" title="Drag to move Quick tools (arrow keys move it too)">Quick tools</button><button id="quick-tools-minimize" class="button secondary ui-icon-only" type="button" aria-expanded="true" aria-controls="quick-tools-body" title="Minimize Quick tools">Minimize Quick tools</button></div>
    <div id="quick-tools-body" class="quick-tools-body">
      <div class="quick-tools-actions" role="group" aria-label="Edit blocks">${actions.map(([id, label, title]) => `<button id="${id}" class="button secondary ui-icon-only" type="button" title="${html(title)}">${label}</button>`).join('')}</div>
      <div class="quick-favourites-head"><h3 id="quick-favourites-title">Favourite blocks</h3><button id="quick-favourite-add" class="button secondary ui-icon-only" type="button" title="Add the selected block to your favourites">Add to favourites</button><button id="quick-favourites-edit" class="button secondary ui-icon-only" type="button" aria-pressed="false" title="Remove favourites">Remove favourites</button></div>
      <p id="quick-favourites-empty" class="quick-favourites-empty">Select a block, then <span class="quick-inline-icon" data-ui-icon aria-hidden="true"></span><span class="visually-hidden">Add to favourites</span> keeps it here. Tap a favourite to add one to your program.</p>
      <ul id="quick-favourites" class="quick-favourites" aria-labelledby="quick-favourites-title"></ul>
      <p id="quick-tools-status" class="quick-tools-status" role="status"></p>
    </div>
    <button id="quick-tools-restore" class="button secondary ui-icon-only quick-tools-restore" type="button" aria-expanded="false" aria-controls="quick-tools-body" title="Quick tools: tap to open, drag to move" hidden>Quick tools</button>`;
  area.append(panel);
  const el = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const grip = el<HTMLButtonElement>('quick-tools-grip'), minimize = el<HTMLButtonElement>('quick-tools-minimize'), restore = el<HTMLButtonElement>('quick-tools-restore');
  const bar = panel.querySelector<HTMLElement>('.quick-tools-bar')!, body = el('quick-tools-body'), list = el<HTMLUListElement>('quick-favourites');
  const add = el<HTMLButtonElement>('quick-favourite-add'), edit = el<HTMLButtonElement>('quick-favourites-edit'), status = el('quick-tools-status');
  el('quick-favourites-empty').querySelector<HTMLElement>('.quick-inline-icon')!.style.setProperty('--ui-icon', `url("data:image/svg+xml,${encodeURIComponent(iconSvg('star'))}")`);

  let state: QuickToolsState;
  try { state = readQuickTools(localStorage.getItem(QUICK_TOOLS_KEY)); } catch { state = readQuickTools(null); }
  const save = () => { try { localStorage.setItem(QUICK_TOOLS_KEY, JSON.stringify(state)); } catch { /* Quick tools still work in this tab */ } };

  // Where the panel may go: right of the palette, below the script tabs, left of the workspace's scrollbar
  // (wider on a touch screen) and above the corner tools (zoom and find), inside the blocks panel. It starts
  // in the bottom right corner, above the corner tools, away from where scripts begin.
  const bounds = (): Area => {
    const frame = area.getBoundingClientRect(), inject = workspace.getInjectionDiv();
    const palette = inject.querySelector<HTMLElement>('.blocklyToolbox')?.getBoundingClientRect();
    const scrollbar = inject.querySelector('.blocklyScrollbarVertical.blocklyMainWorkspaceScrollbar')?.getBoundingClientRect();
    const tabs = document.getElementById('script-tabs')?.getBoundingClientRect();
    const corner = document.getElementById('workspace-tools')?.getBoundingClientRect();
    return {
      left: (palette?.width ? palette.right - frame.left : 0) + GAP, top: (tabs?.height ? tabs.bottom - frame.top : 0) + GAP,
      right: (scrollbar?.width ? scrollbar.left - frame.left : frame.width) - GAP, bottom: (corner?.height ? corner.top - frame.top : frame.height) - GAP,
    };
  };
  const layout = () => {
    const at = placeIn(bounds(), panel.offsetWidth, panel.offsetHeight, state.x, state.y);
    panel.style.left = `${at.left}px`; panel.style.top = `${at.top}px`;
  };
  const moveTo = (left: number, top: number) => {
    const next = placeOf(bounds(), panel.offsetWidth, panel.offsetHeight, left, top, state);
    state.x = next.x; state.y = next.y; layout();
  };
  const resized = new ResizeObserver(layout);
  resized.observe(area); resized.observe(panel);
  const palette = workspace.getInjectionDiv().querySelector<HTMLElement>('.blocklyToolbox');
  if (palette) resized.observe(palette);

  // The grip and the minimized button both move the panel: a drag moves it, a tap on the minimized button opens it.
  const draggable = (handle: HTMLButtonElement) => {
    let press: { id: number; x: number; y: number; left: number; top: number } | null = null, moved = false;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      press = { id: event.pointerId, x: event.clientX, y: event.clientY, left: panel.offsetLeft, top: panel.offsetTop }; moved = false;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!press || event.pointerId !== press.id) return;
      const dx = event.clientX - press.x, dy = event.clientY - press.y;
      if (!moved && Math.hypot(dx, dy) < SLOP) return;
      moved = true; panel.dataset.moving = '';
      moveTo(press.left + dx, press.top + dy);
    });
    const release = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.id) return;
      press = null; delete panel.dataset.moving;
      if (moved) save();
    };
    handle.addEventListener('pointerup', release); handle.addEventListener('pointercancel', release);
    // The click that ends a drag is not a tap.
    handle.addEventListener('click', event => { if (moved) { moved = false; event.stopImmediatePropagation(); } }, { capture: true });
    handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? 64 : 16;
      const [dx, dy] = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[event.key] ?? [0, 0];
      if (!dx && !dy) return;
      event.preventDefault(); moveTo(panel.offsetLeft + dx, panel.offsetTop + dy); save();
    });
  };
  draggable(grip); draggable(restore);

  const showMinimized = (minimized: boolean, focus = false) => {
    state.minimized = minimized;
    panel.toggleAttribute('data-minimized', minimized);
    bar.hidden = body.hidden = minimized; restore.hidden = !minimized;
    minimize.setAttribute('aria-expanded', String(!minimized));
    if (minimized) { removing(false); status.textContent = ''; }
    layout();
    if (focus) (minimized ? restore : minimize).focus();
  };
  minimize.addEventListener('click', () => { showMinimized(true, true); save(); });
  restore.addEventListener('click', () => { showMinimized(false, true); refresh(); save(); });

  // Actions use Blockly's own menu items, so they behave as Duplicate, Delete and Clean up do in a
  // block's long-press menu (and Clean up keeps to the scripts in the open tab, as script tabs make it).
  const menuItem = (id: string) => Blockly.ContextMenuRegistry.registry.getItem(id) as Item | null;
  const allowed = (id: string, scope: Scope) => { try { return menuItem(id)?.preconditionFn?.(scope, new Event('pointerdown')) === 'enabled'; } catch { return false; } };
  const runMenuItem = (id: string, scope: Scope) => menuItem(id)?.callback?.(scope, new Event('pointerdown'), new Event('pointerdown'), new Blockly.utils.Coordinate(0, 0));
  const selected = (): Blockly.BlockSvg | null => {
    const node = Blockly.getSelected();
    if (!(node instanceof Blockly.BlockSvg) || node.isDeadOrDying()) return null;
    let block = node;
    while (block.isShadow() && block.getParent()) block = block.getParent()!;
    return block.workspace === workspace || (block.isInFlyout && mainWorkspace(block) === workspace) ? block : null;
  };
  const isFavourite = (block: Blockly.Block) => { const saved = favouriteOf(block); return !!saved && state.favourites.some(other => sameFavourite(other, saved)); };
  // A selected block is saved again only when it or the project has changed, not on every event.
  let known = { id: '', edits: -1, count: -1, favourite: false };
  const knownFavourite = (block: Blockly.BlockSvg) => {
    const edits = workspace.getUndoStack().length + workspace.getRedoStack().length;
    if (known.id !== block.id || known.edits !== edits || known.count !== state.favourites.length) known = { id: block.id, edits, count: state.favourites.length, favourite: isFavourite(block) };
    return known.favourite;
  };
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (text: string) => { clearTimeout(statusTimer); status.textContent = text; statusTimer = setTimeout(() => { status.textContent = ''; }, 5000); };

  let pending = false;
  const refresh = () => {
    pending = false;
    if (state.minimized) return;
    const block = selected(), inWorkspace = block && !block.isInFlyout ? block : null;
    el<HTMLButtonElement>('quick-undo').disabled = !workspace.getUndoStack().length;
    el<HTMLButtonElement>('quick-redo').disabled = !workspace.getRedoStack().length;
    el<HTMLButtonElement>('quick-duplicate').disabled = !inWorkspace || !allowed('blockDuplicate', { block: inWorkspace });
    el<HTMLButtonElement>('quick-delete').disabled = !inWorkspace || !allowed('blockDelete', { block: inWorkspace });
    el<HTMLButtonElement>('quick-tidy').disabled = !allowed('cleanWorkspace', { workspace });
    el('quick-find').setAttribute('aria-expanded', String(!document.getElementById('block-search')?.hidden));
    add.disabled = !block || knownFavourite(block);
  };
  const refreshSoon = () => { if (!pending) { pending = true; requestAnimationFrame(refresh); } };

  el('quick-undo').addEventListener('click', () => { workspace.undo(false); refreshSoon(); });
  el('quick-redo').addEventListener('click', () => { workspace.undo(true); refreshSoon(); });
  el('quick-duplicate').addEventListener('click', () => { const block = selected(); if (block && !block.isInFlyout) runMenuItem('blockDuplicate', { block }); refreshSoon(); });
  el('quick-delete').addEventListener('click', () => { const block = selected(); if (block && !block.isInFlyout) runMenuItem('blockDelete', { block }); refreshSoon(); });
  el('quick-tidy').addEventListener('click', () => { runMenuItem('cleanWorkspace', { workspace }); say('Scripts tidied up. Undo puts them back.'); refreshSoon(); });
  el('quick-find').addEventListener('click', () => { host.find(); refreshSoon(); });
  el('quick-find').setAttribute('aria-controls', 'block-search');

  // Favourites: each shows as its block does in the palette, its colour and symbol and its words.
  const describe = (saved: State) => {
    const preview = new Blockly.Workspace();
    (preview as Blockly.WorkspaceSvg).targetWorkspace = workspace;
    const kind = saved.type === HAT_TYPE ? (saved.extraState as { kind?: string } | undefined)?.kind : undefined;
    const look = blockLook(workspace, kind ? `hat:${kind}` : saved.type);
    Blockly.Events.disable();
    try {
      const block = Blockly.serialization.blocks.append(structuredClone(saved), preview);
      return { label: block.toString(60) || saved.type, colour: look?.colour ?? block.getColour(), icon: look?.icon, hat: !block.previousConnection && !block.outputConnection };
    } catch { return { label: saved.type, colour: look?.colour ?? '#6c7c64', icon: look?.icon, hat: false }; }
    finally { preview.dispose(); Blockly.Events.enable(); }
  };
  let removingFavourites = false;
  const removing = (on: boolean) => {
    removingFavourites = on && state.favourites.length > 0;
    panel.toggleAttribute('data-removing', removingFavourites); edit.setAttribute('aria-pressed', String(removingFavourites));
    edit.title = removingFavourites ? 'Done removing favourites' : 'Remove favourites';
    render();
  };
  const render = () => {
    list.replaceChildren();
    for (const [index, saved] of state.favourites.entries()) {
      const look = describe(saved), item = document.createElement('li'), button = document.createElement('button'), words = document.createElement('span');
      button.type = 'button'; button.className = look.hat ? 'quick-favourite quick-favourite-hat' : 'quick-favourite';
      button.style.setProperty('--block', look.colour);
      words.textContent = look.label; if (look.icon) button.append(svg(look.icon));
      button.append(words);
      const name = removingFavourites ? `Remove ${look.label} from favourites` : `Add ${look.label}`;
      button.title = name; button.setAttribute('aria-label', name);
      button.addEventListener('click', () => removingFavourites ? forget(index) : insert(saved, look.label));
      item.append(button); list.append(item);
    }
    list.hidden = !state.favourites.length;
    el('quick-favourites-empty').hidden = state.favourites.length > 0;
    edit.hidden = !state.favourites.length;
  };
  /** Where a new block goes: a third of the way across the view near its top, as the block search puts one,
   * or beside or below the panel when that spot is under it. In workspace units. */
  const freeSpot = () => {
    const metrics = workspace.getMetrics(), scale = workspace.scale, frame = workspace.getInjectionDiv().getBoundingClientRect();
    const toUnits = (x: number, y: number) => ({ x: (x - frame.left - metrics.absoluteLeft + metrics.viewLeft) / scale, y: (y - frame.top - metrics.absoluteTop + metrics.viewTop) / scale });
    const box = panel.getBoundingClientRect(), from = toUnits(box.left - GAP, box.top - GAP), to = toUnits(box.right + GAP, box.bottom + GAP);
    const view = { left: metrics.viewLeft / scale, top: metrics.viewTop / scale, right: (metrics.viewLeft + metrics.viewWidth) / scale, bottom: (metrics.viewTop + metrics.viewHeight) / scale };
    const width = 200, height = 60, margin = 16 / scale;
    const clear = (x: number, y: number) => x + width <= from.x || x >= to.x || y + height <= from.y || y >= to.y;
    const spots = [
      { x: view.left + (view.right - view.left) / 3, y: view.top + 40 / scale },
      { x: from.x - width, y: view.top + 40 / scale },
      { x: view.left + margin, y: view.top + 40 / scale },
      { x: from.x, y: to.y },
      { x: view.left + margin, y: to.y },
    ];
    const inView = ({ x, y }: { x: number; y: number }) => x >= view.left + margin / 2 && y >= view.top && x + width <= view.right && y + height <= view.bottom;
    const spot = spots.find(spot => inView(spot) && clear(spot.x, spot.y)) ?? spots[0];
    return new Blockly.utils.Coordinate(spot.x, spot.y);
  };
  const insert = (saved: State, label: string) => {
    // A favourite comes in as a copy, as Duplicate and Paste make one: new names for a copied function,
    // and an event block made from its palette entry.
    const at = freeSpot();
    Blockly.Events.setGroup(true);
    try {
      const copy = structuredClone(saved);
      const pasted = Blockly.clipboard.paste({ paster: Blockly.clipboard.BlockPaster.TYPE, blockState: copy, typeCounts: countTypes(copy) }, workspace, at);
      say(pasted ? `Added ${label}. Connect it to your program. Undo removes it.` : `There is no room for another ${label}.`);
    } catch (error) { say(error instanceof Error ? error.message : String(error)); }
    finally { Blockly.Events.setGroup(false); }
    refreshSoon();
  };
  const forget = (index: number) => {
    state.favourites = state.favourites.filter((_, i) => i !== index); save();
    say('Removed from your favourites.');
    removing(removingFavourites); refreshSoon();
  };
  const favourite = (block: Blockly.Block) => {
    const saved = favouriteOf(block);
    if (!saved) { say('That block is too big to keep as a favourite.'); return; }
    const at = state.favourites.findIndex(other => sameFavourite(other, saved));
    if (at >= 0) { forget(at); return; }
    const next = withFavourite(state.favourites, saved);
    if (!next) { say(`Favourites hold ${MAX_FAVOURITES} blocks. Remove one first.`); return; }
    state.favourites = next; render();
    // A block kept from its long-press menu while the panel is minimized opens the panel, to show where it went.
    if (state.minimized) showMinimized(false);
    save(); say(`Added ${describe(saved).label} to your favourites.`);
    refreshSoon();
  };
  add.addEventListener('click', () => { const block = selected(); if (block) favourite(block); });
  edit.addEventListener('click', () => removing(!removingFavourites));
  panel.addEventListener('keydown', event => { if (event.key === 'Escape' && removingFavourites) { event.preventDefault(); removing(false); edit.focus(); } });
  controls.set(workspace, { favourite, isFavourite });

  // A press inside the panel keeps the selected block selected (the browser would move focus off it).
  panel.addEventListener('mousedown', event => event.preventDefault());
  // While a block is dragged the panel fades and lets the drag pass, so a block can be dropped under it.
  const changed = (event: Blockly.Events.Abstract) => {
    if (event.type === Blockly.Events.BLOCK_DRAG) panel.toggleAttribute('data-block-drag', (event as Blockly.Events.BlockDrag).isStart === true);
    if (event.type === Blockly.Events.FINISHED_LOADING) render();
    refreshSoon();
  };
  workspace.addChangeListener(changed);
  document.addEventListener('focusin', refreshSoon);

  render(); showMinimized(state.minimized); refresh();
  return {
    /** Labels follow the project (a sprite's name in a favourite's menu); call after the level or project changes. */
    refresh: () => { render(); refreshSoon(); layout(); },
    dispose() {
      resized.disconnect(); workspace.removeChangeListener(changed); document.removeEventListener('focusin', refreshSoon);
      clearTimeout(statusTimer); controls.delete(workspace); panel.remove();
    },
  };
}
