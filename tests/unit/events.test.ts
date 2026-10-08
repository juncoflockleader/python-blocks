import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Blockly } from '../../src/blocks';
import { defineFunction, callState } from '../../src/blocks/core/functions';
import { allSymbols, createVariable, editSignature, handlerSignatures, parameterSymbol, reorderHandlers, signatureOf, type FunctionBlock, type Signature } from '../../src/language/functions';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { compile, blockForLine } from '../../src/language/compiler';
import { createWorkspace, snapshot, restore, prepareProject } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function b(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const block = w.newBlock(type); Object.entries(fields).forEach(([name, value]) => block.setFieldValue(value, name)); return block; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function op(w: Blockly.Workspace, type: string, inputs: Record<string, Blockly.Block>) { const block = b(w, type); Object.entries(inputs).forEach(([name, child]) => plug(block, name, child)); return block; }
function chain(...blocks: Blockly.Block[]) { blocks.slice(1).forEach((block, i) => blocks[i].nextConnection!.connect(block.previousConnection!)); return blocks[0]; }
const n = (w: Blockly.Workspace, value: number) => b(w, 'py_number', { VALUE: String(value) });
const text = (w: Blockly.Workspace, value: string) => b(w, 'text', { TEXT: value });
const get = (w: Blockly.Workspace, id: string) => b(w, 'py_get', { SYMBOL: id });
const set = (w: Blockly.Workspace, id: string, value: Blockly.Block) => plug(b(w, 'py_set', { SYMBOL: id }), 'VALUE', value);
const print = (w: Blockly.Workspace, value: Blockly.Block) => op(w, 'text_print', { TEXT: value });
const wait = (w: Blockly.Workspace) => op(w, 'py_wait', { SECONDS: n(w, 0) });
const handler = (w: Blockly.Workspace, name: string, order: number, event = 'start') => defineFunction(w, { id: name, name, async: true, parameters: [{ id: `${name}-payload`, name: 'payload' }], handler: { event, order } });
const call = (w: Blockly.Workspace, fn: FunctionBlock, args: Blockly.Block[] = [], value = true) => {
  const block = Blockly.serialization.blocks.append(callState(fn.signature, value), w);
  args.forEach((arg, index) => plug(block, `ARG_${fn.signature.parameters[index].id}`, arg)); return block;
};
function execute(w: Blockly.Workspace) {
  const compilation = compile(w); expect(compilation.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  // Finish this test host once all explicitly zero-waiting activities are idle.
  // The product host deliberately keeps that same session alive for input.
  const script = `import asyncio, importlib.util, json, sys, types
sys.path.insert(0, ${JSON.stringify(path.resolve('src/runtime'))})
spec = importlib.util.spec_from_file_location('_playground_events', ${JSON.stringify(path.resolve('src/runtime/events.py'))})
runtime = importlib.util.module_from_spec(spec)
sys.modules['_playground_events'] = runtime
spec.loader.exec_module(runtime)
sys.modules['_playground_host'] = types.SimpleNamespace(emit=lambda value: None)
from execution import run_event_program
async def main():
    task = asyncio.create_task(run_event_program(sys.stdin.read()))
    for _ in range(1000):
        await asyncio.sleep(0)
        if task.done():
            return await task
        session = runtime.events
        if session.state == 'running' and not session._queue and not session._tasks:
            task.cancel()
            await task
            return json.dumps({'type': 'done'})
    task.cancel()
    await task
    raise AssertionError('Event fixture did not reach idle state')
sys.stderr.write(asyncio.run(main()))
`;
  const result = spawnSync('python3', ['-c', script], { encoding: 'utf8', input: compilation.source!, timeout: 3000 });
  expect(result.status).toBe(0);
  return { compilation, stdout: result.stdout, result: JSON.parse(result.stderr) };
}

describe('event compilation and Python semantics', () => {
  it('runs handler-only projects in saved order and awaits nested returned values', () => {
    const w = ws(); const first = handler(w, 'first', 1); const second = handler(w, 'second', 0);
    const helper = defineFunction(w, { id: 'double', name: 'double_value', async: true, parameters: [{ id: 'value', name: 'value' }] });
    const product = op(w, 'py_binary', { A: get(w, parameterSymbol('value')), B: n(w, 2) }); product.setFieldValue('*', 'OP');
    plug(helper, 'BODY', chain(wait(w), op(w, 'py_return_value', { VALUE: product })));
    plug(first, 'BODY', chain(print(w, text(w, 'first')), print(w, op(w, 'py_binary', { A: call(w, helper, [n(w, 21)]), B: n(w, 1) }))));
    plug(second, 'BODY', print(w, text(w, 'second')));
    const result = execute(w);
    expect(result.compilation).toMatchObject({ hasEntry: true, executionMode: 'events' }); expect(result.result.type).toBe('done');
    expect(result.stdout).toBe('second\nfirst\n43\n');
    expect(result.compilation.source).toContain('await double_value(21)');
    first.moveBy(-700, -700); second.moveBy(900, 900);
    expect(compile(w).source).toBe(result.compilation.source);
  });

  it('initializes project state before dispatch and preserves independent payload copies', () => {
    const w = ws(); const items = createVariable(w, 'items').getId();
    const literal = b(w, 'lists_create_with'); literal.loadExtraState!({ itemCount: 1 }); plug(literal, 'ADD0', n(w, 1));
    plug(b(w, 'py_program'), 'BODY', chain(set(w, items, literal), op(w, 'py_emit', { EVENT: text(w, 'message'), PAYLOAD: get(w, items) }), op(w, 'py_list_append', { LIST: get(w, items), VALUE: n(w, 99) })));
    const first = handler(w, 'first', 0, 'message'); const second = handler(w, 'second', 1, 'message');
    const payload = (h: FunctionBlock) => get(w, parameterSymbol(h.signature.parameters[0].id));
    plug(first, 'BODY', chain(op(w, 'py_list_append', { LIST: payload(first), VALUE: n(w, 7) }), print(w, payload(first)), print(w, get(w, items))));
    plug(second, 'BODY', print(w, payload(second)));
    const result = execute(w); expect(result.stdout).toBe('[1, 7]\n[1, 99]\n[1]\n');
    expect(result.compilation.source).not.toContain('global');
    expect(result.compilation.source!.indexOf('items = [1]')).toBeLessThan(result.compilation.source!.indexOf('events.on('));
  });

  it('maps a failure after an await to the original statement', () => {
    const w = ws(); const h = handler(w, 'broken', 0);
    const divide = op(w, 'py_binary', { A: n(w, 1), B: n(w, 0) }); divide.setFieldValue('/', 'OP');
    const out = print(w, divide); plug(h, 'BODY', chain(wait(w), out));
    const result = execute(w); expect(result.result.exceptionType).toBe('ZeroDivisionError');
    const frame = result.result.frames.at(-1);
    expect(blockForLine(result.compilation, frame.file, frame.line)).toBe(out.id);
    const registrationLine = result.compilation.source!.split('\n').findIndex(line => line.startsWith('events.on')) + 1;
    expect(blockForLine(result.compilation, 'program.py', registrationLine)).toBe(h.id);
  });

  it('requires explicit async contexts without converting synchronous callers', () => {
    const w = ws(); const helper = defineFunction(w, { id: 'waiter', name: 'waiter', parameters: [] }); plug(helper, 'BODY', wait(w));
    const syncCaller = defineFunction(w, { id: 'caller', name: 'caller', parameters: [] }); plug(syncCaller, 'BODY', call(w, helper, [], false));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'wait-context' }));
    editSignature(w, { ...helper.signature, async: true });
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-call-context' }));
    expect(syncCaller.signature.async).toBeUndefined();
    editSignature(w, { ...syncCaller.signature, async: true });
    expect(compile(w).diagnostics.some(d => d.severity === 'error')).toBe(false);
    plug(b(w, 'py_program'), 'BODY', call(w, syncCaller, [], false));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-call-context' }));
  });

  it('diagnoses handler calls, escaped payloads, reserved emission, and missing values', () => {
    const w = ws(); const h = handler(w, 'receive', 0); const other = defineFunction(w, { id: 'other', name: 'other', parameters: [] });
    plug(other, 'BODY', print(w, get(w, parameterSymbol(h.signature.parameters[0].id))));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'out-of-scope' }));
    plug(h, 'BODY', call(w, h, [b(w, 'py_none')], false));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'handler-call' }));
    h.getInputTargetBlock('BODY')!.dispose(); const emit = op(w, 'py_emit', { EVENT: text(w, 'start') }); plug(h, 'BODY', emit);
    const errors = compile(w).diagnostics;
    expect(errors).toContainEqual(expect.objectContaining({ code: 'reserved-event' }));
    expect(errors).toContainEqual(expect.objectContaining({ code: 'missing-input', input: 'PAYLOAD' }));
  });
});

