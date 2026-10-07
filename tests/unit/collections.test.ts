import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { defineFunction, callState } from '../../src/blocks/core/functions';
import { createVariable, parameterSymbol } from '../../src/language/functions';
import { compile, blockForLine } from '../../src/language/compiler';
import { createWorkspace, snapshot, prepareProject, restore } from '../../src/project';
const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function b(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const block = w.newBlock(type); Object.entries(fields).forEach(([key, value]) => block.setFieldValue(value, key)); return block; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function op(w: Blockly.Workspace, type: string, inputs: Record<string, Blockly.Block>) { const block = b(w, type); Object.entries(inputs).forEach(([name, child]) => plug(block, name, child)); return block; }
function chain(...blocks: Blockly.Block[]) { blocks.slice(1).forEach((block, i) => blocks[i].nextConnection!.connect(block.previousConnection!)); return blocks[0]; }
const n = (w: Blockly.Workspace, value: number) => b(w, 'py_number', { VALUE: String(value) });
const text = (w: Blockly.Workspace, value: string) => b(w, 'text', { TEXT: value });
const get = (w: Blockly.Workspace, id: string) => b(w, 'py_get', { SYMBOL: id });
const set = (w: Blockly.Workspace, id: string, value: Blockly.Block) => plug(b(w, 'py_set', { SYMBOL: id }), 'VALUE', value);
const print = (w: Blockly.Workspace, value: Blockly.Block) => op(w, 'text_print', { TEXT: value });
const program = (w: Blockly.Workspace, ...blocks: Blockly.Block[]) => plug(b(w, 'py_program'), 'BODY', chain(...blocks));
function list(w: Blockly.Workspace, ...values: Blockly.Block[]) { const block = b(w, 'lists_create_with'); block.loadExtraState!({ itemCount: values.length }); values.forEach((v, i) => plug(block, `ADD${i}`, v)); return block; }
function dict(w: Blockly.Workspace, ...pairs: [Blockly.Block, Blockly.Block][]) { const block = b(w, 'py_dict'); block.loadExtraState!({ itemCount: pairs.length }); pairs.forEach(([key, value], i) => { plug(block, `KEY${i}`, key); plug(block, `VALUE${i}`, value); }); return block; }
function execute(w: Blockly.Workspace) { const result = compile(w); expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]); return { ...result, ...spawnSync('python3', ['-c', result.source!], { encoding: 'utf8', timeout: 3000 }) }; }

