import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';
import { adoptScripts, changeTabs, cleanTabs, DEFAULT_TAB, placeScript, scriptTabs, tabOf, tabOfScript, MAX_TABS } from '../../src/scripts/tabs';
import { guessIcon } from '../../src/scripts/tab-strip';

/** Script tabs (src/scripts/tabs.ts): named tabs that sort a project's scripts. They are saved with the
 * project, change as one Undo step, never stop a project opening, and never change the program. */
const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const open = (path: string) => { const w = ws(); restore(w, prepareProject(readFileSync(path, 'utf8')).project); return w; };
const ids = (w: Blockly.Workspace, tab: string) => w.getTopBlocks(false).filter(b => tabOf(w, b) === tab).map(b => b.id).sort();

describe('script tabs', () => {
  it('start as one Main tab that is not saved, so a project without tabs is unchanged', () => {
    const w = open('content/builds/catch-the-star-game.json');
    expect(scriptTabs(w).tabs).toEqual([DEFAULT_TAB]);
    expect(snapshot(w).workspace.scriptTabs).toBeUndefined();
    for (const block of w.getTopBlocks(false)) expect(tabOf(w, block)).toBe('main');
  });

  it('save the tabs and where each script lives, leaving out scripts that are gone', () => {
    const w = open('content/builds/catch-the-star-game.json');
    const [first, second] = w.getTopBlocks(false);
    changeTabs(w, { tabs: [DEFAULT_TAB, { id: 'star', name: 'Star', icon: 'star' }], moves: { [second.id]: 'star' } });
    adoptScripts(w, ['gone-forever'], 'star');
    const saved = snapshot(w).workspace.scriptTabs;
    expect(saved.tabs).toEqual([DEFAULT_TAB, { id: 'star', name: 'Star', icon: 'star' }]);
    expect(saved.scripts[second.id]).toBe('star');
    expect(saved.scripts['gone-forever']).toBeUndefined();
    // Reopened, every script is back in its tab.
    const again = ws(); restore(again, snapshot(w));
    expect(tabOfScript(again, second.id)).toBe('star');
    expect(tabOfScript(again, first.id)).toBe('main');
  });

  it('are only for finding your way: the Python is the same in any tab', () => {
    const w = open('content/examples/sky-defenders.json');
    const before = compile(w).source;
    changeTabs(w, { tabs: [{ id: 'one', name: 'Everything' }] });
    expect(compile(w).source).toBe(before);
  });

  it('change as one Undo step, and Undo brings back a deleted tab with its scripts', async () => {
    const w = open('content/examples/sky-defenders.json');
    const aliens = ids(w, 'aliens');
    expect(aliens).toEqual(['make_aliens_function_block', 'on_alien_overlap_handler_block']);
    const tabs = scriptTabs(w).tabs;
    await flush(); w.clearUndo();
    // Deleting a tab moves its scripts to the first tab left: nothing is deleted from the program.
    changeTabs(w, { tabs: tabs.filter(t => t.id !== 'aliens'), moves: Object.fromEntries(aliens.map(id => [id, 'game'])) });
    await flush();
    expect(scriptTabs(w).tabs.map(t => t.id)).toEqual(['game', 'cannon', 'bombs']);
    expect(ids(w, 'game')).toEqual([...aliens, 'on_start_handler_block'].sort());
    w.undo(false); await flush();
    expect(scriptTabs(w).tabs.map(t => t.id)).toEqual(['game', 'cannon', 'aliens', 'bombs']);
    expect(ids(w, 'aliens')).toEqual(aliens);
    w.undo(true); await flush();
    expect(scriptTabs(w).tabs.map(t => t.id)).toEqual(['game', 'cannon', 'bombs']);
  });

  it('send the scripts of a removed tab to the first tab, even when the change does not say so', () => {
    const w = open('content/examples/sky-defenders.json');
    changeTabs(w, { tabs: scriptTabs(w).tabs.filter(t => t.id !== 'bombs') });
    expect(ids(w, 'game')).toContain('on_bomb_update_handler_block');
  });

  it('place a block pulled out of a script in that script’s tab, without an Undo step', async () => {
    const w = open('content/examples/sky-defenders.json');
    await flush(); w.clearUndo();
    placeScript(w, 'some-block', 'bombs');
    expect(tabOfScript(w, 'some-block')).toBe('bombs');
    adoptScripts(w, ['some-block'], 'game');
    expect(tabOfScript(w, 'some-block')).toBe('bombs');
    await flush(); expect(w.getUndoStack()).toEqual([]);
  });

  it('never stop a project from opening: anything unusable is dropped', () => {
    expect(cleanTabs(null)).toEqual({ tabs: [DEFAULT_TAB], scripts: {} });
    expect(cleanTabs({ tabs: [{ id: 'bad id!', name: 'X' }, { id: 'a', name: '   ' }, { id: 'b', name: '  Player   one ', icon: 'nope' }, { id: 'b', name: 'Again' }], scripts: { s1: 'b', s2: 'missing', s3: 4 } }))
      .toEqual({ tabs: [{ id: 'b', name: 'Player one' }], scripts: { s1: 'b' } });
    expect(cleanTabs({ tabs: Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `Tab ${i}` })) }).tabs).toHaveLength(MAX_TABS);
    expect(cleanTabs({ tabs: [{ id: 'long', name: 'x'.repeat(80) }] }).tabs[0].name).toHaveLength(30);
    const project = JSON.parse(readFileSync('content/examples/snake.json', 'utf8'));
    project.workspace.scriptTabs = { tabs: 'not a list', scripts: [1, 2] };
    const w = ws(); restore(w, prepareProject(JSON.stringify(project)).project);
    expect(scriptTabs(w).tabs).toEqual([DEFAULT_TAB]);
  });

  it('give every example and lesson game with tabs a tab for each script', () => {
    const gallery = JSON.parse(readFileSync('content/gallery.json', 'utf8')) as { id: string; project: string }[];
    let withTabs = 0;
    for (const entry of gallery) {
      const data = JSON.parse(readFileSync(entry.project, 'utf8'));
      if (!data.workspace.scriptTabs) continue;
      withTabs++;
      const w = open(entry.project), tabsList = scriptTabs(w).tabs.map(t => t.id);
      for (const block of w.getTopBlocks(false)) expect(Object.keys(data.workspace.scriptTabs.scripts), `${entry.id}: ${block.id}`).toContain(block.id);
      for (const tab of tabsList) expect(ids(w, tab).length, `${entry.id}: tab ${tab} is empty`).toBeGreaterThan(0);
    }
    expect(withTabs).toBeGreaterThanOrEqual(7);
  });

  it('guess a picture from a new tab’s name', () => {
    expect(guessIcon('Lives and score')).toBe('heart');
    expect(guessIcon('Enemies')).toBe('target');
    expect(guessIcon('Player')).toBe('sprite');
    expect(guessIcon('Shooting')).toBe('rocket');
    expect(guessIcon('Zzz')).toBeUndefined();
  });
});
