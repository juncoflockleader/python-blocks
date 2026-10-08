import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Blockly } from '../../src/blocks';
import { callState, defineFunction } from '../../src/blocks/core/functions';
import { convertPython, type ConvertedPython, type ParsePython } from '../../src/bridge/converter';
import type { ParseResult } from '../../src/bridge/parser-protocol';
import { compile } from '../../src/language/compiler';
import { handlerSignatures, signatureOf, type FunctionBlock } from '../../src/language/functions';
import { loadWorkspace } from '../../src/language/serialization';
import { createWorkspace, prepareProject, snapshot, type Project } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
const ws = () => { const w = createWorkspace(); workspaces.push(w); return w; };
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const cache = new Map<string, ParseResult>();
const parse: ParsePython = async source => {
  if (!cache.has(source)) cache.set(source, JSON.parse(execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))"], { input: source, encoding: 'utf8', maxBuffer: 64_000_000 })));
  return structuredClone(cache.get(source)!);
};
async function convert(source: string, base = snapshot(ws())): Promise<ConvertedPython> {
  const before = structuredClone(base), result = await convertPython(source, base, parse);
  expect(base).toEqual(before);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  const w = ws(); loadWorkspace(result.project.workspace, w);
  expect(compile(w).source).toBe(result.compilation.source);
  return result;
}
function execute(source: string, files: Record<string, string> = {}, events = false) {
  const script = `import asyncio, importlib.util, json, sys, types
sys.path.insert(0, ${JSON.stringify(resolve('src/runtime'))})
spec = importlib.util.spec_from_file_location('_playground_events', ${JSON.stringify(resolve('src/runtime/events.py'))})
runtime = importlib.util.module_from_spec(spec)
sys.modules['_playground_events'] = runtime
spec.loader.exec_module(runtime)
sys.modules['_playground_host'] = types.SimpleNamespace(emit=lambda value: None)
from execution import run_event_program, run_program
data = json.load(sys.stdin)
async def main():
    task = asyncio.create_task(run_event_program(data['source'], files=data['files']))
    for _ in range(1000):
        await asyncio.sleep(0.001)
        if task.done(): return await task
        session = runtime.events
        if session.state == 'running' and not session._queue and not session._tasks:
            task.cancel()
            await task
            return json.dumps({'type': 'done'})
    raise AssertionError('Fixture did not become idle')
sys.stderr.write(asyncio.run(main()) if data['events'] else run_program(data['source'], data['files']))
`;
  const result = spawnSync('python3', ['-c', script], { input: JSON.stringify({ source, files, events }), encoding: 'utf8', timeout: 3000 });
  expect(result.status, result.stderr).toBe(0); const details = JSON.parse(result.stderr);
  return { output: result.stdout, error: details.exceptionType, message: details.message };
}
async function equivalent(source: string, output: string, error?: string, base?: Project) {
  const result = await convert(source, base), events = result.compilation.executionMode === 'events';
  const before = execute(source, result.compilation.files, events), after = execute(result.compilation.source!, result.compilation.files, events);
  expect(after).toEqual(before); expect(after.output).toBe(output); expect(after.error).toBe(error); return result;
}

