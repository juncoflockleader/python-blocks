import { afterEach, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { defineFunction, callState } from '../../src/blocks/core/functions';
import { allSymbols, createVariable, editSignature, parameterSymbol, type FunctionBlock } from '../../src/language/functions';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { compile } from '../../src/language/compiler';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const b = w.newBlock(type); Object.entries(fields).forEach(([name, value]) => b.setFieldValue(value, name)); return b; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
const num = (w: Blockly.Workspace, n: number) => block(w, 'py_number', { VALUE: String(n) });
const get = (w: Blockly.Workspace, id: string) => block(w, 'py_get', { SYMBOL: id });
const output = (w: Blockly.Workspace, value: Blockly.Block) => plug(block(w, 'text_print'), 'TEXT', value);
const returns = (w: Blockly.Workspace, value: Blockly.Block) => plug(block(w, 'py_return_value'), 'VALUE', value);
const binary = (w: Blockly.Workspace, op: string, a: Blockly.Block, b: Blockly.Block) => plug(plug(block(w, 'py_binary', { OP: op }), 'A', a), 'B', b);
function call(w: Blockly.Workspace, fn: FunctionBlock, argument?: Blockly.Block) { const b = Blockly.serialization.blocks.append(callState(fn.signature, true), w); if (argument) plug(b, `ARG_${fn.signature.parameters[0].id}`, argument); return b; }
function execute(w: Blockly.Workspace) { const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]); const run = spawnSync('python3', ['-c', result.source!], { encoding: 'utf8', timeout: 3000 }); expect(run.stderr).toBe(''); return run.stdout; }
function example(w: Blockly.Workspace) {
  const helper = defineFunction(w, { id: 'helper-id', name: 'helper', parameters: [] }); plug(helper, 'BODY', returns(w, num(w, 7)));
  const f = defineFunction(w, { id: 'function-id', name: 'total_to', parameters: [{ id: 'number-param', name: 'number' }] });
  const total = createVariable(w, 'total', f.functionId).getId(); const offset = createVariable(w, 'offset').getId();
  const initialize = plug(block(w, 'py_set', { SYMBOL: total }), 'VALUE', get(w, parameterSymbol('number-param')));
  const condition = plug(plug(block(w, 'controls_if'), 'IF0', plug(plug(block(w, 'logic_compare', { OP: 'LTE' }), 'A', get(w, parameterSymbol('number-param'))), 'B', num(w, 0))), 'DO0', returns(w, binary(w, '+', get(w, offset), call(w, helper))));
  initialize.nextConnection!.connect(condition.previousConnection!);
  condition.nextConnection!.connect(returns(w, binary(w, '+', get(w, total), call(w, f, binary(w, '-', get(w, parameterSymbol('number-param')), num(w, 1))))).previousConnection!);
  plug(f, 'BODY', initialize); return { f, helper, total, offset };
}

it('duplicates a recursive function with new local/parameter IDs and preserves external targets', async () => {
  const w = ws(); const { f, total, offset, helper } = example(w); const original = Blockly.serialization.blocks.save(f)!;
  await flush(); w.clearUndo();
  const copied = pasteBlockCopy(w, original) as FunctionBlock; await flush();
  expect(copied.functionId).not.toBe(f.functionId); expect(copied.signature.name).toBe('total_to_copy');
  expect(copied.signature.parameters[0].id).not.toBe('number-param');
  const local = allSymbols(w).find(s => s.owner === copied.functionId && s.kind === 'local')!;
  expect(local.name).toBe('total'); expect(local.id).not.toBe(total);
  const calls = copied.getDescendants(false).filter(b => b.type === 'py_call_value') as FunctionBlock[];
  expect(calls.map(b => b.functionId).sort()).toEqual([copied.functionId, helper.functionId].sort());
  const ids = copied.getDescendants(false).map(b => b.id);
  expect(ids.some(id => f.getDescendants(false).some(b => b.id === id))).toBe(false);
  expect(Blockly.serialization.blocks.save(f)).toEqual(original);
  const copiedId = copied.functionId; const blockId = copied.id;
  w.undo(false); await flush(); expect(w.getBlockById(blockId)).toBeNull(); expect(w.getProcedureMap().has(copiedId)).toBe(false);
  expect(allSymbols(w).some(s => s.owner === copiedId)).toBe(false);
  w.undo(true); await flush(); expect((w.getBlockById(blockId) as FunctionBlock).functionId).toBe(copiedId);
  const init = plug(block(w, 'py_set', { SYMBOL: offset }), 'VALUE', num(w, 8));
  const printOriginal = output(w, call(w, f, num(w, 3))); const printCopy = output(w, call(w, w.getBlockById(blockId) as FunctionBlock, num(w, 3)));
  init.nextConnection!.connect(printOriginal.previousConnection!); printOriginal.nextConnection!.connect(printCopy.previousConnection!); plug(block(w, 'py_program'), 'BODY', init);
  expect(execute(w)).toBe('21\n21\n');
  const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project); expect(execute(restored)).toBe('21\n21\n');
});

