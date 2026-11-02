import * as Blockly from 'blockly/core';
import { iconSvg } from '../ui/icon-art';
import { askName } from '../ui/name-sheet';
import { MAX_TABS, MAX_TAB_NAME, TAB_ICONS, adoptScripts, changeTabs, hasTab, newTabId, onTabsLoaded, placeScript, scriptTabs, tabName, tabOfScript, type ScriptTab, type TabIcon, TabsEvent } from './tabs';
import './tabs.css';

/** The strip of script tabs along the top of the workspace, beside the palette. Only the scripts of the chosen tab are on screen: the
 * others are hidden and cannot be snapped to, bumped or selected, but they still run and still compile.
 * A new script belongs to the tab it was made in; a script moves to another tab by being dropped on that
 * tab's name, or with "Move script to another tab" in its menu. Anything that goes to a block (Find blocks,
 * an error, the debugger, a guide) opens that block's tab first. */
export interface ScriptTabsControl {
  readonly current: string;
  show(tab: string): void;
  /** Open the tab of this block, if it is in another one. */
  reveal(blockId: string): void;
  /** Ask which tab a script should move to. */
  pickTab(scriptId: string): void;
  dispose(): void;
}

type Top = Blockly.BlockSvg | Blockly.comments.RenderedWorkspaceComment;
const controls = new WeakMap<Blockly.Workspace, ScriptTabsControl>();

// A hidden script keeps its connections out of Blockly's connection database, so nothing can snap to it
// or bump it. Blockly turns tracking back on after it loads blocks, so the refusal sits here, where it
// cannot be missed.
const hiddenRoots = new WeakSet<Blockly.BlockSvg>();
const tracking = Blockly.BlockSvg.prototype.setConnectionTracking;
Blockly.BlockSvg.prototype.setConnectionTracking = function (this: Blockly.BlockSvg, track: boolean) {
  tracking.call(this, track && !hiddenRoots.has(this.getRootBlock()));
};
// Tabs share one canvas, so a hidden script can lie where a visible one is. Blockly nudges scripts whose
// connections nearly touch; a hidden script that redraws would still look for neighbours from where it
// lies, so neither side of a bump may be hidden.
const bumpNeighbours = Blockly.BlockSvg.prototype.bumpNeighbours;
Blockly.BlockSvg.prototype.bumpNeighbours = function (this: Blockly.BlockSvg) {
  if (!hiddenRoots.has(this.getRootBlock())) bumpNeighbours.call(this);
};
type Bump = (this: Blockly.RenderedConnection, superior: Blockly.RenderedConnection, initiatedByThis?: boolean) => void;
const connectionProto = Blockly.RenderedConnection.prototype as unknown as { bumpAwayFrom: Bump };
const bumpAwayFrom = connectionProto.bumpAwayFrom;
connectionProto.bumpAwayFrom = function (superior, initiatedByThis) {
  if (hiddenRoots.has(this.getSourceBlock().getRootBlock()) || hiddenRoots.has(superior.getSourceBlock().getRootBlock())) return;
  bumpAwayFrom.call(this, superior, initiatedByThis);
};

Blockly.ContextMenuRegistry.registry.register({
  id: 'pbMoveScriptToTab',
  scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
  displayText: () => 'Move script to another tab',
  preconditionFn: scope => scope.block && !scope.block.isInFlyout && !scope.block.isShadow() && controls.has(scope.block.workspace) ? 'enabled' : 'hidden',
  callback: scope => { if (scope.block) controls.get(scope.block.workspace)?.pickTab(scope.block.getRootBlock().id); },
  weight: 6,
});

