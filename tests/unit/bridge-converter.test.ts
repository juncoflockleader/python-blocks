import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { Blockly, squareProject } from '../../src/blocks';
import { convertPython, type ConvertedPython, type ParsePython } from '../../src/bridge/converter';
import { sameSemantics } from '../../src/bridge/ast';
import type { ParseResult } from '../../src/bridge/parser-protocol';
import { compile, LANGUAGE_VERSION } from '../../src/language/compiler';
import { createVariable } from '../../src/language/functions';
import { loadWorkspace } from '../../src/language/serialization';
import { createWorkspace, prepareProject, snapshot, type Project } from '../../src/project';

const workspaces: Blockly.Workspace[] = [];
function workspace() { const w = createWorkspace(); workspaces.push(w); return w; }
afterEach(() => workspaces.splice(0).forEach(w => w.dispose()));
const cache = new Map<string, ParseResult>();
const parse: ParsePython = async source => {
  if (!cache.has(source)) cache.set(source, JSON.parse(execFileSync('python3', ['-c', "import sys; sys.path.insert(0, 'src/bridge'); from parse_python import parse_source_json; print(parse_source_json(sys.stdin.read()))"], { input: source, encoding: 'utf8', maxBuffer: 64_000_000 })));
  return structuredClone(cache.get(source)!);
};
function empty() { return snapshot(workspace()); }
async function converted(source: string, project = empty()): Promise<ConvertedPython> {
  const original = JSON.stringify(project), result = await convertPython(source, project, parse);
  expect(JSON.stringify(project)).toBe(original);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(result.source).toBe(source);
  const w = workspace(); loadWorkspace(result.project.workspace, w);
  expect(compile(w).source).toBe(result.compilation.source);
  expect(result.compilation.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const roundTrip = await convertPython(result.compilation.source!, result.project, parse);
  expect(roundTrip).toMatchObject({ ok: true, unchanged: true, project: result.project });
  return result;
}
function execute(source: string) {
  const result = spawnSync('python3', ['-c', source], { encoding: 'utf8', timeout: 1000 });
  if (result.error) throw result.error;
  return { output: result.stdout, status: result.status, error: result.stderr.trim().split('\n').at(-1) };
}
async function equivalent(source: string, output?: string, error?: string) {
  const result = await converted(source), original = execute(source), generated = execute(result.compilation.source!);
  expect(generated).toEqual(original);
  if (output !== undefined) expect(generated.output).toBe(output);
  if (error) expect(generated.error).toContain(error);
  else expect(generated.status).toBe(0);
  return result;
}

describe('Python → core blocks', () => {
  it('keeps the generated text join evaluation order and its isolated comprehension variable', async () => {
    await equivalent('def mutate():\n    values.append(1)\nvalues = []\nx = "outer"\nprint("".join([str(x) for x in [values, mutate(), values]]))\nprint(x)\n', '[1]None[1]\nouter\n');
  });
  it.each([
    '"-".join([str(x) for x in [1, 2, 3]])',
    '"".join([str(x) for x in [1, 2, 3] if x])',
    '"".join([str(x + 1) for x in [1, 2, 3]])',
    '"".join(str(x) for x in [1, 2, 3])',
  ])('rejects a general comprehension or join outside the generated pattern: %s', async expression => {
    expect(await convertPython(`print(${expression})\n`, empty(), parse)).toMatchObject({ ok: false, diagnostics: [{ code: 'unsupported' }] });
  });
  it('preserves exact integers, float identity, signed zero, infinity, Unicode and multiline text', async () => {
    await equivalent('print(0x20000000000001)\nprint(900719925474099312345678901234567890)\nprint(1.0)\nprint(-0.0)\nprint(1e999)\nprint("雪🙂")\nprint("line\\nquote\\\"\\tend")\nprint(True)\nprint(False)\nprint(None)\n', '9007199254740993\n900719925474099312345678901234567890\n1.0\n-0.0\ninf\n雪🙂\nline\nquote"\tend\nTrue\nFalse\nNone\n');
  });
  it('preserves arithmetic precedence, unary operators and Python conversions', async () => {
    await equivalent('speed = -7\nprint(-speed ** 2)\nprint((-speed) ** 2)\nprint(2 ** -3)\nprint(+(speed))\nprint(speed / 2)\nprint(speed // 2)\nprint(speed % 2)\nprint(4 - 3 - 2)\nprint(4 - (3 - 2))\nprint(int("42"))\nprint(float("2.5"))\nprint(str(False))\nprint(bool([]))\n', '-49\n49\n0.125\n-7\n-3.5\n-4\n1\n-1\n3\n42\n2.5\nFalse\nFalse\n');
  });
  it('preserves operand-returning logic and short-circuit order across several operands', async () => {
    await equivalent('print(0 and 1 / 0)\nprint([] or "yes" or 1 / 0)\nprint([1] and 2 and "end")\nprint(0 or (3 and 5))\nprint(not [])\nprint(not [0])\n', '0\nyes\nend\n5\nTrue\nFalse\n');
    await equivalent('print(0 or int("first") or int("second"))', '', "invalid literal for int() with base 10: 'first'");
  });
  it('preserves comparisons, membership and invalid mixed-type ordering', async () => {
    await equivalent('print(1 == True)\nprint(1 != "1")\nprint(2 < 3)\nprint(3 <= 3)\nprint(4 > 3)\nprint(4 >= 4)\nprint("x" in {"x": 1})\nprint(0 not in [1, 2])\n', 'True\nTrue\nTrue\nTrue\nTrue\nTrue\nTrue\nTrue\n');
    await equivalent('print(1 < "2")', '', 'TypeError');
  });
  it('keeps collection aliases, shallow copies, negative indices and dictionary operations', async () => {
    await equivalent('values = [[1], 2]\nalias = values\ncopy = values.copy()\nalias[0].append(3)\nalias[-1] = 9\nprint(copy)\nprint(values)\ndel alias[1]\nprint(values)\nvalues.append(4)\nprint(len(values))\nd = {"x": 1, "x": 2}\nd["y"] = values\nprint(d.get("missing", 8))\nprint(d.get("x", 8))\nprint(d.keys())\nprint(d.copy())\ndel d["x"]\nprint(d)\n', "[[1, 3], 2]\n[[1, 3], 9]\n[[1, 3]]\n2\n8\n2\ndict_keys(['x', 'y'])\n{'x': 2, 'y': [[1, 3], 4]}\n{'y': [[1, 3], 4]}\n");
  });
  it('preserves assignment, dictionary and eager default evaluation order', async () => {
    await equivalent('items = [0]\nitems[int("index")] = int("value")\n', '', "'value'");
    await equivalent('print({int("key"): int("value")})', '', "'key'");
    await equivalent('print({"present": 1}.get("present", int("default")))', '', "'default'");
    await equivalent('print([int("first"), int("second")])', '', "'first'");
  });
  it('preserves case-sensitive names and read-before-assignment errors without initializing variables', async () => {
    await equivalent('Score = 1\nscore = 2\n雪 = 3\nprint(Score + score + 雪)\n', '6\n');
    const result = await equivalent('print(later)\nlater = 1\n', '', 'NameError');
    expect(result.compilation.source).not.toContain('later = None');
  });
  it('converts nested branches, range forms, iteration, while, break, continue and pass', async () => {
    const source = 'for i in range(5, 0, -2):\n    if i == 3:\n        continue\n    print(i)\nfor j in range(2):\n    print(j)\nfor k in range(3, 5):\n    print(k)\nfor x in [0, 1, 2]:\n    if x == 0:\n        pass\n    elif x == 1:\n        print("one")\n    else:\n        print("two")\nn = 2\nwhile n:\n    print(n)\n    n = n - 1\n    if n == 0:\n        break\npass\n';
    await equivalent(source, '5\n1\n0\n1\n3\n4\none\ntwo\n2\n1\n');
    await equivalent('for i in range(0, 2, 0):\n    pass\n', '', 'ValueError');
    await equivalent('for i in range(2.5):\n    pass\n', '', 'TypeError');
    await equivalent('if False:\n    pass\nelse:\n    pass\nwhile False:\n    pass\n', '');
  });
  it('accepts empty programs and comments while retaining exact submitted text', async () => {
    for (const source of ['', 'pass\n', '# unfinished idea\r\n']) await equivalent(source, '');
    const source = '# headline\r\n雪 = 2 # remember this 🙂\r\nprint(雪)\r\n';
    const result = await converted(source), w = workspace(); loadWorkspace(result.project.workspace, w);
    expect(w.getAllBlocks(false).find(b => b.type === 'py_set')!.getCommentText()).toBe('remember this 🙂');
    const span = result.sourceMap.find(s => source.slice(s.span.start.offset, s.span.end.offset) === '雪 = 2');
    expect(span).toBeDefined();
  });
  it('supports the generated random import and repeat counters without exposing their names', async () => {
    await equivalent('import random\nfor _pb_repeat in range(2):\n    print(random.randint(1, 1))\nfor _pb_repeat7 in range(1):\n    print(3)\n', '1\n1\n3\n');
    const bad = await convertPython('for _pb_repeat in range(2):\n    print(_pb_repeat)\n', empty(), parse);
    expect(bad).toMatchObject({ ok: false, diagnostics: [{ code: 'unsupported' }] });
  });

  it.each([
    ['print(1 < 2 < 3)', 'Chained comparisons'],
    ['a = []\nb = a\na += [1]', 'Augmented assignment'],
    ['a = b = []', 'Multiple assignment'],
    ['a, b = [1, 2]', 'single variable'],
    ['print([1, 2][0:1])', 'Slicing'],
    ['print([x for x in [1]])', 'ListComp'],
    ['print({**{}})', '** expansion'],
    ['print(None is None)', 'Identity comparisons'],
    ['print(1, 2)', '1 positional argument'],
    ['print(1, end="")', 'positional arguments'],
    ['print({}.get("x"))', '2 positional arguments'],
    ['for i in []:\n    pass\nelse:\n    print(1)', 'for/else'],
    ['while False:\n    pass\nelse:\n    print(1)', 'while/else'],
    ['for i in [1]:\n    break\n    print(2)', 'terminating block'],
    ['import os\nos.remove("no")', 'existing library imports'],
    ['print(b"bytes")', 'bytes literals'],
    ['print(2j)', 'complex literals'],
    ['print(...)', 'ellipsis literals'],
    ['x: int = 1', 'AnnAssign'],
    ['x = 1\nx.value = 2', 'single variable'],
  ])('rejects unsupported Python with its original positioned source: %s', async (source, message) => {
    const base = empty(), saved = JSON.stringify(base), result = await convertPython(source, base, parse);
    expect(JSON.stringify(base)).toBe(saved);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.source).toBe(source);
    expect(result.diagnostics[0].message).toContain(message);
    const span = result.diagnostics[0].span;
    expect(span).toBeDefined(); expect(source.slice(span!.start.offset, span!.end.offset).length).toBeGreaterThan(0);
  });
});

