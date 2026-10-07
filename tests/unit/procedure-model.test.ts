import { afterEach, describe, expect, it } from 'vitest';
import { Blockly } from '../../src/blocks';
import { ObservableParameterModel, ObservableProcedureModel, registerProcedureSerializer } from '@blockly/block-shareable-procedures';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = new Blockly.Workspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 10));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));

describe('pinned procedure model compatibility', () => {
  it('preserves independent parameter IDs despite shared backing variable names', () => {
    const w = ws();
    const a = new ObservableParameterModel(w, 'count', 'param-a');
    const b = new ObservableParameterModel(w, 'count', 'param-b');
    expect(a.getId()).not.toBe(b.getId());
    // The plugin does not supply Python scope: its backing variable is shared.
    expect(a.getVariableModel().getId()).toBe(b.getVariableModel().getId());
    a.setName('limit');
    expect(a.getId()).toBe('param-a'); expect(b.getName()).toBe('count');
  });
  it('serializes ordered parameter identities and independent functions', () => {
    registerProcedureSerializer();
    const w = ws(); const f = new ObservableProcedureModel(w, 'sum_to', 'function-a');
    f.insertParameter(new ObservableParameterModel(w, 'start', 'param-start'), 0);
    f.insertParameter(new ObservableParameterModel(w, 'stop', 'param-stop'), 1);
    w.getProcedureMap().add(f);
    const restored = ws(); Blockly.serialization.workspaces.load(Blockly.serialization.workspaces.save(w), restored);
    const result = restored.getProcedureMap().get('function-a')!;
    expect(result.getName()).toBe('sum_to');
    expect(result.getParameters().map(p => [p.getId(), p.getName()])).toEqual([['param-start', 'start'], ['param-stop', 'stop']]);
  });
  it('characterizes parameter reorder undo loss, while rename and deletion undo work', async () => {
    const w = ws(); const f = new ObservableProcedureModel(w, 'compute', 'function-a');
    const first = new ObservableParameterModel(w, 'first', 'param-first');
    const second = new ObservableParameterModel(w, 'second', 'param-second');
    f.insertParameter(first, 0); f.insertParameter(second, 1); w.getProcedureMap().add(f);
    await flush(); w.clearUndo();
    Blockly.Events.setGroup(true);
    f.startBulkUpdate(); f.setName('calculate'); f.deleteParameter(1); f.insertParameter(second, 0); f.endBulkUpdate();
    Blockly.Events.setGroup(false); await flush();
    expect(f.getParameters().map(p => p.getId())).toEqual(['param-second', 'param-first']);
    w.undo(false); await flush();
    expect(f.getName()).toBe('compute');
    // Blockly filters the delete/create pair for the same parameter identity.
    // Our adapter must record an atomic signature event instead.
    expect(f.getParameters().map(p => p.getId())).toEqual(['param-second', 'param-first']);
    w.undo(true); await flush(); expect(f.getName()).toBe('calculate');
    w.clearUndo(); w.getProcedureMap().delete(f.getId()); await flush();
    expect(w.getProcedureMap().has(f.getId())).toBe(false);
    w.undo(false); await flush(); expect(w.getProcedureMap().get(f.getId())).toBe(f);
  });
});
