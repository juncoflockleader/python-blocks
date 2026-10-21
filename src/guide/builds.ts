import type * as Blockly from 'blockly/core';
import { plainText, setRichText } from './ui-refs';
import { closePop, pop, popOpen } from './pop';
import { installWords } from './words';
import { iconMarkup } from '../ui/icon-art';
import { scrollWithin } from '../ui/scroll';
import { answerLines, checkGame, checkProgram, gameUncheckable, stopChecking, stopGameCheck, uncheckable, type GameStep, type PuzzleTest, type TestResult } from './checker';
import { paintPuzzle, type PuzzlePicture } from './puzzle-art';
import type { Compilation } from '../language/compiler';
import { aboutTheRun, passes, type Check, type RunFacts } from './checks';
import { recipeById, type Recipe, type RecipePart } from './recipes';
import { atLeast, levelNames, type Level } from '../ui/levels';
import { handlerSignatures, type FunctionBlock } from '../language/functions';

/** A guided build: a short, checked tutorial that ends in a playable game.
 * Steps are checked against the workspace (and whether it ran or finished),
 * never by watching where the learner clicks.
 *
 * A lesson is a guided build with chapters, a live checklist per step, a hint
 * ladder (hints, then "Show me how"), and three more kinds of step: Predict
 * (choose what will happen, then run), Fix it (repair a script the lesson
 * writes) and Play-test (reach a score while the game runs). */
export type StepKind = 'build' | 'predict' | 'fix' | 'play' | 'quiz' | 'complete' | 'challenge';
export interface Prediction { question: string; choices: string[]; answer: number; explain: string }
export interface BuildStep {
  text: string; check: Check; recipe?: string; select?: string; other?: string; highlight?: { category?: string; element?: string };
  kind?: StepKind;
  /** The step's goal in a few words ("Make the bird fall"), shown large above the text. */
  title?: string;
  /** What the coach says beside the highlighted palette category when the step starts. */
  coach?: string;
  /** The keys the game is played with in this step: a tip on Run says to tap the game first. */
  keys?: 'arrows' | 'space' | 'both';
  /** The step has a short recording of what it makes (public/lessons), shown as "Watch"; after a guess on a Guess-first step. */
  clip?: { demo?: unknown[]; seconds?: number };
  /** A puzzle: the program reads each test's input and prints its answer, and Check my answer runs every
   * test (checker.ts). The first `examples` tests (one by default) are shown up front; `picture` is laid over the stage. */
  puzzle?: { tests: PuzzleTest[]; examples?: number; picture?: PuzzlePicture };
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
   * first removes the script the lesson planted in that step, and `replaces` the scripts with these
   * names (a starter's on_start_2), as when blocks move to another script. `world: "copy"` first duplicates the
   * starting world, as Duplicate world in Worlds & tilemaps does (a new level). */
  solution?: { parts: RecipePart[]; replacesPlant?: number; replaces?: string[]; world?: 'copy'; variables?: string[] };
  /** A Play-test goal counted from the score while the game runs. */
  goal?: { score: number; label: string };
  // ── Academy units (kind "unit") ──
  /** The project the step opens with (a practice problem's starter): loaded when the step opens, and again by Start over. */
  project?: unknown;
  /** A question answered on the spot (a practice Guess): choose, and see at once whether it is right and why. */
  quiz?: Prediction;
  /** Check my answer plays the game with a scripted player and judges what it shows (checker.ts, src/runtime/checks.py). */
  game?: { script: GameStep[] };
  /** A guide panel: the cast talking, drawn over the stage until the program runs. */
  panel?: PuzzlePicture;
  /** A mastery problem: one try, no hints. A unit is mastered with two of its three. */
  mastery?: boolean;
  /** Other versions of the step (other names and numbers): a wrong guess moves on to the next, and a mastery problem picks one by chance. */
  variants?: Partial<BuildStep>[];
}
export interface Chapter { title: string; idea: string; steps: number }
export interface Build {
  id: string; title: string; level: Level; minutes: number; order: number; summary: string; ideas: string[];
  starter: unknown; steps: BuildStep[]; finish: { text: string; remix: string[] }; next?: string;
  kind?: 'build' | 'lesson' | 'unit'; chapters?: Chapter[]; learn?: string[];
  /** An academy unit's place: chapter 1, unit 1 is "1.1"; a capstone is the chapter's big project. */
  unit?: { chapter: number; number: number; capstone?: boolean };
}
const modules = import.meta.glob<Build>(['../../content/builds/*.json', '!../../content/builds/*-game.json', '../../content/academy/units/*.json'], { eager: true, import: 'default' });
// Lessons are listed before the shorter guided builds.
export const builds: Build[] = Object.values(modules).sort((a, b) => Number(b.kind === 'lesson') - Number(a.kind === 'lesson') || a.order - b.order);
export const buildById = (id: string) => builds.find(b => b.id === id);
export const stepKinds: Record<StepKind, string> = { build: 'Build', predict: 'Guess first', fix: 'Fix the bug', play: 'Play it', quiz: 'Guess', complete: 'Put it together', challenge: 'Challenge' };
/** A step with one of its other versions laid over it (0 is the step itself). */
export const version = (step: BuildStep, variant = 0): BuildStep => variant > 0 && step.variants?.[variant - 1] ? { ...step, ...step.variants[variant - 1] } : step;
/** Said when a lesson step is done, in turn. */
const CHEERS = ['You did it!', 'Awesome!', 'It works!', 'Nice one!', 'Super!', 'Great job!'];
const KEY_TIPS: Record<NonNullable<BuildStep['keys']>, string> = {
  arrows: 'Tap the game first, then hold [←] or [→].', space: 'Tap the game first, then tap [space].', both: 'Tap the game first. [←] [→] walk and [space] jumps.',
};
const clipUrl = (build: Build, index: number, ext: string) => `${import.meta.env.BASE_URL}lessons/${build.id}-${index + 1}.${ext}`;
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
  /** Duplicate the starting world, as Worlds & tilemaps' Duplicate world does. */
  copyWorld?(): void;
  /** Add scripts as one Undo step, first removing `replace` (block ids), making `variables` they use; returns the new scripts' ids. */
  insert(parts: RecipePart[], title: string, select?: string, other?: string, replace?: string[], variables?: string[]): string[];
  /** Keep the current project before a lesson replaces it; false when it cannot be kept. */
  keep(): boolean;
  /** Reopen the kept project; false when a Python draft must be saved first. */
  restore(): boolean;
  kept(): boolean;
  play(): void;
  /** The Help tab reads "Lesson" while a lesson is open. */
  tabLabel(text: string): void;
  /** A lesson is open (or not), and whether its step is a puzzle: the editor makes room for it (lesson-stage.ts). */
  lessonMode?(on: boolean, puzzle: boolean): void;
  /** The project compiled as Run would run it, for a puzzle's checker. */
  compilation(): Compilation;
  /** The project as it is now, so an academy step's work can be put back when the learner returns to it. */
  snapshot?(): unknown;
  /** Academy progress: a step was done (its check passed), or an answer was tried (a quiz, or Check my answer), and how it went. */
  progress?(event: { build: Build; index: number; type: 'done' | 'tried'; ok?: boolean; hints: number; ms: number }): void;
}
/** Active time per step (the tab hidden does not count) and whether "Show me
 * how" was used, so tester sessions can be compared with each build's minutes. */
