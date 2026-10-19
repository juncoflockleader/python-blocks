import type * as Blockly from 'blockly/core';
import { passes, type Check, type RunFacts } from './checks';
import { recipeById, type Recipe, type RecipePart } from './recipes';
import { atLeast, levelNames, type Level } from '../ui/levels';

/** A guided build: a short, checked tutorial that ends in a playable game.
 * Steps are checked against the workspace (and whether it ran or finished),
 * never by watching where the learner clicks.
 *
 * A lesson is a guided build with chapters, a live checklist per step, a hint
 * ladder (hints, then "Show me how"), and three more kinds of step: Predict
 * (choose what will happen, then run), Fix it (repair a script the lesson
 * writes) and Play-test (reach a score while the game runs). */
export type StepKind = 'build' | 'predict' | 'fix' | 'play';
export interface Prediction { question: string; choices: string[]; answer: number; explain: string }
export interface BuildStep {
  text: string; check: Check; recipe?: string; select?: string; other?: string; highlight?: { category?: string; element?: string };
  kind?: StepKind;
  /** The idea behind the step, in one or two sentences. */
  why?: string;
  /** Parts of the step, each ticked live; the step's own check decides when it is done. */
  checklist?: { text: string; check: Check }[];
  /** Hints shown one at a time before "Show me how". */
  hints?: string[];
  predict?: Prediction;
  /** Scripts the lesson writes when a Fix-it step starts: the puzzle to repair. */
  plant?: RecipePart[];
  /** What "Show me how" adds when the step has no idea card; `replacesPlant`
   * first removes the script the lesson planted in that step. */
  solution?: { parts: RecipePart[]; replacesPlant?: number };
  /** A Play-test goal counted from the score while the game runs. */
  goal?: { score: number; label: string };
}
export interface Chapter { title: string; idea: string; steps: number }
export interface Build {
  id: string; title: string; level: Level; minutes: number; order: number; summary: string; ideas: string[];
  starter: unknown; steps: BuildStep[]; finish: { text: string; remix: string[] }; next?: string;
  kind?: 'build' | 'lesson'; chapters?: Chapter[]; learn?: string[];
}
const modules = import.meta.glob<Build>(['../../content/builds/*.json', '!../../content/builds/*-game.json'], { eager: true, import: 'default' });
// Lessons are listed before the shorter guided builds.
export const builds: Build[] = Object.values(modules).sort((a, b) => Number(b.kind === 'lesson') - Number(a.kind === 'lesson') || a.order - b.order);
export const buildById = (id: string) => builds.find(b => b.id === id);
export const stepKinds: Record<StepKind, string> = { build: 'Build', predict: 'Predict', fix: 'Fix it', play: 'Play-test' };
/** The chapter a step belongs to, and its place in that chapter. */
export function chapterOf(build: Build, index: number) {
  let first = 0;
  for (const [number, chapter] of (build.chapters ?? []).entries()) {
    if (index < first + chapter.steps) return { number, chapter, first, step: index - first };
    first += chapter.steps;
  }
  return null;
}

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
  /** Add scripts as one Undo step, first removing `replace` (block ids); returns the new scripts' ids. */
  insert(parts: RecipePart[], title: string, select?: string, other?: string, replace?: string[]): string[];
  /** Keep the current project before a lesson replaces it; false when it cannot be kept. */
  keep(): boolean;
  /** Reopen the kept project; false when a Python draft must be saved first. */
  restore(): boolean;
  kept(): boolean;
  play(): void;
  /** The Help tab reads "Lesson" while a lesson is open. */
  tabLabel(text: string): void;
}
/** Active time per step (the tab hidden does not count) and whether "Show me
 * how" was used, so tester sessions can be compared with each build's minutes. */
interface Timing { started: string; steps: number[]; shown: boolean[] }
interface Saved { id: string; index: number; timing?: Timing; planted?: Record<string, string[]>; answers?: Record<string, number> }
const minutesText = (ms: number) => { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
const STORAGE = 'python-blocks.guide.v1';
const item = (tag: string, className: string, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });

