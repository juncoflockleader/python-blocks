import type * as Blockly from 'blockly/core';
import { passes, type Check, type RunFacts } from './checks';
import { recipeById, type Recipe } from './recipes';
import { atLeast, levelNames, type Level } from '../ui/levels';

/** A guided build: a short, checked tutorial that ends in a playable game.
 * Steps are checked against the workspace (and whether it ran or finished),
 * never by watching where the learner clicks. */
export interface BuildStep { text: string; check: Check; recipe?: string; select?: string; other?: string; highlight?: { category?: string; element?: string } }
export interface Build {
  id: string; title: string; level: Level; minutes: number; order: number; summary: string; ideas: string[];
  starter: unknown; steps: BuildStep[]; finish: { text: string; remix: string[] }; next?: string;
}
const modules = import.meta.glob<Build>(['../../content/builds/*.json', '!../../content/builds/*-game.json'], { eager: true, import: 'default' });
export const builds: Build[] = Object.values(modules).sort((a, b) => a.order - b.order);
export const buildById = (id: string) => builds.find(b => b.id === id);

export interface GuideHost {
  workspace: Blockly.WorkspaceSvg;
  level(): Level;
  setLevel(level: Level): void;
  /** Replace the project; false when the learner must save a Python draft first. */
  load(project: unknown, title: string): boolean;
  select(spriteId: string): void;
  /** The sprite a step's ideas should target by default (or none). */
  prefer(spriteId: string | undefined): void;
  showRecipe(recipe: Recipe): void;
  /** Bring the Help tab forward; `list` also shows the Builds section (the active step sits above every section). */
  reveal(list?: boolean): void;
  /** The Help tab shows a dot when the guide changes while another tab is open. */
  notify(): void;
  finished(build: Build): void;
  /** The learner left a build before its end; the editor re-evaluates its empty-workspace prompt. */
  stopped?(): void;
  /** Save a facilitator's timing record. */
  download(name: string, text: string): void;
  revision: string;
}
/** Active time per step (the tab hidden does not count) and whether "Show me
 * how" was used, so tester sessions can be compared with each build's minutes. */
