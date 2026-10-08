import { strToU8, zipSync } from 'fflate';
import type { Compilation } from '../language/compiler';

const dependencyNote = '# Python Blocks export\n# Requires playground.py and its browser host; see docs/architecture.md.\n';
export function pythonExport(compilation: Compilation): { name: string; content: BlobPart; type: string } {
  if (compilation.source === null) throw new Error('Resolve program errors before exporting Python.');
  const eventNote = compilation.executionMode === 'events' ? '# Event module: the host initializes this source, then awaits the event session.\n' : '';
  if (!Object.keys(compilation.files).length && !compilation.scene) return { name: 'my-drawing.py', content: dependencyNote + eventNote + '\n' + compilation.source, type: 'text/x-python' };
  const files = Object.fromEntries(Object.entries({ 'program.py': compilation.source, ...compilation.files }).map(([name, source]) => [name, strToU8(source)]));
  if (compilation.scene) files['scene.json'] = strToU8(JSON.stringify(compilation.scene, null, 2));
  files['README.txt'] = strToU8('Python Blocks source archive\n\nprogram.py and the generated module files are the exact compiled sources.\nKeep scene.json (when present) and the .py files together when inspecting or adapting them.\nThis archive does not include the playground runtime or its browser host.\n' + (eventNote ? 'Event projects require a host that initializes program.py and then awaits the event session.\n' : '') + '\nUse Save project to preserve editable blocks, or Export module to share reusable definitions.\n');
  files['modules.json'] = strToU8(JSON.stringify(compilation.moduleSources, null, 2));
  return { name: 'python-sources.zip', content: new Uint8Array(zipSync(files)), type: 'application/zip' };
}
