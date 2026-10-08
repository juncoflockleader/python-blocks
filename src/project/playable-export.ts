import { strToU8, zip, type AsyncZippable } from 'fflate';
import type { Compilation } from '../language/compiler';
import type { Project } from './index';
import { fetchBytes, validatePlayManifest, type PlayManifest } from '../player/format';

interface BundleFile { path: string; bytes: number; sha256: string }
export function validateBundle(value: unknown): asserts value is { version: 1; files: BundleFile[] } {
  const b = value as { version: number; files: BundleFile[] };
  const safe = (p: string) => typeof p === 'string' && /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(p) && !p.split('/').some(part => part === '.' || part === '..');
  const reserved = new Set(['README.txt', 'program.py', 'scene.json', 'modules.json', 'source-map.json', 'project.python-blocks.json', 'player.json', 'bundle.json']);
  if (!b || b.version !== 1 || !Array.isArray(b.files) || !b.files.length || b.files.length > 128 || b.files.some(f => !f || !safe(f.path) || reserved.has(f.path)
    || !Number.isSafeInteger(f.bytes) || f.bytes <= 0 || f.bytes > 20_000_000 || !/^[a-f0-9]{64}$/.test(f.sha256))
    || new Set(b.files.map(f => f.path)).size !== b.files.length || b.files.reduce((n,f) => n + f.bytes,0) > 40_000_000
    || ['index.html', 'serve.py', 'pyodide/pyodide.mjs', 'pyodide/pyodide.asm.wasm', 'pyodide/python_stdlib.zip', 'THIRD-PARTY-NOTICES.txt'].some(p => !b.files.some(f => f.path === p)))
    throw new Error('The player bundle is invalid. Rebuild the app and try again.');
}
const readme = `Python Blocks playable project

1. Extract the entire ZIP into a folder.
2. Open a terminal in that folder and run: python3 serve.py
   On Windows with the Python launcher, use: py -3 serve.py
3. Open the printed local address (normally http://127.0.0.1:8000/).
4. Press Run. Click the stage for keyboard input, or use Touch controls.
   Enable audio if your browser has suspended sound. Stop ends all activities.
   Play again and Run restore the captured starting scene.
5. Press Ctrl+C in the terminal when finished.

Python 3.7+ is used only to serve files; the included browser runtime runs
your project with Python 3.14.2. No pip packages, Node, editor, account or
internet connection are required. If port 8000 is busy, use --port 8001.
Opening index.html directly as a file cannot load browser modules/WASM.
You can also serve the whole folder using another static HTTP server,
including from a subdirectory. Keep all files and their relative paths.

The player requires a modern browser with module Workers, WebAssembly,
OffscreenCanvas and Web Audio. It contains the same run limits and Stop
behavior as the editor. Its UI does not edit or save your project.

project.python-blocks.json preserves the editable blocks and original assets;
use Open project in Python Blocks to continue creating. program.py and the
_pb_module_*.py files are the exact compiled sources. scene.json (when present)
contains captured images, sounds, worlds, controls and watches. player.json
selects execution mode and source files. modules.json records module pins;
source-map.json maps source lines to block IDs for debugging. runtime-source/
contains the Python libraries; the compiled worker supplies their browser
bridge. Python source alone does not run this graphics host in desktop Python.

This ZIP captures the project when Export playable is clicked. Later editor
changes and runtime movement do not change it. Missing or damaged player
files: extract again or make a fresh export. See THIRD-PARTY-NOTICES.txt and
licenses/ for runtime attribution and corresponding source locations.
`;

export async function playableExport(compilation: Compilation, project: Project, base: URL, signal: AbortSignal, progress: (text: string) => void): Promise<Uint8Array<ArrayBuffer>> {
  if (compilation.source === null || !compilation.hasEntry) throw new Error('Add a runnable program and resolve errors before exporting.');
  // Capture before the first await. Editing while downloading never alters this archive.
  const captured = structuredClone(compilation), capturedProject = JSON.stringify(project);
  const manifest: PlayManifest = { format: 'python-blocks-playable', version: 1, executionMode: captured.executionMode, requiresSound: !!captured.requiresSound, scene: !!captured.scene, modules: Object.keys(captured.files) };
  validatePlayManifest(manifest);
  const files: AsyncZippable = Object.fromEntries(Object.entries({
    'README.txt': readme, 'program.py': captured.source!, ...captured.files, 'player.json': JSON.stringify(manifest, null, 2),
    'project.python-blocks.json': capturedProject, 'modules.json': JSON.stringify(captured.moduleSources, null, 2),
    'source-map.json': JSON.stringify(captured.sourceMap, null, 2), ...(captured.scene ? { 'scene.json': JSON.stringify(captured.scene) } : {}),
  }).map(([name, text]) => [name, strToU8(text)]));
  progress('Preparing playable export…');
  const raw = await fetchBytes(new URL('bundle.json', base), 64_000, signal);
  const bundle: unknown = JSON.parse(new TextDecoder().decode(raw)); validateBundle(bundle);
  let next = 0, done = 0;
  // Four bounded requests at a time; verify the complete pinned player before creating a ZIP.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < bundle.files.length) {
      signal.throwIfAborted(); const file = bundle.files[next++];
      const bytes = await fetchBytes(new URL(file.path, base), file.bytes, signal);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      if (bytes.length !== file.bytes || hash !== file.sha256) throw new Error(`Player file changed or is incomplete: ${file.path}. Reload the app and export again.`);
      files[file.path] = bytes; progress(`Preparing playable export… ${++done}/${bundle.files.length} files`);
    }
  }));
  files['bundle.json'] = raw; signal.throwIfAborted(); progress('Compressing playable export…');
  return new Promise((resolve, reject) => {
    const terminate = zip(files, { level: 6 }, (error, bytes) => { signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(new Uint8Array(bytes)); });
    const abort = () => { terminate(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