describe('native collections', () => {
  it('passes lists by reference, mutates aliases, uses negative indices, and returns a value', () => {
    const w = ws(); const items = createVariable(w, 'items').getId(); const alias = createVariable(w, 'alias').getId();
    const f = defineFunction(w, { id: 'mutate', name: 'mutate', parameters: [{ id: 'values-param', name: 'values' }] });
    const p = parameterSymbol('values-param');
    plug(f, 'BODY', chain(op(w, 'py_list_append', { LIST: get(w, p), VALUE: n(w, 9) }), op(w, 'py_item_set', { COLLECTION: get(w, p), KEY: n(w, -2), VALUE: n(w, 7) }), op(w, 'py_item_delete', { COLLECTION: get(w, p), KEY: n(w, 0) }), op(w, 'py_return_value', { VALUE: op(w, 'py_length', { VALUE: get(w, p) }) })));
    const call = Blockly.serialization.blocks.append(callState(f.signature, true), w); plug(call, 'ARG_values-param', get(w, items));
    program(w, set(w, items, list(w, n(w, 1), n(w, 2))), set(w, alias, get(w, items)), print(w, call), print(w, get(w, alias)), print(w, op(w, 'py_item_get', { COLLECTION: get(w, items), KEY: n(w, -1) })));
    const result = execute(w); expect(result.stdout).toBe('2\n[7, 9]\n9\n'); expect(result.source).not.toContain('global');
  });
  it('copies the outer collection while keeping nested values shared', () => {
    const w = ws(); const items = createVariable(w, 'items').getId(); const copy = createVariable(w, 'copied').getId();
    const nested = () => op(w, 'py_item_get', { COLLECTION: get(w, copy), KEY: n(w, 0) });
    program(w,
      set(w, items, list(w, list(w, n(w, 1)), n(w, 2))),
      set(w, copy, op(w, 'py_shallow_copy', { VALUE: get(w, items) })),
      op(w, 'py_item_set', { COLLECTION: nested(), KEY: n(w, 0), VALUE: n(w, 7) }),
      op(w, 'py_list_append', { LIST: get(w, copy), VALUE: n(w, 3) }),
      print(w, get(w, items)), print(w, get(w, copy)));
    expect(execute(w).stdout).toBe('[[7], 2]\n[[7], 2, 3]\n');
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(execute(restored).stdout).toBe('[[7], 2]\n[[7], 2, 3]\n');
  });
  it('creates nested dictionaries, overwrites repeated keys, defaults only on absent keys, and iterates keys', () => {
    const w = ws(); const record = createVariable(w, 'record').getId(); const key = createVariable(w, 'key').getId();
    const each = plug(op(w, 'py_for_each', { ITERABLE: op(w, 'py_dict_keys', { DICT: get(w, record) }) }), 'DO', print(w, get(w, key))); each.setFieldValue(key, 'SYMBOL');
    program(w,
      set(w, record, dict(w, [text(w, 'score'), n(w, 1)], [text(w, 'empty'), b(w, 'py_none')], [text(w, 'score'), n(w, 5)])),
      print(w, op(w, 'py_item_get', { COLLECTION: get(w, record), KEY: text(w, 'score') })),
      print(w, op(w, 'py_dict_get', { DICT: get(w, record), KEY: text(w, 'empty'), DEFAULT: n(w, 99) })),
      print(w, op(w, 'py_dict_get', { DICT: get(w, record), KEY: text(w, 'missing'), DEFAULT: n(w, 99) })),
      op(w, 'py_item_set', { COLLECTION: get(w, record), KEY: text(w, 'nested'), VALUE: dict(w, [text(w, 'items'), list(w, n(w, 3))]) }),
      op(w, 'py_item_delete', { COLLECTION: get(w, record), KEY: text(w, 'empty') }), each,
      print(w, op(w, 'py_contains', { COLLECTION: get(w, record), ITEM: text(w, 'nested') })));
    expect(execute(w).stdout).toBe('5\nNone\n99\nscore\nnested\nTrue\n');
  });
  it('evaluates dictionary keys and values exactly once, in Python order', () => {
    const w = ws(); const counter = createVariable(w, 'counter').getId();
    const f = defineFunction(w, { id: 'step', name: 'step', parameters: [] });
    plug(f, 'BODY', chain(set(w, counter, op(w, 'py_binary', { A: get(w, counter), B: n(w, 1) })), op(w, 'py_return_value', { VALUE: get(w, counter) })));
    const call = () => Blockly.serialization.blocks.append(callState(f.signature, true), w);
    program(w, set(w, counter, n(w, 0)), print(w, dict(w, [call(), call()], [call(), call()])), print(w, get(w, counter)));
    expect(execute(w).stdout).toBe('{1: 2, 3: 4}\n4\n');
  });
  it('evaluates dict.get defaults eagerly and does not invent lazy semantics', () => {
    const w = ws();
    program(w, print(w, op(w, 'py_dict_get', { DICT: dict(w, [text(w, 'present'), n(w, 1)]), KEY: text(w, 'present'), DEFAULT: op(w, 'py_binary', { A: n(w, 1), B: n(w, 0) }) })));
    w.getAllBlocks(false).find(b => b.type === 'py_binary')!.setFieldValue('/', 'OP');
    expect(execute(w).stderr).toContain('ZeroDivisionError');
  });
  it('mutates a project collection from a function without declaring it global', () => {
    const w = ws(); const values = createVariable(w, 'values').getId();
    const f = defineFunction(w, { id: 'append', name: 'append_value', parameters: [] }); plug(f, 'BODY', op(w, 'py_list_append', { LIST: get(w, values), VALUE: n(w, 2) }));
    program(w, set(w, values, list(w, n(w, 1))), Blockly.serialization.blocks.append(callState(f.signature), w), print(w, get(w, values)));
    const result = execute(w); expect(result.stdout).toBe('[1, 2]\n'); expect(result.source).not.toContain('global');
  });
});

