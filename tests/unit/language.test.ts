import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { Blockly } from '../../src/blocks';
import { compile, blockForLine, isPythonNumber } from '../../src/language/compiler';
import { createWorkspace } from '../../src/project';
import { pythonGenerator as inherited } from 'blockly/python';
import { createVariable } from '../../src/language/functions';

const workspaces: Blockly.Workspace[] = [];
function ws() { const workspace = createWorkspace(); workspaces.push(workspace); return workspace; }
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
function block(w: Blockly.Workspace, type: string, fields: Record<string, string> = {}) {
  const b = w.newBlock(type); for (const [key, value] of Object.entries(fields)) b.setFieldValue(value, key); return b;
}
function plug(parent: Blockly.Block, input: string, child: Blockly.Block) { parent.getInput(input)!.connection!.connect(child.outputConnection ?? child.previousConnection!); return parent; }
function num(w: Blockly.Workspace, value: string | number) { return block(w, 'py_number', { VALUE: String(value) }); }
function print(w: Blockly.Workspace, value: Blockly.Block) { return plug(block(w, 'text_print'), 'TEXT', value); }
function program(w: Blockly.Workspace, body: Blockly.Block) { return plug(block(w, 'py_program'), 'BODY', body); }
function binary(w: Blockly.Workspace, op: string, a: Blockly.Block, b: Blockly.Block) { return plug(plug(block(w, 'py_binary', { OP: op }), 'A', a), 'B', b); }
function run(w: Blockly.Workspace) {
  const result = compile(w);
  expect(result.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const execution = spawnSync('python3', ['-c', result.source!], { encoding: 'utf8', timeout: 3000 });
  return { ...result, ...execution };
}

describe('sequential Python semantics', () => {
  it('preserves integer digits and expression grouping', () => {
    const w = ws();
    program(w, print(w, binary(w, '+', num(w, '9007199254740993'), binary(w, '**', num(w, -2), num(w, 2)))));
    expect(run(w).stdout).toBe('9007199254740997\n');
  });
  it('short-circuits without evaluating the failing right operand', () => {
    const w = ws();
    const logic = plug(plug(block(w, 'py_logic', { OP: 'and' }), 'A', num(w, 0)), 'B', binary(w, '/', num(w, 1), num(w, 0)));
    program(w, print(w, logic));
    expect(run(w).stdout).toBe('0\n');
  });
  it.each(['2.5', '-2', '0'])('uses Python range for repeat count %s', count => {
    const w = ws();
    const loop = plug(plug(block(w, 'controls_repeat_ext'), 'TIMES', num(w, count)), 'DO', print(w, num(w, 1)));
    program(w, loop);
    const result = run(w);
    expect(result.source).not.toMatch(/\bint\(/);
    if (count === '2.5') expect(result.stderr).toContain('TypeError');
    else { expect(result.status).toBe(0); expect(result.stdout).toBe(''); }
  });
  it('supports stop-exclusive descending ranges and break', () => {
    const w = ws(); const variable = w.getVariableMap().createVariable('index');
    const loop = block(w, 'py_range', { VAR: variable.getId() });
    for (const [input, value] of [['START', 5], ['STOP', 0], ['STEP', -2]] as const) plug(loop, input, num(w, value));
    const output = print(w, block(w, 'variables_get', { VAR: variable.getId() }));
    plug(loop, 'DO', output); program(w, loop);
    expect(run(w).stdout).toBe('5\n3\n1\n');
    output.nextConnection!.connect(block(w, 'py_flow', { FLOW: 'break' }).previousConnection!);
    expect(run(w).stdout).toBe('5\n');
  });
  it('reports a zero range step as a Python ValueError', () => {
    const w = ws(); const loop = block(w, 'py_range');
    for (const input of ['START', 'STOP', 'STEP']) plug(loop, input, num(w, 0));
    program(w, loop); expect(run(w).stderr).toContain('ValueError');
  });
  it('does not initialize a read-before-assignment variable', () => {
    const w = ws(); const variable = w.getVariableMap().createVariable('score');
    program(w, print(w, block(w, 'variables_get', { VAR: variable.getId() })));
    const result = run(w);
    expect(result.source).not.toContain('score = None');
    expect(result.stderr).toContain('NameError');
  });
  it('makes conversion explicit', () => {
    const w = ws();
    program(w, print(w, plug(block(w, 'py_convert', { TYPE: 'int' }), 'VALUE', block(w, 'text', { TEXT: '42' }))));
    expect(run(w).stdout).toBe('42\n');
  });
  it('preserves division, floor division, negative remainder, text joining, and conversion results', () => {
    const w = ws();
    const join = block(w, 'text_join'); join.loadExtraState!({ itemCount: 2 }); plug(join, 'ADD0', block(w, 'text', { TEXT: 'score=' })); plug(join, 'ADD1', num(w, 3));
    const expressions = [binary(w, '/', num(w, -7), num(w, 2)), binary(w, '//', num(w, -7), num(w, 2)), binary(w, '%', num(w, -7), num(w, 2)), join,
      plug(block(w, 'py_convert', { TYPE: 'float' }), 'VALUE', block(w, 'text', { TEXT: '2.5' })),
      plug(block(w, 'py_convert', { TYPE: 'bool' }), 'VALUE', block(w, 'text', { TEXT: '' })),
      plug(block(w, 'py_convert', { TYPE: 'str' }), 'VALUE', block(w, 'py_none'))];
    const outputs = expressions.map(e => print(w, e)); outputs.slice(1).forEach((b, i) => outputs[i].nextConnection!.connect(b.previousConnection!)); program(w, outputs[0]);
    expect(run(w).stdout).toBe('-3.5\n-4\n1\nscore=3\n2.5\nFalse\nNone\n');
  });
  it('returns truthy or operands without evaluating failing alternatives and preserves conversion errors', () => {
    const w = ws(); const expression = plug(plug(block(w, 'py_logic', { OP: 'or' }), 'A', block(w, 'text', { TEXT: 'ready' })), 'B', binary(w, '/', num(w, 1), num(w, 0)));
    const output = print(w, expression); program(w, output); expect(run(w).stdout).toBe('ready\n');
    expression.dispose(); plug(output, 'TEXT', plug(block(w, 'py_convert', { TYPE: 'int' }), 'VALUE', block(w, 'text', { TEXT: 'oops' })));
    expect(run(w).stderr).toContain('ValueError');
  });
  it.each(['WHILE', 'UNTIL'])('uses Python truthiness in %s loops without synthetic conversion', mode => {
    const w = ws(); const id = createVariable(w, 'count').getId();
    const read = () => block(w, 'py_get', { SYMBOL: id });
    const assign = (value: Blockly.Block) => plug(block(w, 'py_set', { SYMBOL: id }), 'VALUE', value);
    const start = assign(num(w, mode === 'WHILE' ? 3 : 0)); const loop = block(w, 'controls_whileUntil', { MODE: mode });
    plug(loop, 'BOOL', read()); const output = print(w, read()); output.nextConnection!.connect(assign(binary(w, mode === 'WHILE' ? '-' : '+', read(), num(w, 1))).previousConnection!);
    plug(loop, 'DO', output); start.nextConnection!.connect(loop.previousConnection!); program(w, start);
    expect(run(w).stdout).toBe(mode === 'WHILE' ? '3\n2\n1\n' : '0\n');
  });
  it('selects nested elif and else branches using ordinary Python conditions', () => {
    const w = ws(); const outer = block(w, 'controls_if'); outer.loadExtraState!({ hasElse: true });
    plug(outer, 'IF0', block(w, 'text', { TEXT: 'truthy' })); plug(outer, 'ELSE', print(w, num(w, 99)));
    const inner = block(w, 'controls_if'); inner.loadExtraState!({ elseIfCount: 1, hasElse: true });
    plug(inner, 'IF0', num(w, 0)); plug(inner, 'DO0', print(w, num(w, 1))); plug(inner, 'IF1', block(w, 'py_none')); plug(inner, 'DO1', print(w, num(w, 2))); plug(inner, 'ELSE', print(w, num(w, 3)));
    plug(outer, 'DO0', inner); program(w, outer); expect(run(w).stdout).toBe('3\n');
    inner.getInputTargetBlock('IF1')!.dispose(); plug(inner, 'IF1', num(w, 1)); expect(run(w).stdout).toBe('2\n');
  });
  it('rejects fractional range bounds in scoped loops with a native TypeError', () => {
    const w = ws(); const index = createVariable(w, 'index').getId(); const loop = block(w, 'py_scoped_range', { SYMBOL: index });
    plug(loop, 'START', num(w, 0)); plug(loop, 'STOP', num(w, 3.5)); plug(loop, 'STEP', num(w, 1)); program(w, loop);
    expect(run(w).stderr).toContain('TypeError');
  });
  it.each(['EQ', 'LT'])('keeps differently typed comparison operands connected for Python %s semantics', async op => {
    const w = ws(); const comparison = block(w, 'logic_compare', { OP: op });
    const number = num(w, 1); const text = block(w, 'text', { TEXT: '1' });
    plug(comparison, 'A', number); plug(comparison, 'B', text); program(w, print(w, comparison));
    // The inherited comparison handler runs after Blockly delivers its events.
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(comparison.getInputTargetBlock('A')).toBe(number);
    expect(comparison.getInputTargetBlock('B')).toBe(text);
    const result = run(w);
    if (op === 'EQ') expect(result.stdout).toBe('False\n');
    else expect(result.stderr).toContain('TypeError');
  });
  it('assigns state, iterates text, and continues within a conditional', () => {
    const w = ws(); const v = w.getVariableMap().createVariable('letter');
    const each = block(w, 'controls_forEach', { VAR: v.getId() });
    plug(each, 'LIST', block(w, 'text', { TEXT: 'abc' }));
    const condition = block(w, 'controls_if');
    const comparison = block(w, 'logic_compare', { OP: 'EQ' });
    plug(comparison, 'A', block(w, 'variables_get', { VAR: v.getId() }));
    plug(comparison, 'B', block(w, 'text', { TEXT: 'b' }));
    plug(condition, 'IF0', comparison); plug(condition, 'DO0', block(w, 'py_flow', { FLOW: 'continue' }));
    condition.nextConnection!.connect(print(w, block(w, 'variables_get', { VAR: v.getId() })).previousConnection!);
    plug(each, 'DO', condition); program(w, each);
    expect(run(w).stdout).toBe('a\nc\n');
  });
  it('uses truthiness in elif branches and maps their condition errors to the if block', () => {
    const w = ws(); const condition = block(w, 'controls_if');
    condition.loadExtraState!({ elseIfCount: 1, hasElse: true });
    plug(condition, 'IF0', num(w, 0)); plug(condition, 'DO0', print(w, num(w, 1)));
    plug(condition, 'IF1', num(w, 2)); plug(condition, 'DO1', print(w, num(w, 2)));
    plug(condition, 'ELSE', print(w, num(w, 3))); program(w, condition);
    expect(run(w).stdout).toBe('2\n');
    condition.getInputTargetBlock('IF1')!.dispose();
    plug(condition, 'IF1', binary(w, '/', num(w, 1), num(w, 0)));
    const result = compile(w);
    const line = result.source!.split('\n').findIndex(l => l.startsWith('elif')) + 1;
    expect(blockForLine(result, 'program.py', line)).toBe(condition.id);
  });
});

describe('structure, diagnostics, and source identity', () => {
  it('ignores loose drafts and layout when compiling the program', () => {
    const w = ws(); const root = program(w, print(w, num(w, 1))); const draft = print(w, num(w, 999));
    const first = compile(w); root.moveBy(500, 800); draft.moveBy(-100, -900);
    expect(compile(w).source).toBe(first.source);
    expect(first.diagnostics).toContainEqual(expect.objectContaining({ code: 'inactive-draft', blockId: draft.id }));
    expect(run(w).stdout).toBe('1\n');
  });
  it('blocks missing inputs, duplicate roots, and invalid control context', () => {
    const w = ws(); const out = block(w, 'text_print'); program(w, out);
    expect(compile(w)).toMatchObject({ source: null, diagnostics: [expect.objectContaining({ code: 'missing-input', blockId: out.id, input: 'TEXT' })] });
    plug(out, 'TEXT', num(w, 3));
    const extra = block(w, 'py_program'); expect(compile(w).source).toBeNull(); extra.dispose();
    out.nextConnection!.connect(block(w, 'py_flow').previousConnection!);
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'flow-outside-loop' }));
  });
  it('rejects invalid numeric text and reserved names before generation', () => {
    const w = ws(); const n = num(w, '1); print(99)'); program(w, print(w, n));
    expect(compile(w).source).toBeNull();
    n.setFieldValue('0', 'VALUE');
    const variable = w.getVariableMap().createVariable('not a name');
    const root = w.getTopBlocks(false)[0]; root.getInputTargetBlock('BODY')!.dispose();
    plug(root, 'BODY', print(w, block(w, 'variables_get', { VAR: variable.getId() })));
    expect(compile(w).diagnostics).toContainEqual(expect.objectContaining({ code: 'invalid-name' }));
  });
  it('maps nested statements and subsequent statements independently', () => {
    const w = ws(); const failure = print(w, binary(w, '/', num(w, 1), num(w, 0)));
    const loop = plug(plug(block(w, 'controls_repeat_ext'), 'TIMES', num(w, 2)), 'DO', failure);
    const after = print(w, num(w, 42)); loop.nextConnection!.connect(after.previousConnection!); program(w, loop);
    const result = compile(w); const lines = result.source!.split('\n');
    expect(blockForLine(result, 'program.py', lines.findIndex(l => l.includes('range(')) + 1)).toBe(loop.id);
    expect(blockForLine(result, 'program.py', lines.findIndex(l => l.includes('/')) + 1)).toBe(failure.id);
    expect(blockForLine(result, 'program.py', lines.findIndex(l => l.includes('print(42)')) + 1)).toBe(after.id);
    expect(result.source).not.toContain('pb-map-');
  });
  it('maps hoisted function bodies and their return expressions', () => {
    const w = ws(); const definition = block(w, 'procedures_defreturn', { NAME: 'answer' });
    plug(definition, 'STACK', print(w, num(w, 10))); plug(definition, 'RETURN', binary(w, '/', num(w, 1), num(w, 0)));
    const result = compile(w);
    const line = result.source!.split('\n').findIndex(l => l.includes('return')) + 1;
    expect(blockForLine(result, 'program.py', line)).toBe(definition.id);
  });
  it('accepts only complete numeric literals', () => {
    for (const value of ['0', '-1', '1.25', '.5', '1.', '-2e-3', '9007199254740993']) expect(isPythonNumber(value)).toBe(true);
    for (const value of ['', '01', 'NaN', '1e', '1\nprint(2)', '--2']) expect(isPythonNumber(value)).toBe(false);
  });
});

describe('recorded inherited generator behaviors', () => {
  it('documents the implicit repeat conversion replaced by our generator', () => {
    const w = ws(); const loop = block(w, 'controls_repeat_ext');
    plug(loop, 'TIMES', block(w, 'math_number', { NUM: '2.5' }));
    expect(inherited.workspaceToCode(w)).toContain('range(2)');
  });
  it('documents variable initialization and broad function globals pending scoped functions', () => {
    const w = ws(); const v = w.getVariableMap().createVariable('score');
    const definition = block(w, 'procedures_defnoreturn', { NAME: 'show' });
    plug(definition, 'STACK', print(w, block(w, 'variables_get', { VAR: v.getId() })));
    const source = inherited.workspaceToCode(w);
    expect(source).toContain('score = None'); expect(source).toContain('global score');
  });
  it('documents missing-input fallback and layout-dependent loose execution', () => {
    const w = ws(); const one = block(w, 'text_print'); const two = print(w, block(w, 'math_number', { NUM: '2' }));
    const before = inherited.workspaceToCode(w); one.moveBy(0, 100); two.moveBy(0, -100);
    expect(before).toContain("print('')"); expect(inherited.workspaceToCode(w)).not.toBe(before);
  });
});
