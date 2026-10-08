import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';

// Exercise the real Vite-built parser client and module worker before the editor
// integration exists. Only these in-memory build assets are routed; Pyodide and
// CPython are the production server's actual pinned local files.
const assets = new Map<string, Buffer>();
test.beforeAll(async () => {
  const result = await build({configFile:false,logLevel:'silent',base:'/',build:{write:false,emptyOutDir:false,minify:false,
    lib:{entry:resolve('src/bridge/parser.ts'),formats:['es'],fileName:() => 'bridge-parser-test.js'}}});
  for (const bundle of Array.isArray(result) ? result : [result]) {
    if (!('output' in bundle)) throw new Error('Expected an in-memory parser build.');
    for (const file of bundle.output) assets.set('/'+file.fileName,Buffer.from(file.type === 'chunk' ? file.code : file.source));
  }
});
async function prepare(page: Page) {
  for (const [path,body] of assets) await page.route('**'+path,route => route.fulfill({body,contentType:'text/javascript'}));
  await page.goto('/');
  await expect(page.locator('#run')).toBeVisible();
  await page.evaluate(async () => {
    const path = '/bridge-parser-test.js';
    const {PythonParser} = await import(path);
    (window as any).bridgeParser = new PythonParser();
  });
}

test('real browser CPython parses exact literals, comments and positions without executing learner code', async ({page}) => {
  await prepare(page);
  const source = '# 🙂\r\n雪 = 900719925474099312345678901234567890\r\nprint("🙂", 雪)\r\n';
  const result = await page.evaluate(source => (window as any).bridgeParser.parse(source),source);
  expect(result.ok).toBe(true); expect(result.pythonVersion).toBe('3.14.2');
  expect(result.tree.fields.body[0].fields.value.fields.value).toEqual({literalType:'int',text:'900719925474099312345678901234567890'});
  const span = result.tree.fields.body[1].span; expect(source.slice(span.start.offset,span.end.offset)).toBe('print("🙂", 雪)');
  expect(result.comments[0].text).toBe('# 🙂');
  const floats = await page.evaluate(() => (window as any).bridgeParser.parse('values = [1.0, -0.0, 1e999]\n'));
  expect(floats.ok).toBe(true);
  const values = floats.tree.fields.body[0].fields.value.fields.elts;
  expect(values[0].fields.value).toEqual({literalType:'float',text:'1.0'});
  expect(values[1]).toMatchObject({type:'UnaryOp',fields:{op:{type:'USub'},operand:{fields:{value:{literalType:'float',text:'0.0'}}}}});
  expect(values[2].fields.value).toEqual({literalType:'float',text:'inf'});
  for (const source of ['return 1','if True\n    pass','await f()']) {
    const bad = await page.evaluate(source => (window as any).bridgeParser.parse(source),source);
    expect(bad.ok).toBe(false); expect(bad.diagnostics[0]).toMatchObject({code:'syntax',span:{start:{line:1}}});
  }
  const unicodeError = await page.evaluate(() => (window as any).bridgeParser.parse('雪="🙂"; return 1'));
  expect(unicodeError.diagnostics[0].span.start).toEqual({line:1,column:8,offset:8});
  const title = await page.title();
  const inspected = await page.evaluate(() => (window as any).bridgeParser.parse('from js import document\ndocument.title = "Executed learner source"\nimport absent_module\nwhile True: pass\n'));
  expect(inspected.ok).toBe(true); expect(await page.title()).toBe(title);
  await page.evaluate(() => (window as any).bridgeParser.dispose());
});

test('parser cancellation during runtime loading releases the request and a fresh parse recovers', async ({page}) => {
  await prepare(page);
  let requested!: () => void, release!: () => void;
  const loading = new Promise<void>(r => {requested=r;}), held = new Promise<void>(r => {release=r;});
  await page.route('**/pyodide/pyodide.asm.wasm',async route => {requested(); await held; await route.continue().catch(() => {});});
  try {
    await page.evaluate(() => {
      const w = window as any; w.parseAbort = new AbortController();
      w.parsePending = w.bridgeParser.parse('value = 1',w.parseAbort.signal).then(() => 'unexpected success',(e: Error) => e.name);
    });
    await loading;
    await page.evaluate(() => (window as any).parseAbort.abort());
    expect(await page.evaluate(() => (window as any).parsePending)).toBe('AbortError');
  } finally { release(); await page.unroute('**/pyodide/pyodide.asm.wasm'); }
  const result = await page.evaluate(() => (window as any).bridgeParser.parse('value = 2\n'));
  expect(result.ok).toBe(true); expect(result.tree.fields.body[0].fields.value.fields.value.text).toBe('2');
  await page.evaluate(() => (window as any).bridgeParser.dispose());
});

test('parser startup errors recover and parsing does not stop a live scene interpreter', async ({page}) => {
  await prepare(page);
  await page.route('**/pyodide/pyodide.mjs',route => route.fulfill({status:503,body:'unavailable'}));
  const error = await page.evaluate(() => (window as any).bridgeParser.parse('').then(() => '',(e: Error) => e.message));
  expect(error).toContain('could not start'); await page.unroute('**/pyodide/pyodide.mjs');
  await page.locator('#scene-example').click(); await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText('Event session running',{timeout:60_000});
  const result = await page.evaluate(() => (window as any).bridgeParser.parse('from playground import events\nasync def tick(payload):\n    await events.wait(0.1)\nevents.on("tick", tick)\n'));
  expect(result.ok).toBe(true); await expect(page.locator('#status')).toHaveText('Event session running');
  await page.evaluate(() => (window as any).bridgeParser.dispose());
  await page.locator('#stage').focus(); await page.keyboard.down('Space');
  await expect(page.locator('#output')).toContainText('True'); await page.keyboard.up('Space');
  await page.locator('#stop').click(); await expect(page.locator('#status')).toHaveText('Stopped');
});
