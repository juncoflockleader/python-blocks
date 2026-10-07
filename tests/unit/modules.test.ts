import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Blockly } from '../../src/blocks';
import { callState, defineFunction } from '../../src/blocks/core/functions';
import { compile, blockForLine } from '../../src/language/compiler';
import { createVariable, editSignature, parameterSymbol, type FunctionBlock } from '../../src/language/functions';
import { exportModule, exportImportedModule, importModule, prepareModule } from '../../src/language/module-format';
import { moduleCallState, moduleState, renameModule, removeModule, type ModuleBundle, type ModuleCallBlock, type ModuleImport } from '../../src/language/modules';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { createWorkspace, snapshot, prepareProject, restore } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function b(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const block = w.newBlock(type); Object.entries(fields).forEach(([key, value]) => block.setFieldValue(value, key)); return block; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function op(w: Blockly.Workspace, type: string, inputs: Record<string, Blockly.Block>) { const block = b(w, type); Object.entries(inputs).forEach(([name, child]) => plug(block, name, child)); return block; }
function chain(...blocks: Blockly.Block[]) { blocks.slice(1).forEach((block, i) => blocks[i].nextConnection!.connect(block.previousConnection!)); return blocks[0]; }
const n = (w: Blockly.Workspace, value: number) => b(w, 'py_number', { VALUE: String(value) });
const get = (w: Blockly.Workspace, id: string) => b(w, 'py_get', { SYMBOL: id });
const print = (w: Blockly.Workspace, value: Blockly.Block) => op(w, 'text_print', { TEXT: value });
const fn = (w: Blockly.Workspace, id: string, name = id) => defineFunction(w, { id, name, parameters: [{ id: `${id}-value`, name: 'value' }] });
function call(w: Blockly.Workspace, f: FunctionBlock, arg: Blockly.Block) { return plug(Blockly.serialization.blocks.append(callState(f.signature, true), w), `ARG_${f.signature.parameters[0].id}`, arg); }
function imported(w: Blockly.Workspace, binding: ModuleImport, bundle: ModuleBundle, arg: Blockly.Block, index = 0) {
  const signature = bundle.definitions.find(d => d.moduleId === binding.moduleId && d.revision === binding.revision)!.exports[index];
  return plug(Blockly.serialization.blocks.append(moduleCallState(binding, signature, true), w), `ARG_${signature.parameters[0].id}`, arg) as ModuleCallBlock;
}
function arithmeticModule(value = 2) {
  const donor = ws(); const helper = fn(donor, 'helper', 'scale'); const publicFn = fn(donor, 'public', 'calculate');
  plug(helper, 'BODY', op(donor, 'py_return_value', { VALUE: op(donor, 'py_binary', { A: get(donor, parameterSymbol('helper-value')), B: n(donor, value) }) }));
  helper.getInputTargetBlock('BODY')!.getInputTargetBlock('VALUE')!.setFieldValue('*', 'OP');
  plug(publicFn, 'BODY', op(donor, 'py_return_value', { VALUE: call(donor, helper, get(donor, parameterSymbol('public-value'))) }));
  plug(b(donor, 'py_program'), 'BODY', print(donor, n(donor, 999)));
  return { donor, helper, publicFn, bundle: exportModule(donor, { moduleId: 'arithmetic', name: 'arithmetic', functions: ['public'] }) };
}
function execute(w: Blockly.Workspace) {
  const compilation = compile(w); expect(compilation.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const script = `import json,sys\nsys.path.insert(0, ${JSON.stringify(path.resolve('src/runtime'))})\nfrom execution import run_program\ndata=json.load(sys.stdin)\nsys.stderr.write(run_program(data['source'], data['files']))`;
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify(compilation), encoding: 'utf8', timeout: 3000 });
  expect(result.status).toBe(0); return { compilation, stdout: result.stdout, result: JSON.parse(result.stderr) };
}

