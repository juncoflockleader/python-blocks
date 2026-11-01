import * as Blockly from 'blockly/core';

/** Script tabs: a project's scripts sorted into named tabs, so a big game reads as a few small parts
 * (the player, the enemies, score and lives). Tabs are only for finding your way: every script still
 * runs, Python lists them all, and a tab never changes what the program does. They are saved with the
 * project as `scriptTabs`: the tabs in order, and which tab each top-level script (or workspace note)
 * lives in, by its id. A script that is not listed lives in the first tab. */
export const TAB_ICONS = ['game', 'sprite', 'rocket', 'target', 'heart', 'star', 'coin', 'flag', 'physics', 'world', 'wall', 'bricks', 'music', 'message', 'clock', 'keyboard', 'pen', 'wand'] as const;
export type TabIcon = typeof TAB_ICONS[number];
export interface ScriptTab { id: string; name: string; icon?: TabIcon }
export interface ScriptTabs { tabs: ScriptTab[]; scripts: Record<string, string> }
export const MAX_TABS = 12;
export const MAX_TAB_NAME = 30;
export const DEFAULT_TAB: ScriptTab = Object.freeze({ id: 'main', name: 'Main' });

interface State { tabs: ScriptTab[]; scripts: Map<string, string> }
const states = new WeakMap<Blockly.Workspace, State>();
const fresh = (): State => ({ tabs: [{ ...DEFAULT_TAB }], scripts: new Map() });
const state = (workspace: Blockly.Workspace) => {
  let s = states.get(workspace);
  if (!s) { s = fresh(); states.set(workspace, s); }
  return s;
};
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const isIcon = (value: unknown): value is TabIcon => (TAB_ICONS as readonly unknown[]).includes(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** A tab name as it is kept: trimmed, single spaces, at most MAX_TAB_NAME characters. */
export const tabName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_TAB_NAME);
export const newTabId = () => `tab-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Tabs are never a reason a project fails to open: anything unusable is dropped, and no usable tab
 * leaves the one default tab. */
export function cleanTabs(value: unknown): ScriptTabs {
  const tabs: ScriptTab[] = [];
  if (record(value) && Array.isArray(value.tabs)) for (const tab of value.tabs) {
    if (tabs.length >= MAX_TABS || !record(tab) || typeof tab.id !== 'string' || !ID.test(tab.id) || tabs.some(t => t.id === tab.id)) continue;
    const name = typeof tab.name === 'string' ? tabName(tab.name) : '';
    if (name) tabs.push({ id: tab.id, name, ...(isIcon(tab.icon) ? { icon: tab.icon } : {}) });
  }
  if (!tabs.length) tabs.push({ ...DEFAULT_TAB });
  const scripts: Record<string, string> = {};
  if (record(value) && record(value.scripts)) for (const [id, tab] of Object.entries(value.scripts)) if (typeof tab === 'string' && tabs.some(t => t.id === tab)) scripts[id] = tab;
  return { tabs, scripts };
}

/** The tabs in order and where each script lives, including scripts no longer on the workspace. */
export function scriptTabs(workspace: Blockly.Workspace): ScriptTabs {
  const s = state(workspace);
  return { tabs: structuredClone(s.tabs), scripts: Object.fromEntries(s.scripts) };
}
const topOf = (workspace: Blockly.Workspace, id: string) => {
  const block = workspace.getBlockById(id);
  if (block) return block.getParent() ? null : block;
  return workspace.getCommentById(id);
};
/** The tab a script lives in, by the id of its top block (or of a workspace note). */
export function tabOfScript(workspace: Blockly.Workspace, id: string): string {
  const s = state(workspace), tab = s.scripts.get(id);
  return tab && s.tabs.some(t => t.id === tab) ? tab : s.tabs[0].id;
}
/** The tab a block's script lives in. */
export const tabOf = (workspace: Blockly.Workspace, block: Blockly.Block) => tabOfScript(workspace, block.getRootBlock().id);
/** Whether this script has a tab of its own yet (a new script gets the tab it was made in). */
export const hasTab = (workspace: Blockly.Workspace, id: string) => state(workspace).scripts.has(id);
/** Give scripts that have no tab yet a tab, without an Undo step: a new script simply belongs where it
 * was made. Undoing the change that made it removes the script; its entry stays harmlessly until save. */
export function adoptScripts(workspace: Blockly.Workspace, ids: string[], tab: string) {
  const s = state(workspace); if (!s.tabs.some(t => t.id === tab)) return;
  for (const id of ids) if (!s.scripts.has(id)) s.scripts.set(id, tab);
}

/** Put one script in a tab without an Undo step: a block pulled out of a script stays in that script's
 * tab, and putting it back undoes the pull. */
export function placeScript(workspace: Blockly.Workspace, id: string, tab: string) {
  const s = state(workspace); if (s.tabs.some(t => t.id === tab)) s.scripts.set(id, tab);
}

export interface TabsChange { tabs?: ScriptTab[]; moves?: Record<string, string> }
type Move = [id: string, from: string | null, to: string];
interface TabsEventJson extends Blockly.Events.AbstractEventJson { before?: ScriptTab[]; after?: ScriptTab[]; moves: Move[] }
function apply(workspace: Blockly.Workspace, tabs: ScriptTab[] | undefined, moves: Move[], forward: boolean) {
  const s = state(workspace);
  if (tabs) s.tabs = structuredClone(tabs);
  for (const [id, from, to] of moves) {
    const target = forward ? to : from;
    if (target === null) s.scripts.delete(id); else s.scripts.set(id, target);
  }
}
/** One undoable change to the tabs: their list (names, icons, order) and scripts moved between them. */
export class TabsEvent extends Blockly.Events.Abstract {
  type = 'py_script_tabs'; isBlank = false;
  constructor(workspace: Blockly.Workspace, readonly before: ScriptTab[] | undefined, readonly after: ScriptTab[] | undefined, readonly moves: Move[]) { super(); this.workspaceId = workspace.id; }
  override run(forward: boolean) {
    const workspace = this.getEventWorkspace_();
    apply(workspace, forward ? this.after : this.before, this.moves, forward);
    // Tell listeners (the tab strip, autosave) what Undo or Redo just changed.
    const notification = new TabsEvent(workspace, this.before, this.after, this.moves); notification.recordUndo = false; Blockly.Events.fire(notification);
  }
  override toJson(): TabsEventJson { return { ...super.toJson(), before: this.before, after: this.after, moves: this.moves }; }
  static override fromJson(json: TabsEventJson, workspace: Blockly.Workspace) { const e = new TabsEvent(workspace, json.before, json.after, json.moves); e.group = json.group; return e; }
}
Blockly.registry.register(Blockly.registry.Type.EVENT, 'py_script_tabs', TabsEvent);

/** Change the tabs as one Undo step. Scripts in a tab that is removed move to the first tab left. */
export function changeTabs(workspace: Blockly.Workspace, change: TabsChange) {
  const s = state(workspace);
  const before = structuredClone(s.tabs);
  const after = change.tabs ? cleanTabs({ tabs: change.tabs }).tabs : undefined;
  const tabs = after ?? before;
  const moves: Move[] = [];
  for (const [id, to] of Object.entries(change.moves ?? {})) {
    if (!tabs.some(t => t.id === to)) continue;
    const from = s.scripts.get(id) ?? null;
    if (from !== to) moves.push([id, from, to]);
  }
  if (after) for (const [id, from] of s.scripts) if (!after.some(t => t.id === from) && !moves.some(m => m[0] === id)) moves.push([id, from, after[0].id]);
  const tabsChanged = !!after && JSON.stringify(after) !== JSON.stringify(before);
  if (!tabsChanged && !moves.length) return false;
  const group = Blockly.Events.getGroup(); if (!group) Blockly.Events.setGroup(true);
  try {
    apply(workspace, tabsChanged ? after : undefined, moves, true);
    Blockly.Events.fire(new TabsEvent(workspace, tabsChanged ? before : undefined, tabsChanged ? after : undefined, moves));
  } finally { if (!group) Blockly.Events.setGroup(false); }
  return true;
}

const loaded = new WeakMap<Blockly.Workspace, () => void>();
/** Called (once the load has finished) each time the workspace loads a project. */
export function onTabsLoaded(workspace: Blockly.Workspace, callback: (() => void) | null) {
  if (callback) loaded.set(workspace, callback); else loaded.delete(workspace);
}
const announce = (workspace: Blockly.Workspace) => { const callback = loaded.get(workspace); if (callback) setTimeout(callback, 0); };

Blockly.serialization.registry.register('scriptTabs', {
  // After the blocks, so a save can leave out scripts that are gone.
  priority: 10,
  save(workspace) {
    const s = state(workspace);
    if (s.tabs.length === 1 && s.tabs[0].id === DEFAULT_TAB.id && s.tabs[0].name === DEFAULT_TAB.name && !s.tabs[0].icon) return null;
    const scripts: Record<string, string> = {};
    for (const [id, tab] of s.scripts) if (topOf(workspace, id) && s.tabs.some(t => t.id === tab)) scripts[id] = tab;
    return { tabs: structuredClone(s.tabs), scripts };
  },
  load(value, workspace) {
    const clean = cleanTabs(value);
    states.set(workspace, { tabs: clean.tabs, scripts: new Map(Object.entries(clean.scripts)) });
  },
  clear(workspace) { states.set(workspace, fresh()); announce(workspace); },
});
