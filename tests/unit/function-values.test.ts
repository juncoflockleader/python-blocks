import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { Blockly } from '../../src/blocks';
import { callState, defineFunction, referenceState } from '../../src/blocks/core/functions';
import { compile, blockForLine } from '../../src/language/compiler';
import { createVariable, editSignature, parameterSymbol, type FunctionBlock } from '../../src/language/functions';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { exportModule, importModule } from '../../src/language/module-format';
import { moduleReferenceState, moduleState, renameModule, removeModule, type ModuleCallBlock } from '../../src/language/modules';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const b = w.newBlock(type); Object.entries(fields).forEach(([k, v]) => b.setFieldValue(v, k)); return b; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function op(w: Blockly.Workspace, type: string, inputs: Record<string, Blockly.Block>) { const b = block(w, type); Object.entries(inputs).forEach(([k, v]) => plug(b, k, v)); return b; }
function chain(...blocks: Blockly.Block[]) { blocks.slice(1).forEach((b, i) => blocks[i].nextConnection!.connect(b.previousConnection!)); return blocks[0]; }
const num = (w: Blockly.Workspace, n: number) => block(w, 'py_number', { VALUE: String(n) });
const get = (w: Blockly.Workspace, id: string) => block(w, 'py_get', { SYMBOL: id });
const ref = (w: Blockly.Workspace, fn: FunctionBlock) => Blockly.serialization.blocks.append(referenceState(fn.signature), w) as FunctionBlock;
const print = (w: Blockly.Workspace, v: Blockly.Block) => op(w, 'text_print', { TEXT: v });
const ret = (w: Blockly.Workspace, v: Blockly.Block) => op(w, 'py_return_value', { VALUE: v });
function fn(w: Blockly.Workspace, name: string, params: string[] = []) { return defineFunction(w, { id: name, name, parameters: params.map(p => ({ id: `${name}-${p}`, name: p })) }); }
function call(w: Blockly.Workspace, fn: FunctionBlock, args: Blockly.Block[] = []) {
  const b = Blockly.serialization.blocks.append(callState(fn.signature, true), w);
  args.forEach((v, i) => plug(b, `ARG_${fn.signature.parameters[i].id}`, v)); return b;
}
function dynamic(w: Blockly.Workspace, target: Blockly.Block, args: Blockly.Block[] = [], value = true) {
  const b = block(w, value ? 'py_dynamic_call_value' : 'py_dynamic_call'); b.loadExtraState!({ argumentCount: args.length }); plug(b, 'CALLABLE', target);
  args.forEach((v, i) => plug(b, `ARG${i}`, v)); return b;
}
function difference(w: Blockly.Workspace) {
  const f = fn(w, 'difference', ['left', 'right']);
  const expression = op(w, 'py_binary', { A: get(w, parameterSymbol('difference-left')), B: get(w, parameterSymbol('difference-right')) }); expression.setFieldValue('-', 'OP');
  plug(f, 'BODY', ret(w, expression)); return f;
}
function execute(w: Blockly.Workspace) {
  const compilation = compile(w); expect(compilation.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const script = `import json,sys\nsys.path.insert(0, ${JSON.stringify(path.resolve('src/runtime'))})\nfrom execution import run_program\ndata=json.load(sys.stdin)\nsys.stderr.write(run_program(data['source'], data['files']))`;
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify(compilation), encoding: 'utf8', timeout: 3000 });
  expect(result.status).toBe(0); return { compilation, stdout: result.stdout, result: JSON.parse(result.stderr) };
}

