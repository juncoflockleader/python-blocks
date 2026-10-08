import { expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { resolve } from 'node:path';
import type { ConvertedPython, ConversionResult } from '../../src/bridge/converter';

const assets = new Map<string, Buffer>();
export async function buildConverterHarness() {
  const result = await build({ configFile: false, logLevel: 'silent', base: '/', build: { write: false, emptyOutDir: false, minify: false,
    lib: { entry: resolve('tests/fixtures/bridge/converter-harness.ts'), formats: ['es'], fileName: () => 'bridge-converter-test.js' } } });
  for (const bundle of Array.isArray(result) ? result : [result]) {
    if (!('output' in bundle)) throw new Error('Expected an in-memory converter build.');
    for (const file of bundle.output) assets.set('/' + file.fileName, Buffer.from(file.type === 'chunk' ? file.code : file.source));
  }
}
export async function prepare(page: Page) {
  for (const [path, body] of assets) await page.route('**' + path, route => route.fulfill({ body, contentType: 'text/javascript' }));
  await page.goto('/'); await expect(page.locator('#run')).toBeVisible();
  await page.evaluate(async () => { const path = '/bridge-converter-test.js'; (window as any).testBridge = await import(path); });
}
export async function convert(page: Page, source: string, previous?: Pick<ConvertedPython, 'project'>) {
  const result: ConversionResult = await page.evaluate(({ source, base }) => (window as any).testBridge.convert(source, base), { source, base: previous?.project });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  expect(result.source).toBe(source); return result;
}
export async function install(page: Page, result: ConvertedPython) {
  await page.locator('#project-file').setInputFiles({ name: 'converted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(result.project)) });
  if (Object.keys(result.compilation.files).length) await expect(page.locator('#python')).toContainText(result.compilation.source!);
  else await expect(page.locator('#python')).toHaveText(result.compilation.source!);
}