describe('durable event and async editing', () => {
  it('preserves handler ordering, payload identity, locals, and names across edit/undo/copy/reload', async () => {
    const w = ws(); const first = handler(w, 'first', 0); const second = handler(w, 'second', 1);
    const local = createVariable(w, 'count', first.functionId).getId(); const payloadId = parameterSymbol(first.signature.parameters[0].id);
    plug(first, 'BODY', chain(set(w, local, get(w, payloadId)), print(w, get(w, local)))); plug(second, 'BODY', print(w, text(w, 'second')));
    await flush(); w.clearUndo(); reorderHandlers(w, ['second', 'first']); await flush();
    expect(handlerSignatures(w).map(h => h.id)).toEqual(['second', 'first']);
    w.undo(false); await flush(); expect(handlerSignatures(w).map(h => h.id)).toEqual(['first', 'second']);
    w.undo(true); await flush(); expect(handlerSignatures(w).map(h => h.id)).toEqual(['second', 'first']);
    const next: Signature = { ...first.signature, name: 'renamed', parameters: [{ ...first.signature.parameters[0], name: 'data' }], handler: { ...first.signature.handler!, event: 'message' } };
    editSignature(w, next); await flush(); expect(first.getDescendants(false).find(b => b.type === 'py_get')!.getField('SYMBOL')!.getText()).toContain('data');
    expect(allSymbols(w).find(s => s.id === payloadId)?.name).toBe('data');
    w.clearUndo(); const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(first)!) as FunctionBlock; await flush();
    expect(copy.type).toBe('py_handler'); expect(copy.signature.async).toBe(true); expect(copy.signature.handler).toEqual({ event: 'message', order: 2 });
    expect(copy.signature.parameters[0].id).not.toBe(first.signature.parameters[0].id);
    expect(allSymbols(w).find(s => s.owner === copy.functionId && s.kind === 'local')?.id).not.toBe(local);
    const id = copy.id; const signature = structuredClone(copy.signature);
    w.undo(false); await flush(); expect(w.getBlockById(id)).toBeNull();
    w.undo(true); await flush(); expect((w.getBlockById(id) as FunctionBlock).signature).toEqual(signature);
    const saved = snapshot(w); expect(saved.languageVersion).toBe(19);
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(saved)).project);
    expect(compile(restored).source).toBe(compile(w).source);
    expect(handlerSignatures(restored)).toEqual(handlerSignatures(w));
  });

  it('updates call labels for async edits and restores them through undo and persistence', async () => {
    const w = ws(); const fn = defineFunction(w, { id: 'helper', name: 'helper', parameters: [] });
    const h = handler(w, 'start_handler', 0); const caller = call(w, fn, [], false); plug(h, 'BODY', caller);
    await flush(); w.clearUndo(); editSignature(w, { ...fn.signature, async: true }); await flush();
    expect(caller.getFieldValue('ACTION')).toBe('await call'); expect(compile(w).source).toContain('await helper()');
    w.undo(false); await flush(); expect(caller.getFieldValue('ACTION')).toBe('call'); expect(compile(w).source).not.toContain('await helper()');
    w.undo(true); await flush();
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(fn)!) as FunctionBlock; expect(copy.signature.async).toBe(true);
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(signatureOf(restored.getProcedureMap().get('helper')!).async).toBe(true);
  });

  it('detects duplicate handler positions and repairs them with explicit reordering', () => {
    const w = ws(); handler(w, 'one', 0); handler(w, 'two', 0);
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'handler-order' }));
    reorderHandlers(w, ['two', 'one']); expect(compile(w).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  });

  it('keeps version-3 functions synchronous and rejects malformed execution metadata before restore', () => {
    const w = ws(); defineFunction(w, { id: 'old', name: 'old', parameters: [] }); const old = { ...snapshot(w), languageVersion: 3 };
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(old)).project);
    expect(signatureOf(restored.getProcedureMap().get('old')!).async).toBeUndefined();
    const invalid = snapshot(w); invalid.workspace.procedures[0].async = 'maybe';
    const before = snapshot(restored); expect(() => restore(restored, invalid)).toThrow('async function setting'); expect(snapshot(restored)).toEqual(before);
  });
});
