import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ConversionResult } from '../../src/bridge/converter';

import { buildConverterHarness, prepare, convert, install } from './bridge-support';

test.beforeAll(buildConverterHarness);

test('real CPython conversion renders editable blocks and executes exact numeric, alias and loop behavior', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await prepare(page);
  const source = '# submitted Python\n雪 = 90071992547409931234567890\nitems = [[1], 2]\nalias = items\ncopy = items.copy()\nalias[0].append(3)\nprint(copy)\nprint(雪)\nx = -0.0\nprint(x)\nprint(-x)\nprint([] or "ready" or 1 / 0)\nfor index in range(3, 0, -1):\n    if index == 2:\n        continue\n    print(index)\n';
  const first = await convert(page, source); await install(page, first);
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('[[1, 3], 2]\n90071992547409931234567890\n-0.0\n0.0\nready\n3\n1\n');
  const edited = await convert(page, source.replace('range(3, 0, -1)', 'range(4, 0, -1)'), first);
  expect(edited.project.workspace.variables).toEqual(first.project.workspace.variables);
  await install(page, edited); await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Finished', { timeout: 60_000 });
  await expect(page.locator('#output')).toContainText('ready\n4\n3\n1\n');
  const unchanged = await convert(page, edited.compilation.source!, edited);
  expect(unchanged.unchanged).toBe(true); expect(unchanged.project).toEqual(edited.project);
  await page.evaluate(() => (window as any).testBridge.dispose());
  await page.reload(); await expect(page.locator('#python')).toHaveText(edited.compilation.source!);
  expect(errors).toEqual([]);
});

test('browser conversion rejects unsafe rewrites without changing the loaded project and keeps runtime error order', async ({ page }) => {
  await prepare(page);
  const first = await convert(page, 'items = [0]\nitems[int("index")] = int("value")\n'); await install(page, first);
  const before = await page.locator('#python').textContent();
  const source = 'items = []\nalias = items\nitems += [1]\n';
  const rejected: ConversionResult = await page.evaluate(({ source, project }) => (window as any).testBridge.convert(source, project), { source, project: first.project });
  expect(rejected).toMatchObject({ ok: false, source, diagnostics: [{ code: 'unsupported', span: { start: { line: 3, column: 0 } } }] });
  await expect(page.locator('#python')).toHaveText(before!);
  await page.locator('#run').click(); await expect(page.locator('#output')).toContainText("invalid literal for int() with base 10: 'value'", { timeout: 60_000 });
  await expect(page.locator('#output')).not.toContainText("'index'");
  await page.evaluate(() => (window as any).testBridge.dispose());
});

test('function and lambda conversion preserves scope identities across edits in browser CPython', async ({ page }) => {
  await prepare(page);
  const source = 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\ndef apply(fn, value):\n    return fn(value)\nf = lambda value: factorial(value) + 1\nprint(apply(f, 5))\n';
  const first = await convert(page, source); await install(page, first);
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('121\n', { timeout: 60_000 });
  const changed = await convert(page, source.replace('apply(f, 5)', 'apply(f, 4)'), first); await install(page, changed);
  await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('25\n', { timeout: 60_000 });
  expect(changed.project.workspace.procedures).toEqual(first.project.workspace.procedures);
  const renamed = await convert(page, source.replace('apply(f, 5)', 'apply(f, 4)').replaceAll('factorial', 'product_down'), changed);
  expect(renamed.project.workspace.procedures.map((p: any) => p.id).sort()).toEqual(changed.project.workspace.procedures.map((p: any) => p.id).sort());
  await install(page, renamed); await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('25\n', { timeout: 60_000 });
  const failing = await convert(page, 'def read():\n    print(count)\n    count = 3\ncount = 9\nread()\n', renamed); await install(page, failing);
  await page.locator('#run').click(); await expect(page.locator('#output')).toContainText('UnboundLocalError', { timeout: 60_000 });
  await page.evaluate(() => (window as any).testBridge.dispose());
});

test('converted event handlers keep explicit await, payload isolation, order and Stop', async ({ page }) => {
  await prepare(page);
  const source = 'from playground import events\nasync def helper(value):\n    await events.wait(0)\n    return value * 2\nasync def first(payload):\n    payload.append(7)\n    print(payload)\n    print(await helper(4))\nasync def second(payload):\n    print(payload)\nitems = [1]\nevents.emit("message", items)\nitems.append(9)\nevents.on("message", first)\nevents.on("message", second)\n';
  const first = await convert(page, source); await install(page, first); await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 });
  await expect(page.locator('#output')).toHaveText('[1, 7]\n[1]\n8\n');
  await page.locator('#stop').click(); await expect(page.locator('#status')).toHaveText('Stopped');
  const changed = await convert(page, source.replace('events.on("message", first)\nevents.on("message", second)', 'events.on("message", second)\nevents.on("message", first)'), first);
  await install(page, changed); await page.locator('#run').click();
  await expect(page.locator('#output')).toHaveText('[1]\n[1, 7]\n8\n', { timeout: 60_000 });
  await page.locator('#stop').click(); await page.evaluate(() => (window as any).testBridge.dispose());
});

test('Python edits call the same pinned module and preserve its immutable files', async ({ page }) => {
  await prepare(page);
  const project = JSON.parse(readFileSync('tests/fixtures/modules/consumer.json', 'utf8'));
  await page.locator('#project-file').setInputFiles({ name: 'module.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
  // The existing read-only preview concatenates separately labelled files.
  // Only program.py is editable; pinned module source is never converter input.
  const original = (await page.locator('#python').textContent())!.split('\n# --- ')[0];
  const source = original.replace('difference(10, 3)', 'difference(12, 3)'); expect(source).not.toBe(original);
  const changed = await convert(page, source, { project });
  expect(changed.project.workspace.pythonModules).toEqual(project.workspace.pythonModules);
  expect(changed.compilation.files['_pb_module_0.py']).toContain('def difference(left, right):');
  await install(page, changed); await page.locator('#run').click(); await expect(page.locator('#output')).toHaveText('9\n', { timeout: 60_000 });
  await page.evaluate(() => (window as any).testBridge.dispose());
});