describe('isolated conversion and semantic acceptance', () => {
  it.each(readdirSync('tests/fixtures/language').filter(name => name.endsWith('.json') && name !== 'missing-input.json'))('retains the unchanged generated core fixture %s without executing it', async name => {
    const project = prepareProject(readFileSync(`tests/fixtures/language/${name}`, 'utf8')).project;
    const w = workspace(); loadWorkspace(project.workspace, w);
    const source = compile(w).source; expect(source).not.toBeNull();
    const result = await converted(source!, project);
    expect(result.unchanged).toBe(true); expect(result.project).toEqual(project);
  });
  it('returns unchanged generated projects exactly, including legacy blocks and disabled/loose drafts', async () => {
    const w = workspace(); loadWorkspace(squareProject, w);
    const draft = w.newBlock('text'); draft.setFieldValue('draft', 'TEXT'); draft.moveBy(410, 210);
    const disabled = w.getAllBlocks(false).find(b => b.type === 'pen_turn')!; disabled.setDisabledReason(true, 'user-disabled');
    const base = snapshot(w), source = compile(w).source!, result = await converted(source, base);
    expect(result.unchanged).toBe(true); expect(result.project).toEqual(base);
    result.project.workspace.blocks.blocks[0].x = 1234;
    expect(snapshot(w)).toEqual(base);
  });
  it('preserves project variable and Program identities, layout and independent loose drafts', async () => {
    const w = workspace(), variable = createVariable(w, 'score'), program = w.newBlock('py_program'); program.moveBy(110, 90);
    const draft = w.newBlock('text'); draft.setFieldValue('keep me', 'TEXT'); draft.moveBy(800, 300);
    const base = snapshot(w), result = await converted('score = 3\nprint(score)', base), candidate = workspace(); loadWorkspace(result.project.workspace, candidate);
    expect(candidate.getBlockById(program.id)?.getRelativeToSurfaceXY()).toEqual(program.getRelativeToSurfaceXY());
    expect(candidate.getBlockById(draft.id)?.getFieldValue('TEXT')).toBe('keep me');
    expect(candidate.getAllBlocks(false).filter(b => ['py_get', 'py_set'].includes(b.type)).every(b => b.getFieldValue('SYMBOL') === variable.getId())).toBe(true);
    expect(snapshot(w)).toEqual(base);
  });
  it('captures the base before parser waits and propagates cancellation instead of returning a candidate', async () => {
    const base = empty(), original = structuredClone(base);
    const result = await convertPython('print(1)', base, async source => { base.languageVersion = 999; return parse(source); });
    expect(result.ok).toBe(true); if (result.ok) expect(result.project.languageVersion).toBe(LANGUAGE_VERSION);
    const abort = new AbortController();
    await expect(convertPython('print(1)', original, async source => { abort.abort(); return parse(source); }, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('rejects moved imports, missing imports and injected structural mismatches', async () => {
    for (const [source, code] of [['print(random.randint(1, 1))', 'semantic-mismatch'], ['print(1)\nimport random\nprint(random.randint(1, 1))', 'unsupported']]) {
      const result = await convertPython(source, empty(), parse);
      expect(result).toMatchObject({ ok: false, diagnostics: [{ code }] });
    }
    let calls = 0;
    const result = await convertPython('print(1)', empty(), async source => parse(++calls === 1 ? source : 'print(2)'));
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'semantic-mismatch' }] });
    const [a, b] = await Promise.all([parse('a = [1]\nb = a'), parse('a = [1]\nb = a.copy()')]);
    if (a.ok && b.ok) expect(sameSemantics(a.tree, b.tree)).toBe(false);
  });
  it('preserves Blockly event settings after success, invalid source and rejected blocks', async () => {
    const record = Blockly.Events.getRecordUndo(), group = Blockly.Events.getGroup();
    Blockly.Events.setGroup('live-user-action'); Blockly.Events.setRecordUndo(true);
    try {
      for (const source of ['print(1)', 'x =', 'x += 1']) {
        await convertPython(source, empty(), parse);
        expect(Blockly.Events.isEnabled()).toBe(true); expect(Blockly.Events.getRecordUndo()).toBe(true); expect(Blockly.Events.getGroup()).toBe('live-user-action');
      }
    } finally { Blockly.Events.setGroup(group); Blockly.Events.setRecordUndo(record); }
  });
  it('rejects oversized conversions and keeps disabled nested drafts recoverable', async () => {
    const result = await convertPython(Array.from({ length: 1001 }, () => 'print(1)').join('\n'), empty(), parse);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'limit' }] });
    const w = workspace(); loadWorkspace({ blocks: { languageVersion: 0, blocks: [{ type: 'py_program', inputs: { BODY: { block: { type: 'text_print', disabledReasons: ['user-disabled'], inputs: { TEXT: { block: { type: 'text', fields: { TEXT: 'draft' } } } } } } } }] } }, w);
    const base = snapshot(w), disabledId = w.getAllBlocks(false).find(b => !b.isEnabled())!.id;
    const changed = await converted('print(1)', base), restored = workspace(); loadWorkspace(changed.project.workspace, restored);
    expect(restored.getBlockById(disabledId)?.isEnabled()).toBe(false);
    expect(restored.getBlockById(disabledId)?.getParent()).toBeNull();
    expect(snapshot(w)).toEqual(base);
  });
  it('loads language-18 projects and saves the unary block at language 19', async () => {
    const base = empty(); base.languageVersion = 18;
    expect(prepareProject(JSON.stringify(base)).project.languageVersion).toBe(19);
    const result = await converted('x = 2\nprint(-x)', base);
    expect(result.project.languageVersion).toBe(19);
  });
});