export function installGuide(host: GuideHost) {
  const slot = document.getElementById('guide-slot')!;
  // The list and its confirmation live in the Builds section; the active step is
  // mounted above the Help sections so it stays visible while ideas are shown.
  const activeSlot = document.getElementById('guide-active-slot') ?? slot;
  slot.innerHTML = `<section id="guide" class="guide" aria-labelledby="guide-title"><h2 id="guide-title">Guided builds</h2><p class="tab-note">Make a small game one checked step at a time.</p>
    <div id="guide-kept" class="guide-kept" hidden><p>Your project from before the lesson is kept.</p><button id="guide-kept-return" class="button secondary">Return to my project</button></div>
    <div id="guide-confirm" class="guide-confirm" hidden><p id="guide-confirm-text"></p><div class="guide-actions"><button id="guide-confirm-start" class="button primary">Replace and start</button><button id="guide-confirm-cancel" class="button secondary">Keep my project</button></div></div>
    <ul id="guide-list" class="guide-list"></ul></section>`;
  activeSlot.insertAdjacentHTML('beforeend', `<div id="guide-active" class="guide-active" hidden><div class="guide-head"><h3 id="guide-build-title"></h3><span id="guide-progress"></span></div><div id="guide-meter" class="guide-meter" aria-hidden="true"><span></span></div><div id="guide-chapters" class="guide-chapters" aria-hidden="true" hidden></div>
      <div id="guide-card" class="guide-card-body"><p id="guide-step" class="guide-step"></p><p id="guide-why" class="guide-why" hidden></p>
        <p id="guide-planted" class="guide-planted" hidden>The lesson wrote this script for you. One thing is missing: that is this step’s puzzle.</p>
        <div id="guide-predict" class="guide-predict" hidden><div id="guide-choices" class="guide-choices" role="group" aria-label="Your prediction"></div><p id="guide-predict-result" class="guide-predict-result" role="status"></p></div>
        <div id="guide-goal" class="guide-goal" role="status" hidden><p><span id="guide-goal-count"></span> <span id="guide-goal-label"></span></p><div id="guide-goal-pips" class="guide-goal-pips" aria-hidden="true"></div></div>
        <ul id="guide-checklist" class="guide-checklist" hidden></ul></div>
      <p id="guide-check" class="guide-check" role="status"></p>
      <div id="guide-hints" class="guide-hints" hidden><div class="guide-hints-head"><span>Stuck? Help comes in steps.</span><span id="guide-rungs" class="guide-rungs" aria-hidden="true"></span></div><p id="guide-hint-text" class="guide-hint-text" role="status"></p><button id="guide-hint" class="button secondary"></button></div>
      <div class="guide-actions"><button id="guide-back" class="button secondary">Back</button><button id="guide-show" class="button secondary">Show me how</button><button id="guide-next" class="button primary">Next step</button><button id="guide-stop" class="button secondary">Leave build</button></div>
      <div id="guide-finish" hidden><p id="guide-finish-text"></p><p id="guide-time" class="guide-time"></p><h4>Remix it</h4><ul id="guide-remix"></ul><div class="guide-actions"><button id="guide-next-build" class="button primary"></button><button id="guide-timing" class="button secondary">Download timing</button></div></div></div>`);
  document.body.insertAdjacentHTML('beforeend', `<dialog id="lesson-start" class="lesson-dialog" aria-labelledby="lesson-start-title"><div class="lesson-start">
      <div class="lesson-start-side"><img id="lesson-start-preview" class="lesson-preview" alt=""><h3>Chapters</h3><ol id="lesson-start-chapters" class="lesson-chapters"></ol></div>
      <div class="lesson-start-main"><p id="lesson-start-eyebrow" class="lesson-eyebrow"></p><h2 id="lesson-start-title"></h2><p id="lesson-start-summary" class="lesson-lede"></p><p id="lesson-start-chips" class="lesson-chips"></p>
        <h3>You will learn to</h3><ul id="lesson-start-learn" class="lesson-learn"></ul>
        <p id="lesson-start-note" class="lesson-note"></p>
        <div class="guide-actions lesson-actions"><button id="lesson-start-cancel" class="button secondary">Not now</button><button id="lesson-start-go" class="button primary">Start lesson</button></div></div></div></dialog>
    <dialog id="lesson-finish" class="lesson-dialog" aria-labelledby="lesson-finish-title"><div class="lesson-finish">
      <p class="lesson-eyebrow">Lesson complete</p><h2 id="lesson-finish-title"></h2><p id="lesson-finish-text" class="lesson-lede"></p>
      <h3>What you used</h3><ul id="lesson-finish-learn" class="lesson-badges"></ul>
      <h3>Remix it</h3><ul id="lesson-finish-remix" class="lesson-remix"></ul>
      <div class="guide-actions lesson-actions"><span id="lesson-finish-time" class="lesson-note"></span><button id="lesson-finish-play" class="button secondary">Play again</button><button id="lesson-finish-return" class="button secondary">Return to my project</button><button id="lesson-finish-close" class="button secondary">Keep editing</button><button id="lesson-finish-next" class="button primary"></button></div></div></dialog>`);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  let active: Build | null = null, index = 0, done = false, facts: RunFacts = { ran: false, finished: null }, highlighted: Element[] = [], timer = 0;
  let timing: Timing | null = null, since: number | null = null, record = '', pending: Build | null = null, starting: Build | null = null;
  let planted: Record<string, string[]> = {}, answers: Record<string, number> = {}, early = false;
  const hintLevel = new Map<number, number>();
  const lesson = () => active?.kind === 'lesson';

  for (const build of builds) {
    const entry = document.createElement('li'), start = document.createElement('button');
    start.className = build.kind === 'lesson' ? 'guide-card guide-lesson' : 'guide-card'; start.id = `guide-start-${build.id}`;
    const title = document.createElement('strong'), meta = document.createElement('span'), summary = document.createElement('span');
    title.textContent = build.title;
    meta.textContent = build.kind === 'lesson'
      ? `Lesson · ${build.minutes} min · ${levelNames[build.level]} · ${build.chapters?.length ?? 0} chapters`
      : `${build.minutes} min · ${levelNames[build.level]} · ${build.ideas.join(', ')}`;
    summary.textContent = build.summary;
    start.append(title, meta, summary); start.addEventListener('click', () => begin(build)); entry.append(start); el('guide-list').append(entry);
  }
  /** Add the time since the last check to the current step. */
  function clock() {
    if (timing && since !== null) { timing.steps[index] += performance.now() - since; since = document.hidden ? null : performance.now(); }
  }
  function save() {
    clock();
    try { if (active) localStorage.setItem(STORAGE, JSON.stringify({ id: active.id, index, timing: timing ?? undefined, planted, answers } satisfies Saved)); else localStorage.removeItem(STORAGE); } catch { /* the build continues in this tab */ }
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
  const showKept = () => { el('guide-kept').hidden = !!active || !host.kept(); };

  /** A lesson opens a start sheet; starting it keeps the current project instead of asking twice. */
  function offerLesson(build: Build) {
    starting = build;
    const preview = el<HTMLImageElement>('lesson-start-preview');
    preview.classList.remove('lesson-preview-missing'); preview.onerror = () => preview.classList.add('lesson-preview-missing');
    preview.src = `${import.meta.env.BASE_URL}gallery/${build.id}-game.png`;
    el('lesson-start-eyebrow').textContent = `Guided lesson · ${levelNames[build.level]} level`;
    el('lesson-start-title').textContent = build.title;
    el('lesson-start-summary').textContent = build.summary;
    el('lesson-start-chips').replaceChildren(...[`About ${build.minutes} minutes`, `${build.chapters?.length ?? 0} chapters · ${build.steps.length} steps`, 'Saves as you go'].map(text => item('span', 'lesson-chip', text)));
    el('lesson-start-learn').replaceChildren(...(build.learn ?? []).map(text => item('li', '', text)));
    el('lesson-start-chapters').replaceChildren(...(build.chapters ?? []).map(chapter => {
      const li = item('li', ''); li.append(item('span', '', chapter.title), item('span', 'lesson-chapter-steps', chapter.steps === 1 ? '1 step' : `${chapter.steps} steps`)); return li;
    }));
    const keeping = host.workspace.getTopBlocks(false).length > 0;
    el('lesson-start-note').textContent = keeping ? 'Starting opens a fresh lesson project. The project in the editor now is kept, so you can go back to it.' : 'Starting opens a fresh lesson project.';
    el('lesson-start-go').textContent = 'Start lesson'; delete el('lesson-start-go').dataset.force;
    const dialog = el<HTMLDialogElement>('lesson-start'); if (!dialog.open) dialog.showModal();
  }
  el('lesson-start-cancel').addEventListener('click', () => { starting = null; el<HTMLDialogElement>('lesson-start').close(); });
  el('lesson-start-go').addEventListener('click', () => {
    const build = starting; if (!build) return;
    const force = el('lesson-start-go').dataset.force === 'yes';
    if (host.workspace.getTopBlocks(false).length && !force && !host.keep()) {
      el('lesson-start-note').textContent = 'Your current project could not be kept in this browser. Save it first (⋯ menu → Save project), or start anyway and replace it.';
      el('lesson-start-go').textContent = 'Start anyway'; el('lesson-start-go').dataset.force = 'yes';
      return;
    }
    el<HTMLDialogElement>('lesson-start').close(); starting = null;
    begin(build, 0, true, null, true);
  });

  function begin(build: Build, at = 0, load = true, resumed: Saved | null = null, confirmed = false) {
    if (load) {
      if (build.kind === 'lesson' && !confirmed) { clearConfirm(); offerLesson(build); return; }
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
    timing = resumed?.timing ?? { started: new Date().toISOString(), steps: build.steps.map(() => 0), shown: build.steps.map(() => false) };
    planted = resumed?.planted ?? {}; answers = resumed?.answers ?? {}; hintLevel.clear();
    since = document.hidden ? null : performance.now();
    host.tabLabel(lesson() ? 'Lesson' : 'Help');
    render(); save(); host.reveal(); showKept();
  }
  el('guide-confirm-start').addEventListener('click', () => { if (pending) begin(pending, 0, true, null, true); });
  el('guide-confirm-cancel').addEventListener('click', clearConfirm);

  function renderChapters(build: Build) {
    const where = chapterOf(build, index)!;
    el('guide-build-title').textContent = `${where.number + 1} · ${where.chapter.title}`;
    const kind = active!.steps[index].kind;
    el('guide-progress').textContent = `Step ${where.step + 1} of ${where.chapter.steps}${kind && kind !== 'build' ? ` · ${stepKinds[kind]}` : ''}`;
    el('guide-chapters').replaceChildren(...build.chapters!.map((chapter, number) => {
      const segment = item('span', ''); segment.style.flexGrow = String(chapter.steps);
      const filled = number < where.number ? 100 : number > where.number ? 0 : (where.step / chapter.steps) * 100;
      segment.style.setProperty('--filled', `${filled}%`); return segment;
    }));
  }
  function render() {
    if (!active) { el('guide-active').hidden = true; el('guide-list').hidden = false; clearHighlight(); return; }
    const step = active.steps[index], isLesson = lesson();
    facts = { ran: false, finished: null, score: 0, predicted: answers[index] !== undefined }; done = false; early = false;
    el('guide-list').hidden = true; el('guide-active').hidden = false; el('guide-finish').hidden = true;
    el('guide-active').classList.toggle('guide-lesson-active', isLesson);
    el('guide-meter').hidden = isLesson; el('guide-chapters').hidden = !isLesson;
    if (isLesson) renderChapters(active);
    else {
      el('guide-build-title').textContent = active.title;
      el('guide-progress').textContent = `Step ${index + 1} of ${active.steps.length}`;
      el('guide-meter').querySelector('span')!.style.width = `${(index / active.steps.length) * 100}%`;
    }
    el('guide-step').textContent = step.text;
    el('guide-why').hidden = !step.why; el('guide-why').textContent = step.why ?? '';
    el('guide-stop').textContent = isLesson ? 'Leave lesson' : 'Leave build';
    el<HTMLButtonElement>('guide-back').disabled = index === 0;
    // Lessons offer "Show me how" as the last rung of the hint ladder.
    el('guide-show').hidden = isLesson || !step.recipe;
    if (step.select) host.select(step.select);
    host.prefer(step.other);
    if (step.plant && !planted[index]) { planted[index] = host.insert(step.plant, `${active.title}: step ${index + 1}`, step.select, step.other); save(); }
    el('guide-planted').hidden = !step.plant;
    renderPredict(); renderHints(); renderChecklist();
    highlight(step); evaluate();
    // A new step starts at the top of its card, wherever the last one was scrolled to.
    if (isLesson && !el('guide-active').closest('[hidden]')) el('guide-active').scrollIntoView({ block: 'start' });
  }
  function renderPredict() {
    const step = active!.steps[index], prediction = step.predict;
    el('guide-predict').hidden = !prediction;
    if (!prediction) return;
    const chosen = answers[index];
    el('guide-choices').replaceChildren(...prediction.choices.map((choice, number) => {
      const button = item('button', 'guide-choice', choice) as HTMLButtonElement;
      button.type = 'button'; button.setAttribute('aria-pressed', String(chosen === number));
      if (facts.ran && number === prediction.answer) button.classList.add('guide-choice-answer');
      button.addEventListener('click', () => {
        if (facts.ran && chosen !== undefined) return;
        answers[index] = number; facts.predicted = true; early = false; save(); renderPredict(); evaluate();
      });
      return button;
    }));
    const result = el('guide-predict-result');
    result.classList.remove('guide-right', 'guide-wrong');
    if (chosen === undefined) result.textContent = early ? 'Choose what you think will happen first, then run it again.' : 'Choose an answer, then press Run code to find out.';
    else if (!facts.ran) result.textContent = 'Now press Run code and watch.';
    else {
      const right = chosen === prediction.answer;
      result.classList.add(right ? 'guide-right' : 'guide-wrong');
      result.textContent = `${right ? 'You predicted it.' : 'Not what you guessed, and that is how you learn it.'} ${prediction.explain}`;
    }
  }
  function renderChecklist() {
    const step = active!.steps[index], list = el('guide-checklist');
    list.hidden = !step.checklist?.length;
    list.replaceChildren(...(step.checklist ?? []).map(part => {
      const li = item('li', ''), ok = passes(part.check, host.workspace, facts);
      li.classList.toggle('guide-ticked', ok);
      li.append(item('span', 'guide-box'), item('span', '', part.text));
      li.setAttribute('aria-label', `${part.text}: ${ok ? 'done' : 'not yet'}`);
      return li;
    }));
    const goal = step.goal; el('guide-goal').hidden = !goal;
    if (goal) {
      const reached = Math.min(facts.score ?? 0, goal.score);
      el('guide-goal-count').textContent = `${reached} of ${goal.score}`; el('guide-goal-label').textContent = goal.label;
      el('guide-goal-pips').replaceChildren(...Array.from({ length: goal.score }, (_, n) => item('span', n < reached ? 'guide-pip-on' : '')));
    }
  }
  /** Hints, then "Show me how": the step's idea card, or the lesson's own blocks. */
  function rungs(step: BuildStep) { return [...(step.hints ?? []), ...(step.recipe || step.solution ? ['show'] : [])]; }
  function renderHints() {
    const step = active!.steps[index], ladder = rungs(step);
    el('guide-hints').hidden = !lesson() || !ladder.length;
    if (el('guide-hints').hidden) return;
    const level = hintLevel.get(index) ?? 0;
    el('guide-rungs').replaceChildren(...ladder.map((_, n) => item('span', n < level ? 'guide-rung-on' : '')));
    const shown = level > 0 ? ladder[level - 1] : '';
    el('guide-hint-text').textContent = shown === 'show'
      ? (step.recipe ? 'The idea card is open in Ideas. Press its Insert, then check the numbers.'
        : step.solution?.replacesPlant !== undefined ? 'The lesson swapped in a working script. See what changed, then run it.' : 'The lesson added the blocks. See how they fit, then run it.')
      : shown;
    const next = ladder[level], button = el<HTMLButtonElement>('guide-hint');
    // After the last rung an idea card can be opened again; the lesson's own blocks are added once.
    if (next) button.textContent = next === 'show' ? 'Show me how' : level === 0 ? 'Give me a hint' : 'Another hint';
    else button.textContent = step.recipe ? 'Show the idea again' : 'All help shown';
    button.disabled = !next && !step.recipe;
  }
  el('guide-hint').addEventListener('click', () => {
    if (!active) return;
    const step = active.steps[index], ladder = rungs(step), level = hintLevel.get(index) ?? 0;
    const rung = ladder[level] ?? (step.recipe ? 'show' : undefined);
    if (rung === undefined) return;
    if (rung === 'show') showHow(step);
    hintLevel.set(index, Math.min(ladder.length, level + 1)); renderHints();
  });
  function showHow(step: BuildStep) {
    if (timing) timing.shown[index] = true;
    const recipe = step.recipe && recipeById(step.recipe);
    if (recipe) { host.showRecipe(recipe); return; }
    if (!step.solution) return;
    const replace = step.solution.replacesPlant === undefined ? [] : planted[step.solution.replacesPlant] ?? [];
    const ids = host.insert(step.solution.parts, `${active!.title}: step ${index + 1}`, step.select, step.other, replace);
    if (step.solution.replacesPlant !== undefined) planted[step.solution.replacesPlant] = ids;
    save();
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
    if (lesson()) renderChecklist();
  }
  function finish() {
    if (!active) return;
    const build = active;
    clearHighlight(); el('guide-meter').querySelector('span')!.style.width = '100%';
    el('guide-progress').textContent = 'Finished';
    el('guide-step').textContent = ''; el('guide-check').textContent = '';
    for (const id of ['guide-why', 'guide-planted', 'guide-predict', 'guide-goal', 'guide-checklist', 'guide-hints', 'guide-chapters']) el(id).hidden = true;
    el('guide-finish').hidden = false; el('guide-finish-text').textContent = build.finish.text;
    el('guide-remix').replaceChildren(...build.finish.remix.map(text => item('li', '', text)));
    const next = build.next ? buildById(build.next) : undefined;
    el('guide-next-build').hidden = !next; el('guide-next-build').textContent = next ? `${next.kind === 'lesson' ? 'Next lesson' : 'Next build'}: ${next.title}` : '';
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
    active = null; timing = null; since = null; planted = {}; answers = {}; save(); host.prefer(undefined); host.tabLabel('Help');
    if (build.kind === 'lesson') celebrate(build, total, next);
    host.finished(build);
  }
  /** The lesson's finish sheet: what was used, remixes, and where to go next. */
  function celebrate(build: Build, total: number, next: Build | undefined) {
    el('lesson-finish-title').textContent = `You built ${build.title}`;
    el('lesson-finish-text').textContent = build.finish.text;
    el('lesson-finish-learn').replaceChildren(...(build.chapters ?? []).map(chapter => { const li = item('li', ''); li.append(item('strong', '', chapter.title), item('span', '', chapter.idea)); return li; }));
    el('lesson-finish-remix').replaceChildren(...build.finish.remix.map(text => item('li', '', text)));
    el('lesson-finish-time').textContent = `Time: ${minutesText(total)} (planned ${build.minutes} min)`;
    el('lesson-finish-return').hidden = !host.kept();
    el('lesson-finish-next').hidden = !next; el('lesson-finish-next').textContent = next ? `Next: ${next.title}` : '';
    el('lesson-finish-next').onclick = () => { el<HTMLDialogElement>('lesson-finish').close(); if (next) begin(next); };
    el<HTMLDialogElement>('lesson-finish').showModal();
  }
  el('lesson-finish-close').addEventListener('click', () => { el<HTMLDialogElement>('lesson-finish').close(); showKept(); });
  el('lesson-finish-play').addEventListener('click', () => { el<HTMLDialogElement>('lesson-finish').close(); host.play(); });
  const returnToKept = () => { if (host.restore()) { el<HTMLDialogElement>('lesson-finish').close(); showKept(); host.reveal(true); } };
  el('lesson-finish-return').addEventListener('click', returnToKept);
  el('guide-kept-return').addEventListener('click', returnToKept);
  el('guide-next').addEventListener('click', () => { if (!active || !done) return; if (index === active.steps.length - 1) finish(); else { clock(); index++; render(); save(); } });
  el('guide-back').addEventListener('click', () => { if (active && index > 0) { clock(); index--; render(); save(); } });
  el('guide-show').addEventListener('click', () => { const recipe = active?.steps[index].recipe && recipeById(active.steps[index].recipe!); if (recipe) { if (timing) timing.shown[index] = true; host.showRecipe(recipe); } });
  el('guide-stop').addEventListener('click', () => {
    active = null; timing = null; since = null; planted = {}; answers = {}; save();
    for (const id of ['guide-next', 'guide-back', 'guide-show']) el(id).hidden = false;
    clearConfirm(); host.prefer(undefined); host.tabLabel('Help'); render(); host.reveal(true); showKept(); host.stopped?.();
  });
  el('guide-timing').addEventListener('click', () => { if (record) host.download(`build-timing-${JSON.parse(record).build}.json`, record); });
  const changed = (event: Blockly.Events.Abstract) => { if (!active || event.isUiEvent) return; clearTimeout(timer); timer = window.setTimeout(evaluate, 120); };
  host.workspace.addChangeListener(changed);
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Saved | null; const build = saved && buildById(saved.id);
    const timingOk = saved?.timing && Array.isArray(saved.timing.steps) && saved.timing.steps.length === build?.steps.length && saved.timing.steps.every(ms => Number.isFinite(ms) && ms >= 0);
    const entries = (value: unknown, valid: (v: unknown) => boolean) => value && typeof value === 'object' && Object.values(value).every(valid) ? value : {};
    if (build && saved!.index >= 0 && saved!.index < build.steps.length) begin(build, saved!.index, false, {
      ...saved!,
      timing: timingOk ? { ...saved!.timing!, shown: build.steps.map((_, i) => saved!.timing!.shown?.[i] === true) } : undefined,
      planted: entries(saved!.planted, v => Array.isArray(v) && v.every(id => typeof id === 'string')) as Record<string, string[]>,
      answers: entries(saved!.answers, v => Number.isInteger(v)) as Record<string, number>,
    });
  } catch { /* start fresh */ }
  showKept();
  return {
    get active() { return active; },
    begin(id: string) { const build = buildById(id); if (build) begin(build); },
    ran() {
      if (!active) return;
      // A prediction counts only when it was made before the run.
      if (active.steps[index].predict && answers[index] === undefined) { early = true; renderPredict(); return; }
      facts.ran = true; evaluate();
      if (active.steps[index].predict) { renderPredict(); el('guide-predict-result').scrollIntoView({ block: 'nearest' }); }
    },
    gameOver(won: boolean) { if (active) { facts.finished = won ? 'won' : 'lost'; evaluate(); } },
    /** The running game's score; Play-test goals count the highest reached. */
    score(value: number) { if (active && value > (facts.score ?? 0)) { facts.score = value; evaluate(); } },
    dispose() {
      save(); clearTimeout(timer); host.workspace.removeChangeListener(changed); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', save);
      clearHighlight(); slot.replaceChildren(); el('guide-active')?.remove(); el('lesson-start')?.remove(); el('lesson-finish')?.remove();
    },
  };
}
