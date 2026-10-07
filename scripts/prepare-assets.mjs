import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'public'), { recursive: true });
// Serve the pinned runtime locally; running a project makes no CDN request.
await cp(dirname(require.resolve('pyodide')), resolve(root, 'public/pyodide'), { recursive: true });
await cp(resolve(dirname(require.resolve('blockly')), 'media'), resolve(root, 'public/blockly'), { recursive: true });
console.log('Prepared local Pyodide runtime and Blockly media.');