const guesses: [RegExp, TabIcon][] = [
  [/live|health|\bhp\b|heart/i, 'heart'], [/score|point|coin|gem|money/i, 'coin'], [/shoot|laser|bullet|bomb|fire|missile/i, 'rocket'],
  [/enem|alien|ghost|monster|baddie|beetle|rock|bird|chick/i, 'target'], [/player|hero|\bme\b|character|cannon|ship|pipe|muncher|snake|lander/i, 'sprite'],
  [/level|world|map/i, 'world'], [/sound|music|song/i, 'music'], [/control|key|move/i, 'keyboard'], [/win|goal|flag|finish|end/i, 'flag'],
  [/time|clock|count/i, 'clock'], [/talk|story|say|chat/i, 'message'], [/wall|brick/i, 'bricks'], [/jump|gravity|physic|fall/i, 'physics'],
  [/draw|pen|paint/i, 'pen'], [/magic|spell|trick/i, 'wand'], [/star/i, 'star'], [/start|setup|rule|game/i, 'game'],
];
/** A picture for a new tab, from the words in its name. */
export const guessIcon = (name: string): TabIcon | undefined => guesses.find(([pattern]) => pattern.test(name))?.[1];
const iconLabels: Record<TabIcon, string> = {
  game: 'Game', sprite: 'Character', rocket: 'Rocket', target: 'Target', heart: 'Heart', star: 'Star', coin: 'Coin', flag: 'Flag', physics: 'Physics',
  world: 'World', wall: 'Wall', bricks: 'Bricks', music: 'Music', message: 'Talk', clock: 'Clock', keyboard: 'Keys', pen: 'Pen', wand: 'Magic',
};