describe('collection errors and editing', () => {
  it.each(['index', 'key', 'float-index', 'unhashable-key', 'set-index', 'delete-key'] as const)('preserves Python failure for %s and maps the statement', kind => {
    const w = ws(); let action: Blockly.Block; let exception: string;
    if (kind === 'unhashable-key') { action = print(w, dict(w, [list(w, n(w, 1)), n(w, 2)])); exception = 'TypeError'; }
    else {
      const isList = ['index', 'float-index', 'set-index'].includes(kind);
      const type = kind === 'set-index' ? 'py_item_set' : kind === 'delete-key' ? 'py_item_delete' : 'py_item_get';
      action = op(w, type, { COLLECTION: isList ? list(w, n(w, 1)) : dict(w), KEY: isList ? n(w, kind === 'float-index' ? 0.5 : 4) : text(w, 'missing'), ...(kind === 'set-index' ? { VALUE: n(w, 8) } : {}) });
      if (type === 'py_item_get') action = print(w, action);
      exception = kind === 'float-index' ? 'TypeError' : isList ? 'IndexError' : 'KeyError';
    }
    program(w, action); const result = execute(w); expect(result.stderr).toContain(exception);
    const line = Number(result.stderr.match(/line (\d+)/)?.[1]); expect(blockForLine(result, 'program.py', line)).toBe(action.id);
  });
  it('requires all dictionary inputs and supports an explicitly empty dictionary', () => {
    const w = ws(); const dictionary = b(w, 'py_dict'); program(w, print(w, dictionary));
    expect(compile(w).diagnostics.filter(d => d.code === 'missing-input')).toHaveLength(4);
    dictionary.loadExtraState!({ itemCount: 0 }); expect(execute(w).stdout).toBe('{}\n');
    expect(() => dictionary.loadExtraState!({ itemCount: -1 })).toThrow('between 0 and 100');
  });
  it('reorders whole key/value pairs and keeps removed shadow expressions recoverable', () => {
    const w = ws(); const dictionary = dict(w, [text(w, 'first'), n(w, 1)], [text(w, 'second'), n(w, 2)]);
    const original = ['KEY0', 'VALUE0', 'KEY1', 'VALUE1'].map(name => dictionary.getInputTargetBlock(name)!);
    original.forEach(b => b.setShadow(true));
    const mutator = ws(); const container = b(mutator, 'py_dict_container');
    type Pair = Blockly.Block & { keyConnection: Blockly.Connection; valueConnection: Blockly.Connection };
    const second = b(mutator, 'py_dict_pair') as Pair; const first = b(mutator, 'py_dict_pair') as Pair;
    second.keyConnection = original[2].outputConnection!; second.valueConnection = original[3].outputConnection!;
    first.keyConnection = original[0].outputConnection!; first.valueConnection = original[1].outputConnection!;
    plug(container, 'PAIRS', chain(second, first)); dictionary.compose!(container);
    expect(dictionary.getInputTargetBlock('KEY0')).toBe(original[2]); expect(dictionary.getInputTargetBlock('VALUE0')).toBe(original[3]);
    first.unplug(); dictionary.compose!(container);
    expect(original[0].getParent()).toBeNull(); expect(original[0].isShadow()).toBe(false);
    expect(original[1].getParent()).toBeNull(); expect(original[2].isShadow()).toBe(true);
    program(w, print(w, dictionary)); expect(execute(w).stdout).toBe("{'second': 2}\n");
  });
  it('keeps reordered and removed list shadow values recoverable', () => {
    const w = ws(); const literal = list(w, n(w, 1), n(w, 2));
    const first = literal.getInputTargetBlock('ADD0')!; const second = literal.getInputTargetBlock('ADD1')!;
    first.setShadow(true); second.setShadow(true);
    const mutator = ws(); const container = b(mutator, 'lists_create_with_container');
    const item = b(mutator, 'lists_create_with_item') as Blockly.Block & { valueConnection_: Blockly.Connection };
    item.valueConnection_ = second.outputConnection!; plug(container, 'STACK', item); literal.compose!(container);
    expect(w.getBlockById(first.id)).toBe(first); expect(first.getParent()).toBeNull(); expect(first.isShadow()).toBe(false);
    expect(literal.getInputTargetBlock('ADD0')).toBe(second); expect(second.isShadow()).toBe(true);
    program(w, print(w, literal)); expect(execute(w).stdout).toBe('[2]\n');
  });
});