interface Timing { started: string; steps: number[]; shown: boolean[] }
interface Saved { id: string; index: number; timing?: Timing; planted?: Record<string, string[]>; answers?: Record<string, number>; variants?: Record<string, number>; mastery?: Record<string, boolean>; reached?: number[] }
/** The blocks of the scripts with these names, so Show me how can take them away (by name, since a script
 * that Show me how put in has new block ids but the same name). */
export function scriptsNamed(workspace: Blockly.Workspace, names: string[]) {
  if (!names.length) return [];
  const ids = new Set(handlerSignatures(workspace).filter(h => names.includes(h.name)).map(h => h.id));
  return workspace.getAllBlocks(false).filter(b => b.type === 'py_handler' && ids.has((b as unknown as FunctionBlock).functionId)).map(b => b.id);
}
const minutesText = (ms: number) => { const seconds = Math.round(ms / 1000); return `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
const STORAGE = 'python-blocks.guide.v1';
const item = (tag: string, className: string, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const richItem = (text: string) => { const li = document.createElement('li'); setRichText(li, text); return li; };

export function installGuide(host: GuideHost) {
  installWords();
  const slot = document.getElementById('guide-slot')!;
  // The list and its confirmation live in the Builds section; the active step is
  // mounted above the Help sections so it stays visible while ideas are shown.
  const activeSlot = document.getElementById('guide-active-slot') ?? slot;
  slot.innerHTML = `<section id="guide" class="guide" aria-labelledby="guide-title"><h2 id="guide-title">Lessons</h2><p class="tab-note">Build a game one checked step at a time. Lessons teach more; guided builds are quick.</p>
    <div id="guide-kept" class="guide-kept" hidden><p>Your project from before the lesson is kept.</p><button id="guide-kept-return" class="button secondary">Return to my project</button></div>
    <div id="guide-confirm" class="guide-confirm" hidden><p id="guide-confirm-text"></p><div class="guide-actions"><button id="guide-confirm-start" class="button primary">Replace and start</button><button id="guide-confirm-cancel" class="button secondary">Keep my project</button></div></div>
    <ul id="guide-list" class="guide-list"></ul></section>`;
  activeSlot.insertAdjacentHTML('beforeend', `<div id="guide-active" class="guide-active" hidden><div class="guide-head"><h3 id="guide-build-title"></h3><span id="guide-progress"></span></div><div id="guide-meter" class="guide-meter" aria-hidden="true"><span></span></div><div id="guide-chapters" class="guide-chapters" aria-hidden="true" hidden></div>
      <div id="guide-card" class="guide-card-body"><div class="guide-title-row"><h4 id="guide-step-title" class="guide-step-title" hidden></h4><span class="guide-tools"><button id="guide-watch" class="guide-tool" type="button" title="Watch it on the stage" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('play')}</svg><span class="guide-tool-label">Watch it</span></button><button id="guide-read" class="guide-read guide-tool" type="button" aria-pressed="false" title="Read to me" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('volume')}</svg><span class="guide-tool-label">Read to me</span></button><button id="guide-restart" class="guide-tool" type="button" title="Start this problem over" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('restart')}</svg><span class="guide-tool-label">Start over</span></button><button id="guide-why-toggle" class="guide-why-toggle guide-tool" type="button" aria-expanded="false" aria-controls="guide-why" title="Why does it work?" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('help')}</svg><span class="guide-tool-label">Why does it work?</span></button></span></div>
        <p id="guide-step" class="guide-step"></p>
        <div id="guide-why-box" class="guide-why-box" hidden><p id="guide-why" class="guide-why" hidden></p></div>
        <p id="guide-planted" class="guide-planted" hidden></p>
        <div id="guide-puzzle" class="guide-puzzle" hidden><div id="guide-examples" class="puzzle-examples"></div>
          <div class="puzzle-actions"><button id="guide-try" class="button secondary" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('play')}</svg>Try it</button><button id="guide-check-answer" class="button primary" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup('check')}</svg>Check my answer</button></div>
          <div id="guide-try-box" class="puzzle-try" hidden><label class="puzzle-box"><span>Your input</span><textarea id="guide-try-input" rows="3" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea></label><div class="puzzle-box"><span>Your program printed</span><pre id="guide-try-output"></pre></div><p id="guide-try-verdict" class="puzzle-verdict" role="status"></p></div>
          <div id="guide-results" class="puzzle-results" hidden><p id="guide-results-title" class="puzzle-results-title" role="status"></p><ol id="guide-results-list"></ol></div></div>
        <ul id="guide-checklist" class="guide-checklist" hidden></ul>
        <div id="guide-predict" class="guide-predict" hidden><p id="guide-question" class="guide-question"></p><div id="guide-choices" class="guide-choices" role="group" aria-label="Your guess"></div><p id="guide-predict-result" class="guide-predict-result" role="status"></p><button id="guide-another" class="button secondary" type="button" hidden>Try another one</button></div>
        <div id="guide-goal" class="guide-goal" role="status" hidden><p><span id="guide-goal-count"></span> <span id="guide-goal-label"></span></p><div id="guide-goal-pips" class="guide-goal-pips" aria-hidden="true"></div></div></div>
      <p id="guide-check" class="guide-check" role="status"></p>
      <div id="guide-hints" class="guide-hints" hidden><p id="guide-hint-text" class="guide-hint-text" role="status"></p></div>
      <div class="guide-actions"><button id="guide-back" class="button secondary">Back</button><button id="guide-hint" class="button secondary" hidden></button><button id="guide-show" class="button secondary">Show me how</button><button id="guide-next" class="button primary">Next step</button><button id="guide-stop" class="button secondary">Leave build</button></div>
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
  let timing: Timing | null = null, since: number | null = null, record = '', pending: Build | null = null, starting: Build | null = null, startingAt = 0;
  let planted: Record<string, string[]> = {}, answers: Record<string, number> = {}, early = false;
  // Academy units: each step's chosen version, the step whose own project is on the workspace, and how mastery problems went.
  let variants: Record<string, number> = {}, loadedFor = -1, mastery: Record<string, boolean> = {};
  // The learner's work on each academy step with its own project, kept while they look at other steps.
  let work: Record<number, unknown> = {};
  // Steps already done: going back to one and on again does not ask for it twice.
  let reached = new Set<number>();
  let rendering = false, cheers = 0, coachTimer = 0, looseTimer = 0, keysTip = false, cheerWaits = false, checking = 0, built = false, blocksFirst = false;
  const looseShown = new Set<string>();
  const hintLevel = new Map<number, number>();
  const lesson = () => active?.kind === 'lesson' || active?.kind === 'unit';
  const unit = () => active?.kind === 'unit';
  /** A unit with each step's chosen version; a mastery problem not yet chosen gets one by chance. */
  function versions(build: Build) {
    if (build.kind !== 'unit') return build;
    build.steps.forEach((step, i) => { if (variants[i] === undefined && step.mastery && step.variants?.length) variants[i] = Math.floor(Math.random() * (step.variants.length + 1)); });
    return { ...build, steps: build.steps.map((step, i) => version(step, variants[i] ?? 0)) };
  }
  const tried = (ok: boolean) => { if (active) host.progress?.({ build: active, index, type: 'tried', ok, hints: hintLevel.get(index) ?? 0, ms: timing?.steps[index] ?? 0 }); };
  const speech = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const stopReading = () => { if (speech?.speaking) speech.cancel(); el('guide-read').setAttribute('aria-pressed', 'false'); };

  for (const build of builds) {
    const entry = document.createElement('li'), start = document.createElement('button');
    start.className = build.kind === 'lesson' ? 'guide-card guide-lesson' : 'guide-card'; start.id = `guide-start-${build.id}`;
    const title = document.createElement('strong'), meta = document.createElement('span'), summary = document.createElement('span');
    title.textContent = build.title;
    meta.textContent = build.kind === 'lesson'
      ? `Lesson · ${build.minutes} min · ${levelNames[build.level]} · ${build.chapters?.length ?? 0} chapters`
      : `Guided build · ${build.minutes} min · ${levelNames[build.level]} · ${build.ideas.join(', ')}`;
    summary.textContent = build.summary;
    start.append(title, meta, summary); start.addEventListener('click', () => begin(build)); entry.append(start); el('guide-list').append(entry);
  }
  /** Add the time since the last check to the current step. */
  function clock() {
    if (timing && since !== null) { timing.steps[index] += performance.now() - since; since = document.hidden ? null : performance.now(); }
  }
  function save() {
    clock();
    try { if (active) localStorage.setItem(STORAGE, JSON.stringify({ id: active.id, index, timing: timing ?? undefined, planted, answers, variants, mastery, reached: [...reached] } satisfies Saved)); else localStorage.removeItem(STORAGE); } catch { /* the build continues in this tab */ }
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
    // A puzzle lesson or an academy unit has no finished game to show; its own picture stands in.
    preview.src = build.kind === 'unit' || build.steps.every(step => step.puzzle) ? `${import.meta.env.BASE_URL}lessons/${build.id}.png` : `${import.meta.env.BASE_URL}gallery/${build.id}-game.png`;
    el('lesson-start-eyebrow').textContent = build.unit ? `Academy · Chapter ${build.unit.chapter} · Unit ${build.unit.chapter}.${build.unit.number}` : `Guided lesson · ${levelNames[build.level]} level`;
    el('lesson-start-title').textContent = build.title;
    el('lesson-start-summary').textContent = build.summary;
    const puzzles = build.steps.every(step => step.puzzle);
    el('lesson-start-chips').replaceChildren(...[`About ${build.minutes} minutes`, build.unit ? (build.chapters ?? []).map(part => part.title).join(' · ') : `${build.chapters?.length ?? 0} chapters · ${build.steps.length} ${puzzles ? 'puzzles' : 'steps'}`, 'Saves as you go'].map(text => item('span', 'lesson-chip', text)));
    el('lesson-start-learn').replaceChildren(...(build.learn ?? []).map(text => item('li', '', text)));
    el('lesson-start-chapters').replaceChildren(...(build.chapters ?? []).map(chapter => {
      const li = item('li', ''); li.append(item('span', '', chapter.title), item('span', 'lesson-chapter-steps', chapter.steps === 1 ? '1 step' : `${chapter.steps} steps`)); return li;
    }));
    const keeping = host.workspace.getTopBlocks(false).length > 0;
    el('lesson-start-note').textContent = keeping ? 'Starting opens a fresh lesson project. The project in the editor now is kept, so you can go back to it.' : 'Starting opens a fresh lesson project.';
    el('lesson-start-go').textContent = build.unit ? 'Start unit' : 'Start lesson'; delete el('lesson-start-go').dataset.force;
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
    const at = startingAt; startingAt = 0;
    begin(build, at, true, null, true);
  });

  function begin(build: Build, at = 0, load = true, resumed: Saved | null = null, confirmed = false) {
    variants = resumed?.variants ?? {}; mastery = resumed?.mastery ?? {}; work = {}; reached = new Set(resumed?.reached ?? []); build = versions(buildById(build.id) ?? build);
    // A resumed unit's workspace is the learner's work on the open problem.
    loadedFor = load ? -1 : at;
    if (load) {
      if ((build.kind === 'lesson' || build.kind === 'unit') && !confirmed) { clearConfirm(); offerLesson(build); return; }
      // A project on the workspace is replaced only after an explicit choice
      // (the confirmation's button, or choosing the same build again).
      if (host.workspace.getTopBlocks(false).length && !confirmed && pending?.id !== build.id) {
        pending = build; el('guide-confirm').hidden = false;
        el('guide-confirm-text').textContent = `Starting “${build.title}” replaces the project in the editor. To keep your project, save it first (⋯ menu → Save project).`;
        host.reveal(true); scrollWithin(el('guide-confirm'));
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
    const step = active!.steps[index], kind = step.kind;
    // A unit names itself ("1.1 · Tap and it talks") and the part the step is in ("Practice 3 of 9 · Fix the bug").
    if (build.unit) {
      el('guide-build-title').textContent = `${build.unit.chapter}.${build.unit.number} · ${build.title}`;
      el('guide-progress').textContent = `${where.chapter.title} ${where.step + 1} of ${where.chapter.steps}${kind && kind !== 'build' ? ` · ${stepKinds[kind]}` : ''}`;
    } else {
      el('guide-build-title').textContent = `${where.number + 1} · ${where.chapter.title}`;
      el('guide-progress').textContent = step.puzzle ? `Puzzle ${index + 1} of ${build.steps.length}` : `Step ${where.step + 1} of ${where.chapter.steps}${kind && kind !== 'build' ? ` · ${stepKinds[kind]}` : ''}`;
    }
    el('guide-chapters').replaceChildren(...build.chapters!.map((chapter, number) => {
      const segment = item('span', ''); segment.style.flexGrow = String(chapter.steps);
      const filled = number < where.number ? 100 : number > where.number ? 0 : (where.step / chapter.steps) * 100;
      segment.style.setProperty('--filled', `${filled}%`); return segment;
    }));
  }
  function render() {
    if (!active) { el('guide-active').hidden = true; el('guide-list').hidden = false; clearHighlight(); stagePicture(null); hideClip(); lessonRoom(false); return; }
    const step = active.steps[index], isLesson = lesson();
    lessonRoom(isLesson, !!step.puzzle);
    // A quiz remembers its answer, and a mastery problem its one try.
    facts = { ran: false, finished: null, score: 0, level: 0, predicted: answers[index] !== undefined, answered: !!step.quiz && answers[index] === step.quiz.answer, tried: answers[index] !== undefined || mastery[index] !== undefined, solved: step.mastery && step.game ? mastery[index] === true : false }; done = false; early = false;
    el('guide-list').hidden = true; el('guide-active').hidden = false; el('guide-finish').hidden = true;
    el('guide-active').classList.toggle('guide-lesson-active', isLesson);
    el('guide-meter').hidden = isLesson; el('guide-chapters').hidden = !isLesson;
    if (isLesson) renderChapters(active);
    else {
      el('guide-build-title').textContent = active.title;
      el('guide-progress').textContent = `Step ${index + 1} of ${active.steps.length}`;
      el('guide-meter').querySelector('span')!.style.width = `${(index / active.steps.length) * 100}%`;
    }
    rendering = true; stopReading(); closePop(); clearTimeout(coachTimer); looseShown.clear();
    el('guide-step-title').hidden = !step.title; el('guide-step-title').textContent = step.title ?? '';
    el('guide-read').hidden = !isLesson || !speech;
    setRichText(el('guide-step'), step.text);
    // In a lesson the idea behind a step waits behind "Why does it work?", so the card stays short.
    el('guide-why-box').hidden = !step.why; setRichText(el('guide-why'), step.why ?? '');
    el('guide-why-toggle').hidden = !isLesson || !step.why; el('guide-why').hidden = isLesson; el('guide-why-toggle').setAttribute('aria-expanded', 'false');
    // A lesson's Leave sits by its progress, so its one row of buttons is Back, a hint and Next.
    el('guide-stop').textContent = unit() ? 'Leave unit' : isLesson ? 'Leave lesson' : 'Leave build';
    (isLesson ? document.querySelector('#guide-active .guide-head')! : el('guide-next').parentElement!).append(el('guide-stop'));
    el<HTMLButtonElement>('guide-back').disabled = index === 0;
    // Lessons offer "Show me how" as the last rung of the hint ladder.
    el('guide-show').hidden = isLesson || !step.recipe;
    // An academy problem opens with its own small project (the learner's own was kept when the unit started), and its scripts;
    // coming back to a step puts back the work done on it.
    if (step.project && loadedFor !== index) {
      if (loadedFor >= 0 && host.snapshot) work[loadedFor] = host.snapshot();
      if (work[index] !== undefined) { host.load(structuredClone(work[index]), active.title); loadedFor = index; } else openProject(step);
    }
    el('guide-restart').hidden = !step.project;
    if (step.select) host.select(step.select);
    host.prefer(step.other);
    if (step.plant && !step.project && !planted[index]) { planted[index] = host.insert(step.plant, `${active.title}: step ${index + 1}`, step.select, step.other); save(); }
    el('guide-planted').hidden = !step.plant || !!step.puzzle;   // a puzzle's plant only empties the Program block
    el('guide-planted').textContent = step.kind === 'fix' ? 'We made these blocks for you, but there is a bug. Can you fix it?' : 'We made these blocks for you. Read them before you run them.';
    renderChecklist(); renderPredict(); renderHints(); renderClip(true); renderPuzzle();
    highlight(step); evaluate(); rendering = false;
    // The coach points at where to look, once the card has settled.
    if (isLesson && step.coach && highlighted[0]) coachTimer = window.setTimeout(() => { if (active?.steps[index] === step && !done && !popOpen() && highlighted[0]?.isConnected) pop(highlighted[0], [step.coach!], { label: 'Tip', className: 'coach-pop', side: 'right', coach: true, timeout: 12000 }); }, 500);
    // A new step starts at the top of its card, wherever the last one was scrolled to.
    if (isLesson && !el('guide-active').closest('[hidden]')) scrollWithin(el('guide-active'), 'start');
  }
  /** A Guess-first step's guess (shown after the run), or an academy quiz (shown at once). */
  function renderPredict() {
    const step = active!.steps[index], quiz = step.quiz, prediction = step.predict ?? quiz;
    el('guide-predict').hidden = !prediction || guessWaits();
    el('guide-another').hidden = true;
    if (!prediction) return;
    const chosen = answers[index], shown = quiz ? chosen !== undefined : facts.ran;
    el('guide-question').textContent = quiz ? quiz.question : `Guess: ${prediction.question}`;
    el('guide-choices').replaceChildren(...prediction.choices.map((choice, number) => {
      const button = item('button', 'guide-choice', choice) as HTMLButtonElement;
      button.type = 'button'; button.setAttribute('aria-pressed', String(chosen === number));
      if (shown && number === prediction.answer) button.classList.add('guide-choice-answer');
      // Once it is shown, a lesson keeps only the guess and the answer, so what happened stays in view.
      button.hidden = lesson() && shown && chosen !== undefined && number !== chosen && number !== prediction.answer;
      button.addEventListener('click', () => {
        if (shown && chosen !== undefined) return;
        answers[index] = number; facts.predicted = true; early = false;
        if (quiz) { facts.tried = true; facts.answered = number === quiz.answer; if (step.mastery) mastery[index] = facts.answered; tried(facts.answered); }
        save(); renderPredict(); evaluate();
      });
      return button;
    }));
    const result = el('guide-predict-result');
    result.classList.remove('guide-right', 'guide-wrong');
    // A lesson's list already says to guess, then run; the line under the guesses waits for what happened.
    result.hidden = !quiz && lesson() && !!step.checklist?.some(part => 'predicted' in part.check) && !facts.ran && !early;
    if (quiz) {
      result.hidden = chosen === undefined;
      if (chosen !== undefined) {
        const right = chosen === quiz.answer;
        result.classList.add(right ? 'guide-right' : 'guide-wrong');
        setRichText(result, `${right ? 'Yes!' : 'Not quite.'} ${quiz.explain}`);
        // A wrong guess moves on to another version of the question; a mastery question has one try.
        el('guide-another').hidden = right || !!step.mastery;
      }
    } else if (chosen === undefined) setRichText(result, early ? 'Pick your guess first, then run it again.' : 'Pick your guess, then press [[Run code]] to see!');
    else if (!facts.ran) setRichText(result, 'Now press [[Run code]] and watch.');
    else {
      const right = chosen === prediction.answer;
      result.classList.add(right ? 'guide-right' : 'guide-wrong');
      setRichText(result, `${right ? 'You guessed it!' : 'Good guess! Here is what really happens:'} ${prediction.explain}`);
    }
    renderClip();
  }
  /** Another version of the open step (other names and numbers), or the same one again when it has no others. */
  el('guide-another').addEventListener('click', () => {
    if (!active) return;
    const base = buildById(active.id)?.steps[index]; if (!base) return;
    variants[index] = ((variants[index] ?? 0) + 1) % ((base.variants?.length ?? 0) + 1);
    active.steps[index] = version(base, variants[index]);
    delete answers[index]; delete work[index]; loadedFor = -1; save(); render(); scrollWithin(el('guide-predict'));
  });
  /** The guess waits until the blocks listed before it are in, so a lesson shows one moment at a time: build, guess, run. */
  const guessWaits = () => lesson() && !!active!.steps[index].predict && answers[index] === undefined && !early && !facts.ran && blocksFirst;
  function renderChecklist() {
    const step = active!.steps[index], list = el('guide-checklist'), parts = step.checklist ?? [];
    list.hidden = !parts.length;
    const ticks = parts.map(part => passes(part.check, host.workspace, facts)), blocks = parts.map(part => !aboutTheRun(part.check));
    // Once a lesson step's blocks are in, its finished items fold into one line; what is left (the guess, the run) stays in view.
    const before = built;
    built = lesson() && blocks.some(Boolean) && blocks.every((isBlock, i) => !isBlock || ticks[i]);
    const guess = parts.findIndex(part => 'predicted' in part.check);
    blocksFirst = parts.some((part, i) => i < (guess < 0 ? parts.length : guess) && blocks[i] && !ticks[i]);
    const rows = parts.map((part, i) => {
      const li = item('li', ''), ok = ticks[i];
      li.classList.toggle('guide-ticked', ok); li.classList.toggle('guide-folded', built && ok);
      const label = item('span', ''); setRichText(label, part.text);
      li.append(item('span', 'guide-box'), label);
      li.setAttribute('aria-label', `${plainText(part.text)}: ${ok ? 'done' : 'not yet'}`);
      return li;
    });
    if (built) {
      const summary = item('li', 'guide-summary');
      summary.append(item('span', 'guide-box'), item('span', '', ticks.every(Boolean) ? 'All done!' : step.predict && answers[index] === undefined ? 'Your blocks are in. Now guess!' : 'Your blocks are in.'));
      rows.unshift(summary);
    }
    list.replaceChildren(...rows);
    if (step.predict) el('guide-predict').hidden = guessWaits();
    el('guide-hints').hidden = !hintShown();
    // A new moment (the blocks just went in, or came out) starts at the top of the step.
    if (built !== before && !rendering && !el('guide-active').closest('[hidden]')) scrollWithin(el('guide-active'), 'start');
    const goal = step.goal; el('guide-goal').hidden = !goal;
    if (goal) {
      const reached = Math.min(facts.score ?? 0, goal.score);
      el('guide-goal-count').textContent = `${reached} of ${goal.score}`; el('guide-goal-label').textContent = goal.label;
      el('guide-goal-pips').replaceChildren(...Array.from({ length: goal.score }, (_, n) => item('span', n < reached ? 'guide-pip-on' : '')));
    }
  }
  /** A short recording of what the step makes, played over the stage: a build step plays it once as it opens,
   * and Watch by the step's title plays it again. On a Guess-first step it waits until the guess has been run. */
  const clipReady = () => { const step = active!.steps[index]; return lesson() && !!step.clip && (!step.predict || (facts.ran && answers[index] !== undefined)); };
  function renderClip(opening = false) {
    el('guide-watch').hidden = !clipReady();
    if (!clipReady()) hideClip();
    else if (opening && !active!.steps[index].predict) playClip();
  }
  function hideClip() { document.getElementById('guide-clip')?.remove(); }
  function playClip() {
    const surface = document.querySelector('.stage-surface'); if (!surface || !active) return;
    hideClip();
    const figure = item('figure', 'stage-clip'); figure.id = 'guide-clip';
    figure.dataset.clip = `${active.id}-${index}`;
    const caption = item('figcaption', '', active.steps[index].predict ? 'Watch: what really happens' : 'Watch: what you will make');
    const close = item('button', 'stage-clip-close', '×') as HTMLButtonElement; close.type = 'button'; close.setAttribute('aria-label', 'Close the clip');
    // Tapping the clip anywhere puts the stage back, so sprites can be picked and dragged again.
    figure.addEventListener('click', hideClip);
    const still = () => { const image = document.createElement('img'); image.alt = ''; image.src = clipUrl(active!, index, 'png'); image.addEventListener('error', hideClip, { once: true }); return image; };
    // Nothing moves for a reader who asked for reduced motion: the still frame stands in for a moment.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { figure.append(still(), caption, close); surface.append(figure); window.setTimeout(() => { if (figure.isConnected) hideClip(); }, 5000); return; }
    const video = document.createElement('video');
    video.muted = true; video.autoplay = true; video.playsInline = true; video.poster = clipUrl(active, index, 'png'); video.setAttribute('aria-hidden', 'true');
    for (const [type, ext] of [['video/mp4', 'mp4'], ['video/webm', 'webm']]) { const source = document.createElement('source'); source.type = type; source.src = clipUrl(active, index, ext); video.append(source); }
    const fail = () => video.replaceWith(still());
    video.lastElementChild!.addEventListener('error', fail, { once: true }); video.addEventListener('error', fail, { once: true });
    // It plays twice, then the stage comes back.
    let plays = 0;
    video.addEventListener('ended', () => { if (++plays < 2) video.play().catch(() => {}); else window.setTimeout(() => { if (figure.isConnected) hideClip(); }, 400); });
    figure.append(video, caption, close); surface.append(figure);
    video.play().catch(() => {});
  }
  el('guide-watch').addEventListener('click', () => { if (active && clipReady()) playClip(); });
  /** Tell the editor whether a lesson is open, so it can give the lesson room. */
  const lessonRoom = (on: boolean, puzzle = false) => host.lessonMode?.(on, puzzle);
  // ── Puzzles: examples, Try it, Check my answer, and the picture over the stage ──
  const box = (label: string, text: string, className = '') => { const div = item('div', `puzzle-box ${className}`.trim()); div.append(item('span', '', label), item('pre', '', text)); return div; };
  function stagePicture(step: BuildStep | null, cheering = false) {
    const surface = document.querySelector('.stage-surface'); let canvas = document.getElementById('puzzle-picture') as HTMLCanvasElement | null;
    const picture = step?.puzzle?.picture ?? (step?.panel && !facts.ran ? step.panel : undefined);
    if (!picture || !surface) { canvas?.remove(); return; }
    if (!canvas) { canvas = Object.assign(document.createElement('canvas'), { id: 'puzzle-picture', className: 'puzzle-picture', width: 960, height: 640 }); canvas.setAttribute('aria-hidden', 'true'); surface.append(canvas); }
    paintPuzzle(canvas, picture, cheering, !!step!.puzzle);
  }
  function renderPuzzle() {
    const step = active!.steps[index], puzzle = lesson() ? step.puzzle : undefined, game = lesson() ? step.game : undefined;
    checking++; stopChecking(); stopGameCheck();
    el('guide-puzzle').hidden = !puzzle && !game; stagePicture(lesson() ? step : null);
    // A game is checked by playing it, so it has no examples or Try it; a mastery problem has one try.
    el('guide-examples').hidden = !puzzle; el('guide-try').hidden = !puzzle;
    el<HTMLButtonElement>('guide-check-answer').disabled = !!step.mastery && mastery[index] !== undefined;
    el('guide-results').hidden = true; el('guide-results-list').replaceChildren();
    if (!puzzle) return;
    el('guide-examples').replaceChildren(...puzzle.tests.slice(0, puzzle.examples ?? 1).map(test => { const pair = item('div', 'puzzle-example'); pair.append(box('Example input', test.input), box('Answer wanted', test.output)); return pair; }));
    el<HTMLTextAreaElement>('guide-try-input').value = puzzle.tests[0].input;
    el('guide-try-box').hidden = true; el('guide-results').hidden = true; el('guide-results-list').replaceChildren();
  }
  function compiled() {
    const compilation = host.compilation(), problem = uncheckable(compilation);
    return { compilation, problem };
  }
  el('guide-try').addEventListener('click', async () => {
    const step = active?.steps[index]; if (!step?.puzzle) return;
    const run = ++checking, input = el<HTMLTextAreaElement>('guide-try-input').value, verdict = el('guide-try-verdict');
    el('guide-try-box').hidden = false; el('guide-try-output').textContent = 'Running…'; verdict.textContent = ''; verdict.className = 'puzzle-verdict';
    const { compilation, problem } = compiled();
    if (problem) { el('guide-try-output').textContent = ''; setRichText(verdict, problem); verdict.classList.add('puzzle-bad'); return; }
    const same = (a: string, b: string) => answerLines(a).join('\n') === answerLines(b).join('\n');
    const example = step.puzzle.tests.find(test => same(test.input, input));
    const [result] = await checkProgram(compilation, [{ input, output: example?.output ?? '' }]);
    if (run !== checking) return;
    el('guide-try-output').textContent = result.output || '(nothing printed)';
    if (result.error) { verdict.textContent = result.error; verdict.classList.add('puzzle-bad'); }
    else if (example) { verdict.textContent = result.ok ? '✓ That is the answer wanted.' : `✗ The answer wanted is: ${answerLines(example.output).join(' / ')}`; verdict.classList.add(result.ok ? 'puzzle-good' : 'puzzle-bad'); }
    else verdict.textContent = 'That is what your program printed for your input.';
    scrollWithin(el('guide-try-box'));
  });
  /** What to look at when a test fails: the test's own tip, or what the printed lines show. */
  function tipFor(test: PuzzleTest, result: TestResult) {
    if (result.error) return '';
    if (!result.output.trim()) return 'Your program did not print anything. Is there a ((Text#text_print|print)) block?';
    const got = answerLines(result.output), want = answerLines(test.output);
    if (got.length > want.length) return test.tip ?? 'Your program printed more lines than the answer has.';
    if (got.length < want.length) return test.tip ?? 'The answer has more lines than your program printed. Does your repeat run enough times?';
    return test.tip ?? 'Work out the answer for this input by hand, then follow your blocks one at a time.';
  }
  function resultItem(test: PuzzleTest, result: TestResult, number: number, open: boolean) {
    const li = item('li', result.ok ? 'puzzle-pass' : 'puzzle-fail'), name = `Test ${number}${test.name ? ` · ${test.name}` : ''}`;
    if (result.ok) { li.append(item('span', 'puzzle-mark', '✓'), item('span', '', name)); return li; }
    const details = document.createElement('details'); details.open = open;
    const summary = document.createElement('summary'); summary.append(item('span', 'puzzle-mark', '✗'), item('span', '', name));
    const boxes = item('div', 'puzzle-example');
    boxes.append(box('Input', test.input), box(result.error ? 'Your program stopped' : 'You printed', result.error ?? (result.output || '(nothing)'), 'puzzle-got'), box('Answer wanted', test.output));
    details.append(summary, boxes);
    const tip = tipFor(test, result); if (tip) { const p = item('p', 'puzzle-tip'); setRichText(p, `Tip: ${tip}`); details.append(p); }
    li.append(details); return li;
  }
  /** What a game check saw, in a child's words, when it was not what was wanted. */
  const costumeName = (id: unknown) => typeof id === 'string' ? id.replace(/^[a-z]+\//, '').replace(/@\d+$/, '').replace(/-/g, ' ') : String(id);
  function saw(step: GameStep, got: unknown) {
    if (!('expect' in step)) return '';
    const expect = step.expect;
    if (got === null || got === undefined) return 'sprite' in expect ? `${expect.sprite} is not on the stage.` : 'The game had not finished.';
    if ('sprite' in expect) {
      if ('says' in expect || 'thinks' in expect) return got ? `${expect.sprite} ${'says' in expect ? 'said' : 'thought'} “${got}”.` : `${expect.sprite} said nothing.`;
      if ('costume' in expect) return `${expect.sprite} wore ${costumeName(got)}.`;
      if ('visible' in expect) return `${expect.sprite} was ${got ? 'showing' : 'hidden'}.`;
      if ('at' in expect && Array.isArray(got)) return `${expect.sprite} was at x ${Math.round(Number(got[0]))}, y ${Math.round(Number(got[1]))}.`;
      for (const field of ['x', 'y', 'size', 'direction'] as const) if (field in expect) return `${expect.sprite}’s ${field} was ${Math.round(Number(got))}.`;
    }
    if ('score' in expect) return `The score was ${got}.`;
    if ('lives' in expect) return `Lives were ${got}.`;
    return `The game was ${got}.`;
  }
  function gameItem(step: GameStep, ok: boolean, got: unknown) {
    const li = item('li', `game-check ${ok ? 'puzzle-pass' : 'puzzle-fail'}`), label = item('span', ''); setRichText(label, step.label ?? 'Check');
    li.append(item('span', 'puzzle-mark', ok ? '✓' : '✗'), label);
    if (!ok) li.append(item('span', 'puzzle-saw', saw(step, got)));
    return li;
  }
  /** Check my answer for a game: the checker plays it (taps, keys, waits) and each check shows as it is judged. */
  async function checkTheGame(step: BuildStep) {
    const run = ++checking, script = step.game!.script, title = el('guide-results-title'), list = el('guide-results-list'), button = el<HTMLButtonElement>('guide-check-answer');
    el('guide-results').hidden = false; list.replaceChildren(); title.className = 'puzzle-results-title';
    const compilation = host.compilation(), problem = gameUncheckable(compilation);
    if (problem) { setRichText(title, problem); title.classList.add('puzzle-bad'); return; }
    const wanted = script.filter(part => 'expect' in part).length;
    title.textContent = 'Checking… the checker is playing your game'; button.disabled = true;
    const outcome = await checkGame(compilation, script, result => { if (run === checking) list.append(gameItem(script[result.index], result.ok, result.got)); });
    if (run !== checking) return;
    button.disabled = !!step.mastery;
    const passed = outcome.results.filter(r => r.ok).length, all = !outcome.error && passed === wanted;
    setRichText(title, outcome.error ? `Your game stopped with an error: ${outcome.error}` : all ? 'It works! Every check passes.'
      : step.mastery ? `${passed} of ${wanted} checks pass. That was your one try, so press [[Next step]].` : `${passed} of ${wanted} checks pass. Look at the ✗, change your blocks, then check again.`);
    title.classList.add(all ? 'puzzle-good' : 'puzzle-bad');
    facts.tried = true; if (step.mastery) mastery[index] = all; tried(all); save();
    scrollWithin(el('guide-results'));
    if (all) facts.solved = true;
    evaluate();
  }
  /** Load a step's own project and plant its scripts, as one fresh start. */
  function openProject(step: BuildStep) {
    delete work[index];
    host.load(structuredClone(step.project), active!.title); loadedFor = index;
    if (step.plant) { planted[index] = host.insert(step.plant, `${active!.title}: step ${index + 1}`, step.select, step.other); save(); }
  }
  el('guide-restart').addEventListener('click', () => {
    const step = active?.steps[index]; if (!step?.project) return;
    openProject(step);
    el('guide-results').hidden = true; el('guide-results-list').replaceChildren(); evaluate();
  });
  el('guide-check-answer').addEventListener('click', async () => {
    const step = active?.steps[index]; if (step?.game) { await checkTheGame(step); return; }
    if (!step?.puzzle) return;
    const run = ++checking, tests = step.puzzle.tests, title = el('guide-results-title'), list = el('guide-results-list');
    el('guide-results').hidden = false; list.replaceChildren(); title.className = 'puzzle-results-title';
    const { compilation, problem } = compiled();
    if (problem) { setRichText(title, problem); title.classList.add('puzzle-bad'); return; }
    title.textContent = `Checking… 0 of ${tests.length}`; (el('guide-check-answer') as HTMLButtonElement).disabled = true;
    let firstFailure = true;
    const results = await checkProgram(compilation, tests, result => {
      if (run !== checking) return;
      list.append(resultItem(tests[result.index], result, result.index + 1, !result.ok && firstFailure));
      if (!result.ok) firstFailure = false;
      title.textContent = `Checking… ${result.index + 1} of ${tests.length}`;
    });
    if (run !== checking) return;
    (el('guide-check-answer') as HTMLButtonElement).disabled = false;
    const passed = results.filter(r => r.ok).length, all = passed === tests.length;
    title.textContent = all ? `All ${tests.length} tests pass!` : `${passed} of ${tests.length} tests pass`;
    title.classList.add(all ? 'puzzle-good' : 'puzzle-bad');
    scrollWithin(el('guide-results'));
    if (all) { facts.solved = true; stagePicture(step, true); evaluate(); }
  });
  /** Hints, then "Show me how": the step's idea card, or the lesson's own blocks. */
  function rungs(step: BuildStep) { return [...(step.hints ?? []), ...(step.recipe || step.solution ? ['show'] : [])]; }
  /** A hint shows above the buttons once asked for, until the blocks are in or the step is done. */
  const hintShown = () => lesson() && !el('guide-hint').hidden && (hintLevel.get(index) ?? 0) > 0 && !built && !done;
  function renderHints() {
    const step = active!.steps[index], ladder = rungs(step), button = el<HTMLButtonElement>('guide-hint');
    // A mastery problem is the learner's own try: no hints, no Show me how.
    button.hidden = !lesson() || !ladder.length || !!step.mastery;
    const level = hintLevel.get(index) ?? 0;
    el('guide-hints').hidden = !hintShown();
    if (button.hidden) return;
    const shown = level > 0 ? ladder[level - 1] : '';
    setRichText(el('guide-hint-text'), shown === 'show'
      ? (step.recipe ? 'The idea card is open in Ideas. Press its Insert, then check the numbers.'
        : step.solution?.replacesPlant !== undefined ? 'We swapped in blocks that work. See what changed, then run it.' : 'We added the blocks. See how they fit, then run it.')
      : shown);
    const next = ladder[level];
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
    hintLevel.set(index, Math.min(ladder.length, level + 1)); renderHints(); scrollWithin(el('guide-hints'));
  });
  function showHow(step: BuildStep) {
    if (timing) timing.shown[index] = true;
    const recipe = step.recipe && recipeById(step.recipe);
    if (recipe) { host.showRecipe(recipe); return; }
    if (!step.solution) return;
    if (step.solution.world === 'copy') host.copyWorld?.();
    const replace = [...(step.solution.replacesPlant === undefined ? [] : planted[step.solution.replacesPlant] ?? []), ...scriptsNamed(host.workspace, step.solution.replaces ?? [])];
    if (!step.solution.parts.length) { save(); return; }
    const ids = host.insert(step.solution.parts, `${active!.title}: step ${index + 1}`, step.select, step.other, replace, step.solution.variables);
    if (step.solution.replacesPlant !== undefined) planted[step.solution.replacesPlant] = ids;
    save();
  }
  function evaluate() {
    if (!active) return;
    const step = active.steps[index], ok = passes(step.check, host.workspace, facts) || reached.has(index);
    if (ok) reached.add(index);
    if (ok && !done) { host.notify(); host.progress?.({ build: active, index, type: 'done', hints: hintLevel.get(index) ?? 0, ms: timing?.steps[index] ?? 0 }); if (lesson() && !rendering) cheer(); }
    done = ok;
    el('guide-check').textContent = ok ? (lesson() ? 'You did it! Press Next step.' : 'Done! Go to the next step.') : lesson() ? 'Do everything on the list to go on.' : 'When this step is done, it gets a check mark.';
    el('guide-check').classList.toggle('guide-done', ok);
    el<HTMLButtonElement>('guide-next').disabled = !ok;
    el('guide-next').textContent = index === active.steps.length - 1 ? 'Finish' : 'Next step';
    if (lesson()) renderChecklist();
  }
  /** A lesson step just got done: a cheer beside Next step, which it also offers. */
  function cheer() {
    clearTimeout(coachTimer);
    // The tip about tapping the game comes first; the cheer follows once it is closed.
    if (keysTip) { cheerWaits = true; return; }
    const next = el<HTMLButtonElement>('guide-next'); if (next.closest('[hidden]')) return;
    scrollWithin(next);
    const stars = document.createElement('span'); stars.className = 'cheer-stars'; stars.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) stars.append(Object.assign(document.createElement('i'), { style: `--i:${i}` }));
    const words = document.createElement('strong'); words.textContent = CHEERS[cheers++ % CHEERS.length];
    const go = document.createElement('button'); go.type = 'button'; go.className = 'button primary';
    go.textContent = index === active!.steps.length - 1 ? 'Finish' : 'Next step';
    go.addEventListener('click', () => { closePop(); next.click(); });
    pop(next, [stars, words, go], { label: words.textContent, className: 'cheer-pop', side: 'above', coach: true, timeout: 9000 });
  }
  /** A tip beside a block left loose on the workspace: it will not run until it is snapped into a script. */
  function looseTip() {
    if (!active || !lesson() || done) return;
    const loose = host.workspace.getTopBlocks(false).find(block => !block.isShadow() && (block.previousConnection || block.outputConnection) && !looseShown.has(block.id) && !block.isDeadOrDying());
    if (!loose) return;
    const root = loose.getSvgRoot(); if (!root.isConnected || !root.getBoundingClientRect().width) return;
    looseShown.add(loose.id); clearTimeout(coachTimer);
    const text = document.createElement('span');
    setRichText(text, loose.outputConnection ? 'This block is loose. Put it into a hole in another block.' : 'This block is loose, so it will not run. Snap it under a ((Events|when …)) block!');
    pop(root, [text], { label: 'Tip', className: 'coach-pop', side: 'right', coach: true, timeout: 9000 });
  }
  function finish() {
    if (!active) return;
    const build = active;
    stopReading(); closePop(); stopChecking(); stagePicture(null); hideClip(); lessonRoom(false);
    clearHighlight(); el('guide-meter').querySelector('span')!.style.width = '100%';
    el('guide-progress').textContent = 'Finished';
    el('guide-step').textContent = ''; el('guide-check').textContent = '';
    for (const id of ['guide-why-box', 'guide-planted', 'guide-predict', 'guide-goal', 'guide-checklist', 'guide-hints', 'guide-hint', 'guide-chapters', 'guide-step-title', 'guide-read', 'guide-watch', 'guide-why-toggle', 'guide-puzzle']) el(id).hidden = true;
    el('guide-finish').hidden = false; setRichText(el('guide-finish-text'), build.finish.text);
    el('guide-remix').replaceChildren(...build.finish.remix.map(richItem));
    const next = build.next ? buildById(build.next) : undefined;
    el('guide-next-build').hidden = !next; el('guide-next-build').textContent = next ? `${next.kind === 'lesson' ? 'Next lesson' : 'Next build'}: ${next.title}` : '';
    el('guide-next-build').onclick = () => { if (next) begin(next); };
    for (const id of ['guide-next', 'guide-back', 'guide-show']) el(id).hidden = true;
    clock();
    const total = timing ? timing.steps.reduce((sum, ms) => sum + ms, 0) : 0;
    el('guide-time').textContent = `Time: ${minutesText(total)} (planned ${build.minutes} min).`;
    record = JSON.stringify({
      build: build.id, title: build.title, plannedMinutes: build.minutes, started: timing?.started, finished: new Date().toISOString(), activeMinutes: Math.round(total / 600) / 100,
      steps: build.steps.map((step, i) => ({ step: i + 1, text: plainText(step.text), activeSeconds: Math.round((timing?.steps[i] ?? 0) / 100) / 10, usedShowMeHow: timing?.shown[i] ?? false })),
      note: 'Active time excludes time while the tab was hidden. Nothing is uploaded.', revision: host.revision, browser: navigator.userAgent,
    }, null, 2);
    const tries = mastery;
    active = null; timing = null; since = null; planted = {}; answers = {}; variants = {}; mastery = {}; save(); host.prefer(undefined); host.tabLabel('Help');
    if (build.kind === 'lesson' || build.kind === 'unit') celebrate(build, total, next, tries);
    host.finished(build);
  }
  /** The lesson's finish sheet: what was used, remixes, and where to go next. */
  function celebrate(build: Build, total: number, next: Build | undefined, tries: Record<string, boolean> = {}) {
    el('lesson-finish-title').textContent = build.kind === 'unit' ? `You finished ${build.title}` : `You built ${build.title}`;
    // A unit is mastered with two of its three mastery problems right.
    const right = Object.values(tries).filter(Boolean).length, count = build.steps.filter(step => step.mastery).length;
    setRichText(el('lesson-finish-text'), build.kind === 'unit' && count ? `${build.finish.text} Mastery: ${right} of ${count} right. ${right >= Math.min(2, count) ? '★ You mastered this unit!' : 'Practice a little more, then try the mastery problems again.'}` : build.finish.text);
    el('lesson-finish-learn').replaceChildren(...(build.chapters ?? []).map(chapter => { const li = item('li', ''); li.append(item('strong', '', chapter.title), item('span', '', chapter.idea)); return li; }));
    el('lesson-finish-remix').replaceChildren(...build.finish.remix.map(richItem));
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
  el('guide-why-toggle').addEventListener('click', () => {
    const open = el('guide-why').hidden; el('guide-why').hidden = !open; el('guide-why-toggle').setAttribute('aria-expanded', String(open));
    if (open) scrollWithin(el('guide-why'));
  });
  // Read the step aloud: its goal, its text and what to do, in the browser's own voice.
  el('guide-read').addEventListener('click', () => {
    if (!speech || !active) return;
    if (speech.speaking) { stopReading(); return; }
    const step = active.steps[index];
    const words = [step.title, step.text, ...(step.checklist ?? []).map(part => part.text)].filter(Boolean).map(text => plainText(text!)).join('. ').replace(/\.\./g, '.');
    const utterance = new SpeechSynthesisUtterance(words); utterance.rate = 0.92;
    utterance.onend = utterance.onerror = () => el('guide-read').setAttribute('aria-pressed', 'false');
    el('guide-read').setAttribute('aria-pressed', 'true'); speech.speak(utterance);
  });
  el('guide-stop').addEventListener('click', () => {
    stopReading(); closePop(); stopChecking(); stopGameCheck(); stagePicture(null); hideClip();
    active = null; timing = null; since = null; planted = {}; answers = {}; variants = {}; mastery = {}; loadedFor = -1; reached = new Set(); save();
    for (const id of ['guide-next', 'guide-back', 'guide-show']) el(id).hidden = false;
    clearConfirm(); host.prefer(undefined); host.tabLabel('Help'); render(); host.reveal(true); showKept(); host.stopped?.();
  });
  el('guide-timing').addEventListener('click', () => { if (record) host.download(`build-timing-${JSON.parse(record).build}.json`, record); });
  const changed = (event: Blockly.Events.Abstract) => {
    if (!active || event.isUiEvent) return;
    clearTimeout(timer); timer = window.setTimeout(evaluate, 120);
    clearTimeout(looseTimer); looseTimer = window.setTimeout(looseTip, 3500);
  };
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
      variants: entries(saved!.variants, v => Number.isInteger(v) && (v as number) >= 0) as Record<string, number>,
      mastery: entries(saved!.mastery, v => typeof v === 'boolean') as Record<string, boolean>,
      reached: Array.isArray(saved!.reached) ? saved!.reached.filter(n => Number.isInteger(n) && n >= 0) : [],
    });
  } catch { /* start fresh */ }
  showKept();
  return {
    get active() { return active; },
    /** Start a build; an academy unit can start at a later step (Continue on the map). */
    begin(id: string, at = 0) { const build = buildById(id); if (build) { startingAt = Math.max(0, Math.min(at, build.steps.length - 1)); begin(build); } },
    ran() {
      if (!active) return;
      hideClip();
      if (active.steps[index].panel) { facts.ran = true; stagePicture(null); }
      // A prediction counts only when it was made before the run.
      if (active.steps[index].predict && answers[index] === undefined) { early = true; renderPredict(); return; }
      clearTimeout(coachTimer); facts.ran = true;
      // Keys reach the game once it has been tapped; on a touch screen the game's own buttons appear instead.
      const step = active.steps[index], keys = step.keys, stage = document.getElementById('stage');
      if (lesson() && keys && stage && !matchMedia('(pointer: coarse)').matches && document.activeElement !== stage) {
        const text = document.createElement('span'); setRichText(text, KEY_TIPS[keys]); keysTip = true; cheerWaits = false;
        pop(stage, [text], { label: 'Tip', className: 'coach-pop', side: 'below', coach: true, timeout: 7000, onClose: () => {
          keysTip = false;
          if (cheerWaits) { cheerWaits = false; window.setTimeout(() => { if (active?.steps[index] === step && done && !popOpen()) cheer(); }, 1500); }
        } });
      }
      // The result (and its clip) first, so the cheer that evaluate() may show is placed where the card has settled.
      if (step.predict) { renderPredict(); scrollWithin(el('guide-predict-result')); }
      evaluate();
    },
    gameOver(won: boolean) { if (active) { facts.finished = won ? 'won' : 'lost'; evaluate(); } },
    /** What read blocks read when Run code runs: a puzzle's Try it input (its first example to begin with). */
    input() { return active && lesson() && active.steps[index].puzzle ? el<HTMLTextAreaElement>('guide-try-input').value : undefined; },
    /** The running game's score; Play-test goals count the highest reached. */
    score(value: number) { if (active && value > (facts.score ?? 0)) { facts.score = value; evaluate(); } },
    /** The running game's level (its world's number); a step can ask for a level reached. */
    level(value: number) { if (active && value > (facts.level ?? 0)) { facts.level = value; evaluate(); } },
    dispose() {
      save(); clearTimeout(timer); clearTimeout(looseTimer); clearTimeout(coachTimer); stopReading(); closePop(); stopChecking(); stopGameCheck(); stagePicture(null); hideClip(); lessonRoom(false); host.workspace.removeChangeListener(changed); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', save);
      clearHighlight(); slot.replaceChildren(); el('guide-active')?.remove(); el('lesson-start')?.remove(); el('lesson-finish')?.remove();
    },
  };
}