const html = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function installScriptTabs(workspace: Blockly.WorkspaceSvg, host: { revealBlocks?(): void } = {}): ScriptTabsControl {
  const strip = document.getElementById('script-tabs')!, list = document.getElementById('script-tab-list')!;
  const empty = document.getElementById('script-tabs-empty')!;
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="script-tab-dialog" class="script-tab-dialog" aria-labelledby="script-tab-dialog-title"><form id="script-tab-form">
      <h2 id="script-tab-dialog-title">Change this tab</h2>
      <label>Name <input id="script-tab-name" maxlength="${MAX_TAB_NAME}" required autocomplete="off" spellcheck="false"></label>
      <fieldset class="script-tab-icons"><legend>Picture</legend><div id="script-tab-icons">${TAB_ICONS.map(icon => `<button type="button" class="script-tab-icon-choice" data-icon="${icon}" aria-pressed="false" title="${iconLabels[icon]}" aria-label="${iconLabels[icon]}">${iconSvg(icon, 'currentColor')}</button>`).join('')}</div></fieldset>
      <div class="script-tab-order" role="group" aria-label="Tab order"><button type="button" id="script-tab-left" class="button secondary">Move left</button><button type="button" id="script-tab-right" class="button secondary">Move right</button></div>
      <p id="script-tab-delete-note" class="tab-note" role="status"></p>
      <div class="dialog-actions"><button type="button" id="script-tab-delete" class="button secondary">Delete tab</button><button id="script-tab-done" class="button primary">Done</button></div>
    </form></dialog>
    <dialog id="script-move-dialog" class="script-tab-dialog" aria-labelledby="script-move-title">
      <h2 id="script-move-title">Move this script to…</h2>
      <div id="script-move-list" class="script-move-list"></div>
      <div class="dialog-actions"><button type="button" id="script-move-cancel" class="button secondary">Cancel</button></div>
    </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const editDialog = el<HTMLDialogElement>('script-tab-dialog'), moveDialog = el<HTMLDialogElement>('script-move-dialog');

  let current = scriptTabs(workspace).tabs[0].id;
  const hidden = new Map<string, Top>();
  /** Bubbles (comments, warnings) a script had open when it was hidden, reopened when it shows again. */
  const bubbles = new WeakMap<Top, { setBubbleVisible(on: boolean): unknown }[]>();
  /** Where each tab was scrolled to, in workspace units, while this project is open. */
  const views = new Map<string, { left: number; top: number }>();

  const tabs = () => scriptTabs(workspace).tabs;
  const tops = (): Top[] => [...workspace.getTopBlocks(false), ...workspace.getTopComments(false)];
  const countIn = (tab: string) => workspace.getTopBlocks(false).filter(b => tabOfScript(workspace, b.id) === tab).length;
  const svgOf = (top: Top) => top.getSvgRoot();

  function hide(top: Top) {
    if (top instanceof Blockly.BlockSvg) {
      const open: { setBubbleVisible(on: boolean): unknown }[] = [];
      for (const block of top.getDescendants(false)) for (const icon of block.getIcons()) {
        const bubble = icon as unknown as { bubbleIsVisible?(): boolean; setBubbleVisible?(on: boolean): unknown };
        if (bubble.bubbleIsVisible?.() && bubble.setBubbleVisible) { open.push(bubble as { setBubbleVisible(on: boolean): unknown }); bubble.setBubbleVisible(false); }
      }
      if (open.length) bubbles.set(top, open);
      hiddenRoots.add(top); top.setConnectionTracking(false);
      if (Blockly.common.getSelected() && top.getDescendants(false).includes(Blockly.common.getSelected() as Blockly.BlockSvg)) (Blockly.common.getSelected() as Blockly.BlockSvg).unselect();
    }
    svgOf(top).style.display = 'none';
  }
  function unhide(top: Top) {
    svgOf(top).style.display = '';
    if (top instanceof Blockly.BlockSvg) {
      hiddenRoots.delete(top); top.setConnectionTracking(true);
      for (const bubble of bubbles.get(top) ?? []) bubble.setBubbleVisible(true);
      bubbles.delete(top);
    }
  }

  /** Put every script where it belongs: on screen in the current tab, hidden in the others. */
  function sync() {
    const all = tabs();
    if (!all.some(t => t.id === current)) current = all[0].id;
    const present = tops();
    adoptScripts(workspace, present.filter(top => !hasTab(workspace, top.id)).map(top => top.id), current);
    let changed = false;
    for (const top of present) {
      const show = tabOfScript(workspace, top.id) === current;
      if (show && hidden.has(top.id)) { unhide(top); hidden.delete(top.id); changed = true; }
      // A script being dragged is never hidden under the learner's finger.
      else if (!show && !(top instanceof Blockly.BlockSvg && top.isDragging())) {
        if (!hidden.has(top.id)) changed = true;
        // Hiding again is cheap, and catches blocks that joined a hidden script (Undo can do that).
        hide(top); hidden.set(top.id, top);
      }
    }
    for (const [id, top] of hidden) if (!present.includes(top)) hidden.delete(id);
    if (changed) workspace.resizeContents();
    render();
  }

  function render() {
    const all = tabs();
    // Rebuilt on every change: a learner's keyboard focus stays on the same tab.
    const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.tab ?? (document.activeElement as HTMLElement).id : null;
    list.replaceChildren();
    for (const tab of all) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'script-tab'; button.dataset.tab = tab.id;
      button.setAttribute('aria-pressed', String(tab.id === current));
      const count = countIn(tab.id);
      button.title = `${tab.name}: ${count === 1 ? '1 script' : `${count} scripts`}`;
      button.innerHTML = `${tab.icon ? `<span class="script-tab-icon" aria-hidden="true">${iconSvg(tab.icon, 'currentColor')}</span>` : ''}<span class="script-tab-name">${html(tab.name)}</span><span class="script-tab-count" aria-hidden="true">${count}</span><span class="visually-hidden">, ${count === 1 ? '1 script' : `${count} scripts`}</span>`;
      button.addEventListener('click', () => show(tab.id));
      button.addEventListener('dblclick', () => edit(tab.id));
      list.append(button);
      if (tab.id === current) {
        const change = document.createElement('button');
        change.type = 'button'; change.className = 'script-tab-edit'; change.id = 'script-tab-edit';
        change.title = 'Rename, choose a picture, move or delete this tab'; change.setAttribute('aria-label', `Change the ${tab.name} tab`);
        change.innerHTML = iconSvg('edit', 'currentColor');
        change.addEventListener('click', () => edit(tab.id));
        list.append(change);
      }
    }
    el<HTMLButtonElement>('script-tab-add').disabled = all.length >= MAX_TABS;
    // The open tab stays in view when the tabs are wider than the strip (scrolling only the strip).
    const open = list.querySelector<HTMLElement>('[aria-pressed=true]');
    if (open) {
      const left = open.offsetLeft - list.offsetLeft, right = left + open.offsetWidth + 44;
      if (left < list.scrollLeft) list.scrollLeft = left; else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth;
    }
    fade();
    if (focused) (list.querySelector<HTMLElement>(`[data-tab="${CSS.escape(focused)}"]`) ?? (focused === 'script-tab-edit' ? el('script-tab-edit') : null))?.focus();
    empty.hidden = all.length < 2 || countIn(current) > 0;
    if (!empty.hidden) empty.querySelector('strong')!.textContent = all.find(t => t.id === current)!.name;
  }

  /** The strip's edge fades while more tabs lie beyond it. */
  const fade = () => {
    strip.classList.toggle('script-tabs-overflow', list.scrollWidth > list.clientWidth + 1);
    strip.classList.toggle('script-tabs-at-end', list.scrollLeft + list.clientWidth >= list.scrollWidth - 1);
  };
  list.addEventListener('scroll', fade, { passive: true });
  const viewTopLeft = () => { const view = workspace.getMetricsManager().getViewMetrics(true); return { left: view.left, top: view.top }; };
  function scrollTo(left: number, top: number) {
    const view = viewTopLeft();
    workspace.scroll(workspace.scrollX + (view.left - left) * workspace.scale, workspace.scrollY + (view.top - top) * workspace.scale);
  }
  /** A tab seen for the first time opens at its top-left script. */
  function scrollHome() {
    const box = workspace.getBlocksBoundingBox(), any = workspace.getTopBoundedElements().length > 0;
    scrollTo(any ? box.left - 24 : -24, any ? box.top - 24 : -24);
  }

  function show(tab: string, home = false) {
    if (tab !== current) {
      views.set(current, viewTopLeft());
      current = tab;
      if (workspace.isDragging()) return render();
      sync();
      const view = views.get(tab);
      if (view && !home) scrollTo(view.left, view.top); else scrollHome();
    }
    render();
  }
  function reveal(blockId: string) {
    const block = workspace.getBlockById(blockId);
    if (!block || block.isInFlyout) return;
    const tab = tabOfScript(workspace, block.getRootBlock().id);
    if (tab !== current) { host.revealBlocks?.(); show(tab); }
  }

  /** Where a script moved into a tab goes: under that tab's scripts, so it never lands on one. */
  function freeSpot(tab: string, except: string) {
    const boxes = workspace.getTopBlocks(false).filter(b => b.id !== except && tabOfScript(workspace, b.id) === tab).map(b => b.getBoundingRectangle());
    if (!boxes.length) return new Blockly.utils.Coordinate(40, 30);
    return new Blockly.utils.Coordinate(Math.min(...boxes.map(b => b.left)), Math.max(...boxes.map(b => b.bottom)) + 40);
  }
  function moveScript(scriptId: string, tab: string, group?: string) {
    const block = workspace.getBlockById(scriptId);
    if (!block || tab === tabOfScript(workspace, scriptId)) return;
    const previous = Blockly.Events.getGroup(); Blockly.Events.setGroup(group ?? true);
    try {
      const spot = freeSpot(tab, scriptId);
      changeTabs(workspace, { moves: { [scriptId]: tab } });
      block.moveTo(spot);
    } finally { Blockly.Events.setGroup(previous); }
    sync(); flash(tab);
  }
  function flash(tab: string) {
    const button = list.querySelector<HTMLElement>(`.script-tab[data-tab="${CSS.escape(tab)}"]`);
    if (!button) return;
    button.classList.remove('script-tab-flash'); void button.offsetWidth; button.classList.add('script-tab-flash');
  }

  async function newTab(moving?: string) {
    if (tabs().length >= MAX_TABS) return;
    const answer = await askName({
      title: moving ? 'Move it to a new tab' : 'New tab', value: '', confirm: 'Make tab',
      hint: 'Name it for what its scripts do, such as Player, Enemies or Score and lives.',
      validate: name => !tabName(name) ? 'Give the tab a name.' : tabs().some(t => t.name.toLocaleLowerCase() === tabName(name).toLocaleLowerCase()) ? 'There is already a tab with that name.' : null,
    });
    if (!answer) return;
    const name = tabName(answer.name), icon = guessIcon(name);
    const tab: ScriptTab = { id: newTabId(), name, ...(icon ? { icon } : {}) };
    const block = moving ? workspace.getBlockById(moving) : null;
    const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(true);
    try {
      changeTabs(workspace, { tabs: [...tabs(), tab], moves: block ? { [block.id]: tab.id } : {} });
      block?.moveTo(new Blockly.utils.Coordinate(40, 30));
    } finally { Blockly.Events.setGroup(group); }
    if (block) { sync(); flash(tab.id); } else show(tab.id, true);
  }

  let editing = '';
  function edit(tab: string) {
    const found = tabs().find(t => t.id === tab); if (!found) return;
    editing = tab;
    el<HTMLInputElement>('script-tab-name').value = found.name;
    el('script-tab-delete-note').textContent = '';
    el<HTMLButtonElement>('script-tab-delete').textContent = 'Delete tab';
    delete el<HTMLButtonElement>('script-tab-delete').dataset.confirm;
    refreshEdit();
    editDialog.showModal();
  }
  function refreshEdit() {
    const all = tabs(), index = all.findIndex(t => t.id === editing), tab = all[index];
    if (!tab) { editDialog.close(); return; }
    for (const choice of el('script-tab-icons').querySelectorAll<HTMLButtonElement>('button')) choice.setAttribute('aria-pressed', String(choice.dataset.icon === tab.icon));
    el<HTMLButtonElement>('script-tab-left').disabled = index === 0;
    el<HTMLButtonElement>('script-tab-right').disabled = index === all.length - 1;
    el<HTMLButtonElement>('script-tab-delete').disabled = all.length === 1;
  }
  const updateTab = (change: (tab: ScriptTab, all: ScriptTab[]) => ScriptTab[]) => {
    const all = tabs(), tab = all.find(t => t.id === editing); if (!tab) return;
    changeTabs(workspace, { tabs: change(tab, all) }); sync(); refreshEdit();
  };
  const rename = () => {
    const name = tabName(el<HTMLInputElement>('script-tab-name').value);
    if (name) updateTab((tab, all) => all.map(t => t.id === tab.id ? { ...t, name } : t));
  };
  el('script-tab-name').addEventListener('change', rename);
  el('script-tab-form').addEventListener('submit', event => { event.preventDefault(); rename(); editDialog.close(); });
  el('script-tab-icons').addEventListener('click', event => {
    const icon = (event.target as Element).closest<HTMLElement>('[data-icon]')?.dataset.icon as TabIcon | undefined; if (!icon) return;
    updateTab((tab, all) => all.map(t => {
      if (t.id !== tab.id) return t;
      const { icon: _old, ...rest } = t;
      return t.icon === icon ? rest : { ...rest, icon };
    }));
  });
  for (const [id, step] of [['script-tab-left', -1], ['script-tab-right', 1]] as const) el(id).addEventListener('click', () => updateTab((tab, all) => {
    const index = all.findIndex(t => t.id === tab.id), next = [...all];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    return next;
  }));
  el('script-tab-delete').addEventListener('click', () => {
    const button = el<HTMLButtonElement>('script-tab-delete'), all = tabs(), tab = all.find(t => t.id === editing);
    if (!tab || all.length < 2) return;
    const count = countIn(tab.id), into = all.filter(t => t.id !== tab.id)[0];
    if (count && !button.dataset.confirm) {
      button.dataset.confirm = 'yes'; button.textContent = 'Delete it';
      el('script-tab-delete-note').textContent = `Its ${count === 1 ? 'script moves' : `${count} scripts move`} to ${into.name}. Nothing is deleted from your program.`;
      return;
    }
    // The scripts go under the ones already in the tab they move to.
    const moving = workspace.getTopBlocks(false).filter(b => tabOfScript(workspace, b.id) === tab.id);
    const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(true);
    try {
      let spot = freeSpot(into.id, '');
      const moves = Object.fromEntries(moving.map(b => [b.id, into.id]));
      changeTabs(workspace, { tabs: all.filter(t => t.id !== tab.id), moves });
      for (const block of moving) { block.moveTo(spot); spot = new Blockly.utils.Coordinate(spot.x, block.getBoundingRectangle().bottom + 40); }
    } finally { Blockly.Events.setGroup(group); }
    editDialog.close();
    show(into.id); sync();
  });

  let movingScript = '';
  function pickTab(scriptId: string) {
    movingScript = scriptId;
    const all = tabs(), from = tabOfScript(workspace, scriptId), box = el('script-move-list');
    box.replaceChildren();
    for (const tab of all) {
      if (tab.id === from) continue;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary script-move-choice'; button.dataset.tab = tab.id;
      button.innerHTML = `${tab.icon ? iconSvg(tab.icon, 'currentColor') : ''}<span>${html(tab.name)}</span>`;
      button.addEventListener('click', () => { moveDialog.close(); moveScript(movingScript, tab.id); });
      box.append(button);
    }
    if (all.length < MAX_TABS) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'button secondary script-move-choice'; button.id = 'script-move-new';
      button.innerHTML = `${iconSvg('plus', 'currentColor')}<span>A new tab…</span>`;
      button.addEventListener('click', () => { moveDialog.close(); void newTab(movingScript); });
      box.append(button);
    }
    moveDialog.showModal();
  }
  el('script-move-cancel').addEventListener('click', () => moveDialog.close());
  el('script-tab-add').addEventListener('click', () => void newTab());

  // Drop a script on a tab's name to move it there, or on New tab to start a tab with it.
  let dragging = '', target: string | null = null;
  // The dragged block is drawn over the strip, so look under it for the tab.
  const hovered = (event: PointerEvent) => {
    const at = document.elementsFromPoint(event.clientX, event.clientY).find(element => strip.contains(element));
    if (!at) return null;
    if (at.closest('#script-tab-add')) return 'new';
    return at.closest<HTMLElement>('.script-tab')?.dataset.tab ?? null;
  };
  const mark = (tab: string | null) => {
    target = tab;
    for (const button of strip.querySelectorAll<HTMLElement>('.script-tab, #script-tab-add')) button.classList.toggle('script-tab-drop', !!tab && (button.dataset.tab ?? 'new') === tab && tab !== current);
    strip.classList.toggle('script-tabs-dragging', !!dragging);
    // Over a tab, the dragged script turns see-through so the tab it will go to shows.
    document.documentElement.classList.toggle('script-tab-dropping', !!tab && tab !== current);
  };
  const onMove = (event: PointerEvent) => { if (dragging) mark(hovered(event)); };
  const onUp = (event: PointerEvent) => { if (dragging) target = hovered(event); };
  document.addEventListener('pointermove', onMove, true);
  document.addEventListener('pointerup', onUp, true);

  const isDrag = (event: Blockly.Events.Abstract): event is Blockly.Events.BlockDrag => event.type === Blockly.Events.BLOCK_DRAG;
  const listener = (event: Blockly.Events.Abstract) => {
    if (isDrag(event)) {
      if (event.isStart) { dragging = event.blockId ?? ''; mark(null); return; }
      const drop = target, id = event.blockId ?? dragging;
      dragging = ''; mark(null);
      const block = id ? workspace.getBlockById(id) : null;
      if (!drop || drop === current || !block || block.getParent()) return;
      if (drop === 'new') { void newTab(block.id); return; }
      moveScript(block.id, drop, event.group);
      return;
    }
    // A hidden block is never left selected, where Delete would remove a script nobody can see (focus
    // can come back to one when a dialog closes). Going to a block on purpose opens its tab first.
    if (event.type === Blockly.Events.SELECTED) {
      const block = workspace.getBlockById((event as Blockly.Events.Selected).newElementId ?? '');
      if (block && hidden.has(block.getRootBlock().id) && Blockly.common.getSelected() === block) block.unselect();
      return;
    }
    if (event.isUiEvent) return;
    // A block pulled out of a script stays in that script's tab (Undo can pull one out in another tab).
    if (event.type === Blockly.Events.BLOCK_MOVE) {
      const move = event as Blockly.Events.BlockMove;
      if (move.oldParentId && !move.newParentId && move.blockId) {
        const parent = workspace.getBlockById(move.oldParentId);
        const tab = parent ? tabOfScript(workspace, parent.getRootBlock().id) : current;
        if (tabOfScript(workspace, move.blockId) !== tab || !hasTab(workspace, move.blockId)) {
          const moved = workspace.getBlockById(move.blockId);
          if (moved && !moved.getParent()) placeScript(workspace, move.blockId, tab);
        }
      }
    }
    scheduleSync();
  };
  let pending = false;
  const scheduleSync = () => { if (pending) return; pending = true; queueMicrotask(() => { pending = false; sync(); }); };
  workspace.addChangeListener(listener);

  // Undo and Redo show what they changed: a step that only touched another tab opens that tab.
  const undo = workspace.undo.bind(workspace);
  workspace.undo = (redo = false) => {
    const stack = redo ? workspace.getRedoStack() : workspace.getUndoStack(), last = stack.at(-1);
    const step = last ? (last.group ? stack.filter(e => e.group === last.group) : [last]) : [];
    undo(redo);
    const ids = step.flatMap(e => e instanceof TabsEvent ? e.moves.map(m => m[0]) : [(e as { blockId?: string }).blockId ?? '']).filter(Boolean);
    if (ids.length) setTimeout(() => {
      sync();
      const blocks = ids.map(id => workspace.getBlockById(id)).filter((b): b is Blockly.BlockSvg => !!b && !b.isInFlyout);
      if (blocks.length && !blocks.some(b => !hidden.has(b.getRootBlock().id))) reveal(blocks[0].id);
    }, 0);
  };

  // The strip lies over the top of the workspace, beside the palette: the palette and its flyout keep the
  // panel's full height. Blockly is told the workspace view starts under the strip, as it would under a
  // toolbox at the top, so scripts, scrollbars and centring never hide behind it. (Beside the palette, the
  // strip is also outside the palette's delete area, which reaches up and down without end: a script
  // dropped on a tab is moved, never deleted.)
  const panel = strip.parentElement!;
  const stripHeight = () => strip.offsetHeight;
  const metrics = workspace.getMetricsManager();
  const absolute = metrics.getAbsoluteMetrics.bind(metrics), viewMetrics = metrics.getViewMetrics.bind(metrics);
  let fullHeight = false;
  metrics.getAbsoluteMetrics = () => { const m = absolute(); return { ...m, top: m.top + stripHeight() }; };
  metrics.getViewMetrics = (inWorkspaceUnits?: boolean) => {
    const m = viewMetrics(inWorkspaceUnits);
    return fullHeight ? m : { ...m, height: Math.max(0, m.height - stripHeight() / (inWorkspaceUnits ? workspace.scale : 1)) };
  };
  // The flyout sizes itself to the workspace view; it keeps the full height, drawn over the strip.
  const flyout = workspace.getFlyout() as (Blockly.IFlyout & { position(): void }) | null;
  const position = flyout?.position.bind(flyout);
  if (flyout && position) flyout.position = () => { fullHeight = true; try { position(); } finally { fullHeight = false; } };
  const placeStrip = () => {
    const palette = workspace.getInjectionDiv().querySelector<HTMLElement>('.blocklyToolbox');
    panel.style.setProperty('--palette-width', `${palette?.offsetWidth ?? 0}px`);
  };
  const resized = new ResizeObserver(() => { placeStrip(); fade(); });
  const palette = workspace.getInjectionDiv().querySelector<HTMLElement>('.blocklyToolbox');
  if (palette) resized.observe(palette);
  resized.observe(strip);
  placeStrip(); Blockly.svgResize(workspace);

  // Things that go to a block open its tab first.
  const centerOnBlock = workspace.centerOnBlock.bind(workspace), highlightBlock = workspace.highlightBlock.bind(workspace);
  workspace.centerOnBlock = (id, blockOnly) => { if (id) reveal(id); centerOnBlock(id, blockOnly); };
  workspace.highlightBlock = (id, add) => { if (id) reveal(id); highlightBlock(id, add); };
  // Only the scripts on screen count for scrolling, zooming to fit and keyboard moves between scripts.
  const bounded = workspace.getTopBoundedElements.bind(workspace);
  workspace.getTopBoundedElements = (ordered?: boolean) => bounded(ordered).filter(element => !hidden.has((element as unknown as { id: string }).id));
  // Workspace menu items act on the scripts on screen: Clean up, Collapse, Expand and Delete all.
  const originalItems = new Map<string, Partial<Blockly.ContextMenuRegistry.RegistryItem>>();
  const onScreen = <T>(scope: Blockly.ContextMenuRegistry.Scope, action: () => T): T => {
    if (scope.workspace !== workspace) return action();
    const own = Object.prototype.hasOwnProperty.call(workspace, 'getTopBlocks'), all = workspace.getTopBlocks;
    workspace.getTopBlocks = (ordered: boolean) => all.call(workspace, ordered).filter(block => !hidden.has(block.id));
    try { return action(); } finally { if (own) workspace.getTopBlocks = all; else delete (workspace as Partial<Blockly.WorkspaceSvg>).getTopBlocks; }
  };
  for (const id of ['cleanWorkspace', 'collapseWorkspace', 'expandWorkspace', 'workspaceDelete']) {
    const item = Blockly.ContextMenuRegistry.registry.getItem(id) as Blockly.ContextMenuRegistry.RegistryItem | null;
    if (!item) continue;
    const { preconditionFn, callback, displayText } = item;
    originalItems.set(id, { preconditionFn, callback, displayText });
    if (preconditionFn) item.preconditionFn = (scope, event) => onScreen(scope, () => preconditionFn(scope, event));
    if (callback) item.callback = (scope, ...rest) => onScreen(scope, () => callback(scope, ...rest));
    if (typeof displayText === 'function') item.displayText = scope => onScreen(scope, () => (displayText as (scope: Blockly.ContextMenuRegistry.Scope) => string | HTMLElement)(scope));
  }

  // A project that opens keeps the tab on screen when it still has it (applying Python reloads the same
  // project); another project opens at its first tab.
  onTabsLoaded(workspace, () => {
    const all = tabs(), same = all.some(t => t.id === current);
    if (!same) { current = all[0].id; views.clear(); }
    sync();
    if (!same) scrollHome();
  });

  const control: ScriptTabsControl = {
    get current() { return current; },
    show: tab => show(tab), reveal, pickTab,
    dispose() {
      controls.delete(workspace); onTabsLoaded(workspace, null);
      workspace.removeChangeListener(listener);
      document.removeEventListener('pointermove', onMove, true); document.removeEventListener('pointerup', onUp, true);
      for (const [id, item] of originalItems) Object.assign(Blockly.ContextMenuRegistry.registry.getItem(id) ?? {}, item);
      for (const top of hidden.values()) unhide(top);
      metrics.getAbsoluteMetrics = absolute; metrics.getViewMetrics = viewMetrics; resized.disconnect();
      if (flyout && position) flyout.position = position;
      editDialog.remove(); moveDialog.remove();
    },
  };
  controls.set(workspace, control);
  sync();
  return control;
}
