import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Blockly } from '../../src/blocks';
import { callState, defineFunction, referenceState } from '../../src/blocks/core/functions';
import { blockForLine, compile } from '../../src/language/compiler';
import { allSymbols, createVariable, editSignature, lambdaParameterSymbol, parameterSymbol, SymbolField, type FunctionBlock, type LambdaBlock } from '../../src/language/functions';
import { editLambda, lambdaState, validateLambda } from '../../src/language/lambdas';
import { pasteBlockCopy } from '../../src/language/clipboard';
import { exportModule, importModule } from '../../src/language/module-format';
import { moduleReferenceState, moduleState } from '../../src/language/modules';
import { createWorkspace, prepareProject, restore, snapshot } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
const flush = () => new Promise(resolve => setTimeout(resolve, 20));
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) { const b = w.newBlock(type); Object.entries(fields).forEach(([k, v]) => b.setFieldValue(v, k)); return b; }
function plug(parent: Blockly.Block, name: string, child: Blockly.Block) { parent.getInput(name)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function op(w: Blockly.Workspace, type: string, inputs: Record<string, Blockly.Block>) { const b = block(w, type); Object.entries(inputs).forEach(([k, v]) => plug(b, k, v)); return b; }
const num = (w: Blockly.Workspace, n: number) => block(w, 'py_number', { VALUE: String(n) });
const get = (w: Blockly.Workspace, id: string) => block(w, 'py_get', { SYMBOL: id });
const print = (w: Blockly.Workspace, value: Blockly.Block) => op(w, 'text_print', { TEXT: value });
const ret = (w: Blockly.Workspace, value: Blockly.Block) => op(w, 'py_return_value', { VALUE: value });
function lambda(w: Blockly.Workspace, names = ['value']) { return Blockly.serialization.blocks.append({ type: 'py_lambda', extraState: lambdaState(names) }, w) as LambdaBlock; }
function param(b: LambdaBlock, index = 0) { return get(b.workspace, lambdaParameterSymbol(b.lambda.id, b.lambda.parameters[index].id)); }
function binary(w: Blockly.Workspace, operator: string, a: Blockly.Block, b: Blockly.Block) { const expression = op(w, 'py_binary', { A: a, B: b }); expression.setFieldValue(operator, 'OP'); return expression; }
function dynamic(w: Blockly.Workspace, callable: Blockly.Block, args: Blockly.Block[] = []) {
  const b = block(w, 'py_dynamic_call_value'); b.loadExtraState!({ argumentCount: args.length }); plug(b, 'CALLABLE', callable); args.forEach((v, i) => plug(b, `ARG${i}`, v)); return b;
}
function fn(w: Blockly.Workspace, name: string, params: string[] = []) { return defineFunction(w, { id: name, name, parameters: params.map(p => ({ id: `${name}-${p}`, name: p })) }); }
function call(w: Blockly.Workspace, fn: FunctionBlock, args: Blockly.Block[] = []) {
  const b = Blockly.serialization.blocks.append(callState(fn.signature, true), w); args.forEach((v, i) => plug(b, `ARG_${fn.signature.parameters[i].id}`, v)); return b;
}
function execute(w: Blockly.Workspace) {
  const compilation = compile(w); expect(compilation.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const script = `import json,sys\nsys.path.insert(0, ${JSON.stringify(path.resolve('src/runtime'))})\nfrom execution import run_program\ndata=json.load(sys.stdin)\nsys.stderr.write(run_program(data['source'], data['files']))`;
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify(compilation), encoding: 'utf8', timeout: 3000 });
  expect(result.status).toBe(0); return { compilation, stdout: result.stdout, result: JSON.parse(result.stderr) };
}