describe('Python function and event conversion', () => {
  it('preserves recursive and mutual calls with hoisted plain definitions and early returns', async () => {
    await equivalent('def odd(n):\n    if n == 0:\n        return False\n    return even(n - 1)\ndef factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\ndef even(n):\n    if n == 0:\n        return True\n    return odd(n - 1)\ndef empty():\n    pass\ndef leave():\n    return\nprint(factorial(5))\nprint(even(8))\nprint(empty())\nprint(leave())\n', '120\nTrue\nNone\nNone\n');
  });
  it('binds parameters and loop locals separately in each function and preserves conditional unbound errors', async () => {
    await equivalent('def a(n):\n    total = 0\n    for i in range(n):\n        total = total + i\n    n = total\n    return n\ndef b(n):\n    total = n + 10\n    return total\nprint(a(4))\nprint(b(4))\n', '6\n14\n');
    await equivalent('def read():\n    print(count)\n    count = 3\ncount = 9\nread()\n', '', 'UnboundLocalError');
    await equivalent('def read():\n    if False:\n        count = 3\n    return count\nprint(read())\n', '', 'UnboundLocalError');
  });
  it('preserves explicit globals across nested declarations, reads and project mutation', async () => {
    await equivalent('def update():\n    if False:\n        global z, a\n    z = z + 1\n    a = a + 2\ndef read():\n    global z\n    return z\nz = 3\na = 4\nupdate()\nprint(read())\nprint(a)\n', '4\n6\n');
    await equivalent('def read():\n    return later\nprint(read())\nlater = 3\n', '', 'NameError');
    await equivalent('def itself():\n    global itself\n    return itself\nprint(itself() == itself)\n', 'True\n');
  });
  it('preserves native argument evaluation order and function-valued parameter shadowing', async () => {
    await equivalent('def target(a, b):\n    return a - b\ndef marker(value):\n    print(value)\n    return value\nprint(target(marker(9), marker(4)))\n', '9\n4\n5\n');
    await equivalent('def helper(n):\n    return n + 1\ndef apply(helper):\n    return helper(3)\nprint(apply(helper))\n', '4\n');
    await equivalent('def helper(n):\n    return n\ndef apply():\n    helper = 3\n    return helper(1)\nprint(apply())\n', '', 'TypeError');
  });
  it('converts stored and returned function values, lambdas and collection-held calls', async () => {
    await equivalent('def twice(n):\n    return n * 2\ndef choose():\n    return twice\ndef apply(fn, value):\n    return fn(value)\nf = twice\nitems = [f, lambda n: n + 3]\nprint(apply(f, 4))\nprint(items[1](5))\nprint(choose()(6))\nprint((lambda x, y: x - y)(9, 2))\n', '8\n8\n12\n7\n');
    await equivalent('def twice(n):\n    return n * 2\nf = lambda value: twice(value)\nprint(f(4))\n', '8\n');
    await equivalent('f = lambda value: value\nprint(f())\n', '', 'TypeError');
  });
  it('preserves async completion, payload copies, emit order and handler registration order', async () => {
    const source = 'from playground import events\nasync def second(payload):\n    print("second")\n    print(payload)\nasync def first(payload):\n    payload.append(7)\n    print(payload)\n    print(await doubled(4))\nasync def doubled(value):\n    await events.wait(0)\n    return value * 2\nitems = [1]\nevents.emit("message", items)\nitems.append(9)\nevents.on("message", first)\nevents.on("message", second)\n';
    const result = await equivalent(source, '[1, 7]\nsecond\n[1]\n8\n');
    const w = ws(); loadWorkspace(result.project.workspace, w);
    expect(handlerSignatures(w).map(s => s.name)).toEqual(['first', 'second']);
    const reversed = source.replace('events.on("message", first)\nevents.on("message", second)', 'events.on("message", second)\nevents.on("message", first)');
    await equivalent(reversed, 'second\n[1]\n[1, 7]\n8\n', undefined, result.project);
  });
  it('retains function, parameter and local identities across changed bodies, parameter reorder and rename', async () => {
    const first = await convert('def subtract(left, right):\n    answer = left - right\n    return answer\nprint(subtract(9, 2))\n');
    const initial = ws(); loadWorkspace(first.project.workspace, initial);
    const fn = initial.getTopBlocks(false).find(b => b.type === 'py_function') as FunctionBlock;
    fn.moveBy(100, 150); const base = snapshot(initial);
    const updated = await equivalent('def subtract(right, left):\n    answer = left - right + 1\n    return answer\nprint(subtract(2, 9))\n', '8\n', undefined, base);
    const w = ws(); loadWorkspace(updated.project.workspace, w); const model = w.getProcedureMap().get(fn.functionId)!;
    expect(model.getParameters().map(p => p.getId())).toEqual(fn.signature.parameters.map(p => p.id).reverse());
    expect(w.getBlockById(fn.id)?.getRelativeToSurfaceXY()).toEqual(fn.getRelativeToSurfaceXY());
    expect(updated.project.workspace.variables.filter((v: any) => v.name === 'answer')).toEqual(base.workspace.variables.filter((v: any) => v.name === 'answer'));
    const renamed = await equivalent('def subtract(right, amount):\n    answer = amount - right\n    return answer\nprint(subtract(2, 9))\n', '7\n', undefined, updated.project);
    const last = ws(); loadWorkspace(renamed.project.workspace, last);
    expect(signatureOf(last.getProcedureMap().get(fn.functionId)!).parameters.map(p => p.id)).toEqual(signatureOf(model).parameters.map(p => p.id));
  });
  it('allows deleting and renaming functions and changing a former local into a parameter', async () => {
    const first = await convert('def old():\n    value = 4\n    return value\nprint(old())\n');
    await equivalent('def old(value):\n    return value\nprint(old(5))\n', '5\n', undefined, first.project);
    const renamed = await equivalent('def renamed():\n    value = 6\n    return value\nprint(renamed())\n', '6\n', undefined, first.project);
    const removed = await equivalent('print(7)', '7\n', undefined, renamed.project);
    expect(removed.project.workspace.blocks.blocks.some((b: any) => b.type === 'py_function')).toBe(false);
  });
  it.each([
    ['print(f())\ndef f():\n    return 1', 'before startup'],
    ['def f(x=1):\n    return x', 'ordinary positional'],
    ['def f(x, /):\n    return x', 'ordinary positional'],
    ['def f(*args):\n    return args', 'ordinary positional'],
    ['def f(x: int):\n    return x', 'annotations'],
    ['@decorator\ndef f():\n    pass', 'Decorators'],
    ['def f():\n    def g():\n        pass\n    return g', 'Nested function'],
    ['x = 1\nf = lambda: x', 'only its own parameters'],
    ['f = lambda x: (lambda y: x + y)', 'only its own parameters'],
    ['def f():\n    return\n    print(1)', 'terminating block'],
    ['async def f():\n    return 1\nprint(f())', 'with await'],
    ['async def f():\n    return 1\nx = f', 'synchronous functions only'],
    ['def f():\n    return 1\nasync def g():\n    return await f()', 'must not use await'],
    ['from playground import events\nasync def f(payload):\n    pass\nevents.on("start", f)\nprint(1)', 'registration timing'],
    ['from playground import events\nasync def f(payload):\n    pass\nevents.on("start", f)\nevents.on("message", f)', 'one registration'],
    ['from playground import events\ndef f(payload):\n    pass\nevents.on("start", f)', 'async definition'],
    ['from playground import events\nasync def f(payload):\n    await f(payload)\nevents.on("start", f)', 'instead of calling'],
  ])('rejects unsupported scope or timing without a partial candidate: %s', async (source, message) => {
    const base = snapshot(ws()), saved = structuredClone(base), result = await convertPython(source, base, parse);
    expect(base).toEqual(saved); expect(result.ok).toBe(false);
    if (!result.ok) { expect(result.diagnostics[0].message).toContain(message); expect(result.diagnostics[0].span).toBeDefined(); }
  });
});

