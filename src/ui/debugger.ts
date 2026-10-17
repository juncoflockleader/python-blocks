import * as Blockly from 'blockly/core';
import { blockForLine, type Compilation } from '../language/compiler';
import { debugAvailable, type DebugAction, type DebugOptions, type DebugSnapshot, type DebugValue } from '../runtime/debug';
import type { RunnerEvent } from '../runtime/protocol';
import './debugger.css';

export function debugOptions(compilation: Compilation): DebugOptions {
  const lines: Record<string, number[]> = {};
  for (const span of compilation.sourceMap) {
    const file = lines[span.file] ??= [];
    for (let line = span.startLine; line <= span.endLine; line++) file.push(line);
  }
  return { lines: Object.fromEntries(Object.entries(lines).map(([file, values]) => [file, [...new Set(values)]])) };
}

export function installDebugger(workspace: Blockly.WorkspaceSvg, options: {
  start(): Promise<void>;
  stop(): void;
  /** Bring the debugger into view (the editor shows it in the Output tab). */
  reveal(): void;
  action(action: DebugAction): Promise<boolean>;
  current(): Compilation;
  draftChanged(): boolean;
}) {
  const start = document.createElement('button'); start.id = 'debug-start'; start.className = 'button secondary level-pro'; start.textContent = 'Debug code';
  document.querySelector('#menu-tools')!.append(start);
  const panel = document.createElement('section'); panel.className = 'debug-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Python debugger');
  panel.innerHTML = `<div class="debug-heading"><h2>Debug your program</h2><div class="debug-controls"><button id="debug-pause" class="button secondary">Pause</button><button id="debug-resume" class="button primary">Resume</button><button id="debug-into" class="button secondary" title="Run to the next statement, entering called functions">Step into</button><button id="debug-over" class="button secondary" title="Run the current statement, skipping deeper function calls">Step over</button><button id="debug-out" class="button secondary" title="Run until execution returns to a shallower call">Step out</button><button id="debug-stop" class="button secondary">Stop debugging</button><button id="debug-close" class="button secondary">Close debugger</button></div></div><p id="debug-status" role="status"></p><p id="debug-stale" role="status" hidden></p><div class="debug-layout"><div><label for="debug-frame">Call stack</label><select id="debug-frame"></select><p id="debug-location"></p><pre id="debug-source" tabindex="0" aria-label="Captured Python source"></pre></div><div><h3>Local values</h3><dl id="debug-locals"></dl><details><summary>Global values</summary><dl id="debug-globals"></dl></details><p class="debug-note">Values are captured before the highlighted statement runs. Previews are read-only and shortened for large values.</p></div></div>`;
  document.querySelector('#debug-slot')!.append(panel);
  const get = <T extends HTMLElement>(id: string) => panel.querySelector<T>(`#debug-${id}`)!;
  let captured: Compilation | null = null, snapshot: DebugSnapshot | null = null;
  let active = false, paused = false, pending = false, busy = false, frameIndex = 0;
  const available = debugAvailable();
  if (!available) start.title = 'Debugging needs shared memory and an isolated editor page. See docs/debugging-and-search.md for hosting setup.';
  const controls = () => {
    start.disabled = !available || active || busy || document.querySelector<HTMLButtonElement>('#run')!.disabled;
    get<HTMLButtonElement>('pause').disabled = !active || paused || pending;
    for (const id of ['resume', 'into', 'over', 'out']) get<HTMLButtonElement>(id).disabled = !active || !paused || pending || (id === 'out' && (snapshot?.frames.length ?? 0) < 2);
    get<HTMLButtonElement>('close').disabled = active;
    get<HTMLButtonElement>('stop').disabled = !active;
  };
  const values = (id: string, items: DebugValue[]) => {
    const list = get(id); list.replaceChildren();
    if (!items.length) { const empty = document.createElement('dd'); empty.textContent = 'No values yet.'; list.append(empty); }
    for (const item of items) { const name = document.createElement('dt'), value = document.createElement('dd'); name.textContent = item.name; value.textContent = item.value; list.append(name, value); }
  };
  const renderFrame = (highlight = true) => {
    const frame = snapshot?.frames[frameIndex];
    const source = get('source'); source.replaceChildren();
    const unchanged = captured?.revision === options.current()?.revision && !options.draftChanged();
    get('stale').hidden = !captured || unchanged;
    get('stale').textContent = 'You have edited this project. This debugger shows the captured run; stop and debug again to use your changes.';
    if (!frame || !captured) {
      get('location').textContent = paused ? 'Paused between event handlers. Step into runs to the next block; resume to send input.' : '';
      values('locals', []); values('globals', []); return;
    }
    const module = captured.moduleSources[frame.file];
    get('location').textContent = `${active ? 'Next' : 'Last pause'}: ${module ? module.name + ' · ' : ''}${frame.file}:${frame.line} · ${frame.name}`;
    const lines = (frame.file === 'program.py' ? captured.source! : captured.files[frame.file] ?? '').split('\n');
    for (let index = Math.max(0, frame.line - 7); index < Math.min(lines.length, frame.line + 6); index++) {
      const line = document.createElement('span'); line.className = 'debug-source-line';
      if (index + 1 === frame.line) { line.classList.add('debug-current-line'); line.setAttribute('aria-current', 'step'); }
      const number = document.createElement('span'); number.className = 'debug-line-number'; number.textContent = String(index + 1);
      line.append(number, document.createTextNode(lines[index] || ' ')); source.append(line);
    }
    values('locals', frame.locals); values('globals', frame.globals);
    if (highlight) workspace.highlightBlock(null);
    if (highlight && paused && unchanged) {
      const mainFrame = frame.file === 'program.py' ? frame : snapshot!.frames.find(f => f.file === 'program.py');
      const id = mainFrame && blockForLine(captured, mainFrame.file, mainFrame.line);
      if (id && workspace.getBlockById(id)) { workspace.highlightBlock(id); workspace.centerOnBlock(id); }
    }
  };
  start.addEventListener('click', async () => { if (busy || active) return; busy = true; controls(); try { await options.start(); } finally { busy = false; controls(); } });
  for (const action of ['pause', 'resume', 'into', 'over', 'out'] as DebugAction[]) get(action).addEventListener('click', async () => {
    pending = true; controls();
    if (action === 'pause') get('status').textContent = 'Pause requested…';
    try { await options.action(action); }
    catch (error) { get('status').textContent = `Could not resume: ${error instanceof Error ? error.message : String(error)}. Try again or Stop.`; }
    finally { pending = false; controls(); }
  });
  get<HTMLSelectElement>('frame').addEventListener('change', () => { frameIndex = Number(get<HTMLSelectElement>('frame').value); renderFrame(); });
  get('stop').addEventListener('click', () => options.stop());
  get('close').addEventListener('click', () => { panel.hidden = true; workspace.highlightBlock(null); });
  controls();
  return {
    get paused() { return active && paused; },
    start(compilation: Compilation, debug: boolean) {
      active = debug; paused = false; snapshot = null; captured = debug ? compilation : null; pending = false;
      panel.hidden = !debug;
      if (debug) { options.reveal(); panel.scrollIntoView({ block: 'nearest' }); }
      get('status').textContent = 'Starting debugger…';
      get('frame').replaceChildren(); renderFrame(); controls();
    },
    event(event: RunnerEvent) {
      if (!active) return;
      if (event.type === 'debug-paused') {
        paused = true; pending = false; snapshot = event.snapshot; frameIndex = 0;
        const select = get<HTMLSelectElement>('frame'); select.replaceChildren();
        snapshot.frames.forEach((frame, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = `${frame.name} · ${frame.file}:${frame.line}`; select.append(option); });
        get('status').textContent = `Paused before the next statement.${snapshot.truncated ? ' Showing the first 20 stack frames.' : ''}`;
        renderFrame();
      } else if (event.type === 'debug-running') {
        paused = false; pending = false; workspace.highlightBlock(null); get('status').textContent = 'Running. Pause to inspect the next statement.';
      }
      controls();
    },
    finish(preserveHighlight = false) { if (active) { active = false; paused = false; pending = false; get('status').textContent = 'Debug session ended. Start Debug code for a fresh run.'; renderFrame(!preserveHighlight); } controls(); },
    refresh() { controls(); if (captured && snapshot) renderFrame(); },
    dispose() { start.remove(); panel.remove(); },
  };
}
