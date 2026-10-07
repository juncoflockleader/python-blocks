import type { PyodideInterface } from 'pyodide';
import playgroundSource from './playground.py?raw';
import executionSource from './execution.py?raw';
import eventsSource from './events.py?raw';
import type { RunnerCommand, RunnerEvent } from './protocol';
import { eventLimits, isDrawCommand } from './protocol';

const send = (event: RunnerEvent) => self.postMessage(event);
let started = false;
let ready = false;
let python: PyodideInterface | null = null;

self.onmessage = async (event: MessageEvent<RunnerCommand>) => {
  const command = event.data;
  if (command.type === 'ping') { send({ type: 'pong', id: command.id }); return; }
  if (command.type === 'event') {
    if (!ready || !python) { send({ type: 'event-ack', id: command.id, accepted: false }); return; }
    try {
      python.globals.set('_host_event_json', command.message);
      const accepted = python.runPython('receive_host_event(_host_event_json)') as boolean;
      send({ type: 'event-ack', id: command.id, accepted });
    } catch (error) {
      ready = false;
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
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
    python = await loadPyodide({ indexURL, stdout: output, stderr: output });
    python.registerJsModule('_playground_host', {
      emit: (json: string) => {
        const command: unknown = JSON.parse(json);
        if (!isDrawCommand(command)) throw new Error('The drawing command is invalid.');
        send({ type: 'draw', command });
      },
      session_ready: () => { ready = true; send({ type: 'ready' }); },
    });
    python.FS.writeFile('/home/pyodide/playground.py', playgroundSource);
    python.FS.writeFile('/home/pyodide/_playground_events.py', eventsSource);
    python.FS.writeFile('/home/pyodide/event-limits.json', JSON.stringify(eventLimits));
    send({ type: 'status', message: 'Running Python…' });
    send({ type: 'started' });
    python.runPython(executionSource);
    python.globals.set('_program_source', command.code);
    python.globals.set('_generated_modules_json', JSON.stringify(command.files ?? {}));
    const result = await python.runPythonAsync(command.mode === 'events'
      ? 'from _playground_host import session_ready\nawait run_event_program(_program_source, session_ready, json.loads(_generated_modules_json))'
      : 'run_program(_program_source, json.loads(_generated_modules_json))') as string;
    ready = false;
    send(JSON.parse(result) as RunnerEvent);
  } catch (error) {
    ready = false;
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
