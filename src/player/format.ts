import { validateScene, type SceneState } from '../scene/model';
import type { ExecutionMode } from '../runtime/protocol';

export interface PlayManifest {
  format: 'python-blocks-playable';
  version: 1;
  executionMode: ExecutionMode;
  requiresSound: boolean;
  scene: boolean;
  modules: string[];
}
export interface PlayProgram { source: string; files: Record<string, string>; scene?: SceneState; manifest: PlayManifest }
export function validatePlayManifest(value: unknown): asserts value is PlayManifest {
  const p = value as PlayManifest;
  if (!p || p.format !== 'python-blocks-playable' || p.version !== 1 || !['events', 'sequential'].includes(p.executionMode)
    || typeof p.requiresSound !== 'boolean' || typeof p.scene !== 'boolean' || !Array.isArray(p.modules) || p.modules.length > 64
    || new Set(p.modules).size !== p.modules.length || p.modules.some(n => typeof n !== 'string' || !/^_pb_module_[0-9]+\.py$/.test(n)))
    throw new Error('This playable project has an invalid manifest. Export it again from Python Blocks.');
}

/** Bound decompressed response bytes too; an incorrect Content-Length cannot bypass the limit. */
export async function fetchBytes(url: URL, limit: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${url.pathname} (${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`Empty response for ${url.pathname}.`);
  const parts: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      length += value.length; if (length > limit) throw new Error(`File exceeds the supported size: ${url.pathname}.`);
      parts.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export async function loadPlayProgram(base: URL, signal?: AbortSignal): Promise<PlayProgram> {
  const read = async (name: string, limit: number) => new TextDecoder('utf-8', { fatal: true }).decode(await fetchBytes(new URL(name, base), limit, signal));
  const manifest: unknown = JSON.parse(await read('player.json', 32_000)); validatePlayManifest(manifest);
  const source = await read('program.py', 32_000_000), files: Record<string, string> = {};
  let total = source.length;
  for (const name of manifest.modules) { const text = await read(name, 32_000_000); total += text.length; if (total > 64_000_000) throw new Error('The program sources are too large.'); files[name] = text; }
  const scene: SceneState | undefined = manifest.scene ? JSON.parse(await read('scene.json', 32_000_000)) : undefined;
  if (scene) validateScene(scene);
  else if (manifest.scene) throw new Error('The scene is missing.');
  return { source, files, scene, manifest };
}
