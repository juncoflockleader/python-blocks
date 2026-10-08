import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBytes, loadPlayProgram, validatePlayManifest } from '../../src/player/format';
import { validateBundle } from '../../src/project/playable-export';

afterEach(() => vi.unstubAllGlobals());
describe('portable delivery boundaries', () => {
  it('rejects file traversal, duplicate modules and incompatible formats before loading Python', () => {
    const manifest = { format: 'python-blocks-playable', version: 1, executionMode: 'events', requiresSound: false, scene: false, modules: ['_pb_module_0.py'] };
    expect(() => validatePlayManifest(manifest)).not.toThrow();
    for (const patch of [{ modules: ['../program.py'] }, { modules: ['https://other/source.py'] }, { modules: ['_pb_module_0.py','_pb_module_0.py'] }, { version: 2 }, { executionMode: 'eval' }]) expect(() => validatePlayManifest({ ...manifest, ...patch })).toThrow();
    const file = (path: string) => ({ path, bytes: 10, sha256: 'a'.repeat(64) });
    const bundle = { version: 1, files: ['index.html','serve.py','pyodide/pyodide.mjs','pyodide/pyodide.asm.wasm','pyodide/python_stdlib.zip','THIRD-PARTY-NOTICES.txt'].map(file) };
    expect(() => validateBundle(bundle)).not.toThrow();
    for (const path of ['../outside','/outside','a/../outside','https://other/source','program.py','player.json']) expect(() => validateBundle({ ...bundle, files: [...bundle.files,file(path)] })).toThrow();
    expect(() => validateBundle({ ...bundle, files: [...bundle.files,bundle.files[0]] })).toThrow();
    expect(() => validateBundle({ ...bundle, files: bundle.files.map(f => ({...f,bytes:20_000_001})) })).toThrow();
  });
  it('bounds actual streamed bytes and cancels an oversized response even with a false header', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)); }, cancel }), {headers:{'Content-Length':'1'}})));
    await expect(fetchBytes(new URL('http://localhost/asset'), 10)).rejects.toThrow('exceeds');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('loads exact Python and module text beneath the export folder and rejects a missing scene', async () => {
    const data: Record<string,string> = {'player.json':JSON.stringify({format:'python-blocks-playable',version:1,executionMode:'events',requiresSound:false,scene:false,modules:['_pb_module_0.py']}),'program.py':'print("雪")\n','_pb_module_0.py':'value = 42\n'};
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: URL) => { urls.push(url.pathname); return new Response(data[url.pathname.split('/').at(-1)!]); });
    const loaded = await loadPlayProgram(new URL('http://localhost/lessons/my-game/'));
    expect(loaded.source).toBe('print("雪")\n'); expect(loaded.files).toEqual({'_pb_module_0.py':'value = 42\n'});
    expect(urls).toEqual(['/lessons/my-game/player.json','/lessons/my-game/program.py','/lessons/my-game/_pb_module_0.py']);
    data['player.json'] = JSON.stringify({...loaded.manifest,scene:true}); data['scene.json'] = 'null';
    await expect(loadPlayProgram(new URL('http://localhost/'))).rejects.toThrow('scene is missing');
  });
});
