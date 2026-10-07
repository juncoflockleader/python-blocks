import { afterEach, describe, expect, it } from 'vitest';
import { Blockly, squareProject } from '../../src/blocks';
import { compile } from '../../src/language/compiler';
import { createWorkspace, snapshot, prepareProject, restore, confirmMigration } from '../../src/project';
const workspaces: Blockly.Workspace[] = [];
function ws() { const w = createWorkspace(); workspaces.push(w); return w; }
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));

describe('project persistence', () => {
  it('preserves behavior and block identities through a file round trip', () => {
    const a = ws(); Blockly.serialization.workspaces.load(squareProject, a);
    const file = JSON.stringify(snapshot(a)); const b = ws(); restore(b, prepareProject(file).project);
    expect(compile(b).source).toBe(compile(a).source);
    expect(b.getAllBlocks(false).map(b => b.id).sort()).toEqual(a.getAllBlocks(false).map(b => b.id).sort());
    expect(b.options.oneBasedIndex).toBe(false);
  });
  it('rejects unsupported versions and corrupt blocks without replacing current work', () => {
    const w = ws(); Blockly.serialization.workspaces.load(squareProject, w); const before = snapshot(w);
    expect(() => prepareProject(JSON.stringify({ ...before, languageVersion: 999 }))).toThrow('unsupported');
    expect(() => restore(w, { ...before, workspace: { blocks: { blocks: [{ type: 'does_not_exist' }] } } })).toThrow();
    expect(snapshot(w)).toEqual(before);
  });
  it('wraps one legacy statement stack automatically', () => {
    const prepared = prepareProject(JSON.stringify({ blocks: { blocks: [{ type: 'text_print', inputs: { TEXT: { block: { type: 'text', fields: { TEXT: 'hello' } } } } }] } }));
    expect(prepared.migrationStacks).toEqual([]);
    const w = ws(); restore(w, prepared.project); expect(compile(w).source).toContain('print("hello")');
  });
  it('requires explicit ordering for multiple legacy stacks', () => {
    const prepared = prepareProject(JSON.stringify({ blocks: { blocks: [1, 2].map(n => ({ type: 'text_print', inputs: { TEXT: { block: { type: 'math_number', fields: { NUM: n } } } } })) } }));
    expect(prepared.migrationStacks).toHaveLength(2);
    expect(() => confirmMigration(prepared, [prepared.migrationStacks[0].id])).toThrow('exactly once');
    const w = ws(); restore(w, confirmMigration(prepared, prepared.migrationStacks.map(s => s.id).reverse()));
    expect(compile(w).source).toBe('print(2)\nprint(1)\n');
  });
  it('saves incomplete drafts without claiming they can run', () => {
    const w = ws(); const root = w.newBlock('py_program'); const print = w.newBlock('text_print');
    root.getInput('BODY')!.connection!.connect(print.previousConnection!);
    const file = JSON.stringify(snapshot(w)); restore(w, prepareProject(file).project);
    expect(compile(w).source).toBeNull();
  });
});
