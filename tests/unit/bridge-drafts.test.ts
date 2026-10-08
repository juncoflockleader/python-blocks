import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { loadWorkspace } from '../../src/language/serialization';
import { changeScene, sceneState } from '../../src/scene/state';
import { renameModule } from '../../src/language/modules';
import { createWorkspace, prepareProject, restore, snapshot, MAX_FILE_SIZE } from '../../src/project';
import { PythonBridge, projectRevision, authoredProject } from '../../src/bridge/controller';
import { bridgeState, changeBridgeState, draftChanged, MAX_RECOVERIES } from '../../src/bridge/draft-state';
import { applyProjectTransaction } from '../../src/bridge/transaction';
import type { ParsePython } from '../../src/bridge/converter';
import type { ParseResult } from '../../src/bridge/parser-protocol';

const workspaces: Blockly.Workspace[] = [], bridges: PythonBridge[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
afterEach(() => { bridges.splice(0).forEach(bridge => bridge.dispose()); workspaces.splice(0).forEach(w => w.dispose()); });
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
const cache = new Map<string, ParseResult>();
const parse: ParsePython = async source => {
  if (!cache.has(source)) cache.set(source, JSON.parse(execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))"], { input: source, encoding: 'utf8', maxBuffer: 64_000_000 })));
  return structuredClone(cache.get(source)!);
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
function delayedParser() {
  const entered = deferred(), released = deferred(); let first = true;
  const delayed: ParsePython = async source => {
    if (first) { first = false; entered.resolve(); await released.promise; }
    // Intentionally ignores AbortSignal to exercise stale-result protection.
    return parse(source);
  };
  return { parse: delayed, entered: entered.promise, release: released.resolve };
}
function connect(w: Blockly.Workspace, parser = parse) { const bridge = new PythonBridge(w, parser); bridges.push(bridge); return bridge; }
async function setup(parser = parse) {
  const number = { type: 'py_number', id: 'number', fields: { VALUE: '1' } };
  const print = { type: 'text_print', id: 'print', inputs: { TEXT: { block: number } } };
  const w = ws(); loadWorkspace({ blocks: { languageVersion: 0, blocks: [{ type: 'py_program', id: 'root', x: 40, y: 60, inputs: { BODY: { block: print } } }] } }, w);
  const bridge = connect(w, parser); await bridge.begin(); await flush(); w.clearUndo(); return { w, bridge };
}
const code = (w: Blockly.Workspace) => compile(w).source;

describe('durable Python drafts', () => {
  it('migrates old projects and saves exact invalid Unicode/CRLF source with a stable base revision', async () => {
    const { w, bridge } = await setup(), initial = bridge.state.draft!;
    const source = '# 雪🙂\r\nif True:\r\n    print("unfinished\r\n'; bridge.edit(source);
    const project = snapshot(w); expect(project.formatVersion).toBe(2);
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(project)).project);
    expect(bridgeState(restored)).toEqual(bridge.state); expect(code(restored)).toBe('print(1)\n');
    expect(await projectRevision(snapshot(restored))).toBe(initial.baseRevision); expect(draftChanged(bridgeState(restored).draft)).toBe(true);
    const reopened = connect(restored); await reopened.begin(); expect(reopened.state.draft?.source).toBe(source);
    const old = { ...project, formatVersion: 1, workspace: { ...project.workspace } }; delete old.workspace.pythonBridge;
    const migrated = prepareProject(JSON.stringify(old)).project; expect(migrated.formatVersion).toBe(2); expect(migrated.workspace.pythonBridge).toBeUndefined();
    expect(await projectRevision(migrated)).toBe(initial.baseRevision);
  });
  it.each(['syntax', 'unsupported'])('keeps both representations and positioned diagnostics after a %s failure', async kind => {
    const { w, bridge } = await setup(); const source = kind === 'syntax' ? 'if True:\n' : 'items = []\nitems += [1]\n'; bridge.edit(source);
    const before = snapshot(w), result = await bridge.apply(); expect(result.ok).toBe(false);
    expect(snapshot(w)).toEqual(before); expect(w.getUndoStack()).toHaveLength(0); expect(bridge.status.busy).toBe(false);
    if (!result.ok) { expect(result.source).toBe(source); expect(result.diagnostics[0].span).toBeDefined(); expect(bridge.status.diagnostics).toEqual(result.diagnostics); }
  });
  it.each([
    { version: 99, recovery: [] },
    { version: 1, draft: { source: 'x', baseSource: 'x', baseRevision: 'bad', origin: 'blocks' }, recovery: [] },
    { version: 1, recovery: [null] },
    { version: 1, recovery: 'not a list' },
  ])('rejects malformed draft metadata before touching current work: %j', async malformed => {
    const { w, bridge } = await setup(); bridge.edit('print(\n'); const before = snapshot(w);
    expect(() => restore(w, { ...before, workspace: { ...before.workspace, pythonBridge: malformed } })).toThrow(/draft|Python/);
    expect(snapshot(w)).toEqual(before); expect(Blockly.Events.isEnabled()).toBe(true);
  });
  it('keeps replaced and discarded sources recoverable without silently evicting history', async () => {
    const { w, bridge } = await setup(); bridge.edit('# unfinished\nprint('); const text = bridge.state.draft!.source;
    await bridge.useBlocks(); expect(bridge.state.draft?.source).toBe('print(1)\n'); expect(bridge.state.recovery[0].source).toBe(text);
    bridge.recover(bridge.state.recovery[0].id); expect(bridge.state.draft?.source).toBe(text);
    bridge.discard(); expect(bridge.state.draft).toBeUndefined(); expect(bridge.state.recovery.some(entry => entry.source === text)).toBe(true);
    await bridge.begin(); const state = bridge.state;
    state.recovery = Array.from({ length: MAX_RECOVERIES }, (_, i) => ({ ...state.draft!, source: `# recovery ${i}`, id: `r${i}`, reason: 'discarded' as const })); changeBridgeState(w, state);
    const before = snapshot(w); expect(() => bridge.discard()).toThrow('recovery is full'); expect(snapshot(w)).toEqual(before);
    bridge.removeRecovery('r0'); bridge.discard(); expect(bridge.state.recovery).toHaveLength(MAX_RECOVERIES);
    expect(bridge.state.draft).toBeUndefined(); expect(bridge.state.recovery.some(entry => entry.id === 'r1')).toBe(true);
  });
  it('rejects a project-size overflow without truncating the existing draft', async () => {
    const { w, bridge } = await setup(); bridge.edit('print(2)\n'); const before = snapshot(w);
    expect(() => bridge.edit('x'.repeat(MAX_FILE_SIZE))).toThrow('16 MB project limit'); expect(snapshot(w)).toEqual(before);
  });
  it('does not reset an invalid block project or its existing text while starting a fresh draft', async () => {
    const { w, bridge } = await setup(); bridge.edit('print(\n'); w.getBlockById('number')!.dispose(false); const before = snapshot(w);
    await expect(bridge.useBlocks()).rejects.toThrow('block errors'); expect(snapshot(w)).toEqual(before);
  });
});