describe('synchronous function values', () => {
  it('assigns, passes, returns, and stores ordinary functions in collections', () => {
    const w = ws(); const f = difference(w); const apply = fn(w, 'apply_operation', ['operation', 'left', 'right']);
    plug(apply, 'BODY', ret(w, dynamic(w, get(w, parameterSymbol('apply_operation-operation')), ['left', 'right'].map(p => get(w, parameterSymbol(`apply_operation-${p}`))))));
    const factory = fn(w, 'choose_operation'); plug(factory, 'BODY', ret(w, ref(w, f)));
    const operation = createVariable(w, 'operation').getId();
    const assign = plug(block(w, 'py_set', { SYMBOL: operation }), 'VALUE', ref(w, f));
    const list = block(w, 'lists_create_with'); list.loadExtraState!({ itemCount: 1 }); plug(list, 'ADD0', ref(w, f));
    const dictionary = block(w, 'py_dict'); dictionary.loadExtraState!({ itemCount: 1 }); plug(dictionary, 'KEY0', block(w, 'text', { TEXT: 'operation' })); plug(dictionary, 'VALUE0', ref(w, f));
    const equal = op(w, 'logic_compare', { A: get(w, operation), B: ref(w, f) }); equal.setFieldValue('EQ', 'OP');
    plug(block(w, 'py_program'), 'BODY', chain(assign,
      print(w, call(w, apply, [get(w, operation), num(w, 10), num(w, 3)])),
      print(w, dynamic(w, call(w, factory), [num(w, 12), num(w, 4)])),
      print(w, dynamic(w, op(w, 'py_item_get', { COLLECTION: list, KEY: num(w, 0) }), [num(w, 14), num(w, 5)])),
      print(w, dynamic(w, op(w, 'py_item_get', { COLLECTION: dictionary, KEY: block(w, 'text', { TEXT: 'operation' }) }), [num(w, 16), num(w, 6)])),
      print(w, equal)));
    const result = execute(w); expect(result.stdout).toBe('7\n8\n9\n10\nTrue\n'); expect(result.result.type).toBe('done');
    const reloaded = ws(); restore(reloaded, prepareProject(JSON.stringify(snapshot(w))).project); expect(execute(reloaded).stdout).toBe(result.stdout);
  });

  it('evaluates the callee and each argument once, left to right, with statement and value calls', () => {
    const w = ws(); const f = difference(w); const chooser = fn(w, 'choose_operation');
    plug(chooser, 'BODY', chain(print(w, num(w, 1)), ret(w, ref(w, f))));
    const record = fn(w, 'record', ['value']); plug(record, 'BODY', chain(print(w, get(w, parameterSymbol('record-value'))), ret(w, get(w, parameterSymbol('record-value')))));
    plug(block(w, 'py_program'), 'BODY', chain(print(w, dynamic(w, call(w, chooser), [call(w, record, [num(w, 10)]), call(w, record, [num(w, 3)])])), dynamic(w, ref(w, record), [num(w, 9)], false)));
    expect(execute(w).stdout).toBe('1\n10\n3\n7\n9\n');
  });

  it('retains reference identity through rename, signature edits, deletion, undo, copy, and reload', async () => {
    const w = ws(); const f = difference(w); const reference = ref(w, f); const caller = dynamic(w, reference, [num(w, 10), num(w, 3)]);
    plug(block(w, 'py_program'), 'BODY', print(w, caller)); await flush(); w.clearUndo();
    editSignature(w, { ...f.signature, name: 'subtract_values', parameters: [...f.signature.parameters].reverse() }); await flush();
    expect(reference.inputList).toHaveLength(1); expect(reference.getFieldValue('NAME')).toBe('subtract_values');
    // Dynamic arguments stay positional, unlike signature-aware direct calls.
    expect(execute(w).stdout).toBe('-7\n'); expect(compile(w).source).toContain('(subtract_values)(10, 3)');
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('7\n');
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(reference)!) as FunctionBlock; expect(copy.functionId).toBe(f.functionId); copy.dispose();
    await flush(); w.clearUndo(); Blockly.Events.setGroup(true); f.dispose(); Blockly.Events.setGroup(false); await flush();
    expect(w.getBlockById(reference.id)).toBe(reference); expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-call', blockId: reference.id }));
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('7\n');
    const reloaded = ws(); restore(reloaded, snapshot(w)); expect(execute(reloaded).stdout).toBe('7\n');
  });

  it('remaps self references in copied definitions without retargeting external functions', () => {
    const w = ws(); const f = fn(w, 'return_self'); plug(f, 'BODY', ret(w, ref(w, f)));
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(f, { doFullSerialization: true })!) as FunctionBlock;
    const copiedReference = copy.getInputTargetBlock('BODY')!.getInputTargetBlock('VALUE')! as FunctionBlock;
    expect(copiedReference.functionId).toBe(copy.functionId); expect(copy.functionId).not.toBe(f.functionId);
    const equality = op(w, 'logic_compare', { A: call(w, copy), B: ref(w, copy) }); equality.setFieldValue('EQ', 'OP');
    plug(block(w, 'py_program'), 'BODY', print(w, equality)); expect(execute(w).stdout).toBe('True\n');
    const other = ws(); const detached = pasteBlockCopy(other, Blockly.serialization.blocks.save(ref(w, f))!) as FunctionBlock;
    plug(block(other, 'py_program'), 'BODY', print(other, detached)); expect(compile(other).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-call' }));
  });

  it('reports native arity and non-callable errors at the dynamic call statement', () => {
    for (const arity of [true, false]) {
      const w = ws(); const f = difference(w); const variable = createVariable(w, 'operation').getId();
      const caller = dynamic(w, arity ? ref(w, f) : get(w, variable), [num(w, 1)], false);
      plug(block(w, 'py_program'), 'BODY', chain(plug(block(w, 'py_set', { SYMBOL: variable }), 'VALUE', num(w, 12)), caller));
      const { result, compilation } = execute(w); expect(result.exceptionType).toBe('TypeError');
      expect(result.message).toContain(arity ? 'argument' : 'not callable');
      const frame = result.frames.at(-1); expect(blockForLine(compilation, frame.file, frame.line)).toBe(caller.id);
    }
  });

  it('rejects incomplete dynamic calls and malformed counts before running or replacing a project', () => {
    const w = ws(); const caller = block(w, 'py_dynamic_call'); plug(block(w, 'py_program'), 'BODY', caller);
    expect(compile(w).diagnostics.filter(d => d.code === 'missing-input').map(d => d.input)).toEqual(['CALLABLE', 'ARG0']);
    const before = snapshot(w); const bad = structuredClone(before); bad.workspace.blocks.blocks[0].inputs.BODY.block.extraState.argumentCount = 101;
    const group = Blockly.Events.getGroup(); const recordUndo = Blockly.Events.getRecordUndo();
    expect(() => restore(w, bad)).toThrow('between 0 and 100'); expect(snapshot(w)).toEqual(before);
    expect(Blockly.Events.getRecordUndo()).toBe(recordUndo); expect(Blockly.Events.getGroup()).toBe(group);
  });

  it('rejects shadowed names, handler references, and async values even in async contexts', () => {
    const w = ws(); const target = fn(w, 'calculate'); const outer = fn(w, 'outer', ['calculate']); const reference = ref(w, target); plug(outer, 'BODY', ret(w, reference));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'shadowed-function', blockId: reference.id }));
    editSignature(w, { ...outer.signature, async: true, parameters: [] }); editSignature(w, { ...target.signature, async: true });
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-function-value', blockId: reference.id }));
    const handler = defineFunction(w, { id: 'handler', name: 'on_start', parameters: [{ id: 'payload', name: 'payload' }], async: true, handler: { event: 'start', order: 0 } });
    plug(handler, 'BODY', print(w, ref(w, handler))); expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'handler-call' }));
    const bundle = exportModule(w, { name: 'async_helpers', functions: [target.functionId] }); const consumer = ws(); const binding = importModule(consumer, bundle, 'helpers');
    const imported = Blockly.serialization.blocks.append(moduleReferenceState(binding, target.signature), consumer);
    plug(block(consumer, 'py_program'), 'BODY', print(consumer, imported)); expect(compile(consumer).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-function-value' }));
  });

  it('transfers private helpers referenced as values and imported higher-order functions', () => {
    const donor = ws(); const helper = difference(donor); const factory = fn(donor, 'choose_operation'); plug(factory, 'BODY', ret(donor, ref(donor, helper)));
    const apply = fn(donor, 'apply_operation', ['operation']); plug(apply, 'BODY', ret(donor, dynamic(donor, get(donor, parameterSymbol('apply_operation-operation')), [num(donor, 10), num(donor, 3)])));
    const bundle = exportModule(donor, { name: 'operations', functions: [factory.functionId, apply.functionId] });
    expect(bundle.definitions[0].workspace.blocks.blocks).toHaveLength(3); expect(bundle.definitions[0].exports).toHaveLength(2);
    const consumer = ws(); const binding = importModule(consumer, bundle, 'helpers');
    const imported = (f: FunctionBlock) => Blockly.serialization.blocks.append(moduleReferenceState(binding, f.signature), consumer);
    plug(block(consumer, 'py_program'), 'BODY', print(consumer, dynamic(consumer, imported(apply), [dynamic(consumer, imported(factory))])));
    expect(execute(consumer).stdout).toBe('7\n');
    const saved = snapshot(consumer); const restored = ws(); restore(restored, saved); expect(execute(restored).stdout).toBe('7\n');
    helper.dispose(); expect(() => exportModule(donor, { name: 'broken', functions: [factory.functionId] })).toThrow('missing');
  });

  it('follows imported references into transitive module dependencies', () => {
    const base = ws(); const helper = difference(base); const baseBundle = exportModule(base, { name: 'base', functions: [helper.functionId] });
    const donor = ws(); const dependency = importModule(donor, baseBundle, 'base'); const factory = fn(donor, 'choose_operation');
    plug(factory, 'BODY', ret(donor, Blockly.serialization.blocks.append(moduleReferenceState(dependency, helper.signature), donor)));
    const bundle = exportModule(donor, { name: 'factory', functions: [factory.functionId] }); expect(bundle.definitions).toHaveLength(2);
    const consumer = ws(); const binding = importModule(consumer, bundle, 'tools');
    const reference = Blockly.serialization.blocks.append(moduleReferenceState(binding, factory.signature), consumer);
    plug(block(consumer, 'py_program'), 'BODY', print(consumer, dynamic(consumer, dynamic(consumer, reference), [num(consumer, 12), num(consumer, 5)])));
    expect(execute(consumer).stdout).toBe('7\n');
  });

  it('preserves pinned references through alias editing, removal, undo, and cross-project copy', async () => {
    const donor = ws(); const helper = difference(donor); const bundle = exportModule(donor, { name: 'operations', functions: [helper.functionId] });
    const w = ws(); const binding = importModule(w, bundle, 'tools');
    const reference = Blockly.serialization.blocks.append(moduleReferenceState(binding, helper.signature), w) as ModuleCallBlock;
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, reference, [num(w, 10), num(w, 3)])));
    await flush(); w.clearUndo(); renameModule(w, binding.id, 'helpers'); await flush();
    expect(reference.getFieldValue('NAME')).toBe('helpers.difference'); expect(reference.inputList).toHaveLength(1); expect(execute(w).stdout).toBe('7\n');
    w.undo(false); await flush(); expect(reference.getFieldValue('NAME')).toBe('tools.difference');
    const saved = Blockly.serialization.blocks.save(reference)!; w.clearUndo(); removeModule(w, binding.id); await flush();
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-module-call' }));
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('7\n');
    const consumer = ws(); const copy = pasteBlockCopy(consumer, saved) as ModuleCallBlock;
    plug(block(consumer, 'py_program'), 'BODY', print(consumer, dynamic(consumer, copy, [num(consumer, 8), num(consumer, 3)])));
    expect(compile(consumer).source).toBeNull(); const repaired = importModule(consumer, bundle, 'tools'); expect(repaired.id).toBe(binding.id); expect(execute(consumer).stdout).toBe('5\n');
    const aliasConsumer = ws(); const alias = importModule(aliasConsumer, bundle, 'renamed');
    expect((pasteBlockCopy(aliasConsumer, saved) as ModuleCallBlock).moduleCall.importId).toBe(alias.id);
    const shadowing = fn(w, 'outer', ['tools']); reference.unplug(); plug(shadowing, 'BODY', ret(w, reference));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'shadowed-module' }));
  });

  it('reorders and removes dynamic arguments without detaching the callable or losing shadow values', () => {
    const w = ws(); const f = difference(w); const reference = ref(w, f); const left = num(w, 10); const right = num(w, 3); left.setShadow(true); right.setShadow(true);
    const caller = dynamic(w, reference, [left, right]);
    const mutator = ws(); const container = block(mutator, 'py_call_arguments'); const a = block(mutator, 'py_call_argument'); const b = block(mutator, 'py_call_argument');
    plug(container, 'ARGUMENTS', chain(a, b)); (caller as any).saveConnections(container);
    b.unplug(); a.unplug(); plug(container, 'ARGUMENTS', chain(b, a)); (caller as any).compose(container);
    expect(caller.getInputTargetBlock('ARG0')).toBe(right); expect(caller.getInputTargetBlock('ARG1')).toBe(left); expect(caller.getInputTargetBlock('CALLABLE')).toBe(reference);
    expect(left.isShadow()).toBe(true); expect(right.isShadow()).toBe(true);
    a.unplug(); (caller as any).compose(container);
    expect(left.getParent()).toBeNull(); expect(left.isShadow()).toBe(false); expect(w.getBlockById(left.id)).toBe(left); expect(caller.getInputTargetBlock('CALLABLE')).toBe(reference);
  });

  it('loads version-5 module projects without changing embedded revision contents', () => {
    const old = prepareProject(readFileSync('tests/fixtures/modules/consumer.json', 'utf8')).project;
    expect(old.languageVersion).toBe(19); const w = ws(); restore(w, old);
    expect(moduleState(w).definitions.every(d => d.languageVersion === 5)).toBe(true); expect(execute(w).result.type).toBe('done');
  });
});