describe('pinned modules and existing language fixtures', () => {
  it.each(['consumer.json', 'transitive-consumer.json', 'async-consumer.json', 'module-error.json'])('edits %s while preserving every imported definition and generated module file', async name => {
    const base = prepareProject(readFileSync(`tests/fixtures/modules/${name}`, 'utf8')).project;
    const w = ws(); loadWorkspace(base.workspace, w); const original = compile(w);
    const source = original.source!.replace(/(\d+)(?=\))/, number => String(Number(number) + 1));
    expect(source).not.toBe(original.source);
    const result = await convert(source, base);
    expect(result.project.workspace.pythonModules).toEqual(base.workspace.pythonModules);
    expect(result.compilation.files).toEqual(original.files);
    expect(execute(result.compilation.source!, result.compilation.files, result.compilation.executionMode === 'events')).toEqual(execute(source, original.files, original.executionMode === 'events'));
  });
  it.each(['function-values', 'lambdas', 'events'].flatMap(folder => readdirSync(`tests/fixtures/${folder}`).filter(name => name.endsWith('.json') && name !== 'capture.json').map(name => `${folder}/${name}`)))('converts the generated %s fixture with a harmless source edit', async name => {
    const base = prepareProject(readFileSync(`tests/fixtures/${name}`, 'utf8')).project;
    const w = ws(); loadWorkspace(base.workspace, w); const original = compile(w); expect(original.source).not.toBeNull();
    const result = await convert('# learner note\n' + original.source!, base);
    expect(result.unchanged).toBe(false);
    expect(result.compilation.files).toEqual(original.files);
  });
  it('rejects changing an imported pin or inventing a missing exported function', async () => {
    const base = prepareProject(readFileSync('tests/fixtures/modules/consumer.json', 'utf8')).project;
    const w = ws(); loadWorkspace(base.workspace, w); const original = compile(w).source!;
    for (const source of [original.replace('_pb_module_0', '_pb_module_99'), original.replace(/\.[A-Za-z_]\w*\(/, '.not_exported(')]) {
      expect(source).not.toBe(original);
      const result = await convertPython(source, base, parse); expect(result.ok).toBe(false); expect(base.workspace.pythonModules).toEqual(snapshot(w).workspace.pythonModules);
    }
  });
});