interface Timing { started: string; steps: number[]; shown: boolean[] }
const minutesText = (ms: number) => { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
const STORAGE = 'python-blocks.guide.v1';

export function installGuide(host: GuideHost) {
  const slot = document.getElementById('guide-slot')!;
  // The list and its confirmation live in the Builds section; the active step is
  // mounted above the Help sections so it stays visible while ideas are shown.
  const activeSlot = document.getElementById('guide-active-slot') ?? slot;
  slot.innerHTML = `<section id="guide" class="guide" aria-labelledby="guide-title"><h2 id="guide-title">Guided builds</h2><p class="tab-note">Make a small game one checked step at a time.</p>
    <div id="guide-confirm" class="guide-confirm" hidden><p id="guide-confirm-text"></p><div class="guide-actions"><button id="guide-confirm-start" class="button primary">Replace and start</button><button id="guide-confirm-cancel" class="button secondary">Keep my project</button></div></div>
    <ul id="guide-list" class="guide-list"></ul></section>`;
  activeSlot.insertAdjacentHTML('beforeend', `<div id="guide-active" class="guide-active" hidden><div class="guide-head"><h3 id="guide-build-title"></h3><span id="guide-progress"></span></div><div id="guide-meter" class="guide-meter" aria-hidden="true"><span></span></div>
      <p id="guide-step" class="guide-step"></p><p id="guide-check" class="guide-check" role="status"></p>
      <div class="guide-actions"><button id="guide-back" class="button secondary">Back</button><button id="guide-show" class="button secondary">Show me how</button><button id="guide-next" class="button primary">Next step</button><button id="guide-stop" class="button secondary">Leave build</button></div>
      <div id="guide-finish" hidden><p id="guide-finish-text"></p><p id="guide-time" class="guide-time"></p><h4>Remix it</h4><ul id="guide-remix"></ul><div class="guide-actions"><button id="guide-next-build" class="button primary"></button><button id="guide-timing" class="button secondary">Download timing</button></div></div></div>`);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  let active: Build | null = null, index = 0, done = false, facts: RunFacts = { ran: false, finished: null }, highlighted: Element[] = [], timer = 0;
  let timing: Timing | null = null, since: number | null = null, record = '', pending: Build | null = null;

  for (const build of builds) {
    const item = document.createElement('li'), start = document.createElement('button');
    start.className = 'guide-card'; start.id = `guide-start-${build.id}`;
    const title = document.createElement('strong'), meta = document.createElement('span'), summary = document.createElement('span');
    title.textContent = build.title; meta.textContent = `${build.minutes} min · ${levelNames[build.level]} · ${build.ideas.join(', ')}`; summary.textContent = build.summary;
    start.append(title, meta, summary); start.addEventListener('click', () => begin(build)); item.append(start); el('guide-list').append(item);
  }
  /** Add the time since the last check to the current step. */
  function clock() {
    if (timing && since !== null) { timing.steps[index] += performance.now() - since; since = document.hidden ? null : performance.now(); }
  }
  function save() {
    clock();
    try { if (active) localStorage.setItem(STORAGE, JSON.stringify({ id: active.id, index, timing })); else localStorage.removeItem(STORAGE); } catch { /* the build continues in this tab */ }
  }
  const visibility = () => { if (document.hidden) save(); else if (timing && since === null) since = performance.now(); };
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', save);
  function clearHighlight() { for (const node of highlighted) node.classList.remove('guide-target'); highlighted = []; }
  function highlight(step: BuildStep) {
    clearHighlight();
    const targets = [step.highlight?.category && document.getElementById(`category-${step.highlight.category}`), step.highlight?.element && document.querySelector(step.highlight.element)].filter((n): n is Element => !!n);
    for (const node of targets) node.classList.add('guide-target');
    highlighted = targets;
  }
  const clearConfirm = () => { pending = null; el('guide-confirm').hidden = true; };
  function begin(build: Build, at = 0, load = true, resumed: Timing | null = null, confirmed = false) {
    if (load) {
      // A project on the workspace is replaced only after an explicit choice
      // (the confirmation's button, or choosing the same build again).
      if (host.workspace.getTopBlocks(false).length && !confirmed && pending?.id !== build.id) {
        pending = build; el('guide-confirm').hidden = false;
        el('guide-confirm-text').textContent = `Starting “${build.title}” replaces the project in the editor. To keep your project, save it first (⋯ menu → Save project).`;
        host.reveal(true); el('guide-confirm').scrollIntoView({ block: 'nearest' });
        return;
      }
      clearConfirm();
      if (!atLeast(host.level(), build.level)) host.setLevel(build.level);
      // Mark the build active before its starter loads: the empty-workspace card
      // is decided during that load and must not cover a build's first step.
      const previous = active; active = build; index = at;
      if (!host.load(structuredClone(build.starter), build.title)) { active = previous; return; }
    }
    active = build; index = at;
    timing = resumed ?? { started: new Date().toISOString(), steps: build.steps.map(() => 0), shown: build.steps.map(() => false) };
    since = document.hidden ? null : performance.now();
    render(); save(); host.reveal();
  }
  el('guide-confirm-start').addEventListener('click', () => { if (pending) begin(pending, 0, true, null, true); });
  el('guide-confirm-cancel').addEventListener('click', clearConfirm);
  function render() {
    if (!active) { el('guide-active').hidden = true; el('guide-list').hidden = false; clearHighlight(); return; }
    const step = active.steps[index];
    facts = { ran: false, finished: null }; done = false;
    el('guide-list').hidden = true; el('guide-active').hidden = false; el('guide-finish').hidden = true;
    el('guide-build-title').textContent = active.title;
    el('guide-progress').textContent = `Step ${index + 1} of ${active.steps.length}`;
    el('guide-meter').querySelector('span')!.style.width = `${(index / active.steps.length) * 100}%`;
    el('guide-step').textContent = step.text;
    el<HTMLButtonElement>('guide-back').disabled = index === 0;
    el('guide-show').hidden = !step.recipe;
    if (step.select) host.select(step.select);
    host.prefer(step.other);
    highlight(step); evaluate();
  }
  function evaluate() {
    if (!active) return;
    const step = active.steps[index], ok = passes(step.check, host.workspace, facts);
    if (ok && !done) host.notify();
    done = ok;
    el('guide-check').textContent = ok ? 'Done! Go to the next step.' : 'When this step is done, it gets a check mark.';
    el('guide-check').classList.toggle('guide-done', ok);
    el<HTMLButtonElement>('guide-next').disabled = !ok;
    el('guide-next').textContent = index === active.steps.length - 1 ? 'Finish' : 'Next step';
  }
  function finish() {
    if (!active) return;
    const build = active;
    clearHighlight(); el('guide-meter').querySelector('span')!.style.width = '100%';
    el('guide-progress').textContent = 'Finished';
    el('guide-step').textContent = ''; el('guide-check').textContent = '';
    el('guide-finish').hidden = false; el('guide-finish-text').textContent = build.finish.text;
    el('guide-remix').replaceChildren(...build.finish.remix.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
    const next = build.next ? buildById(build.next) : undefined;
    el('guide-next-build').hidden = !next; el('guide-next-build').textContent = next ? `Next build: ${next.title}` : '';
    el('guide-next-build').onclick = () => { if (next) begin(next); };
    for (const id of ['guide-next', 'guide-back', 'guide-show']) el(id).hidden = true;
    clock();
    const total = timing ? timing.steps.reduce((sum, ms) => sum + ms, 0) : 0;
    el('guide-time').textContent = `Time: ${minutesText(total)} (planned ${build.minutes} min).`;
    record = JSON.stringify({
      build: build.id, title: build.title, plannedMinutes: build.minutes, started: timing?.started, finished: new Date().toISOString(), activeMinutes: Math.round(total / 600) / 100,
      steps: build.steps.map((step, i) => ({ step: i + 1, text: step.text, activeSeconds: Math.round((timing?.steps[i] ?? 0) / 100) / 10, usedShowMeHow: timing?.shown[i] ?? false })),
      note: 'Active time excludes time while the tab was hidden. Nothing is uploaded.', revision: host.revision, browser: navigator.userAgent,
    }, null, 2);
    active = null; timing = null; since = null; save(); host.prefer(undefined); host.finished(build);
  }
  el('guide-next').addEventListener('click', () => { if (!active || !done) return; if (index === active.steps.length - 1) finish(); else { clock(); index++; render(); save(); } });
  el('guide-back').addEventListener('click', () => { if (active && index > 0) { clock(); index--; render(); save(); } });
  el('guide-show').addEventListener('click', () => { const recipe = active?.steps[index].recipe && recipeById(active.steps[index].recipe!); if (recipe) { if (timing) timing.shown[index] = true; host.showRecipe(recipe); } });
  el('guide-stop').addEventListener('click', () => { active = null; timing = null; since = null; save(); for (const id of ['guide-next', 'guide-back', 'guide-show']) el(id).hidden = false; clearConfirm(); host.prefer(undefined); render(); host.reveal(true); host.stopped?.(); });
  el('guide-timing').addEventListener('click', () => { if (record) host.download(`build-timing-${JSON.parse(record).build}.json`, record); });
  const changed = (event: Blockly.Events.Abstract) => { if (!active || event.isUiEvent) return; clearTimeout(timer); timer = window.setTimeout(evaluate, 120); };
  host.workspace.addChangeListener(changed);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as { id: string; index: number; timing?: Timing } | null; const build = saved && buildById(saved.id);
    const resumed = saved?.timing && Array.isArray(saved.timing.steps) && saved.timing.steps.length === build?.steps.length && saved.timing.steps.every(ms => Number.isFinite(ms) && ms >= 0) ? saved.timing : null;
    if (build && saved!.index >= 0 && saved!.index < build.steps.length) begin(build, saved!.index, false, resumed && { ...resumed, shown: build.steps.map((_, i) => resumed.shown?.[i] === true) });
  } catch { /* start fresh */ }
  return {
    get active() { return active; },
    begin(id: string) { const build = buildById(id); if (build) begin(build); },
    ran() { if (active) { facts.ran = true; evaluate(); } },
    gameOver(won: boolean) { if (active) { facts.finished = won ? 'won' : 'lost'; evaluate(); } },
    dispose() { save(); clearTimeout(timer); host.workspace.removeChangeListener(changed); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', save); clearHighlight(); slot.replaceChildren(); el('guide-active')?.remove(); },
  };
}
