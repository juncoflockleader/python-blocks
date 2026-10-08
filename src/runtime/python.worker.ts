import type { PyodideInterface } from 'pyodide';
import questionsSource from './questions.py?raw';
import watchersSource from './watchers.py?raw';
import { validWatchValues } from '../scene/watch-model';
import { validQuestionCommand, validQuestionReply } from '../scene/questions';
import playgroundSource from './playground.py?raw';
import executionSource from './execution.py?raw';
import eventsSource from './events.py?raw';
import sceneSource from './scene.py?raw';
import worldsSource from './worlds.py?raw';
import soundsSource from './sounds.py?raw';
import { validAudioCommand } from '../scene/sound';
import gameSource from './game.py?raw';
import physicsSource from './physics.py?raw';
import behaviorsSource from './behaviors.py?raw';
import { createSensing } from './sensing';
import { isSceneCommand, validateInput, validateScene } from '../scene/model';
import type { RunnerCommand, RunnerEvent } from './protocol';
import { eventLimits, isDrawCommand } from './protocol';

const send = (event: RunnerEvent) => self.postMessage(event);
let started = false;
let ready = false;
let python: PyodideInterface | null = null;

self.onmessage = async (event: MessageEvent<RunnerCommand>) => {
  const command = event.data;
  if (command.type === 'answer') {
    if (python && validQuestionReply(command.reply)) {
      python.globals.set('_question_reply', JSON.stringify(command.reply));
      python.runPython('from _playground_questions import receive_answer\n_pb_answer = json.loads(_question_reply)\nreceive_answer(_pb_answer["id"], _pb_answer["answer"])');
    }
    return;
  }
  if (command.type === 'audio-ended') {
    if (python) {
      python.globals.set('_audio_completion_json', JSON.stringify(command));
      python.runPython('from _playground_sounds import receive_audio\n_pb_audio_reply = json.loads(_audio_completion_json)\nreceive_audio(_pb_audio_reply["id"], _pb_audio_reply.get("error"))');
    }
    return;
  }
  if (command.type === 'ping') { send({ type: 'pong', id: command.id }); return; }
  if (command.type === 'event' || command.type === 'input') {
    if (!ready || !python) { send({ type: 'event-ack', id: command.id, accepted: false }); return; }
    try {
      if (command.type === 'input') validateInput(command.input);
      python.globals.set('_host_event_json', command.type === 'input' ? JSON.stringify(command.input) : command.message);
      const accepted = python.runPython(command.type === 'input' ? 'from _playground_scene import receive_input\nreceive_input(_host_event_json)' : 'receive_host_event(_host_event_json)') as boolean;
      send({ type: 'event-ack', id: command.id, accepted });
    } catch (error) {
      ready = false;
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (started) return;
  started = true;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  try {
    send({ type: 'status', message: 'Starting Python…' });
    const indexURL = command.runtimeURL ?? new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href;
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
    if (command.scene) validateScene(command.scene);
    const sceneSense = await createSensing(command.scene);
    python.registerJsModule('_playground_host', {
      emit: (json: string) => {
        const command: unknown = JSON.parse(json);
        if (!isDrawCommand(command)) throw new Error('The drawing command is invalid.');
        sceneSense.draw(command); send({ type: 'draw', command });
      },
      scene_emit: (json: string) => {
        const command: unknown = JSON.parse(json);
        if (!isSceneCommand(command)) throw new Error('Invalid sprite update.');
        sceneSense.accept(command); send({ type: 'scene', command });
      },
      audio_emit: (json: string) => {
        const command: unknown = JSON.parse(json);
        if (!validAudioCommand(command)) throw new Error('Invalid sound command.');
        send({ type: 'audio', command });
      },
      question_emit: (json: string) => { const command: unknown = JSON.parse(json); if (!validQuestionCommand(command)) throw new Error('Invalid question request.'); send({ type: 'question', command }); },
      scene_sense: sceneSense.query,
      session_ready: () => { ready = true; send({ type: 'ready' }); },
    });
    if (command.scene) { validateScene(command.scene); python.FS.writeFile('/home/pyodide/scene.json', JSON.stringify(command.scene)); }
    python.FS.writeFile('/home/pyodide/_playground_scene.py', sceneSource);
    python.FS.writeFile('/home/pyodide/_playground_questions.py', questionsSource);
    python.FS.writeFile('/home/pyodide/_playground_watchers.py', watchersSource);
    python.FS.writeFile('/home/pyodide/_playground_behaviors.py', behaviorsSource);
    python.FS.writeFile('/home/pyodide/_playground_physics.py', physicsSource);
    python.FS.writeFile('/home/pyodide/_playground_worlds.py', worldsSource);
    python.FS.writeFile('/home/pyodide/_playground_game.py', gameSource);
    python.FS.writeFile('/home/pyodide/_playground_sounds.py', soundsSource);
    python.FS.writeFile('/home/pyodide/playground.py', playgroundSource);
    python.FS.writeFile('/home/pyodide/_playground_events.py', eventsSource);
    python.FS.writeFile('/home/pyodide/event-limits.json', JSON.stringify(eventLimits));
    send({ type: 'status', message: 'Running Python…' });
    send({ type: 'started' });
    python.runPython(executionSource);
    python.globals.set('_program_source', command.code);
    python.globals.set('_generated_modules_json', JSON.stringify(command.files ?? {}));
    let previousWatch = '';
    const publishWatches = () => {
      if (!command.scene?.watchers?.length || !python) return;
      const json = python.runPython('_pb_watch_json(_pb_watch_list)') as string;
      if (json === previousWatch) return;
      const values: unknown = JSON.parse(json);
      if (validWatchValues(values)) { previousWatch = json; send({type:'watch-values',values}); }
    };
    if (command.scene?.watchers?.length) {
      python.globals.set('_watch_definitions', JSON.stringify(command.scene.watchers));
      python.runPython('from _playground_watchers import watch_json as _pb_watch_json\n_pb_watch_list = json.loads(_watch_definitions)');
      watchTimer = setInterval(() => { if (ready) publishWatches(); }, 100);
    }
    const result = await python.runPythonAsync(command.mode === 'events'
      ? 'from _playground_host import session_ready\nawait run_event_program(_program_source, session_ready, json.loads(_generated_modules_json))'
      : 'run_program(_program_source, json.loads(_generated_modules_json))') as string;
    ready = false;
    publishWatches();
    send(JSON.parse(result) as RunnerEvent);
  } catch (error) {
    ready = false;
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally { if (watchTimer !== undefined) clearInterval(watchTimer); }
};
