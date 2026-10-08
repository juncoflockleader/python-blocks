import './style.css';
import { Stage, validateSceneImages } from '../stage';
import { emptyScene } from '../scene/model';
import { GameView } from '../scene/game';
import { PlayInput } from '../scene/play-input';
import { Questions } from '../scene/questions';
import { initialWatch, validWatchValues, type WatchValue } from '../scene/watch-model';
import { SoundPlayer } from '../runtime/audio';
import { PythonRunner } from '../runtime/runner';
import { loadPlayProgram, type PlayProgram } from './format';

document.querySelector('#app')!.innerHTML = `
  <main class="player">
    <header><div><p class="eyebrow">MADE WITH PYTHON BLOCKS</p><h1>Let’s play.</h1></div><span id="status" role="status">Loading project…</span></header>
    <nav aria-label="Play controls"><button id="run" class="button primary" disabled>▶ Run</button><button id="stop" class="button secondary" disabled>■ Stop</button><button id="audio-enable" class="button secondary">Enable audio</button><button id="audio-mute" class="button secondary" aria-pressed="false">Mute</button><span id="audio-status" role="status">Audio ready</span></nav>
    <section aria-label="Project stage"><div class="stage-surface"><canvas id="stage" width="480" height="320" tabindex="0" aria-label="Interactive stage. Click to focus, then use arrow keys, letters, numbers, or space.">Your project appears here.</canvas><div id="game-overlay"></div></div><p id="stage-dialogue" class="stage-dialogue" role="status"></p></section>
    <section id="questions" class="questions" aria-label="Project questions"></section>
    <div id="touch-controls" class="touch-controls"></div>
    <section id="watch-readouts" aria-label="Watched sprite values" hidden><p id="watch-phase">Starting values</p><ul id="watch-values"></ul></section>
    <p class="help">Click the stage to use keys. Tab leaves the stage. Use Touch controls for on-screen buttons. Stop ends the run; Run starts fresh.</p>
    <details id="event-tools" hidden><summary>Send a test event</summary><form id="event-input"><label>Event name <input id="event-name" value="message" maxlength="128"></label><label>Payload (JSON) <textarea id="event-payload" rows="2" maxlength="32768">null</textarea></label><button id="event-send" class="button secondary" disabled>Send event</button><p id="event-input-status" role="status"></p></form></details>
    <section id="output-panel" hidden aria-label="Program output"><h2>Program output</h2><pre id="output" aria-live="polite"></pre><details id="error-details" hidden><summary>Python error details</summary><pre id="traceback"></pre></details></section>
    <footer><a href="project.python-blocks.json" download>Editable project</a><a href="program.py" download>Python source</a><a href="README.txt">How to run</a><a href="THIRD-PARTY-NOTICES.txt">Credits & licenses</a></footer>
  </main>`;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('stage'), run = el<HTMLButtonElement>('run'), stop = el<HTMLButtonElement>('stop');
