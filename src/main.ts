import './style.css';
import { installIcons } from './ui/icons';
import { installPlayView } from './scene/play-view';
import { Questions } from './scene/questions';
import { SoundEditor } from './scene/sound-editor';
import soundExample from './scene/sound-example.json';
import inputExample from './scene/input-example.json';
import { SoundPlayer } from './runtime/audio';
import { GameView } from './scene/game';
import { Blockly, squareProject, toolbox } from './blocks';
import { PythonRunner } from './runtime/runner';
import { Stage, validateSceneImages } from './stage';
import { installSceneEditor } from './scene/editor';
import spriteExample from './scene/example.json';
import motionExample from './scene/motion-example.json';
import storyExample from './scene/story-example.json';
import drawingExample from './scene/drawing-example.json';
import worldExample from './scene/world-example.json';
import gameExample from './scene/game-example.json';
import starGameExample from './scene/star-game-example.json';
import behaviorExample from './scene/behavior-example.json';
import { emptyScene } from './scene/model';
import { compile, blockForLine, type Compilation } from './language/compiler';
import { snapshot, prepareProject, confirmMigration, restore, STORAGE_KEY, type PreparedProject } from './project';
import { installLanguageEditor } from './language/editor';
import { installPythonVariables } from './language/variables';
import { pythonExport } from './project/python-export';
import { playableExport } from './project/playable-export';
import { installPythonEditor } from './bridge/editor';
import { authoredProject } from './bridge/controller';
import { installPilot } from './pilot/editor';
import { scoreStarter } from './pilot/starter';
import { installAssist } from './assist/editor';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Python Blocks home"><span class="brand-mark" aria-hidden="true">pb<span>↗</span></span><span>python<span class="brand-light">blocks</span><small>A little idea. A whole new world.</small></span></a>
    <span class="prototype">EARLY EXPLORER · 0.1</span>
    <a class="design-link" href="https://github.com/juncoflockleader/python-blocks/tree/main/docs" target="_blank" rel="noreferrer">Project notes</a>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">THE CREATIVE CODING PLAYGROUND</p><h1>Small blocks. <em>Big possibilities.</em></h1><p>Make something with blocks. Discover the Python that brings it to life.</p></div><span class="intro-doodle" aria-hidden="true">✳</span></section>
    <section class="project-bar" aria-label="Project controls"><div class="project-name"><span aria-hidden="true">◇</span><div><strong>My first drawing</strong><small>Try changing a number. See what happens.</small></div></div><div class="actions"><button id="save" class="button secondary">Save project</button><button id="open" class="button secondary">Open project</button><input id="project-file" type="file" accept=".json,application/json" hidden><button id="example" class="button secondary">Reset example</button><button id="export" class="button secondary">Export Python</button><button id="export-playable" class="button secondary">Export playable</button><button id="stop" class="button secondary" disabled>Stop</button><button id="run" class="button primary">Run code</button></div></section>
    <p id="export-state" class="project-notice" role="status"></p><button id="export-cancel" class="button secondary" hidden>Cancel export</button><p id="save-state" class="project-notice" role="status"></p><button id="recover" class="button secondary" hidden>Download recovery file</button>
    <section id="diagnostics-panel" class="diagnostics-panel" hidden aria-label="Program diagnostics"><ul id="diagnostics"></ul></section>
    <div class="workspace-grid">
      <section class="panel blocks-panel" aria-labelledby="blocks-title"><div class="panel-heading"><h2 id="blocks-title"><span class="step">01</span> Build with blocks</h2><span class="panel-note">YOUR IDEAS START HERE</span></div><div id="blockly" aria-label="Visual programming workspace"></div><div class="panel-footer"><span class="small-dot"></span>Connect blocks to tell your story.</div></section>
      <div class="right-column">
        <section class="panel stage-panel" aria-labelledby="stage-title"><div class="panel-heading"><h2 id="stage-title"><span class="step">02</span> See it come to life</h2><span id="status" role="status" aria-live="polite">Ready</span></div><div class="stage-wrap"><div class="stage-surface"><canvas id="stage" width="480" height="320" aria-label="Drawing stage">Your drawing appears here.</canvas><div id="game-overlay"></div></div></div><div class="stage-caption"><span><span class="pen-dot"></span> Your pen</span><span>480 × 320</span></div></section>
        <section class="panel python-panel" aria-labelledby="python-title"><div class="panel-heading"><h2 id="python-title"><span class="step">03</span> Meet your Python</h2><span class="language-label">.py</span></div><pre tabindex="0" aria-label="Generated Python code"><code id="python"></code></pre><p class="code-note">Same idea, a new way to write it. Code updates as you build.</p></section>
      </div>
    </div>
    <form id="event-input" class="event-input" hidden aria-label="Send a test event"><h2>Send a test event</h2><p>Run the project, then send input to its handlers.</p><label>Event name <input id="event-name" value="message" spellcheck="false"></label><label>Payload (JSON) <textarea id="event-payload" rows="2" maxlength="32768" spellcheck="false">null</textarea></label><button id="event-send" class="button secondary" disabled>Send event</button><p id="event-input-status" role="status"></p></form>
    <section id="output-panel" class="output-panel" hidden aria-labelledby="output-title"><h2 id="output-title">Program output</h2><pre id="output" aria-live="polite"></pre><details id="error-details" hidden><summary>Python error details</summary><pre id="traceback"></pre></details></section>
    <footer><span>Built for curiosity.</span><span>Blocks → Python → possibility <span class="footer-spark" aria-hidden="true">✳</span></span></footer>
  </main><dialog id="migration-dialog"><h2>Choose startup order</h2><p>This older project has several loose stacks. Choose their order inside Program.</p><ol id="migration-order"></ol><p id="migration-error" role="alert"></p><button id="migration-apply" class="button primary">Use this order</button><button id="migration-cancel" class="button secondary">Cancel</button></dialog>`;

const disposeIcons = installIcons();

function element<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
const run = element<HTMLButtonElement>('#run');
const stop = element<HTMLButtonElement>('#stop');
const status = element('#status');
const output = element('#output');
const outputPanel = element('#output-panel');
const soundPlayer = new SoundPlayer();
element('.stage-caption').insertAdjacentHTML('afterend', '<div class="audio-controls"><button id="audio-enable" class="button secondary">Enable audio</button><button id="audio-mute" class="button secondary" aria-pressed="false">Mute</button><span id="audio-status" role="status">Audio ready</span></div>');
soundPlayer.onChange = () => { element('#audio-status').textContent = `${soundPlayer.count} playing · ${soundPlayer.state}`; element('#audio-status').dataset.voices = String(soundPlayer.count); };
const enableAudio = () => { void soundPlayer.enable().catch(error => { element('#audio-status').textContent = String(error); }); };
element('#audio-enable').addEventListener('click', enableAudio);
element('#audio-mute').addEventListener('click', () => { soundPlayer.mute(!soundPlayer.isMuted); element('#audio-mute').setAttribute('aria-pressed', String(soundPlayer.isMuted)); element('#audio-mute').textContent = soundPlayer.isMuted ? 'Unmute' : 'Mute'; });
const stage = new Stage(element<HTMLCanvasElement>('#stage'));
let pendingPaint = false;
const paint = () => {
  if (pendingPaint) return;
  pendingPaint = true;
  requestAnimationFrame(() => { stage.paint(); pendingPaint = false; });
};
let compilation: Compilation;
let compiledProject = '';
let runningCompilation: Compilation | null = null;
let replayCompilation: Compilation | null = null;
let replayDraftCheckpoint: string | null = null;
let pythonEditor: ReturnType<typeof installPythonEditor> | undefined;
const gameView = new GameView(element('#game-overlay'), () => {
  if (replayCompilation && pythonEditor?.allowReplay(replayDraftCheckpoint)) startRun(replayCompilation, true);
});
stage.onReset = () => gameView.reset();
let eventReady = false;
let sceneEditor: ReturnType<typeof installSceneEditor> | undefined;
const updateEventControls = () => {
  element('#event-input').hidden = (runningCompilation ?? compilation)?.executionMode !== 'events';
  element<HTMLButtonElement>('#event-send').disabled = !eventReady || !runningCompilation;
};
element('.stage-wrap').insertAdjacentHTML('afterend', '<section id="questions" class="questions" aria-label="Project questions"></section>');
const questions = new Questions(element('#questions'), element('#stage'));
questions.onActive = () => sceneEditor?.releaseInput();
const idle = () => { sceneEditor?.stop(); runningCompilation = null; eventReady = false; run.disabled = !!pythonEditor?.busy || !!pythonEditor?.unstored || (!pythonEditor?.active && (!compilation?.hasEntry || compilation?.source === null)); stop.disabled = true; updateEventControls(); };
const runner = new PythonRunner(event => {
  if (event.type === 'watch-values') sceneEditor?.watch(event.values);
  if (event.type === 'scene') {
    if (event.command.type === 'game') {
      if (event.command.state.result) { eventReady = false; sceneEditor?.stop(); updateEventControls(); }
      gameView.accept(event.command.state);
    }
    stage.acceptScene(event.command); paint(); sceneEditor?.live(); }
  if (event.type === 'draw') { stage.accept(event.command); paint(); }
  if (event.type === 'stdout') { outputPanel.hidden = false; output.textContent = (output.textContent + event.text + '\n').slice(-20_000); }
  if (event.type === 'status') status.textContent = event.message;
  if (event.type === 'ready') { sceneEditor?.ready(); eventReady = true; status.textContent = 'Event session running'; updateEventControls(); }
  if (event.type === 'done') { status.textContent = gameView.state?.result ? (gameView.state.result.won ? 'You win!' : 'Game over') : 'Finished'; idle(); paint(); }
  if (event.type === 'error') {
    status.textContent = 'Let’s try again'; outputPanel.hidden = false;
    output.textContent += `${event.exceptionType ? event.exceptionType + ': ' : ''}${event.message}\n`;
    element('#error-details').hidden = !event.details;
    element('#traceback').textContent = event.details ?? '';
    const frames = [...(event.frames ?? []), ...(event.originFrames ?? [])].reverse();
    const frame = frames.find(frame => runningCompilation?.sourceMap.some(span => span.file === frame.file));
    const module = frame && runningCompilation?.moduleSources[frame.file];
    if (module) output.textContent += `In module “${module.name}”, ${frame!.file}:${frame!.line} (${frame!.name}). Inspect it with Modules.\n`;
    const caller = module ? frames.find(frame => frame.file === 'program.py') : frame;
    const id = caller && runningCompilation ? blockForLine(runningCompilation, caller.file, caller.line) : undefined;
    if (id && runningCompilation?.revision === compilation.revision) {
      workspace.highlightBlock(id);
      workspace.getBlockById(id)?.setWarningText(event.message, 'runtime');
    } else if (runningCompilation?.revision !== compilation.revision) output.textContent += 'This error belongs to an earlier version of your program.\n';
    if (pythonEditor?.hasChanges) output.textContent += 'This error belongs to the running program. Your current Python draft has unapplied changes.\n';
    idle(); paint();
  }
}, soundPlayer, questions);

const theme = Blockly.Theme.defineTheme('pythonBlocks', {
  name: 'pythonBlocks', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#fbfcf8', toolboxBackgroundColour: '#f3f5ed', toolboxForegroundColour: '#35483b', flyoutBackgroundColour: '#edf1e5', flyoutOpacity: 1, scrollbarColour: '#cbd3c4', insertionMarkerColour: '#267c70', insertionMarkerOpacity: 0.25 },
  fontStyle: { family: 'system-ui, sans-serif', weight: '500', size: 12 },
});
// Reserve a leading icon gutter using Blockly’s own measured button bounds.
Blockly.FlyoutButton.TEXT_MARGIN_X = 26;
Blockly.FlyoutButton.TEXT_MARGIN_Y = 4;
const workspace = Blockly.inject('blockly', {
  toolbox, theme, oneBasedIndex: false, media: `${import.meta.env.BASE_URL}blockly/`,
  grid: { spacing: 24, length: 2, colour: '#dce2d5', snap: false },
  zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.5, maxScale: 1.5 },
  move: { scrollbars: true, drag: true, wheel: true }, trashcan: true,
});
installPythonVariables(workspace);
const soundEditor = new SoundEditor(workspace);
element('.audio-controls').insertAdjacentHTML('afterbegin', '<button id="sound-open" class="button secondary">Sounds & music</button><button id="sound-example" class="button secondary">Music example</button>');
element('#sound-open').addEventListener('click', () => soundEditor.open());
element('#sound-example').addEventListener('click', () => installProject(prepareProject(JSON.stringify(soundExample)).project));
element('.audio-controls').insertAdjacentHTML('afterend', '<button id="scene-input-example" class="button secondary">Input & color example</button>');
element('#scene-input-example').addEventListener('click', () => installProject(prepareProject(JSON.stringify(inputExample)).project));
const disposeLanguageEditor = installLanguageEditor(workspace);
sceneEditor = installSceneEditor(workspace, stage, value => runner.input(value), () => installProject(prepareProject(JSON.stringify(spriteExample)).project), () => installProject(prepareProject(JSON.stringify(motionExample)).project), () => installProject(prepareProject(JSON.stringify(storyExample)).project), () => installProject(prepareProject(JSON.stringify(drawingExample)).project), () => installProject(prepareProject(JSON.stringify(behaviorExample)).project), () => installProject(prepareProject(JSON.stringify(gameExample)).project), () => installProject(prepareProject(JSON.stringify(worldExample)).project));
element('#scene-world-example').insertAdjacentHTML('afterend', '<button id="scene-star-game" class="button secondary">Star game example</button>');
element('#scene-star-game').addEventListener('click', () => installProject(prepareProject(JSON.stringify(starGameExample)).project));
const playView = installPlayView(() => sceneEditor?.releaseInput());
let autosaveEnabled = true;
let recoveryText: string | null = null;
let pendingMigration: PreparedProject | null = null;
let migrationOrder: string[] = [];
const notice = element('#save-state');
const exportButton = element<HTMLButtonElement>('#export');
const playableButton = element<HTMLButtonElement>('#export-playable');
let exportController: AbortController | null = null;
pythonEditor = installPythonEditor(workspace, {
  compilation: () => compilation ?? compile(workspace),
  changed: () => updateCode(),
  applied: () => { runner.stop(); idle(); sceneEditor?.restore(); paint(); status.textContent = 'Python applied'; updateCode(); },
  download: (name, source) => download(name, source, 'text/x-python'),
});

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateCode(save = true) {
  const current = JSON.stringify(authoredProject(snapshot(workspace)));
  if (!compilation || compiledProject !== current) { compilation = compile(workspace); compiledProject = current; }
  pythonEditor?.refresh();
  const textBlocked = !!pythonEditor?.busy || !!pythonEditor?.unstored;
  run.textContent = pythonEditor?.active ? 'Run Python' : 'Run code';
  run.disabled = !!runningCompilation || textBlocked || (!pythonEditor?.active && (!compilation.hasEntry || compilation.source === null));
  exportButton.disabled = textBlocked || (!pythonEditor?.active && compilation.source === null);
  playableButton.disabled = !!exportController || textBlocked || (!pythonEditor?.active && (!compilation.hasEntry || compilation.source === null));
  updateEventControls();
  workspace.highlightBlock(null);
  for (const block of workspace.getAllBlocks(false)) {
    block.setWarningText(null, 'language'); block.setWarningText(null, 'runtime');
  }
  const list = element('#diagnostics'); list.replaceChildren();
  for (const diagnostic of compilation.diagnostics) {
    const item = document.createElement('li');
    const label = `${diagnostic.severity === 'error' ? 'Fix' : 'Note'}: ${diagnostic.message}`;
    if (diagnostic.blockId && !diagnostic.module) {
      workspace.getBlockById(diagnostic.blockId)?.setWarningText(diagnostic.message, 'language');
      const button = document.createElement('button'); button.textContent = label;
      button.addEventListener('click', () => { workspace.highlightBlock(diagnostic.blockId!); workspace.centerOnBlock(diagnostic.blockId!); });
      item.append(button);
    } else item.textContent = label;
    list.append(item);
  }
  element('#diagnostics-panel').hidden = !compilation.diagnostics.length;
  if (save) saveCurrentProject();
}
function saveCurrentProject() {
  if (!autosaveEnabled) return;
  if (pythonEditor?.unstored) { notice.textContent = 'The latest Python text could not be saved. Download the draft before leaving or opening another project.'; return; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(workspace))); notice.textContent = 'Saved in this browser'; }
  catch { notice.textContent = 'Browser save unavailable. Use Save project to keep a file.'; }
}
// Blockly delivers change notifications asynchronously. Preserve the current
// model even when reload immediately follows an edit or undo/redo.
window.addEventListener('pagehide', saveCurrentProject);

function installProject(project: ReturnType<typeof snapshot>) {
  if (!pythonEditor?.flush()) return false;
  soundEditor.close();
  pythonEditor?.reset();
  restore(workspace, project);
  runner.stop(); idle(); sceneEditor?.restore(); paint();
  autosaveEnabled = true; recoveryText = null; element('#recover').hidden = true;
  output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true;
  status.textContent = 'Ready'; updateCode();
  return true;
}

function showMigration(prepared: PreparedProject) {
  pendingMigration = prepared;
  migrationOrder = prepared.migrationStacks.map(stack => stack.id);
  renderMigration();
  element<HTMLDialogElement>('#migration-dialog').showModal();
}
function renderMigration() {
  const list = element('#migration-order'); list.replaceChildren();
  for (const [index, id] of migrationOrder.entries()) {
    const item = document.createElement('li');
    const label = document.createElement('span'); label.textContent = pendingMigration!.migrationStacks.find(s => s.id === id)!.label;
    item.append(label);
    for (const [delta, text] of [[-1, 'Move up'], [1, 'Move down']] as const) {
      const button = document.createElement('button'); button.textContent = text;
      button.disabled = index + delta < 0 || index + delta >= migrationOrder.length;
      button.addEventListener('click', () => {
        [migrationOrder[index], migrationOrder[index + delta]] = [migrationOrder[index + delta], migrationOrder[index]];
        renderMigration();
      }); item.append(button);
    }
    list.append(item);
  }
  element('#migration-error').textContent = '';
}
element('#migration-apply').addEventListener('click', () => {
  try {
    installProject(confirmMigration(pendingMigration!, migrationOrder));
    pendingMigration = null; element<HTMLDialogElement>('#migration-dialog').close();
  } catch (error) { element('#migration-error').textContent = error instanceof Error ? error.message : String(error); }
});
element('#migration-cancel').addEventListener('click', () => { pendingMigration = null; element<HTMLDialogElement>('#migration-dialog').close(); });

Blockly.serialization.workspaces.load(squareProject, workspace);
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    recoveryText = saved;
    const prepared = prepareProject(saved);
    if (prepared.migrationStacks.length) { autosaveEnabled = false; showMigration(prepared); }
    else { restore(workspace, prepared.project); recoveryText = null; }
  }
} catch (error) {
  autosaveEnabled = false;
  notice.textContent = `Saved work could not be restored: ${error instanceof Error ? error.message : error} Download it for recovery, or open another project. Autosave is paused.`;
  element('#recover').hidden = !recoveryText;
}
sceneEditor.restore();
updateCode(autosaveEnabled);
let assist: ReturnType<typeof installAssist> | undefined;
let lastHelpBlock: string | null = null;
const pilot = installPilot({
  capture: () => {
    if (!autosaveEnabled || !pythonEditor?.flush()) throw new Error('Save or recover your current project before starting the pilot.');
    return JSON.stringify(snapshot(workspace));
  },
  load: source => { if (!installProject(prepareProject(source).project)) throw new Error('Save your Python draft before changing projects.'); },
  starter: kind => JSON.stringify(kind === 'score' ? scoreStarter() : prepareProject(JSON.stringify(spriteExample)).project),
  download: (name, text) => download(name, text, 'application/json'),
  changed: active => assist?.setPilotActive(active),
  revision: typeof __APP_REVISION__ === 'string' ? __APP_REVISION__ : 'development (revision unavailable)',
});
assist = installAssist({
  pilotActive: () => pilot.active,
  read: kind => {
    if (kind === 'blocks') return lastHelpBlock ? workspace.getBlockById(lastHelpBlock)?.toString(4000) ?? '' : '';
    if (kind === 'diagnostics') return [element('#diagnostics').textContent, element('#python-diagnostics').textContent, output.textContent].filter(Boolean).join('\n');
    const textarea = element<HTMLTextAreaElement>('#python-editor');
    if (pythonEditor?.active && !element('#python-draft-view').hidden) return textarea.selectionStart !== textarea.selectionEnd ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd) : textarea.value;
    const selection = window.getSelection();
    if (selection && element('#python').contains(selection.anchorNode) && element('#python').contains(selection.focusNode) && selection.toString()) return selection.toString();
    return element('#python').textContent ?? '';
  },
});
let updatePending = false;
workspace.addChangeListener(event => {
  if (event.type === Blockly.Events.SELECTED) {
    const id = (event as Blockly.Events.Selected).newElementId;
    if (id && workspace.getBlockById(id)) lastHelpBlock = id;
  }
  if (event.isUiEvent || updatePending) return;
  updatePending = true;
  queueMicrotask(() => { updatePending = false; updateCode(); });
});
const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
resizeObserver.observe(element('#blockly'));

function startRun(captured: Compilation, focus = false) {
  if (!captured.hasEntry || captured.source === null) return;
  soundEditor.close();
  if (captured.requiresSound) enableAudio();
  sceneEditor?.start(captured.scene ?? emptyScene()); output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true;
  runningCompilation = captured; replayCompilation = captured;
  replayDraftCheckpoint = pythonEditor?.replayCheckpoint() ?? null;
  eventReady = false; element('#event-input-status').textContent = ''; updateEventControls();
  run.disabled = true; stop.disabled = false; status.textContent = 'Starting Python…';
  runner.run(captured.source, captured.executionMode, captured.files, captured.scene);
  if (focus) element('#stage').focus({ preventScroll: true });
}
async function acceptedCompilation() {
  if (pythonEditor?.active && !(await pythonEditor.apply())) return null;
  updateCode(); return compilation;
}
run.addEventListener('click', async () => {
  if (runningCompilation) return;
  if (pythonEditor?.active || compilation.requiresSound) enableAudio();
  const accepted = await acceptedCompilation(); if (accepted) startRun(accepted);
});
element('#event-input').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const payload: unknown = JSON.parse(element<HTMLTextAreaElement>('#event-payload').value);
    const name = element<HTMLInputElement>('#event-name').value;
    element('#event-input-status').textContent = runner.emit(name, payload) ? `Sent event “${name}”.` : 'Run the event project before sending input.';
  } catch (error) { element('#event-input-status').textContent = error instanceof Error ? error.message : String(error); }
});
stop.addEventListener('click', () => { pythonEditor?.cancel(); runner.stop(); stage.clearGameEffects(); idle(); paint(); });
element('#example').addEventListener('click', () => {
  const prepared = prepareProject(JSON.stringify(squareProject));
  installProject(prepared.project);
});
exportButton.addEventListener('click', async () => {
  const accepted = await acceptedCompilation();
  if (accepted?.source !== null && accepted) { const exported = pythonExport(accepted); download(exported.name, exported.content, exported.type); }
});
playableButton.addEventListener('click', async () => {
  if (exportController) return;
  const accepted = await acceptedCompilation();
  if (!accepted || accepted.source === null || !accepted.hasEntry) return;
  const controller = new AbortController(); exportController = controller;
  const timeout = setTimeout(() => controller.abort(new Error('Export took too long. Please try again.')), 120_000);
  playableButton.disabled = true; element('#export-cancel').hidden = false;
  try {
    const bytes = await playableExport(accepted, snapshot(workspace), new URL(`${import.meta.env.BASE_URL}player/`, location.href), controller.signal, text => { if (!controller.signal.aborted) element('#export-state').textContent = text; });
    controller.signal.throwIfAborted(); download('python-blocks-playable.zip', bytes, 'application/zip');
    element('#export-state').textContent = 'Playable ZIP saved. Extract it, run python3 serve.py in its folder, then open the printed address.';
  } catch (error) {
    element('#export-state').textContent = controller.signal.aborted && controller.signal.reason?.name === 'AbortError' ? 'Export cancelled.' : `Export failed: ${error instanceof Error ? error.message : error}`;
    controller.abort();
  } finally {
    clearTimeout(timeout); exportController = null; element('#export-cancel').hidden = true;
    updateCode();
  }
});
element('#export-cancel').addEventListener('click', () => exportController?.abort());
element('#save').addEventListener('click', () => { if (pythonEditor?.flush()) download('my-project.python-blocks.json', JSON.stringify(snapshot(workspace)), 'application/json'); });
element('#recover').addEventListener('click', () => { if (recoveryText) download('recovered-project.json', recoveryText, 'application/json'); });
element('#open').addEventListener('click', () => element<HTMLInputElement>('#project-file').click());
element<HTMLInputElement>('#project-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  const beforeOpen = JSON.stringify(snapshot(workspace));
  try {
    if (file.size > 16_000_000) throw new Error('This project is too large to load (16 MB limit).');
    const prepared = prepareProject(await file.text());
    await validateSceneImages(prepared.project.workspace.pythonScene ?? emptyScene());
    if (beforeOpen !== JSON.stringify(snapshot(workspace))) throw new Error('The project changed while loading this file. Open it again when ready.');
    if (prepared.migrationStacks.length) showMigration(prepared);
    else installProject(prepared.project);
  } catch (error) { notice.textContent = `Could not open project: ${error instanceof Error ? error.message : error}. Your current work is unchanged.`; }
});
if (import.meta.hot) import.meta.hot.dispose(() => { disposeIcons(); assist?.dispose(); pilot.dispose(); exportController?.abort(); pythonEditor?.dispose(); window.removeEventListener('pagehide', saveCurrentProject); playView.dispose(); runner.dispose(); soundEditor.dispose(); soundPlayer.dispose(); stage.dispose(); resizeObserver.disconnect(); disposeLanguageEditor(); sceneEditor?.dispose(); workspace.dispose(); });
