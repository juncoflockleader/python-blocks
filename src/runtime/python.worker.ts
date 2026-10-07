import type { PyodideInterface } from 'pyodide';
import playgroundSource from './playground.py?raw';
import type { RunnerEvent } from './protocol';
import { isDrawCommand } from './protocol';

const send = (event: RunnerEvent) => self.postMessage(event);
let started = false;

self.onmessage = async (event: MessageEvent<{ code: string }>) => {
  if (started) return;
  started = true;
  try {
    send({ type: 'status', message: 'Starting Python…' });
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
    const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`) as {
      loadPyodide: (options: { indexURL: string; stdout: (text: string) => void; stderr: (text: string) => void }) => Promise<PyodideInterface>;
    };
    let outputSize = 0;
    const output = (text: string) => {
      outputSize += text.length;
      if (outputSize > 20_000) throw new Error('Too much printed output. Try a smaller repeat count.');
      send({ type: 'stdout', text });
    };
    const python = await loadPyodide({ indexURL, stdout: output, stderr: output });
    python.registerJsModule('_playground_host', {
      emit: (json: string) => {
        const command: unknown = JSON.parse(json);
        if (!isDrawCommand(command)) throw new Error('The drawing command is invalid.');
        send({ type: 'draw', command });
      },
    });
    python.FS.writeFile('/home/pyodide/playground.py', playgroundSource);
    send({ type: 'status', message: 'Drawing…' });
    await python.runPythonAsync(event.data.code);
    send({ type: 'done' });
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