const stage = new Stage(canvas), sound = new SoundPlayer(), questions = new Questions(el('questions'), canvas);
const base = new URL('./', location.href);
let program: PlayProgram | null = null, running = false, pendingPaint = false;
const game = new GameView(el('game-overlay'), () => start());
stage.onReset = () => game.reset();
const paint = () => { if (pendingPaint) return; pendingPaint = true; requestAnimationFrame(() => { pendingPaint = false; stage.paint(); el('stage-dialogue').textContent = stage.dialogue(); }); };
const watchNodes = new Map<string, HTMLOutputElement>();
const watch = (values: WatchValue[]) => { if (validWatchValues(values)) for (const value of values) { const node = watchNodes.get(value.id); if (node) { node.textContent = value.text; node.dataset.state = value.state; } } };
function resetWatches() {
  const scene = program?.scene, watches = scene?.watchers ?? [];
  watchNodes.clear(); el('watch-values').replaceChildren(); el('watch-readouts').hidden = !watches.length;
  for (const w of watches) {
    const title = `${scene!.sprites.find(s => s.id === w.sprite)?.name ?? 'Unavailable sprite'} · ${w.property === 'data' ? 'data[' + JSON.stringify(w.key) + ']' : w.property}`;
    const item = document.createElement('li'), label = document.createElement('span'), output = document.createElement('output');
    label.textContent = title; output.setAttribute('aria-label', title); output.setAttribute('aria-live', 'off'); output.dataset.watchId = w.id;
    item.append(label, output); el('watch-values').append(item); watchNodes.set(w.id, output);
  }
  watch(watches.map(w => initialWatch(w, scene!.sprites.find(s => s.id === w.sprite))));
}
const idle = () => { running = false; input.setEnabled(false); run.disabled = !program; stop.disabled = true; el<HTMLButtonElement>('event-send').disabled = true; el('watch-phase').textContent = 'Last run values'; };
const runner = new PythonRunner(event => {
  if (event.type === 'watch-values') watch(event.values);
  if (event.type === 'scene') { if (event.command.type === 'game') { if (event.command.state.result) input.setEnabled(false); game.accept(event.command.state); } stage.acceptScene(event.command); paint(); }
  if (event.type === 'draw') { stage.accept(event.command); paint(); }
  if (event.type === 'stdout') { el('output-panel').hidden = false; el('output').textContent = (el('output').textContent + event.text + '\n').slice(-20_000); }
  if (event.type === 'status') el('status').textContent = event.message;
  if (event.type === 'ready') { input.setEnabled(true); el('status').textContent = 'Event session running'; el<HTMLButtonElement>('event-send').disabled = false; }
  if (event.type === 'done') { el('status').textContent = game.state?.result ? game.state.result.won ? 'You win!' : 'Game over' : 'Finished'; idle(); paint(); }
  if (event.type === 'error') {
    el('status').textContent = 'Let’s try again'; el('output-panel').hidden = false;
    el('output').textContent = (el('output').textContent + `${event.exceptionType ? event.exceptionType + ': ' : ''}${event.message}\n`).slice(-20_000);
    el('traceback').textContent = event.details ?? ''; el('error-details').hidden = !event.details;
    idle(); paint();
  }
}, sound, questions);
const input = new PlayInput(canvas, stage, el('touch-controls'), value => runner.input(value));
questions.onActive = () => input.release();
sound.onChange = () => { el('audio-status').textContent = `${sound.count} playing · ${sound.state}`; el('audio-status').dataset.voices = String(sound.count); };
const enableAudio = () => { void sound.enable().catch(error => { el('audio-status').textContent = String(error); }); };
el('audio-enable').addEventListener('click', enableAudio);
el('audio-mute').addEventListener('click', () => { sound.mute(!sound.isMuted); el('audio-mute').textContent = sound.isMuted ? 'Unmute' : 'Mute'; el('audio-mute').setAttribute('aria-pressed', String(sound.isMuted)); });
function start() {
  if (!program || running && !game.state?.result) return;
  if (program.manifest.requiresSound) enableAudio();
  input.setEnabled(false); input.configure(program.scene?.controls);
  stage.reset(program.scene ?? emptyScene()); resetWatches(); paint();
  running = true; run.disabled = true; stop.disabled = false;
  el('output').textContent = ''; el('traceback').textContent = ''; el('output-panel').hidden = true; el('error-details').hidden = true;
  el('event-input-status').textContent = ''; el('watch-phase').textContent = 'Live values'; el('status').textContent = 'Starting Python…';
  runner.run(program.source, program.manifest.executionMode, program.files, program.scene, new URL('pyodide/', base).href);
  canvas.focus({ preventScroll: true });
}
run.addEventListener('click', start);
stop.addEventListener('click', () => { runner.stop(); stage.clearGameEffects(); idle(); paint(); });
el('event-input').addEventListener('submit', event => {
  event.preventDefault();
  try { const name = el<HTMLInputElement>('event-name').value, payload: unknown = JSON.parse(el<HTMLTextAreaElement>('event-payload').value); el('event-input-status').textContent = runner.emit(name, payload) ? `Sent event “${name}”.` : 'Run the project before sending input.'; }
  catch (error) { el('event-input-status').textContent = error instanceof Error ? error.message : String(error); }
});
const loading = new AbortController();
const timeout = setTimeout(() => loading.abort(), 60_000);
try {
  const loaded = await loadPlayProgram(base, loading.signal);
  if (loaded.scene) await validateSceneImages(loaded.scene);
  program = loaded; stage.reset(program.scene ?? emptyScene()); input.configure(program.scene?.controls); resetWatches(); paint();
  el('event-tools').hidden = program.manifest.executionMode !== 'events'; el('status').textContent = 'Ready'; run.disabled = false;
} catch (error) {
  el('status').textContent = 'Project could not load'; el('output-panel').hidden = false;
  el('output').textContent = `${error instanceof Error ? error.message : error}\nExtract the whole ZIP and run python3 serve.py from its folder. If files are missing or damaged, export the project again.`;
} finally { clearTimeout(timeout); }
const dispose = () => { loading.abort(); runner.dispose(); input.dispose(); sound.dispose(); stage.dispose(); };
window.addEventListener('pagehide', dispose);
if (import.meta.hot) import.meta.hot.dispose(dispose);