describe('atomic Apply and block history', () => {
  it('applies functions/scopes as one event and restores full block and draft state through Undo/Redo', async () => {
    const { w, bridge } = await setup(); const original = code(w)!;
    const source = '# my formatting\ndef twice(value):\n    result = value * 2\n    return result\nprint(twice(3)) # six\n'; bridge.edit(source);
    const before = snapshot(w), result = await bridge.apply(); expect(result.ok).toBe(true); await flush();
    const after = snapshot(w); expect(code(w)).toContain('def twice(value):'); expect(bridge.state.draft).toMatchObject({ source, baseSource: source, origin: 'python' });
    expect(bridge.state.draft!.baseRevision).toBe(await projectRevision(after)); expect(bridge.state.recovery[0].source).toBe(original);
    expect(w.getUndoStack()).toHaveLength(1); expect(w.getUndoStack()[0].type).toBe('py_bridge_apply');
    w.undo(false); await flush(); expect(snapshot(w)).toEqual(before); expect(code(w)).toBe(original); expect(draftChanged(bridge.state.draft)).toBe(true);
    w.undo(true); await flush(); expect(snapshot(w)).toEqual(after); expect(draftChanged(bridge.state.draft)).toBe(false);
    const restored = ws(); restore(restored, after); expect(snapshot(restored)).toEqual(after);
  });
  it('preserves typing after Apply through Undo and Redo, and detects the temporary revision conflict', async () => {
    const { w, bridge } = await setup(); bridge.edit('print(2)\n'); expect((await bridge.apply()).ok).toBe(true); await flush();
    bridge.edit('# later draft\nprint(3)\n'); await flush(); const draft = bridge.state.draft!;
    expect(w.getUndoStack()).toHaveLength(1); w.undo(false); await flush(); expect(code(w)).toBe('print(1)\n'); expect(bridge.state.draft).toEqual(draft);
    expect(await bridge.apply()).toMatchObject({ ok: false, diagnostics: [{ code: 'conflict' }] });
    w.undo(true); await flush(); expect(code(w)).toBe('print(2)\n'); expect(bridge.state.draft).toEqual(draft);
    expect((await bridge.apply()).ok).toBe(true); expect(code(w)).toBe('print(3)\n');
  });
  it('preserves typing after Undo when Redo changes its base and recovers it when starting from current blocks', async () => {
    const { w, bridge } = await setup(); bridge.edit('print(2)\n'); await bridge.apply(); await flush(); w.undo(false); await flush();
    bridge.edit('print(4)\n'); w.undo(true); await flush(); expect(code(w)).toBe('print(2)\n'); expect(bridge.state.draft?.source).toBe('print(4)\n');
    expect(await bridge.apply()).toMatchObject({ ok: false, diagnostics: [{ code: 'conflict' }] });
    await bridge.useBlocks(); expect(bridge.state.draft?.source).toBe('print(2)\n'); expect(bridge.state.recovery.some(entry => entry.source === 'print(4)\n')).toBe(true);
  });
  it('preserves scene assets and pinned module definitions in apply, history and files', async () => {
    for (const fixture of ['src/scene/world-example.json', 'tests/fixtures/modules/consumer.json']) {
      const w = ws(); restore(w, prepareProject(readFileSync(fixture, 'utf8')).project); const bridge = connect(w); await bridge.begin(); await flush(); w.clearUndo();
      bridge.edit('# saved learner explanation\n' + bridge.state.draft!.source); const before = snapshot(w); expect((await bridge.apply()).ok).toBe(true); await flush(); const after = snapshot(w);
      expect(after.workspace.pythonScene).toEqual(before.workspace.pythonScene); expect(after.workspace.pythonModules).toEqual(before.workspace.pythonModules);
      expect(bridge.state.draft!.baseRevision).toBe(await projectRevision(prepareProject(JSON.stringify(after)).project));
      w.undo(false); await flush(); expect(snapshot(w)).toEqual(before); w.undo(true); await flush(); expect(snapshot(w)).toEqual(after);
    }
  });
  it('rolls back a live deserialization failure and preserves Blockly event state and existing history', async () => {
    const { w, bridge } = await setup(); bridge.edit('print(2)\n'); await bridge.apply(); await flush(); const before = snapshot(w), stack = w.getUndoStack().slice();
    const flag = new WeakMap<Blockly.Workspace, boolean>(); let fail = true;
    Blockly.serialization.registry.register('testBridgeFailure', {
      priority: 97, save(workspace) { return flag.get(workspace) ? {} : null; }, clear(workspace) { flag.delete(workspace); },
      load(_state, workspace) { if (workspace === w && fail) { fail = false; throw new Error('Simulated live load failure'); } flag.set(workspace, true); },
    });
    try {
      const candidate = structuredClone(before); candidate.workspace.testBridgeFailure = {};
      const group = Blockly.Events.getGroup(); Blockly.Events.setGroup('outer-edit');
      try { expect(() => applyProjectTransaction(w, candidate)).toThrow('Simulated'); expect(Blockly.Events.getGroup()).toBe('outer-edit'); }
      finally { Blockly.Events.setGroup(group); }
      expect(snapshot(w)).toEqual(before); expect(w.getUndoStack()).toEqual(stack); expect(Blockly.Events.isEnabled()).toBe(true); expect(Blockly.Events.getRecordUndo()).toBe(true);
    } finally { Blockly.serialization.registry.unregister('testBridgeFailure'); }
  });
});