it('pastes between projects without rebinding external names or losing missing-reference labels', () => {
  const source = ws(); const { f } = example(source); const target = ws();
  const unrelated = defineFunction(target, { id: 'other-helper', name: 'helper', parameters: [] }); plug(unrelated, 'BODY', returns(target, num(target, 99)));
  createVariable(target, 'offset');
  const copy = pasteBlockCopy(target, Blockly.serialization.blocks.save(f)!) as FunctionBlock;
  expect(copy.signature.name).toBe('total_to');
  const errors = compile(target).diagnostics;
  expect(errors).toContainEqual(expect.objectContaining({ code: 'unresolved-call' }));
  expect(errors).toContainEqual(expect.objectContaining({ code: 'unresolved-symbol' }));
  const missing = copy.getDescendants(false).find(b => b.type === 'py_get' && String(b.getField('SYMBOL')?.getText()).includes('offset'))!;
  expect(missing).toBeDefined(); expect(missing.getField('SYMBOL')!.getText()).toContain('unavailable');
  const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(target))).project);
  expect(restored.getBlockById(missing.id)!.getField('SYMBOL')!.getText()).toContain('offset');
});

it('keeps a copied call bound by ID after rename and preserves arguments removed since copying', () => {
  const w = ws(); const f = defineFunction(w, { id: 'f', name: 'take', parameters: [{ id: 'p', name: 'value' }] });
  const caller = call(w, f, num(w, 42)); const saved = Blockly.serialization.blocks.save(caller)!;
  editSignature(w, { id: 'f', name: 'renamed', parameters: [] });
  const copied = pasteBlockCopy(w, saved) as FunctionBlock;
  expect(copied.functionId).toBe('f'); expect(copied.signature.name).toBe('renamed');
  expect(copied.inputList.filter(input => input.name.startsWith('ARG_'))).toHaveLength(0);
  expect(w.getTopBlocks(false).filter(b => b.type === 'py_number' && b.getFieldValue('VALUE') === '42')).toHaveLength(2);
});

it('preserves same-spelled locals in different functions and case-sensitive variables through rename/undo/save', async () => {
  const w = ws(); const lower = createVariable(w, 'count'); const upper = createVariable(w, 'Count');
  expect(lower.getId()).not.toBe(upper.getId());
  const assign = plug(block(w, 'py_set', { SYMBOL: lower.getId() }), 'VALUE', num(w, 1));
  const second = plug(block(w, 'py_set', { SYMBOL: upper.getId() }), 'VALUE', num(w, 2)); assign.nextConnection!.connect(second.previousConnection!);
  second.nextConnection!.connect(output(w, binary(w, '+', get(w, lower.getId()), get(w, upper.getId()))).previousConnection!); plug(block(w, 'py_program'), 'BODY', assign);
  await flush(); w.clearUndo(); w.getVariableMap().renameVariable(upper, 'COUNT'); await flush();
  expect(execute(w)).toBe('3\n'); w.undo(false); await flush(); expect(upper.getName()).toBe('Count');
  const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project); expect(execute(restored)).toBe('3\n');
});