describe('expression lambdas', () => {
  it('passes a lambda to a named function and preserves its parameters through save and reload', () => {
    const w = ws(); const apply = fn(w, 'apply_operation', ['operation', 'value']);
    plug(apply, 'BODY', ret(w, dynamic(w, get(w, parameterSymbol('apply_operation-operation')), [get(w, parameterSymbol('apply_operation-value'))])));
    const expression = lambda(w); plug(expression, 'BODY', binary(w, '*', param(expression), num(w, 2)));
    plug(block(w, 'py_program'), 'BODY', print(w, call(w, apply, [expression, num(w, 3)])));
    expect(execute(w).stdout).toBe('6\n'); expect(compile(w).source).toContain('lambda value: (value) * (2)');
    const restored = ws(); restore(restored, prepareProject(JSON.stringify(snapshot(w))).project);
    expect(execute(restored).stdout).toBe('6\n'); expect((restored.getBlockById(expression.id) as LambdaBlock).lambda).toEqual(expression.lambda);
  });

  it('supports zero parameters and nested lambdas that do not capture enclosing variables', () => {
    const w = ws(); const outer = lambda(w, []); const inner = lambda(w, ['number']); plug(inner, 'BODY', binary(w, '+', param(inner), num(w, 1))); plug(outer, 'BODY', inner);
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, dynamic(w, outer), [num(w, 4)])));
    expect(execute(w).stdout).toBe('5\n'); expect(compile(w).source).toContain('lambda:');
  });

  it('returns a lambda from a named function and keeps same-named scopes independent', () => {
    const w = ws(); const factory = fn(w, 'make_operation', ['value']); const expression = lambda(w, ['value']);
    plug(expression, 'BODY', binary(w, '+', param(expression), num(w, 1))); plug(factory, 'BODY', ret(w, expression));
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, call(w, factory, [num(w, 100)]), [num(w, 3)])));
    expect(execute(w).stdout).toBe('4\n');
  });

  it('creates distinct lambda objects on separate evaluation', () => {
    const w = ws(); const factory = fn(w, 'make_operation'); const expression = lambda(w); plug(expression, 'BODY', param(expression)); plug(factory, 'BODY', ret(w, expression));
    const comparison = op(w, 'logic_compare', { A: call(w, factory), B: call(w, factory) }); comparison.setFieldValue('EQ', 'OP');
    plug(block(w, 'py_program'), 'BODY', print(w, comparison)); expect(execute(w).stdout).toBe('False\n');
  });
  it('preserves an assigned lambda through aliases and collection storage', () => {
    const w = ws(); const expression = lambda(w); plug(expression, 'BODY', binary(w, '+', param(expression), num(w, 1)));
    const operation = createVariable(w, 'operation').getId(); const alias = createVariable(w, 'alias').getId();
    const assign = plug(block(w, 'py_set', { SYMBOL: operation }), 'VALUE', expression); const copy = plug(block(w, 'py_set', { SYMBOL: alias }), 'VALUE', get(w, operation)); assign.nextConnection!.connect(copy.previousConnection!);
    const values = block(w, 'lists_create_with'); values.loadExtraState!({ itemCount: 1 }); plug(values, 'ADD0', get(w, alias));
    const call = print(w, dynamic(w, op(w, 'py_item_get', { COLLECTION: values, KEY: num(w, 0) }), [num(w, 7)])); copy.nextConnection!.connect(call.previousConnection!);
    const equality = op(w, 'logic_compare', { A: get(w, operation), B: get(w, alias) }); equality.setFieldValue('EQ', 'OP'); call.nextConnection!.connect(print(w, equality).previousConnection!);
    plug(block(w, 'py_program'), 'BODY', assign); expect(execute(w).stdout).toBe('8\nTrue\n');
  });

  it('preserves Python arity failures and maps errors inside a returned lambda', () => {
    const w = ws(); const factory = fn(w, 'make_operation'); const expression = lambda(w); const failure = ret(w, expression);
    plug(expression, 'BODY', binary(w, '/', param(expression), num(w, 0))); plug(factory, 'BODY', failure);
    const output = print(w, dynamic(w, call(w, factory), [num(w, 2)])); plug(block(w, 'py_program'), 'BODY', output);
    const { result, compilation } = execute(w); expect(result.exceptionType).toBe('ZeroDivisionError');
    const frame = result.frames.at(-1); expect(frame.name).toBe('<lambda>'); expect(blockForLine(compilation, frame.file, frame.line)).toBe(failure.id);
    output.getInputTargetBlock('TEXT')!.dispose(); plug(output, 'TEXT', dynamic(w, call(w, factory), [])); expect(execute(w).result.exceptionType).toBe('TypeError');
  });

  it('renames and reorders parameter bindings atomically while dynamic arguments remain positional', async () => {
    const w = ws(); const expression = lambda(w, ['left', 'right']); const [left, right] = expression.lambda.parameters;
    plug(expression, 'BODY', binary(w, '-', param(expression), param(expression, 1)));
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, expression, [num(w, 10), num(w, 3)])));
    await flush(); w.clearUndo(); editLambda(expression, [{ ...right, name: 'amount' }, left]); await flush();
    expect(execute(w).stdout).toBe('-7\n'); expect(compile(w).source).toContain('lambda amount, left: (left) - (amount)');
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('7\n'); expect(expression.lambda.parameters).toEqual([left, right]);
    w.undo(true); await flush(); expect(execute(w).stdout).toBe('-7\n');
    const restored = ws(); restore(restored, snapshot(w)); expect(execute(restored).stdout).toBe('-7\n');
  });

  it('retains removed parameter reads as unresolved work and restores them with Undo', async () => {
    const w = ws(); const expression = lambda(w); const read = param(expression); plug(expression, 'BODY', read);
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, expression, [num(w, 4)])));
    const before = structuredClone(expression.lambda); await flush(); w.clearUndo(); editLambda(expression, []); await flush();
    expect(read.getParent()).toBe(expression); expect((read.getField('SYMBOL') as SymbolField).saveState()).toEqual(expect.objectContaining({ name: 'value', owner: before.id }));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'unresolved-symbol', blockId: read.id }));
    const broken = ws(); restore(broken, snapshot(w)); expect(compile(broken).source).toBeNull();
    w.undo(false); await flush(); expect(execute(w).stdout).toBe('4\n'); expect(expression.lambda).toEqual(before);
  });

  it('duplicates lambdas with fresh identities and remaps only their own parameter reads', () => {
    const w = ws(); const expression = lambda(w); plug(expression, 'BODY', param(expression));
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(expression, { doFullSerialization: true })!) as LambdaBlock;
    expect(copy.lambda.id).not.toBe(expression.lambda.id); expect(copy.lambda.parameters[0].id).not.toBe(expression.lambda.parameters[0].id);
    expect(copy.getInputTargetBlock('BODY')!.getFieldValue('SYMBOL')).toBe(lambdaParameterSymbol(copy.lambda.id, copy.lambda.parameters[0].id));
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, copy, [num(w, 8)]))); expect(execute(w).stdout).toBe('8\n');
    const escaped = pasteBlockCopy(w, Blockly.serialization.blocks.save(expression.getInputTargetBlock('BODY')!, { doFullSerialization: true })!);
    expect(escaped.getFieldValue('SYMBOL')).toBe(lambdaParameterSymbol(expression.lambda.id, expression.lambda.parameters[0].id));
    const output = w.getTopBlocks(false).find(b => b.type === 'py_program')!.getInputTargetBlock('BODY')!;
    output.getInputTargetBlock('TEXT')!.unplug(); plug(output, 'TEXT', escaped); expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'out-of-scope', blockId: escaped.id }));
  });

  it('copies named functions containing nested lambdas with independent scope ownership', () => {
    const w = ws(); const factory = fn(w, 'make_operation'); const outer = lambda(w); const inner = lambda(w); plug(inner, 'BODY', param(inner)); plug(outer, 'BODY', inner); plug(factory, 'BODY', ret(w, outer));
    const copy = pasteBlockCopy(w, Blockly.serialization.blocks.save(factory, { doFullSerialization: true })!) as FunctionBlock;
    const copiedOuter = copy.getInputTargetBlock('BODY')!.getInputTargetBlock('VALUE')! as LambdaBlock; const copiedInner = copiedOuter.getInputTargetBlock('BODY')! as LambdaBlock;
    expect(new Set([outer.lambda.id, inner.lambda.id, copiedOuter.lambda.id, copiedInner.lambda.id]).size).toBe(4);
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, dynamic(w, call(w, copy), [num(w, 1)]), [num(w, 8)]))); expect(execute(w).stdout).toBe('8\n');
  });

  it('rejects captures of project variables, named-function locals/parameters, and outer-lambda parameters', () => {
    for (const kind of ['project', 'parameter', 'local', 'lambda']) {
      const w = ws(); const outer = fn(w, 'make_operation', kind === 'parameter' ? ['value'] : []); const expression = lambda(w); let id: string;
      if (kind === 'parameter') id = parameterSymbol('make_operation-value');
      else if (kind === 'lambda') { const parent = lambda(w); id = lambdaParameterSymbol(parent.lambda.id, parent.lambda.parameters[0].id); plug(parent, 'BODY', expression); plug(outer, 'BODY', ret(w, parent)); }
      else id = createVariable(w, 'value', kind === 'local' ? outer.functionId : undefined).getId();
      if (kind !== 'lambda') plug(outer, 'BODY', ret(w, expression)); const read = get(w, id); plug(expression, 'BODY', read);
      expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'lambda-capture', blockId: read.id }));
      const options = (read.getField('SYMBOL') as SymbolField).getOptions(false); expect(options).toContainEqual(expect.arrayContaining(['value (unavailable here)', id]));
    }
  });

  it('limits the lambda symbol picker to its parameters without changing a broken reference', () => {
    const w = ws(); const global = createVariable(w, 'score').getId(); const expression = lambda(w); const read = param(expression); plug(expression, 'BODY', read);
    const field = read.getField('SYMBOL') as SymbolField;
    expect(field.getOptions(false).map(o => o[1])).toEqual(['', lambdaParameterSymbol(expression.lambda.id, expression.lambda.parameters[0].id)]);
    read.setFieldValue(global, 'SYMBOL'); expect(field.getValue()).toBe(global); expect(field.getOptions(false).at(-1)).toEqual(['score (unavailable here)', global]);
    expect(allSymbols(w).filter(s => s.owner === expression.lambda.id)).toHaveLength(1);
  });

  it('diagnoses free function-name shadowing in lambdas and their enclosing scopes', () => {
    for (const kind of ['lambda', 'outer-lambda', 'function-parameter', 'function-local']) {
      const w = ws(); const target = fn(w, 'calculate'); const outer = fn(w, 'make_operation', kind === 'function-parameter' ? ['calculate'] : []);
      const expression = lambda(w, kind === 'lambda' ? ['calculate'] : []); const reference = Blockly.serialization.blocks.append(referenceState(target.signature), w); plug(expression, 'BODY', reference);
      let body: Blockly.Block = expression;
      if (kind === 'outer-lambda') { body = lambda(w, ['calculate']); plug(body, 'BODY', expression); }
      const returning = ret(w, body);
      if (kind === 'function-local') { const local = createVariable(w, 'calculate', outer.functionId).getId(); const assign = plug(block(w, 'py_set', { SYMBOL: local }), 'VALUE', num(w, 2)); assign.nextConnection!.connect(returning.previousConnection!); plug(outer, 'BODY', assign); }
      else plug(outer, 'BODY', returning);
      expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'shadowed-function', blockId: reference.id }));
    }
  });

  it('allows explicit synchronous helpers but rejects implicit async bodies even inside async functions', () => {
    const w = ws(); const helper = fn(w, 'calculate'); plug(helper, 'BODY', ret(w, num(w, 9))); const factory = fn(w, 'make_operation'); editSignature(w, { ...factory.signature, async: true });
    const expression = lambda(w, []); const caller = call(w, helper); plug(expression, 'BODY', caller); plug(factory, 'BODY', ret(w, expression));
    expect(compile(w).diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    editSignature(w, { ...helper.signature, async: true }); expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'async-call-context', blockId: caller.id }));
  });

  it('exports lambda parameters and private helper references and runs after cross-project import', () => {
    const donor = ws(); const helper = fn(donor, 'double_value', ['value']); plug(helper, 'BODY', ret(donor, binary(donor, '*', get(donor, parameterSymbol('double_value-value')), num(donor, 2))));
    const factory = fn(donor, 'make_operation'); const expression = lambda(donor); plug(expression, 'BODY', call(donor, helper, [param(expression)])); plug(factory, 'BODY', ret(donor, expression));
    const bundle = exportModule(donor, { name: 'lambda_helpers', functions: [factory.functionId] }); expect(bundle.definitions[0].workspace.blocks.blocks).toHaveLength(2);
    const w = ws(); const binding = importModule(w, bundle, 'helpers'); const reference = Blockly.serialization.blocks.append(moduleReferenceState(binding, factory.signature), w);
    plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, dynamic(w, reference), [num(w, 7)])));
    expect(execute(w).stdout).toBe('14\n'); const reloaded = ws(); restore(reloaded, snapshot(w)); expect(execute(reloaded).stdout).toBe('14\n'); expect(moduleState(reloaded)).toEqual(moduleState(w));
  });

  it('diagnoses imported namespace shadowing and retains transitive dependencies used in lambda bodies', () => {
    const base = ws(); const helper = fn(base, 'calculate'); plug(helper, 'BODY', ret(base, num(base, 7))); const baseBundle = exportModule(base, { name: 'base', functions: [helper.functionId] });
    const w = ws(); const binding = importModule(w, baseBundle, 'tools'); const factory = fn(w, 'make_operation'); const expression = lambda(w, ['tools']);
    const reference = Blockly.serialization.blocks.append(moduleReferenceState(binding, helper.signature), w); plug(expression, 'BODY', reference); plug(factory, 'BODY', ret(w, expression));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'shadowed-module', blockId: reference.id }));
    editLambda(expression, []); const bundle = exportModule(w, { name: 'wrapped', functions: [factory.functionId] }); expect(bundle.definitions).toHaveLength(2);
    const consumer = ws(); const imported = importModule(consumer, bundle, 'helpers'); const maker = Blockly.serialization.blocks.append(moduleReferenceState(imported, factory.signature), consumer);
    plug(block(consumer, 'py_program'), 'BODY', print(consumer, dynamic(consumer, dynamic(consumer, dynamic(consumer, maker))))); expect(execute(consumer).stdout).toBe('7\n');
  });

  it('rejects duplicate lambda scopes in disabled module code before changing the consumer', () => {
    const donor = ws(); const factory = fn(donor, 'make_operation');
    const first = lambda(donor); plug(first, 'BODY', param(first));
    const second = lambda(donor); plug(second, 'BODY', param(second));
    const returning = ret(donor, first); const disabled = print(donor, second);
    disabled.nextConnection!.connect(returning.previousConnection!); disabled.setDisabledReason(true, 'MANUALLY_DISABLED'); plug(factory, 'BODY', disabled);
    const bundle = exportModule(donor, { name: 'helpers', functions: [factory.functionId] });
    const savedPrint = bundle.definitions[0].workspace.blocks.blocks[0].inputs.BODY.block;
    savedPrint.inputs.TEXT.block.extraState.id = first.lambda.id;
    const consumer = ws(); const before = snapshot(consumer);
    expect(() => importModule(consumer, bundle, 'helpers')).toThrow('distinct identities');
    expect(snapshot(consumer)).toEqual(before);
  });

  it('rejects invalid metadata and duplicate scope identities without replacing the project or breaking Undo', () => {
    const w = ws(); const expression = lambda(w); plug(expression, 'BODY', param(expression)); plug(block(w, 'py_program'), 'BODY', print(w, dynamic(w, expression, [num(w, 1)])));
    const before = snapshot(w); const saved = Blockly.serialization.blocks.save(expression)!;
    for (const change of ['duplicate-scope', 'duplicate-name', 'duplicate-parameter', 'reserved', 'missing-id']) {
      const bad = structuredClone(before); const copy = structuredClone(saved); delete copy.id;
      if (change !== 'duplicate-scope') copy.extraState.id = 'new-scope';
      if (change === 'duplicate-name') copy.extraState.parameters.push({ id: 'new-param', name: 'value' });
      if (change === 'duplicate-parameter') copy.extraState.parameters.push({ id: copy.extraState.parameters[0].id, name: 'other' });
      if (change === 'reserved') copy.extraState.parameters[0].name = 'for';
      if (change === 'missing-id') delete copy.extraState.id;
      bad.workspace.blocks.blocks.push(copy); const undo = Blockly.Events.getRecordUndo(); const group = Blockly.Events.getGroup();
      expect(() => restore(w, bad)).toThrow(); expect(snapshot(w)).toEqual(before); expect(Blockly.Events.getRecordUndo()).toBe(undo); expect(Blockly.Events.getGroup()).toBe(group);
    }
    const invalid = lambdaState(Array.from({ length: 101 }, (_, i) => `arg${i}`)); expect(() => validateLambda(invalid)).toThrow('0–100');
  });
});