describe('captured revisions, cancellation and stale results', () => {
  it.each(['block', 'layout', 'asset', 'module'])('rejects a changed %s base without running the parser', async kind => {
    const parser = vi.fn(parse), { w, bridge } = await setup(parser);
    if (kind === 'module') { restore(w, prepareProject(readFileSync('tests/fixtures/modules/consumer.json', 'utf8')).project); await bridge.begin(); }
    bridge.edit('# edit\n' + bridge.state.draft!.source);
    if (kind === 'block') w.getBlockById('number')!.setFieldValue('5', 'VALUE');
    if (kind === 'layout') w.getBlockById('root')!.moveBy(20, 30);
    if (kind === 'asset') changeScene(w, { ...sceneState(w), background: '#123456' });
    if (kind === 'module') renameModule(w, snapshot(w).workspace.pythonModules.imports[0].id, 'renamed_tools');
    const before = snapshot(w); expect(await bridge.apply()).toMatchObject({ ok: false, diagnostics: [{ code: 'conflict' }] }); expect(snapshot(w)).toEqual(before); expect(parser).not.toHaveBeenCalled();
  });
  it('rejects block edits during parsing without overwriting the changed project or submitted source', async () => {
    const delayed = delayedParser(), { w, bridge } = await setup(delayed.parse); bridge.edit('print(2)\n'); const pending = bridge.apply(); await delayed.entered;
    w.getBlockById('number')!.setFieldValue('9', 'VALUE'); const before = snapshot(w); delayed.release();
    expect(await pending).toMatchObject({ ok: false, diagnostics: [{ code: 'conflict' }] }); expect(snapshot(w)).toEqual(before); expect(code(w)).toBe('print(9)\n');
  });
  it('cancels a stale parse after typing without replacing newer text or its status', async () => {
    const delayed = delayedParser(), { w, bridge } = await setup(delayed.parse); bridge.edit('print(2)\n'); const pending = bridge.apply(); await delayed.entered;
    bridge.edit('print(unfinished'); const before = snapshot(w); delayed.release();
    expect(await pending).toMatchObject({ ok: false, diagnostics: [{ code: 'cancelled' }] }); expect(snapshot(w)).toEqual(before); expect(bridge.status).toEqual({ busy: false, diagnostics: [] });
  });
  it('lets a newer Apply finish before an older uncooperative parser reply without stale installation', async () => {
    const delayed = delayedParser(), { w, bridge } = await setup(delayed.parse); bridge.edit('print(2)\n'); const first = bridge.apply(); await delayed.entered;
    bridge.edit('print(3)\n'); expect((await bridge.apply()).ok).toBe(true); const after = snapshot(w); delayed.release();
    expect(await first).toMatchObject({ ok: false, diagnostics: [{ code: 'cancelled' }] }); expect(snapshot(w)).toEqual(after); expect(code(w)).toBe('print(3)\n');
  });
  it('cancels on disposal and retries cleanly after parser startup failure', async () => {
    const delayed = delayedParser(), first = await setup(delayed.parse); first.bridge.edit('print(2)\n'); const pending = first.bridge.apply(); await delayed.entered;
    const before = snapshot(first.w); first.bridge.dispose(); delayed.release(); expect((await pending).ok).toBe(false); expect(snapshot(first.w)).toEqual(before);
    const parser = vi.fn(parse).mockRejectedValueOnce(new Error('Parser unavailable'));
    const second = await setup(parser); second.bridge.edit('print(4)\n'); expect(await second.bridge.apply()).toMatchObject({ ok: false, diagnostics: [{ message: 'Parser unavailable' }] });
    expect(second.bridge.status.busy).toBe(false); expect((await second.bridge.apply()).ok).toBe(true); expect(code(second.w)).toBe('print(4)\n');
  });
  it('ignores draft formatting/history in the authored revision but includes every saved authored field', async () => {
    const { w, bridge } = await setup(), before = await projectRevision(snapshot(w)); bridge.edit('# comment\nprint(1)\n'); bridge.discard();
    expect(await projectRevision(snapshot(w))).toBe(before); expect(authoredProject(snapshot(w)).workspace.pythonBridge).toBeUndefined();
    changeScene(w, { ...sceneState(w), background: '#123456' }); expect(await projectRevision(snapshot(w))).not.toBe(before);
  });
});