describe('portable function modules', () => {
  it('applies file limits to UTF-8 bytes, matching browser uploads', () => {
    const oversized = JSON.stringify({ text: '汉'.repeat(700_000) });
    expect(oversized.length).toBeLessThan(2_000_000);
    expect(() => prepareModule(oversized)).toThrow('2 MB');
    expect(() => prepareProject(oversized)).toThrow('2 MB');
  });
  it('transfers private helper closure and uses real qualified Python without running donor startup', () => {
    const { bundle } = arithmeticModule();
    expect(bundle.definitions[0].exports.map(f => f.name)).toEqual(['calculate']);
    expect(bundle.definitions[0].workspace.blocks.blocks.map((b: { type: string }) => b.type)).toEqual(['py_function', 'py_function']);
    const consumer = ws(); const binding = importModule(consumer, bundle, 'tools');
    const local = fn(consumer, 'local', 'calculate'); plug(local, 'BODY', op(consumer, 'py_return_value', { VALUE: n(consumer, 100) }));
    plug(b(consumer, 'py_program'), 'BODY', chain(print(consumer, imported(consumer, binding, bundle, n(consumer, 21))), print(consumer, call(consumer, local, n(consumer, 0)))));
    const result = execute(consumer); expect(result.stdout).toBe('42\n100\n'); expect(result.result.type).toBe('done');
    expect(result.compilation.source).toContain('tools.calculate(21)'); expect(Object.keys(result.compilation.files)).toHaveLength(1);
    expect(Object.values(result.compilation.files)[0]).toContain('def scale(value):'); expect(Object.values(result.compilation.files)[0]).not.toContain('999');
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(consumer))).project);
    expect(execute(restored).stdout).toBe(result.stdout); expect(moduleState(restored)).toEqual(moduleState(consumer));
  });

  it('pins contents, permits distinct revisions, and never silently replaces an existing namespace', () => {
    const { donor, publicFn, bundle } = arithmeticModule(); const w = ws();
    const binding = importModule(w, bundle, 'first'); const same = importModule(w, bundle, 'first'); expect(same).toEqual(binding); expect(moduleState(w).imports).toHaveLength(1);
    editSignature(donor, { ...publicFn.signature, name: 'renamed' });
    const newer = exportModule(donor, { moduleId: 'arithmetic', name: 'arithmetic', functions: ['public'] });
    const before = snapshot(w); expect(() => importModule(w, newer, 'first')).toThrow('another module revision'); expect(snapshot(w)).toEqual(before);
    const second = importModule(w, newer, 'second');
    plug(b(w, 'py_program'), 'BODY', chain(print(w, imported(w, binding, bundle, n(w, 4))), print(w, imported(w, second, newer, n(w, 7)))));
    expect(execute(w).stdout).toBe('8\n14\n'); expect(exportImportedModule(w, binding.id)).toEqual(bundle);
    // Any altered metadata for an existing pin is a conflict, even if still valid.
    const forged = structuredClone(bundle); forged.definitions[0].name = 'other_name';
    expect(() => importModule(w, forged, 'third')).toThrow('Conflicting contents'); expect(moduleState(w).imports).toHaveLength(2);
  });

  it('bundles transitive pinned module dependencies and keeps function names isolated', () => {
    const { bundle: base } = arithmeticModule(); const donor = ws(); const dependency = importModule(donor, base, 'base');
    const wrapper = fn(donor, 'wrapper', 'calculate'); plug(wrapper, 'BODY', op(donor, 'py_return_value', { VALUE: imported(donor, dependency, base, get(donor, parameterSymbol('wrapper-value'))) }));
    const bundle = exportModule(donor, { name: 'wrapper', functions: ['wrapper'] }); expect(bundle.definitions).toHaveLength(2);
    const consumer = ws(); const target = importModule(consumer, bundle, 'tools');
    plug(b(consumer, 'py_program'), 'BODY', print(consumer, imported(consumer, target, bundle, n(consumer, 9))));
    expect(execute(consumer).stdout).toBe('18\n');
    const missing = structuredClone(bundle); missing.definitions.pop(); expect(() => prepareModule(JSON.stringify(missing))).toThrow('Missing pinned module');
    const cyclic = structuredClone(bundle); cyclic.definitions[1].dependencies.push({ ...cyclic.entry, id: 'cycle', alias: 'cycle' });
    expect(() => prepareModule(JSON.stringify(cyclic))).toThrow('acyclic');
    expect(snapshot(consumer).workspace.pythonModules.definitions).toHaveLength(2);
  });

  it('rejects hidden project state, missing helpers, handlers, invalid exports, and malformed dependencies', () => {
    const { donor, helper, publicFn, bundle } = arithmeticModule(); const state = createVariable(donor, 'hidden').getId();
    publicFn.getInputTargetBlock('BODY')!.dispose(); plug(publicFn, 'BODY', op(donor, 'py_return_value', { VALUE: get(donor, state) }));
    expect(() => exportModule(donor, { name: 'bad', functions: ['public'] })).toThrow('Pass project state');
    publicFn.getInputTargetBlock('BODY')!.dispose(); plug(publicFn, 'BODY', op(donor, 'py_return_value', { VALUE: call(donor, helper, n(donor, 1)) })); helper.dispose();
    expect(() => exportModule(donor, { name: 'bad', functions: ['public'] })).toThrow('missing');
    defineFunction(donor, { id: 'handler', name: 'handler', parameters: [{ id: 'payload', name: 'payload' }], async: true, handler: { event: 'start', order: 0 } });
    expect(() => exportModule(donor, { name: 'bad', functions: ['handler'] })).toThrow('event handler');
    const invalid = structuredClone(bundle); invalid.definitions[0].exports[0].parameters[0].name = 'changed';
    expect(() => prepareModule(JSON.stringify(invalid))).toThrow('does not match');
    const future = structuredClone(bundle); future.definitions[0].languageVersion = 99;
    expect(() => prepareModule(JSON.stringify(future))).toThrow('Unsupported module language version');
    const w = ws(); const before = snapshot(w); expect(() => importModule(w, invalid, 'bad')).toThrow(); expect(snapshot(w)).toEqual(before);
    const badProject = snapshot(w); badProject.workspace.pythonModules = { formatVersion: 1, imports: [], definitions: invalid.definitions };
    expect(() => restore(w, badProject)).toThrow('does not match'); expect(snapshot(w)).toEqual(before);
  });

  it('keeps module references through namespace rename, copy, removal, undo, and reload', async () => {
    const { bundle } = arithmeticModule(); const w = ws(); const binding = importModule(w, bundle, 'tools');
    const call = imported(w, binding, bundle, n(w, 3)); plug(b(w, 'py_program'), 'BODY', print(w, call));
    await flush(); w.clearUndo(); renameModule(w, binding.id, 'helpers'); await flush();
    expect(call.getFieldValue('NAME')).toBe('helpers.calculate'); expect(execute(w).stdout).toBe('6\n');
    w.undo(false); await flush(); expect(call.getFieldValue('NAME')).toBe('tools.calculate');
    w.undo(true); await flush(); expect(call.getFieldValue('NAME')).toBe('helpers.calculate');
    const copied = pasteBlockCopy(w, Blockly.serialization.blocks.save(call)! ) as ModuleCallBlock;
    expect(copied.moduleCall).toEqual(call.moduleCall); copied.dispose(); await flush(); w.clearUndo();
    removeModule(w, binding.id); await flush(); expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-module-call' }));
    expect(call.getInputTargetBlock('ARG_public-value')).not.toBeNull();
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('6\n');
    const restored = ws(); restore(restored, snapshot(w)); expect(execute(restored).stdout).toBe('6\n');
  });

  it('diagnoses namespace shadowing and stale pinned call signatures', () => {
    const { bundle } = arithmeticModule(); const w = ws(); const binding = importModule(w, bundle, 'tools');
    const f = defineFunction(w, { id: 'local', name: 'local', parameters: [{ id: 'tools', name: 'tools' }] });
    const call = imported(w, binding, bundle, n(w, 1)); plug(f, 'BODY', print(w, call));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'shadowed-module', blockId: call.id }));
    editSignature(w, { ...f.signature, parameters: [{ id: 'tools', name: 'value' }] });
    call.moduleCall.signature.parameters[0].name = 'wrong';
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'module-signature', blockId: call.id }));
    const before = snapshot(w); expect(() => importModule(w, bundle, 'local')).toThrow('conflicts'); expect(snapshot(w)).toEqual(before);
  });

  it('copies calls by pinned identity and repairs an unavailable import explicitly', () => {
    const { bundle } = arithmeticModule(); const donor = ws(); const first = importModule(donor, bundle, 'tools');
    const source = imported(donor, first, bundle, n(donor, 6)); const saved = Blockly.serialization.blocks.save(source)!;
    const consumer = ws(); const copy = pasteBlockCopy(consumer, saved) as ModuleCallBlock; plug(b(consumer, 'py_program'), 'BODY', print(consumer, copy));
    expect(compile(consumer).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-module-call' }));
    const restored = importModule(consumer, bundle, 'tools'); expect(restored.id).toBe(first.id); expect(execute(consumer).stdout).toBe('12\n');
    const another = ws(); const other = importModule(another, bundle, 'renamed');
    const remapped = pasteBlockCopy(another, saved) as ModuleCallBlock; expect(remapped.moduleCall.importId).toBe(other.id); expect(remapped.moduleCall.alias).toBe('renamed');
    const secondAlias = importModule(another, bundle, 'also_tools'); const secondCall = imported(another, secondAlias, bundle, n(another, 2));
    const sameProjectCopy = pasteBlockCopy(another, Blockly.serialization.blocks.save(secondCall)!) as ModuleCallBlock;
    expect(sameProjectCopy.moduleCall.importId).toBe(secondAlias.id);
    const wrong = ws(); const different = arithmeticModule(3).bundle; importModule(wrong, different, 'tools');
    const unavailable = pasteBlockCopy(wrong, saved) as ModuleCallBlock; expect(unavailable.moduleCall.importId).toBe(first.id);
    plug(b(wrong, 'py_program'), 'BODY', print(wrong, unavailable)); expect(compile(wrong).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-module-call' }));
  });

  it('maps imported exceptions to their module and private helper statement', () => {
    const { donor, helper } = arithmeticModule(); const division = helper.getInputTargetBlock('BODY')!.getInputTargetBlock('VALUE')!;
    division.setFieldValue('/', 'OP'); division.getInputTargetBlock('B')!.setFieldValue('0', 'VALUE');
    const bundle = exportModule(donor, { name: 'broken', functions: ['public'] }); const w = ws(); const binding = importModule(w, bundle, 'tools');
    plug(b(w, 'py_program'), 'BODY', print(w, imported(w, binding, bundle, n(w, 9))));
    const result = execute(w); expect(result.result.exceptionType).toBe('ZeroDivisionError');
    const frame = result.result.frames.at(-1); expect(frame.file).toMatch(/^_pb_module_\d+\.py$/);
    expect(blockForLine(result.compilation, frame.file, frame.line)).toBe(helper.getInputTargetBlock('BODY')!.id);
    expect(result.compilation.sourceMap.find(s => s.file === frame.file && s.blockId === helper.getInputTargetBlock('BODY')!.id)?.module?.name).toBe('broken');
    expect(result.result.details).toContain('return');
  });

  it('preserves native collection aliasing across module boundaries', () => {
    const donor = ws(); const f = fn(donor, 'append_value');
    plug(f, 'BODY', chain(op(donor, 'py_list_append', { LIST: get(donor, parameterSymbol('append_value-value')), VALUE: n(donor, 9) }), op(donor, 'py_return_value', { VALUE: get(donor, parameterSymbol('append_value-value')) })));
    const bundle = exportModule(donor, { name: 'collections', functions: [f.functionId] }); const w = ws(); const binding = importModule(w, bundle, 'tools');
    const items = createVariable(w, 'items').getId(); const list = b(w, 'lists_create_with'); list.loadExtraState!({ itemCount: 0 });
    plug(b(w, 'py_program'), 'BODY', chain(op(w, 'py_set', { VALUE: list }), print(w, imported(w, binding, bundle, get(w, items))), print(w, get(w, items))));
    w.getAllBlocks(false).find(b => b.type === 'py_set')!.setFieldValue(items, 'SYMBOL');
    expect(execute(w).stdout).toBe('[9]\n[9]\n');
  });

  it('retains explicit async signatures and rejects synchronous module call contexts', () => {
    const donor = ws(); const f = fn(donor, 'wait_then_return'); editSignature(donor, { ...f.signature, async: true });
    plug(f, 'BODY', chain(op(donor, 'py_wait', { SECONDS: n(donor, 0) }), op(donor, 'py_return_value', { VALUE: get(donor, parameterSymbol('wait_then_return-value')) })));
    const bundle = exportModule(donor, { name: 'timing', functions: [f.functionId] }); const w = ws(); const binding = importModule(w, bundle, 'timing');
    const entry = b(w, 'py_program'); const out = print(w, imported(w, binding, bundle, n(w, 7))); plug(entry, 'BODY', out);
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-call-context' }));
    out.unplug(); entry.dispose(); const handler = defineFunction(w, { id: 'handler', name: 'on_start', async: true, parameters: [{ id: 'payload', name: 'payload' }], handler: { event: 'start', order: 0 } }); plug(handler, 'BODY', out);
    const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    expect(result.source).toContain('await timing.wait_then_return(7)'); expect(Object.values(result.files)[0]).toContain('await events.wait(0)');
  });

  it('includes recursive helpers without mistaking function recursion for a module cycle', () => {
    const donor = ws(); const f = fn(donor, 'factorial'); const value = () => get(donor, parameterSymbol('factorial-value'));
    const condition = op(donor, 'logic_compare', { A: value(), B: n(donor, 1) }); condition.setFieldValue('LTE', 'OP');
    const branch = op(donor, 'controls_if', { IF0: condition, DO0: op(donor, 'py_return_value', { VALUE: n(donor, 1) }) });
    const minus = op(donor, 'py_binary', { A: value(), B: n(donor, 1) }); minus.setFieldValue('-', 'OP');
    const product = op(donor, 'py_binary', { A: value(), B: call(donor, f, minus) }); product.setFieldValue('*', 'OP');
    plug(f, 'BODY', chain(branch, op(donor, 'py_return_value', { VALUE: product })));
    const bundle = exportModule(donor, { name: 'recursion', functions: [f.functionId] }); const w = ws(); const binding = importModule(w, bundle, 'recursion');
    plug(b(w, 'py_program'), 'BODY', print(w, imported(w, binding, bundle, n(w, 5)))); expect(execute(w).stdout).toBe('120\n');
  });

  it('exports mutually recursive private helpers with independent parameter identities', () => {
    const donor = ws(); const even = fn(donor, 'even'); const odd = fn(donor, 'odd');
    for (const [current, other, isEven] of [[even, odd, true], [odd, even, false]] as const) {
      const value = () => get(donor, parameterSymbol(current.signature.parameters[0].id));
      const compare = op(donor, 'logic_compare', { A: value(), B: n(donor, 0) }); compare.setFieldValue('EQ', 'OP');
      const branch = op(donor, 'controls_if', { IF0: compare, DO0: op(donor, 'py_return_value', { VALUE: b(donor, 'logic_boolean', { BOOL: isEven ? 'TRUE' : 'FALSE' }) }) });
      const minus = op(donor, 'py_binary', { A: value(), B: n(donor, 1) }); minus.setFieldValue('-', 'OP');
      plug(current, 'BODY', chain(branch, op(donor, 'py_return_value', { VALUE: call(donor, other, minus) })));
    }
    const bundle = exportModule(donor, { name: 'parity', functions: [even.functionId] }); expect(bundle.definitions[0].exports).toHaveLength(1);
    const w = ws(); const binding = importModule(w, bundle, 'parity');
    plug(b(w, 'py_program'), 'BODY', chain(print(w, imported(w, binding, bundle, n(w, 10))), print(w, imported(w, binding, bundle, n(w, 9)))));
    expect(execute(w).stdout).toBe('True\nFalse\n');
  });
});
