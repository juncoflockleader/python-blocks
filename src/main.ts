import './style.css';
import { Blockly, generatePython, squareProject, toolbox } from './blocks';
import { PythonRunner } from './runtime/runner';
import { Stage } from './stage';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header">
    <a class="brand" href="./" aria-label="Python Blocks home"><span class="brand-mark" aria-hidden="true">pb<span>↗</span></span><span>python<span class="brand-light">blocks</span><small>A little idea. A whole new world.</small></span></a>
    <span class="prototype">EARLY EXPLORER · 0.1</span>
    <a class="design-link" href="https://github.com/juncoflockleader/python-blocks/tree/main/docs" target="_blank" rel="noreferrer">Project notes <span aria-hidden="true">↗</span></a>
  </header>
  <main>
    <section class="intro"><div><p class="eyebrow">THE CREATIVE CODING PLAYGROUND</p><h1>Small blocks. <em>Big possibilities.</em></h1><p>Make something with blocks. Discover the Python that brings it to life.</p></div><span class="intro-doodle" aria-hidden="true">✳</span></section>
    <section class="project-bar" aria-label="Project controls"><div class="project-name"><span aria-hidden="true">◇</span><div><strong>My first drawing</strong><small>Try changing a number. See what happens.</small></div></div><div class="actions"><button id="example" class="button secondary">Reset example</button><button id="export" class="button secondary">Export Python <span aria-hidden="true">↗</span></button><button id="stop" class="button secondary" disabled>■ Stop</button><button id="run" class="button primary">▶ Run code</button></div></section>
    <div class="workspace-grid">
      <section class="panel blocks-panel" aria-labelledby="blocks-title"><div class="panel-heading"><h2 id="blocks-title"><span class="step">01</span> Build with blocks</h2><span class="panel-note">YOUR IDEAS START HERE</span></div><div id="blockly" aria-label="Visual programming workspace"></div><div class="panel-footer"><span class="small-dot"></span>Connect blocks to tell your story.</div></section>
      <div class="right-column">
        <section class="panel stage-panel" aria-labelledby="stage-title"><div class="panel-heading"><h2 id="stage-title"><span class="step">02</span> See it come to life</h2><span id="status" role="status" aria-live="polite">Ready</span></div><div class="stage-wrap"><canvas id="stage" width="480" height="320" aria-label="Drawing stage">Your drawing appears here.</canvas></div><div class="stage-caption"><span><span class="pen-dot"></span> Your pen</span><span>480 × 320</span></div></section>
        <section class="panel python-panel" aria-labelledby="python-title"><div class="panel-heading"><h2 id="python-title"><span class="step">03</span> Meet your Python</h2><span class="language-label">.py</span></div><pre tabindex="0" aria-label="Generated Python code"><code id="python"></code></pre><p class="code-note">Same idea, a new way to write it. Code updates as you build.</p></section>
      </div>
    </div>
    <section id="output-panel" class="output-panel" hidden aria-labelledby="output-title"><h2 id="output-title">Program output</h2><pre id="output" aria-live="polite"></pre></section>
    <footer><span>Built for curiosity.</span><span>Blocks → Python → possibility <span class="footer-spark" aria-hidden="true">✳</span></span></footer>
  </main>`;

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
const idle = () => { run.disabled = false; stop.disabled = true; };
const runner = new PythonRunner(event => {
  if (event.type === 'draw') { stage.accept(event.command); paint(); }
  if (event.type === 'stdout') { outputPanel.hidden = false; output.textContent = (output.textContent + event.text + '\n').slice(-20_000); }
  if (event.type === 'status') status.textContent = event.message;
  if (event.type === 'done') { status.textContent = 'Finished'; idle(); paint(); }
  if (event.type === 'error') { status.textContent = 'Let’s try again'; outputPanel.hidden = false; output.textContent += event.message + '\n'; idle(); paint(); }
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
const updateCode = () => { element('#python').textContent = generatePython(workspace) || '# Add a block to start exploring.\n'; };
workspace.addChangeListener(event => { if (!event.isUiEvent) updateCode(); });
Blockly.serialization.workspaces.load(squareProject, workspace);
updateCode();
const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
resizeObserver.observe(element('#blockly'));

run.addEventListener('click', () => {
  stage.reset(); output.textContent = ''; outputPanel.hidden = true;
  run.disabled = true; stop.disabled = false; status.textContent = 'Starting Python…';
  runner.run(generatePython(workspace));
});
stop.addEventListener('click', () => { runner.stop(); idle(); paint(); });
element('#example').addEventListener('click', () => {
  runner.stop(); idle(); workspace.clear();
  Blockly.serialization.workspaces.load(squareProject, workspace);
  updateCode(); stage.reset(); status.textContent = 'Ready'; output.textContent = ''; outputPanel.hidden = true;
});
element('#export').addEventListener('click', () => {
  const code = '# Python Blocks export\n# Requires playground.py and its browser host; see docs/architecture.md.\n\n' + generatePython(workspace);
  const url = URL.createObjectURL(new Blob([code], { type: 'text/x-python' }));
  const link = document.createElement('a'); link.href = url; link.download = 'my-drawing.py'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
if (import.meta.hot) import.meta.hot.dispose(() => { runner.dispose(); resizeObserver.disconnect(); workspace.dispose(); });
