import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'public/player');
await rename(resolve(output, 'player.html'), resolve(output, 'index.html'));
await cp(resolve(root, 'scripts/serve-player.py'), resolve(output, 'serve.py'));
await cp(resolve(root, 'licenses'), resolve(output, 'licenses'), { recursive: true });
await cp(resolve(root, 'src/player/THIRD-PARTY-NOTICES.txt'), resolve(output, 'THIRD-PARTY-NOTICES.txt'));
await mkdir(resolve(output, 'pyodide'), { recursive: true });
for (const name of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'])
  await cp(resolve(root, 'public/pyodide', name), resolve(output, 'pyodide', name));
await mkdir(resolve(output, 'runtime-source'), { recursive: true });
for (const name of (await readdir(resolve(root, 'src/runtime'))).filter(n => n.endsWith('.py') || n === 'event-limits.json'))
  await cp(resolve(root, 'src/runtime', name), resolve(output, 'runtime-source', name));
const files = [];
async function visit(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await visit(path);
    else { const data = await readFile(path); files.push({ path: relative(output, path).replaceAll('\\', '/'), bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }); }
  }
}
await visit(output);
const pyodide = JSON.parse(await readFile(resolve(root, 'node_modules/pyodide/package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(output, 'pyodide/pyodide-lock.json'), 'utf8'));
if (pyodide.version !== '314.0.7' || lock.info.python !== '3.14.2' || lock.info.platform !== 'emscripten_5_0_3')
  throw new Error('Update the pinned runtime notices and portable runtime tests before changing runtime versions.');
await writeFile(resolve(output, 'bundle.json'), JSON.stringify({ version: 1, files }, null, 2));
console.log(`Prepared standalone player: ${files.length} files, ${files.reduce((n, f) => n + f.bytes, 0)} bytes.`);