describe('identity and inactive draft reconciliation', () => {
  it('recognizes an unambiguous recursive function rename without changing scope or block identities', async () => {
    const source = 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\nprint(factorial(4))\n';
    const first = await convert(source), initial = ws(); loadWorkspace(first.project.workspace, initial);
    const result = await equivalent(source.replaceAll('factorial', 'product_down'), '24\n', undefined, first.project);
    const changed = ws(); loadWorkspace(result.project.workspace, changed);
    expect(changed.getAllBlocks(false).map(b => b.id).sort()).toEqual(initial.getAllBlocks(false).map(b => b.id).sort());
    expect(changed.getProcedureMap().getProcedures()[0].getId()).toBe(initial.getProcedureMap().getProcedures()[0].getId());
    expect(changed.getProcedureMap().getProcedures()[0].getName()).toBe('product_down');
  });
  it('does not infer a rename when two removed definitions have identical bodies', async () => {
    const first = await convert('def a(n):\n    return n\ndef b(n):\n    return n\nprint(a(1))\n'), old = first.project.workspace.procedures.map((p: any) => p.id);
    const changed = await equivalent('def c(n):\n    return n\nprint(c(2))\n', '2\n', undefined, first.project);
    expect(old).not.toContain(changed.project.workspace.procedures[0].id);
  });
  it('retains every unchanged nested block and lambda identity when source formatting changes', async () => {
    const source = 'def helper(n):\n    if n:\n        return n + 1\n    return 0\nf = lambda value: helper(value)\nprint(f(3))\n';
    const first = await convert(source), w = ws(); loadWorkspace(first.project.workspace, w);
    const ids = w.getAllBlocks(false).map(b => b.id).sort();
    const changed = await convert('# learner explanation\n' + source, first.project), second = ws(); loadWorkspace(changed.project.workspace, second);
    expect(second.getAllBlocks(false).map(b => b.id).sort()).toEqual(ids);
    const originalLambda = w.getAllBlocks(false).find(b => b.type === 'py_lambda')!;
    expect(second.getBlockById(originalLambda.id)!.saveExtraState!()).toEqual(originalLambda.saveExtraState!());
    for (const span of changed.sourceMap) expect(second.getBlockById(span.blockId)).not.toBeNull();
  });
  it('retains removed arguments from inactive calls as separate drafts after a signature edit', async () => {
    const first = await convert('def total(a, b):\n    return a + b\nprint(total(2, 3))\n'), w = ws(); loadWorkspace(first.project.workspace, w);
    const fn = w.getTopBlocks(false).find(b => b.type === 'py_function') as FunctionBlock;
    const loose = Blockly.serialization.blocks.append(callState(fn.signature), w);
    const values = fn.signature.parameters.map((p, index) => { const n = w.newBlock('py_number'); n.setFieldValue(String(index + 10), 'VALUE'); loose.getInput(`ARG_${p.id}`)!.connection!.connect(n.outputConnection!); return n; });
    const result = await equivalent('def total(a):\n    return a\nprint(total(2))\n', '2\n', undefined, snapshot(w));
    const second = ws(); loadWorkspace(result.project.workspace, second);
    expect(second.getBlockById(loose.id)).not.toBeNull();
    expect(second.getBlockById(values[0].id)?.getParent()?.id).toBe(loose.id);
    expect(second.getBlockById(values[1].id)?.getParent()).toBeNull();
    expect(second.getBlockById(values[1].id)?.getFieldValue('VALUE')).toBe('11');
  });
  it('detaches disabled statements with their descendants and still converts the enabled successor', async () => {
    const first = await convert('def echo(n):\n    print(n)\n    return n\nprint(echo(4))\n'), w = ws(); loadWorkspace(first.project.workspace, w);
    const fn = w.getTopBlocks(false).find(b => b.type === 'py_function') as FunctionBlock, disabled = fn.getInputTargetBlock('BODY')!;
    const read = disabled.getInputTargetBlock('TEXT')!; disabled.setDisabledReason(true, 'user-disabled');
    const result = await equivalent('def echo(n):\n    return n + 1\nprint(echo(4))\n', '5\n', undefined, snapshot(w));
    const second = ws(); loadWorkspace(result.project.workspace, second);
    expect(second.getBlockById(disabled.id)?.isEnabled()).toBe(false); expect(second.getBlockById(disabled.id)?.getParent()).toBeNull();
    expect(second.getBlockById(disabled.id)?.getNextBlock()).toBeNull(); expect(second.getBlockById(read.id)?.getParent()?.id).toBe(disabled.id);
    expect(second.getAllBlocks(false).filter(b => b.type === 'py_return_value')).toHaveLength(1);
  });
  it('keeps dormant shadow values and disabled function roots', async () => {
    const first = await convert('print(1)'), w = ws(); loadWorkspace(first.project.workspace, w);
    const disabled = defineFunction(w, { id: 'inactive-function', name: 'draft_function', parameters: [] }); disabled.setDisabledReason(true, 'user-disabled');
    const base = snapshot(w), program = base.workspace.blocks.blocks.find((b: any) => b.type === 'py_program');
    const input = program.inputs.BODY.block.inputs.TEXT;
    input.shadow = { type: 'text', id: 'hidden-fallback', fields: { TEXT: 'saved draft text' } };
    const result = await equivalent('print(2)', '2\n', undefined, base);
    const second = ws(); loadWorkspace(result.project.workspace, second);
    expect(second.getBlockById(disabled.id)?.isEnabled()).toBe(false);
    const nextProgram = result.project.workspace.blocks.blocks.find((b: any) => b.type === 'py_program');
    expect(nextProgram.inputs.BODY.block.inputs.TEXT.shadow).toEqual(input.shadow);
  });
});
