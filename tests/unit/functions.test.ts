import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { defineFunction, callState } from '../../src/blocks/core/functions';
import { createVariable, editSignature, parameterSymbol, signatureOf, type FunctionBlock } from '../../src/language/functions';
import { compile, blockForLine } from '../../src/language/compiler';
import { createWorkspace, snapshot, restore, prepareProject } from '../../src/project';
const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function b(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const block = w.newBlock(type); for (const [key, value] of Object.entries(fields)) block.setFieldValue(value, key); return block; }
function plug(parent: Blockly.Block, input: string, child: Blockly.Block) { parent.getInput(input)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function chain(...blocks: Blockly.Block[]) { blocks.slice(1).forEach((b, i) => blocks[i].nextConnection!.connect(b.previousConnection!)); return blocks[0]; }
const n = (w: Blockly.Workspace, value: number) => b(w, 'py_number', { VALUE: String(value) });
const get = (w: Blockly.Workspace, symbol: string) => b(w, 'py_get', { SYMBOL: symbol });
const set = (w: Blockly.Workspace, symbol: string, value: Blockly.Block) => plug(b(w, 'py_set', { SYMBOL: symbol }), 'VALUE', value);
const ret = (w: Blockly.Workspace, value: Blockly.Block) => plug(b(w, 'py_return_value'), 'VALUE', value);
const print = (w: Blockly.Workspace, value: Blockly.Block) => plug(b(w, 'text_print'), 'TEXT', value);
const binary = (w: Blockly.Workspace, op: string, a: Blockly.Block, c: Blockly.Block) => plug(plug(b(w, 'py_binary', { OP: op }), 'A', a), 'B', c);
function fn(w: Blockly.Workspace, name: string, params: string[] = []) { return defineFunction(w, { id: name, name, parameters: params.map(name => ({ id: `${name}-${Blockly.utils.idGenerator.genUid()}`, name })) }); }
function call(w: Blockly.Workspace, def: FunctionBlock, args: Blockly.Block[] = [], value = true) {
  const block = Blockly.serialization.blocks.append(callState(signatureOf(def.getProcedureModel()!), value), w);
  args.forEach((arg, i) => plug(block, `ARG_${def.signature.parameters[i].id}`, arg)); return block;
}
function execute(w: Blockly.Workspace) {
  const compiled = compile(w); expect(compiled.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return { ...compiled, ...spawnSync('python3', ['-c', compiled.source!], { encoding: 'utf8', timeout: 3000 }) };
}

describe('scoped Python functions', () => {
  it('does not overwrite a parameter when a repeat loop needs an internal counter', () => {
    const w = ws(); const f = fn(w, 'repeat_then_return', ['count']);
    const loop = plug(b(w, 'controls_repeat_ext'), 'TIMES', n(w, 3));
    plug(f, 'BODY', chain(loop, ret(w, get(w, parameterSymbol(f.signature.parameters[0].id)))));
    plug(b(w, 'py_program'), 'BODY', print(w, call(w, f, [n(w, 42)])));
    expect(execute(w).stdout).toBe('42\n');
  });
  it('keeps Python parameter names case sensitive instead of sharing Blockly names', () => {
    const w = ws(); const f = fn(w, 'difference', ['value', 'Value']); const [a, c] = f.signature.parameters;
    expect(f.signature.parameters.map(p => p.name)).toEqual(['value', 'Value']);
    plug(f, 'BODY', ret(w, binary(w, '-', get(w, parameterSymbol(a.id)), get(w, parameterSymbol(c.id)))));
    plug(b(w, 'py_program'), 'BODY', print(w, call(w, f, [n(w, 10), n(w, 3)])));
    expect(execute(w).stdout).toBe('7\n');
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(execute(restored).stdout).toBe('7\n');
  });
  it('isolates same-named parameters and locals, and rebinds only explicit project state', () => {
    const w = ws(); const a = fn(w, 'first', ['value']); const c = fn(w, 'second', ['value']);
    for (const [def, amount] of [[a, 1], [c, 10]] as const) {
      const local = createVariable(w, 'count', def.functionId).getId();
      plug(def, 'BODY', chain(set(w, local, binary(w, '+', get(w, parameterSymbol(def.signature.parameters[0].id)), n(w, amount))), ret(w, get(w, local))));
    }
    const project = createVariable(w, 'score').getId(); const update = fn(w, 'update_score');
    plug(update, 'BODY', set(w, project, binary(w, '+', get(w, project), n(w, 2))));
    plug(b(w, 'py_program'), 'BODY', chain(set(w, project, n(w, 5)), print(w, call(w, a, [n(w, 3)])), print(w, call(w, c, [n(w, 3)])), call(w, update, [], false), print(w, get(w, project))));
    const result = execute(w); expect(result.stdout).toBe('4\n13\n7\n');
    expect(result.source!.match(/global /g)).toHaveLength(1); expect(result.source).toContain('global score');
    expect(result.source).not.toContain('= None');
  });
  it('supports early return, fallthrough None, bare return, and recursive calls', () => {
    const w = ws(); const f = fn(w, 'factorial', ['number']); const p = parameterSymbol(f.signature.parameters[0].id);
    const condition = plug(plug(b(w, 'controls_if'), 'IF0', plug(plug(b(w, 'logic_compare', { OP: 'LTE' }), 'A', get(w, p)), 'B', n(w, 1))), 'DO0', ret(w, n(w, 1)));
    const recursiveCall = call(w, f, [binary(w, '-', get(w, p), n(w, 1))]);
    plug(f, 'BODY', chain(condition, ret(w, binary(w, '*', get(w, p), recursiveCall))));
    const empty = fn(w, 'empty_function'); const bare = fn(w, 'leave_now'); plug(bare, 'BODY', b(w, 'py_return'));
    plug(b(w, 'py_program'), 'BODY', chain(print(w, call(w, f, [n(w, 5)])), print(w, call(w, empty)), print(w, call(w, bare))));
    expect(execute(w).stdout).toBe('120\nNone\nNone\n');
  });
  it('preserves Python scope failures instead of reading a same-named project variable', () => {
    const w = ws(); const f = fn(w, 'calculate'); const local = createVariable(w, 'count', f.functionId).getId(); const project = createVariable(w, 'count').getId();
    plug(f, 'BODY', print(w, get(w, local)));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unbound-local' }));
    f.getInputTargetBlock('BODY')!.dispose();
    plug(f, 'BODY', chain(print(w, get(w, project)), set(w, local, n(w, 1))));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'scope-conflict' }));
    plug(b(w, 'py_program'), 'BODY', print(w, get(w, local)));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'out-of-scope' }));
  });
  it('supports mutual recursion and preserves runaway-recursion errors', () => {
    const w = ws(); const even = fn(w, 'is_even', ['number']); const odd = fn(w, 'is_odd', ['number']);
    for (const [current, other, answer] of [[even, odd, 'TRUE'], [odd, even, 'FALSE']] as const) {
      const parameter = parameterSymbol(current.signature.parameters[0].id);
      const condition = plug(plug(b(w, 'controls_if'), 'IF0', plug(plug(b(w, 'logic_compare', { OP: 'EQ' }), 'A', get(w, parameter)), 'B', n(w, 0))), 'DO0', ret(w, b(w, 'logic_boolean', { BOOL: answer })));
      plug(current, 'BODY', chain(condition, ret(w, call(w, other, [binary(w, '-', get(w, parameter), n(w, 1))]))));
    }
    const out = print(w, call(w, even, [n(w, 10)])); plug(b(w, 'py_program'), 'BODY', out);
    expect(execute(w).stdout).toBe('True\n');
    out.getInputTargetBlock('TEXT')!.dispose(); plug(out, 'TEXT', call(w, even, [n(w, -1)]));
    expect(execute(w).stderr).toContain('RecursionError');
  });
  it('leaves conditional assignment paths to native UnboundLocalError', () => {
    const w = ws(); const f = fn(w, 'calculate'); const count = createVariable(w, 'count', f.functionId).getId();
    const condition = plug(plug(b(w, 'controls_if'), 'IF0', b(w, 'logic_boolean', { BOOL: 'FALSE' })), 'DO0', set(w, count, n(w, 3)));
    plug(f, 'BODY', chain(condition, ret(w, get(w, count)))); plug(b(w, 'py_program'), 'BODY', print(w, call(w, f)));
    expect(execute(w).stderr).toContain('UnboundLocalError');
  });
  it('binds range targets and accumulators locally without global declarations', () => {
    const w = ws(); const f = fn(w, 'total_up_to', ['limit']);
    const total = createVariable(w, 'total', f.functionId).getId(); const index = createVariable(w, 'number', f.functionId).getId();
    const loop = b(w, 'py_scoped_range', { SYMBOL: index });
    plug(loop, 'START', n(w, 0)); plug(loop, 'STOP', get(w, parameterSymbol(f.signature.parameters[0].id))); plug(loop, 'STEP', n(w, 1));
    plug(loop, 'DO', set(w, total, binary(w, '+', get(w, total), get(w, index))));
    plug(f, 'BODY', chain(set(w, total, n(w, 0)), loop, ret(w, get(w, total))));
    plug(b(w, 'py_program'), 'BODY', print(w, call(w, f, [n(w, 5)])));
    const result = execute(w); expect(result.stdout).toBe('10\n'); expect(result.source).not.toContain('global');
  });
  it('maps errors in returned expressions and keeps calls unresolved after definition deletion', () => {
    const w = ws(); const f = fn(w, 'divide'); const returnBlock = ret(w, binary(w, '/', n(w, 1), n(w, 0))); plug(f, 'BODY', returnBlock);
    const caller = call(w, f); plug(b(w, 'py_program'), 'BODY', print(w, caller));
    const compiled = execute(w); expect(compiled.stderr).toContain('ZeroDivisionError');
    const line = compiled.source!.split('\n').findIndex(l => l.includes('return')) + 1;
    expect(blockForLine(compiled, 'program.py', line)).toBe(returnBlock.id);
    f.dispose(); expect(w.getBlockById(caller.id)).toBe(caller);
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-call', blockId: caller.id }));
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(compile(restored).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-call', blockId: caller.id }));
  });
});

