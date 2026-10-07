import './style.css';
import { Blockly, squareProject, toolbox } from './blocks';
import { PythonRunner } from './runtime/runner';
import { Stage } from './stage';
import { compile, blockForLine, type Compilation } from './language/compiler';
import { snapshot, prepareProject, confirmMigration, restore, STORAGE_KEY, type PreparedProject } from './project';
import { installLanguageEditor } from './language/editor';
import { installPythonVariables } from './language/variables';
import { pythonExport } from './project/python-export';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Python Blocks home"><span class="brand-mark" aria-hidden="true">pb<span>↗</span></span><span>python<span class="brand-light">blocks</span><small>A little idea. A whole new world.</small></span></a>
    <span class="prototype">EARLY EXPLORER · 0.1</span>
    <a class="design-link" href="https://github.com/juncoflockleader/python-blocks/tree/main/docs" target="_blank" rel="noreferrer">Project notes <span aria-hidden="true">↗</span></a>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">THE CREATIVE CODING PLAYGROUND</p><h1>Small blocks. <em>Big possibilities.</em></h1><p>Make something with blocks. Discover the Python that brings it to life.</p></div><span class="intro-doodle" aria-hidden="true">✳</span></section>
    <section class="project-bar" aria-label="Project controls"><div class="project-name"><span aria-hidden="true">◇</span><div><strong>My first drawing</strong><small>Try changing a number. See what happens.</small></div></div><div class="actions"><button id="save" class="button secondary">Save project</button><button id="open" class="button secondary">Open project</button><input id="project-file" type="file" accept=".json,application/json" hidden><button id="example" class="button secondary">Reset example</button><button id="export" class="button secondary">Export Python <span aria-hidden="true">↗</span></button><button id="stop" class="button secondary" disabled>■ Stop</button><button id="run" class="button primary">▶ Run code</button></div></section>
    <p id="save-state" class="project-notice" role="status"></p><button id="recover" class="button secondary" hidden>Download recovery file</button>
    <section id="diagnostics-panel" class="diagnostics-panel" hidden aria-label="Program diagnostics"><ul id="diagnostics"></ul></section>
    <div class="workspace-grid">
      <section class="panel blocks-panel" aria-labelledby="blocks-title"><div class="panel-heading"><h2 id="blocks-title"><span class="step">01</span> Build with blocks</h2><span class="panel-note">YOUR IDEAS START HERE</span></div><div id="blockly" aria-label="Visual programming workspace"></div><div class="panel-footer"><span class="small-dot"></span>Connect blocks to tell your story.</div></section>
      <div class="right-column">
        <section class="panel stage-panel" aria-labelledby="stage-title"><div class="panel-heading"><h2 id="stage-title"><span class="step">02</span> See it come to life</h2><span id="status" role="status" aria-live="polite">Ready</span></div><div class="stage-wrap"><canvas id="stage" width="480" height="320" aria-label="Drawing stage">Your drawing appears here.</canvas></div><div class="stage-caption"><span><span class="pen-dot"></span> Your pen</span><span>480 × 320</span></div></section>
        <section class="panel python-panel" aria-labelledby="python-title"><div class="panel-heading"><h2 id="python-title"><span class="step">03</span> Meet your Python</h2><span class="language-label">.py</span></div><pre tabindex="0" aria-label="Generated Python code"><code id="python"></code></pre><p class="code-note">Same idea, a new way to write it. Code updates as you build.</p></section>
      </div>
    </div>
    <form id="event-input" class="event-input" hidden aria-label="Send a test event"><h2>Send a test event</h2><p>Run the project, then send input to its handlers.</p><label>Event name <input id="event-name" value="message" spellcheck="false"></label><label>Payload (JSON) <textarea id="event-payload" rows="2" maxlength="32768" spellcheck="false">null</textarea></label><button id="event-send" class="button secondary" disabled>Send event</button><p id="event-input-status" role="status"></p></form>
    <section id="output-panel" class="output-panel" hidden aria-labelledby="output-title"><h2 id="output-title">Program output</h2><pre id="output" aria-live="polite"></pre><details id="error-details" hidden><summary>Python error details</summary><pre id="traceback"></pre></details></section>
    <footer><span>Built for curiosity.</span><span>Blocks → Python → possibility <span class="footer-spark" aria-hidden="true">✳</span></span></footer>
  </main><dialog id="migration-dialog"><h2>Choose startup order</h2><p>This older project has several loose stacks. Choose their order inside Program.</p><ol id="migration-order"></ol><p id="migration-error" role="alert"></p><button id="migration-apply" class="button primary">Use this order</button><button id="migration-cancel" class="button secondary">Cancel</button></dialog>`;

function element<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
const run = element<HTMLButtonElement>('#run');
const stop = element<HTMLButtonElement>('#stop');
const status = element('#status');
const output = element('#output');
const outputPanel = element('#output-panel');
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
let eventReady = false;
const updateEventControls = () => {
  element('#event-input').hidden = (runningCompilation ?? compilation)?.executionMode !== 'events';
  element<HTMLButtonElement>('#event-send').disabled = !eventReady || !runningCompilation;
};
const idle = () => { runningCompilation = null; eventReady = false; run.disabled = !compilation?.hasEntry || compilation?.source === null; stop.disabled = true; updateEventControls(); };
const runner = new PythonRunner(event => {
  if (event.type === 'draw') { stage.accept(event.command); paint(); }
  if (event.type === 'stdout') { outputPanel.hidden = false; output.textContent = (output.textContent + event.text + '\n').slice(-20_000); }
  if (event.type === 'status') status.textContent = event.message;
  if (event.type === 'ready') { eventReady = true; status.textContent = 'Event session running'; updateEventControls(); }
  if (event.type === 'done') { status.textContent = 'Finished'; idle(); paint(); }
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
    idle(); paint();
  }
});

const theme = Blockly.Theme.defineTheme('pythonBlocks', {
  name: 'pythonBlocks', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#fbfcf8', toolboxBackgroundColour: '#f3f5ed', toolboxForegroundColour: '#35483b', flyoutBackgroundColour: '#edf1e5', flyoutOpacity: 1, scrollbarColour: '#cbd3c4', insertionMarkerColour: '#267c70', insertionMarkerOpacity: 0.25 },
  fontStyle: { family: 'system-ui, sans-serif', weight: '500', size: 12 },
});
const workspace = Blockly.inject('blockly', {
  toolbox, theme, oneBasedIndex: false, media: `${import.meta.env.BASE_URL}blockly/`,
  grid: { spacing: 24, length: 2, colour: '#dce2d5', snap: false },
  zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.5, maxScale: 1.5 },
  move: { scrollbars: true, drag: true, wheel: true }, trashcan: true,
});
installPythonVariables(workspace);
const disposeLanguageEditor = installLanguageEditor(workspace);
let autosaveEnabled = true;
let recoveryText: string | null = null;
let pendingMigration: PreparedProject | null = null;
let migrationOrder: string[] = [];
const notice = element('#save-state');
const exportButton = element<HTMLButtonElement>('#export');

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateCode(save = true) {
  const current = JSON.stringify(snapshot(workspace));
  if (!compilation || compiledProject !== current) { compilation = compile(workspace); compiledProject = current; }
  element('#python').textContent = compilation.source === null ? '# Resolve the errors listed above to run this program.\n' : compilation.source + Object.entries(compilation.files).map(([file, source]) => `\n# --- ${file}: ${compilation.moduleSources[file].name} ---\n${source}`).join('');
  run.disabled = !!runningCompilation || !compilation.hasEntry || compilation.source === null;
  exportButton.disabled = compilation.source === null;
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
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot(workspace))); notice.textContent = 'Saved in this browser'; }
  catch { notice.textContent = 'Browser save unavailable. Use Save project to keep a file.'; }
}
// Blockly delivers change notifications asynchronously. Preserve the current
// model even when reload immediately follows an edit or undo/redo.
window.addEventListener('pagehide', saveCurrentProject);

