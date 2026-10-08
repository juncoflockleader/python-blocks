import { expect, type Page, type Browser, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';

export async function exported(page: Page) {
  const download = page.waitForEvent('download'); await page.locator('#export-playable').click();
  const result = await download, chunks: Buffer[] = [];
  for await (const chunk of (await result.createReadStream())!) chunks.push(Buffer.from(chunk));
  expect(result.suggestedFilename()).toBe('python-blocks-playable.zip');
  return unzipSync(Buffer.concat(chunks));
}
export async function openProject(page: Page, path: string) { await page.goto('/'); await page.locator('#project-file').setInputFiles(resolve(path)); await expect(page.locator('#export-playable')).toBeEnabled(); }
export async function isolated(browser: Browser, files: Record<string, Uint8Array>, info: TestInfo, nested = false) {
  const root = info.outputPath('extracted'), folder = nested ? join(root,'lesson') : root;
  for (const [name, bytes] of Object.entries(files)) { const path = join(folder,name); await mkdir(dirname(path),{recursive:true}); await writeFile(path,bytes); }
  // The actual exported launcher also serves nested static folders correctly.
  if (nested) await writeFile(join(root,'serve.py'),files['serve.py']);
  const process = spawn('python3',[join(root,'serve.py'),'--port','0'],{cwd:root,stdio:['ignore','pipe','pipe']});
  const origin = await new Promise<string>((resolve,reject) => {
    let out = '', errors = ''; const timer = setTimeout(() => { process.kill(); reject(new Error('Export launcher timed out: '+errors)); }, 10_000);
    process.stderr.on('data', chunk => { errors += String(chunk); });
    process.once('error', e => { clearTimeout(timer); reject(e); });
    process.once('exit', code => { clearTimeout(timer); reject(new Error(`Export launcher exited ${code}: ${errors}`)); });
    process.stdout.on('data', chunk => { out += String(chunk); const url = out.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]; if (url) { clearTimeout(timer); resolve(url); } });
  });
  const context = await browser.newContext({viewport:{width:1200,height:1000}}), blocked: string[] = [], errors: string[] = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin || ['blob:','data:'].includes(url.protocol)) return route.continue();
    blocked.push(url.href); return route.abort();
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  const url = origin + (nested ? '/lesson/' : '/');
  return {page,url,folder,blocked,errors,async close() { await context.close(); process.kill(); }};
}
export const run = async (page: Page, events = true) => { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText(events ? 'Event session running' : 'Finished',{timeout:60_000}); };
export const key = async (page: Page, name: string) => { await page.locator('#stage').focus(); await page.keyboard.press(name); };