describe('function editing and persistence', () => {
  it('diagnoses unsupported duplicate definitions without letting their deletion remove the original model', () => {
    const w = ws(); const f = fn(w, 'calculate');
    const state = Blockly.serialization.blocks.save(f)!; delete state.id;
    const duplicate = Blockly.serialization.blocks.append(state, w);
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'duplicate-function' }));
    duplicate.dispose(); expect(w.getProcedureMap().has(f.functionId)).toBe(true);
    expect(compile(w).source).toContain('def calculate():');
  });
  it('migrates legacy parameter and project bindings without changing execution', () => {
    const w = ws(); const score = w.getVariableMap().createVariable('score');
    const old = b(w, 'procedures_defreturn', { NAME: 'bump' });
    old.loadExtraState!({ params: [{ name: 'amount', id: 'legacy-amount' }] });
    const add = binary(w, '+', b(w, 'variables_get', { VAR: score.getId() }), b(w, 'variables_get', { VAR: 'legacy-amount' }));
    plug(old, 'STACK', plug(b(w, 'variables_set', { VAR: score.getId() }), 'VALUE', add));
    plug(old, 'RETURN', b(w, 'variables_get', { VAR: score.getId() }));
    const caller = b(w, 'procedures_callreturn'); caller.loadExtraState!({ name: 'bump', params: ['amount'] }); plug(caller, 'ARG0', n(w, 3));
    plug(b(w, 'py_program'), 'BODY', chain(plug(b(w, 'variables_set', { VAR: score.getId() }), 'VALUE', n(w, 5)), print(w, caller), print(w, b(w, 'variables_get', { VAR: score.getId() }))));
    const restored = ws();
    const migrated = prepareProject(JSON.stringify({ ...snapshot(w), languageVersion: 1 }));
    restore(restored, migrated.project);
    expect(migrated.project.languageVersion).toBe(19);
    expect(restored.getAllBlocks(false).some(b => b.type.startsWith('procedures_') || b.type.startsWith('variables_'))).toBe(false);
    const result = execute(restored);
    expect(result.stdout).toBe('8\n8\n'); expect(result.source).toContain('def bump(amount)');
    expect(result.source!.match(/global .*/g)).toEqual(['global score']);
  });
  it('preserves an incompatible legacy file instead of dropping extra call arguments', () => {
    const w = ws(); const definition = b(w, 'procedures_defreturn', { NAME: 'calculate' });
    definition.loadExtraState!({ params: [{ name: 'value', id: 'legacy-value' }] });
    const caller = b(w, 'procedures_callreturn'); caller.loadExtraState!({ name: 'calculate', params: ['value', 'extra'] });
    plug(caller, 'ARG0', n(w, 1)); plug(caller, 'ARG1', n(w, 2));
    const before = snapshot(w); const raw = JSON.stringify({ ...before, languageVersion: 1 });
    expect(() => prepareProject(raw)).toThrow('parameters do not match');
    expect(snapshot(w)).toEqual(before);
  });
  it('preserves connected argument identity through rename, reorder, save, and one-step undo', async () => {
    const w = ws(); const f = fn(w, 'difference', ['left', 'right']); const [left, right] = f.signature.parameters;
    plug(f, 'BODY', ret(w, binary(w, '-', get(w, parameterSymbol(left.id)), get(w, parameterSymbol(right.id)))));
    const caller = call(w, f, [n(w, 10), n(w, 3)]); plug(b(w, 'py_program'), 'BODY', print(w, caller));
    await flush(); w.clearUndo();
    editSignature(w, { id: f.functionId, name: 'subtract_values', parameters: [{ ...right, name: 'amount' }, left] }); await flush();
    expect(execute(w).stdout).toBe('7\n'); expect(compile(w).source).toContain('subtract_values(3, 10)');
    w.undo(false); await flush(); expect(execute(w).source).toContain('difference(10, 3)');
    w.undo(true); await flush(); expect(execute(w).stdout).toBe('7\n');
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(execute(restored).source).toBe(execute(w).source);
    expect((restored.getBlockById(f.id) as FunctionBlock).signature.parameters.map(p => p.id)).toEqual([right.id, left.id]);
  });
  it('keeps removed argument blocks recoverable and reconnects them on undo', async () => {
    const w = ws(); const f = fn(w, 'take', ['value']); const arg = n(w, 17); const caller = call(w, f, [arg]);
    arg.setShadow(true);
    await flush(); w.clearUndo();
    editSignature(w, { ...f.signature, parameters: [] }); await flush();
    expect(w.getBlockById(arg.id)).toBe(arg); expect(arg.getParent()).toBeNull();
    w.undo(false); await flush(); expect(arg.getParent()).toBe(caller); expect(arg.isShadow()).toBe(true);
    w.undo(true); await flush(); expect(arg.getParent()).toBeNull();
  });
  it('restores a deleted definition and its existing calls with undo', async () => {
    const w = ws(); const f = fn(w, 'take', ['value']); const arg = n(w, 17); const caller = call(w, f, [arg]);
    await flush(); w.clearUndo();
    const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(true); f.dispose(); Blockly.Events.setGroup(group); await flush();
    expect(w.getBlockById(caller.id)).toBe(caller); expect(caller.getInputTargetBlock(`ARG_${f.signature.parameters[0].id}`)).toBe(arg);
    w.undo(false); await flush(); expect(w.getBlockById(f.id)).not.toBeNull(); expect(w.getProcedureMap().has(f.functionId)).toBe(true);
  });
});