function installProject(project: ReturnType<typeof snapshot>) {
  restore(workspace, project);
  runner.stop(); idle(); stage.reset(); paint();
  autosaveEnabled = true; recoveryText = null; element('#recover').hidden = true;
  output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true;
  status.textContent = 'Ready'; updateCode();
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
updateCode(autosaveEnabled);
let updatePending = false;
workspace.addChangeListener(event => {
  if (event.isUiEvent || updatePending) return;
  updatePending = true;
  queueMicrotask(() => { updatePending = false; updateCode(); });
});
const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
resizeObserver.observe(element('#blockly'));

run.addEventListener('click', () => {
  if (runningCompilation) return;
  updateCode();
  if (!compilation.hasEntry || compilation.source === null) return;
  stage.reset(); output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true;
  runningCompilation = compilation;
  eventReady = false; element('#event-input-status').textContent = ''; updateEventControls();
  run.disabled = true; stop.disabled = false; status.textContent = 'Starting Python…';
  runner.run(compilation.source, compilation.executionMode, compilation.files);
});
element('#event-input').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const payload: unknown = JSON.parse(element<HTMLTextAreaElement>('#event-payload').value);
    const name = element<HTMLInputElement>('#event-name').value;
    element('#event-input-status').textContent = runner.emit(name, payload) ? `Sent event “${name}”.` : 'Run the event project before sending input.';
  } catch (error) { element('#event-input-status').textContent = error instanceof Error ? error.message : String(error); }
});
stop.addEventListener('click', () => { runner.stop(); idle(); paint(); });
element('#example').addEventListener('click', () => {
  const prepared = prepareProject(JSON.stringify(squareProject));
  installProject(prepared.project);
});
exportButton.addEventListener('click', () => {
  updateCode();
  if (compilation.source !== null) { const exported = pythonExport(compilation); download(exported.name, exported.content, exported.type); }
});
element('#save').addEventListener('click', () => download('my-project.python-blocks.json', JSON.stringify(snapshot(workspace), null, 2), 'application/json'));
element('#recover').addEventListener('click', () => { if (recoveryText) download('recovered-project.json', recoveryText, 'application/json'); });
element('#open').addEventListener('click', () => element<HTMLInputElement>('#project-file').click());
element<HTMLInputElement>('#project-file').addEventListener('change', async event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('This project is too large to load (2 MB limit).');
    const prepared = prepareProject(await file.text());
    if (prepared.migrationStacks.length) showMigration(prepared);
    else installProject(prepared.project);
  } catch (error) { notice.textContent = `Could not open project: ${error instanceof Error ? error.message : error}. Your current work is unchanged.`; }
});
if (import.meta.hot) import.meta.hot.dispose(() => { window.removeEventListener('pagehide', saveCurrentProject); runner.dispose(); resizeObserver.disconnect(); disposeLanguageEditor(); workspace.dispose(); });
