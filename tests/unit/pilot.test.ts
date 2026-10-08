import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { exportRecord, newSession, readSession } from '../../src/pilot/model';
import { scoreStarter } from '../../src/pilot/starter';
import { createWorkspace, restore } from '../../src/project';
import { compile } from '../../src/language/compiler';

describe('learner pilot', () => {
  it('provides an editable executable loop without prefilled outcomes', () => {
    const starter = scoreStarter(), workspace = createWorkspace();
    try {
      restore(workspace, starter); const c = compile(workspace);
      expect(c.diagnostics).toEqual([]);
      expect(spawnSync('python3', ['-c', c.source!], { encoding: 'utf8' }).stdout).toBe('2\n4\n6\n');
      expect(c.source).toContain('score = 0');
    } finally { workspace.dispose(); }
    const s = newSession('P01', 'Some blocks', '', 'revision', 'browser', JSON.stringify(starter));
    expect(s.record.notes.every(n => n.outcome === 'unobserved' && n.prediction === '')).toBe(true);
    expect(readSession(JSON.stringify(s))).toEqual(s);
  });
  it('exports observations without project backups', () => {
    const s = newSession('P02', 'New to coding', 'Keyboard', 'rev', 'browser', 'private project source');
    s.backups.endProject = 'another private project'; s.record.notes[2].outcome = 'unfinished';
    const result = exportRecord(s);
    expect(result).not.toContain('private project'); expect(result).not.toContain('backups');
    expect(JSON.parse(result).tasks[2].outcome).toBe('unfinished');
  });
  it('rejects damaged records and unsafe checkpoint keys', () => {
    const s = newSession('P03', '', '', 'rev', 'browser', '{}');
    for (const mutate of [(s: any) => s.record.task = 10, (s: any) => s.record.notes.pop(), (s: any) => s.record.notes[0].elapsedMs = -1, (s: any) => s.backups.key = 'secret']) {
      const copy = structuredClone(s); mutate(copy); expect(() => readSession(JSON.stringify(copy))).toThrow();
    }
  });
});
