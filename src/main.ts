import './style.css';
import { installIcons } from './ui/icons';
import { installBlockIcons } from './ui/block-icons';
import { installBlockSearch } from './ui/block-search';
import { installDebugger, debugOptions } from './ui/debugger';
import { installPlayView } from './scene/play-view';
import { Questions } from './scene/questions';
import { SoundEditor } from './scene/sound-editor';
import { SoundPlayer } from './runtime/audio';
import { GameView } from './scene/game';
import { Blockly, squareProject } from './blocks';
import { PythonRunner } from './runtime/runner';
import { Stage, validateSceneImages } from './stage';
import { installSceneEditor } from './scene/editor';
import spriteExample from './scene/example.json';
import { emptyScene } from './scene/model';
import { sceneState } from './scene/state';
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
import { installHatGuard } from './language/hats';
import { handlerSignatures } from './language/functions';
import { insertRecipe, recipes, type Recipe } from './guide/recipes';
import { recipeCard, type CardHost } from './guide/card';
import { installIdeas, rankIdeas } from './guide/ideas';
import { installGuide } from './guide/builds';
import { installNudges, type FixKind } from './guide/nudges';
import { installFixes, type RuntimeFault } from './guide/fixes';
import { installGallery } from './guide/gallery';
import { installLessons } from './guide/lessons';
import { atLeast, installLevels, levelNames, requiredLevel, storedLevel, toolboxFor, LEVEL_KEY, type Level } from './ui/levels';
import { installHelpSections, installInputHints, installLevelControl, installMenu, installPaletteHint, installPythonPlacement, installTabs, installViewSwitch, shellMarkup, trackKeyboard } from './ui/shell';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = shellMarkup + `<dialog id="migration-dialog"><h2>Choose startup order</h2><p>This older project has several loose stacks. Choose their order inside Program.</p><ol id="migration-order"></ol><p id="migration-error" role="alert"></p><button id="migration-apply" class="button primary">Use this order</button><button id="migration-cancel" class="button secondary">Cancel</button></dialog>`;

const disposeIcons = installIcons();
const disposeInputHints = installInputHints();
const disposeKeyboard = trackKeyboard(document.documentElement);
const menu = installMenu();

function element<T extends HTMLElement>(selector: string): T { return document.querySelector<T>(selector)!; }
const run = element<HTMLButtonElement>('#run');
const stop = element<HTMLButtonElement>('#stop');
const status = element('#status');
const output = element('#output');
const outputPanel = element('#output-panel');
const badge = element<HTMLButtonElement>('#stage-badge');
// Output and errors live in their tab. The first print or error of a run opens
// it, unless the learner is typing in another tab; then a stage badge points there.
let outputAnnounced = false, errorCount = 0;
const tabs = installTabs(tab => { if (tab === 'output') badge.hidden = true; });
const help = installHelpSections();
// The title is cosmetic editor state, kept with the autosave so a reload shows the same name.
const TITLE_KEY = 'python-blocks.title.v1';
const projectTitle = element('#project-title');
/** A lesson keeps the project it replaced here until the learner returns to it. */
const KEPT_KEY = 'python-blocks.guide.kept.v1';
const setTitle = (text: string) => { projectTitle.textContent = text; try { localStorage.setItem(TITLE_KEY, text); } catch { /* the title still shows in this tab */ } };
const outputState = () => { element('#output-empty').hidden = !outputPanel.hidden || !element('#diagnostics-panel').hidden; };
function announceOutput(kind: 'print' | 'error') {
  outputState();
  if (tabs.current === 'output') return;
  const typing = document.activeElement?.closest('.tab-panels') && document.activeElement.matches('input, textarea, select');
  if (!outputAnnounced && !typing) { outputAnnounced = true; tabs.activate('output'); return; }
  outputAnnounced = true;
  if (kind === 'error' || badge.hidden) { badge.textContent = kind === 'error' ? 'Let’s try again · tap to see' : 'New output · tap to see'; badge.hidden = false; }
  tabs.mark('output', true);
}
badge.addEventListener('click', () => tabs.activate('output', true));
const soundPlayer = new SoundPlayer();
element('#audio-controls').insertAdjacentHTML('afterbegin', '<button id="audio-enable" class="button secondary ui-icon-only" title="Enable audio">Enable audio</button><button id="audio-mute" class="button secondary ui-icon-only" aria-pressed="false" title="Mute">Mute</button><span id="audio-status" class="visually-hidden" role="status">Audio ready</span>');
soundPlayer.onChange = () => { element('#audio-status').textContent = `${soundPlayer.count} playing · ${soundPlayer.state}`; element('#audio-status').dataset.voices = String(soundPlayer.count); };
const enableAudio = () => { void soundPlayer.enable().catch(error => { element('#audio-status').textContent = String(error); }); };
element('#audio-enable').addEventListener('click', enableAudio);
element('#audio-mute').addEventListener('click', () => { soundPlayer.mute(!soundPlayer.isMuted); element('#audio-mute').setAttribute('aria-pressed', String(soundPlayer.isMuted)); element('#audio-mute').textContent = element('#audio-mute').title = soundPlayer.isMuted ? 'Unmute' : 'Mute'; });
const stage = new Stage(element<HTMLCanvasElement>('#stage'));
let pendingPaint = false;
const paint = () => {
  if (pendingPaint) return;
  pendingPaint = true;
  requestAnimationFrame(() => { stage.paint(); pendingPaint = false; });
};
let debuggerView: ReturnType<typeof installDebugger> | undefined;
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
let viewSwitch: ReturnType<typeof installViewSwitch> | undefined;
const updateEventControls = () => {
  element('#event-input').hidden = (runningCompilation ?? compilation)?.executionMode !== 'events';
  element<HTMLButtonElement>('#event-send').disabled = !eventReady || !runningCompilation || !!debuggerView?.paused;
};
element('.stage-wrap').insertAdjacentHTML('beforeend', '<section id="questions" class="questions" aria-label="Project questions"></section>');
const questions = new Questions(element('#questions'), element('#stage'));
questions.onActive = () => sceneEditor?.releaseInput();
let autoTouch = false;
// The last run's error, by the block it was mapped to, so its "!" can offer a fix.
const runtimeFaults = new Map<string, RuntimeFault>();
const idle = (preserveHighlight = false) => { stage.pause(false); sceneEditor?.stop(); runningCompilation = null; eventReady = false; run.disabled = !!pythonEditor?.busy || !!pythonEditor?.unstored || (!pythonEditor?.active && (!compilation?.hasEntry || compilation?.source === null)); stop.disabled = true; debuggerView?.finish(preserveHighlight); updateEventControls(); if (autoTouch) { autoTouch = false; sceneEditor?.touchControls(false); } };
const runner = new PythonRunner(event => {
  debuggerView?.event(event);
  if (event.type === 'debug-paused') { status.textContent = 'Paused'; stage.pause(true); sceneEditor?.pause(true); updateEventControls(); }
  if (event.type === 'debug-running') { stage.pause(false); sceneEditor?.pause(false); status.textContent = eventReady ? 'Event session running' : 'Running Python…'; updateEventControls(); }
  if (event.type === 'watch-values') sceneEditor?.watch(event.values);
  if (event.type === 'scene') {
    if (event.command.type === 'game') {
      guide.score(event.command.state.score);
      if (event.command.state.result) { eventReady = false; sceneEditor?.stop(); updateEventControls(); guide.gameOver(event.command.state.result.won); }
      gameView.accept(event.command.state);
    }
    stage.acceptScene(event.command); paint(); sceneEditor?.live(); }
  if (event.type === 'draw') { stage.accept(event.command); paint(); }
  if (event.type === 'stdout') { outputPanel.hidden = false; output.textContent = (output.textContent + event.text + '\n').slice(-20_000); announceOutput('print'); }
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
    idle(true); paint(); announceOutput('error');
    const fix: FixKind | null = event.exceptionType === 'NameError' ? 'name' : /stopped responding|Stopped after \d+ seconds/.test(event.message) ? 'loop' : null;
    if (fix) nudges.error(fix);
    if (id && runningCompilation?.revision === compilation.revision) runtimeFaults.set(id, { message: event.message, kind: fix });
  }
}, soundPlayer, questions);

// Tablets get larger block text at full scale, pinch zoom, and no trashcan:
// drag a block back to the palette or use Delete in its long-press menu.
const coarse = matchMedia('(pointer: coarse)').matches;
const theme = Blockly.Theme.defineTheme('pythonBlocks', {
  name: 'pythonBlocks', base: Blockly.Themes.Classic,
  componentStyles: { workspaceBackgroundColour: '#fbfcf8', toolboxBackgroundColour: '#f3f5ed', toolboxForegroundColour: '#35483b', flyoutBackgroundColour: '#edf1e5', flyoutOpacity: 1, scrollbarColour: '#cbd3c4', insertionMarkerColour: '#267c70', insertionMarkerOpacity: 0.25 },
  fontStyle: { family: 'system-ui, sans-serif', weight: '500', size: coarse ? 13 : 12 },
});
// Reserve a leading icon gutter using Blockly’s own measured button bounds.
Blockly.FlyoutButton.TEXT_MARGIN_X = 26;
Blockly.FlyoutButton.TEXT_MARGIN_Y = 12;
const startScale = coarse ? 1 : 0.9;
let level: Level = storedLevel();
const workspace = Blockly.inject('blockly', {
  toolbox: toolboxFor(level), theme, oneBasedIndex: false, media: `${import.meta.env.BASE_URL}blockly/`,
  grid: { spacing: 24, length: 2, colour: '#dce2d5', snap: false },
  zoom: { controls: false, wheel: true, pinch: true, startScale, minScale: 0.5, maxScale: 1.6 },
  move: { scrollbars: true, drag: true, wheel: true }, trashcan: false,
});
installPythonVariables(workspace);
const disposeHatGuard = installHatGuard(workspace);
const paletteHint = installPaletteHint(() => element('#blockly').querySelector<HTMLElement>('.blocklyToolbox'));
element('#zoom-in').addEventListener('click', () => workspace.zoomCenter(1));
element('#zoom-out').addEventListener('click', () => workspace.zoomCenter(-1));
element('#zoom-reset').addEventListener('click', () => { workspace.setScale(startScale); workspace.scrollCenter(); });
const soundEditor = new SoundEditor(workspace);
const disposeLanguageEditor = installLanguageEditor(workspace);
sceneEditor = installSceneEditor(workspace, stage, value => runner.input(value), { spriteAdded: name => nudges.spriteAdded(name) });
element('#stage-assets').insertAdjacentHTML('beforeend', '<button id="sound-open" class="button secondary">Sounds & music</button>');
element('#sound-open').addEventListener('click', () => soundEditor.open());
installLevels(workspace, () => sceneEditor?.selected() ?? '');
// Every command and event block carries its family's symbol; installed before any project loads.
installBlockIcons(workspace);
// Guidance: reviewed recipes inserted by the app, the gallery, guided builds and nudges.
let preferredTarget: string | undefined;
const cards: CardHost = {
  level: () => level,
  sprites: () => sceneState(workspace).sprites.map(s => ({ id: s.id, name: s.name })),
  selected: () => sceneEditor?.selected() ?? '',
  target: () => preferredTarget,
  insert(recipe: Recipe, target?: string) {
    const switched = !atLeast(level, recipe.level);
    if (switched) levelControl.set(recipe.level);
    const added = insertRecipe(workspace, recipe, sceneEditor?.selected() ?? '', target ?? preferredTarget);
    nudges.inserted(recipe);
    return `Added ${added.length === 1 ? 'a script' : `${added.length} scripts`} for “${recipe.title}”. Run to try it; Undo removes it.${switched ? ` The level is now ${levelNames[recipe.level]}, so the palette shows these blocks.` : ''}`;
  },
  show: recipe => ideas.show(recipe),
};
const blockSearch = installBlockSearch(workspace, () => toolboxFor(level), {
  match: query => rankIdeas(query, level).map(recipe => recipeCard(recipe, cards, { compact: true })),
  preferred: () => level === 'starter',
});
const playView = installPlayView(() => sceneEditor?.releaseInput());
element('#phone-play').addEventListener('click', () => element('#play-expand').click());
const helpDot = () => { if (tabs.current !== 'help') tabs.mark('help', true); };
const showHelp = (section: 'ideas' | 'builds' | 'more') => { tabs.activate('help'); help.show(section); };
const gallery = installGallery({
  open(entry, project) {
    if (!installProject(prepareProject(JSON.stringify(project)).project)) return false;
    setTitle(entry.title); offerLevel(); nudges.tryChanging(entry.title, entry.tryChanging);
    return true;
  },
  play() { element('#play-expand').click(); element('#play-run').click(); },
});
// Lessons and guided builds have their own catalogue, apart from Examples.
const lessons = installLessons({ start: id => guide.begin(id), play: id => gallery.play(id) });
const ideas = installIdeas({
  ...cards, show: recipe => ideas.show(recipe), reveal: () => showHelp('ideas'),
  askAi: wish => { if (level === 'starter') return null; showHelp('more'); assist?.prepare(wish); element<HTMLDetailsElement>('#assist-panel').scrollIntoView({ block: 'start' }); return 'Your wish is in AI assist (Help → More). Review what will be shared, then Send.'; },
});
const nudges = installNudges({
  reveal: () => showHelp('ideas'), notify: helpDot, showRecipe: recipe => ideas.show(recipe), search: wish => ideas.search(wish),
  openGallery: () => gallery.open(), startBuild: id => guide.begin(id), handlerCount: () => handlerSignatures(workspace).length,
  picks: () => [['catch-the-star-game', 'Catch the star'], ['pen-patterns-game', 'Pen patterns'], ['scene-story-example', 'Story']].map(([id, title]) => ({ id, title, open: () => gallery.load(id) })),
});
const guide = installGuide({
  workspace, level: () => level, setLevel: next => levelControl.set(next),
  // A guided build works in the blocks, so it starts in Blocks view.
  load(project, title) { if (!installProject(prepareProject(JSON.stringify(project)).project)) return false; setTitle(title); viewSwitch?.show('blocks'); return true; },
  select: id => sceneEditor?.select(id), prefer: id => { preferredTarget = id; }, showRecipe: recipe => ideas.show(recipe), reveal: list => { if (list) showHelp('builds'); else tabs.activate('help'); }, notify: helpDot,
  finished: () => helpDot(),
  stopped: () => nudges.empty(!workspace.getTopBlocks(false).length),
  download: (name, text) => download(name, text, 'application/json'),
  revision: typeof __APP_REVISION__ === 'string' ? __APP_REVISION__ : 'development (revision unavailable)',
  insert(parts, title, select, other, replace = []) {
    const lesson: Recipe = { id: 'lesson', title, group: 'game', phrases: [], level, concepts: ['event'], steps: [], blocks: parts };
    const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
    try {
      for (const id of replace) workspace.getBlockById(id)?.dispose(true);
      return insertRecipe(workspace, lesson, select ?? sceneEditor?.selected() ?? '', other).map(block => block.id);
    } finally { Blockly.Events.setGroup(group); }
  },
  keep() {
    saveCurrentProject();
    try { localStorage.setItem(KEPT_KEY, JSON.stringify({ title: projectTitle.textContent ?? '', project: snapshot(workspace) })); return true; } catch { return false; }
  },
  restore() {
    let kept: { title: string; project: unknown } | null = null;
    try { kept = JSON.parse(localStorage.getItem(KEPT_KEY) ?? 'null'); } catch { kept = null; }
    if (!kept || !installProject(prepareProject(JSON.stringify(kept.project)).project)) return false;
    setTitle(kept.title || 'My project'); offerLevel();
    try { localStorage.removeItem(KEPT_KEY); } catch { /* the kept copy stays until it can be removed */ }
    return true;
  },
  kept() { try { return localStorage.getItem(KEPT_KEY) !== null; } catch { return false; } },
  play() { element('#run').click(); },
  tabLabel(text) { const label = element('#tab-help').firstChild; if (label) label.textContent = text; },
});
// A block's "!" at Starter and Builder offers a step-by-step fix instead of Blockly's plain bubble.
const fixes = installFixes({
  workspace, level: () => level,
  diagnostics: () => compilation?.diagnostics ?? [], runtime: id => runtimeFaults.get(id) ?? null,
  reveal: () => tabs.activate('help'), notify: helpDot,
  showRecipe: recipe => ideas.show(recipe), showOutput: () => tabs.activate('output'),
  openLibrary: kind => sceneEditor?.openLibrary(kind), openSounds: () => soundEditor.open(),
  makeVariable: () => workspace.getButtonCallback('PB_MAKE_VARIABLE')?.(workspace.getToolbox()?.getFlyout()?.getWorkspace() as never),
  openHandlers: () => element('#events-manage').click(),
});
/** Levels filter the palette, menus and sprite settings; they never hide blocks already in a project. */
const levelControl = installLevelControl(next => {
  level = next;
  workspace.updateToolbox(toolboxFor(next)); workspace.getFlyout()?.hide();
  // The palette may change width (Builder and Pro use two columns on tablets): let Blockly re-measure it.
  Blockly.svgResize(workspace); paletteHint.refresh();
  blockSearch.refresh();
  debuggerView?.refresh();
});
function offerLevel() { try { levelControl.offer(requiredLevel(workspace)); } catch { /* an unusual project still opens; the palette is unchanged */ } }
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

const pythonPlacement = installPythonPlacement(() => Blockly.svgResize(workspace));
viewSwitch = installViewSwitch(view => {
  Blockly.hideChaff(); pythonPlacement.refresh();
  // The workspace was hidden in Stage view: let Blockly measure it again.
  if (view === 'blocks') { Blockly.svgResize(workspace); paletteHint.refresh(); }
  sceneEditor?.view.refresh();
});
// "Go to script" centres a script in the workspace, so it opens Blocks view first.
element('#scene-script-find').addEventListener('click', () => viewSwitch?.show('blocks'), { capture: true });

debuggerView = installDebugger(workspace, {
  reveal: () => tabs.activate('output'),
  start: async () => {
    if (runningCompilation) return;
    if (pythonEditor?.active || compilation.requiresSound) enableAudio();
    const accepted = await acceptedCompilation(); if (accepted) startRun(accepted, false, true);
  },
  stop: () => stop.click(),
  action: action => runner.debug(action),
  current: () => compilation,
  draftChanged: () => !!pythonEditor?.hasChanges,
});

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function updateCode(save = true) {
  const current = JSON.stringify(authoredProject(snapshot(workspace)));
  if (!compilation || compiledProject !== current) { compilation = compile(workspace); compiledProject = current; blockSearch.refresh(); }
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
  runtimeFaults.clear();
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
  const errors = compilation.diagnostics.filter(d => d.severity === 'error').length;
  if (errors > errorCount && tabs.current !== 'output') tabs.mark('output', true);
  errorCount = errors; outputState();
  nudges.empty(!workspace.getTopBlocks(false).length && !guide.active);
  fixes.refresh();
  debuggerView?.refresh();
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
  runner.stop(); idle(); sceneEditor?.restore(true); paint();
  autosaveEnabled = true; recoveryText = null; element('#recover').hidden = true;
  output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true; badge.hidden = true; tabs.mark('output', false);
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
    pendingMigration = null; element<HTMLDialogElement>('#migration-dialog').close(); offerLevel();
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
    projectTitle.textContent = localStorage.getItem(TITLE_KEY) || 'My project';
  } else projectTitle.textContent = 'My first drawing';
} catch (error) {
  autosaveEnabled = false;
  notice.textContent = `Saved work could not be restored: ${error instanceof Error ? error.message : error} Download it for recovery, or open another project. Autosave is paused.`;
  element('#recover').hidden = !recoveryText;
}
sceneEditor.restore();
updateCode(autosaveEnabled);
// A browser that has never chosen a level gets a one-time offer for its saved project.
try { if (localStorage.getItem(LEVEL_KEY) === null && !element<HTMLDialogElement>('#migration-dialog').open) offerLevel(); } catch { /* storage unavailable */ }
let assist: ReturnType<typeof installAssist> | undefined;
let lastHelpBlock: string | null = null;
const pilot = installPilot({
  capture: () => {
    if (!autosaveEnabled || !pythonEditor?.flush()) throw new Error('Save or recover your current project before starting the pilot.');
    return JSON.stringify(snapshot(workspace));
  },
  load: source => { if (!installProject(prepareProject(source).project)) throw new Error('Save your Python draft before changing projects.'); offerLevel(); },
  starter: kind => JSON.stringify(kind === 'score' ? scoreStarter() : prepareProject(JSON.stringify(spriteExample)).project),
  download: (name, text) => download(name, text, 'application/json'),
  changed: active => assist?.setPilotActive(active),
  revision: typeof __APP_REVISION__ === 'string' ? __APP_REVISION__ : 'development (revision unavailable)',
});
assist = installAssist({
  pilotActive: () => pilot.active,
  ideas: { list: recipes.map(recipe => ({ id: recipe.id, title: recipe.title })), match: text => rankIdeas(text, level).map(recipe => recipe.id), show: id => ideas.showId(id), chips: ['make an enemy chase me', 'jump when I press space', 'keep score', 'collect a coin'] },
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
let updatePending = false, updateGroup = '';
workspace.addChangeListener(event => {
  if (event.type === Blockly.Events.SELECTED) {
    const id = (event as Blockly.Events.Selected).newElementId;
    if (id && workspace.getBlockById(id)) lastHelpBlock = id;
    pythonEditor?.follow(id && workspace.getBlockById(id) ? id : null);
  }
  if (!event.isUiEvent) nudges.activity();
  if (event.isUiEvent) return;
  updateGroup = event.group;
  if (updatePending) return;
  updatePending = true;
  queueMicrotask(() => {
    updatePending = false;
    // A block that gains or loses a warning re-renders and may bump a neighbour. That move
    // belongs to the change that caused it, so a single Undo reverts both.
    const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(updateGroup || false);
    try { updateCode(); } finally { Blockly.Events.setGroup(group || false); }
  });
});
const resizeObserver = new ResizeObserver(() => Blockly.svgResize(workspace));
resizeObserver.observe(element('#blockly'));
element('#menu-pilot').addEventListener('click', () => { showHelp('more'); const panel = element<HTMLDetailsElement>('#pilot-panel'); panel.open = true; panel.querySelector('summary')!.focus(); panel.scrollIntoView({ block: 'start' }); });
element('#menu-assist').addEventListener('click', () => { showHelp('more'); const panel = element<HTMLDetailsElement>('#assist-panel'); panel.open = true; panel.querySelector('summary')!.focus(); panel.scrollIntoView({ block: 'start' }); });

/** Key handlers, key sensing or a keyboard controller mean the program wants keys. */
function listensForKeys(captured: Compilation) {
  return handlerSignatures(workspace).some(h => /^(key|release):/.test(h.handler!.event))
    || workspace.getAllBlocks(false).some(b => b.isEnabled() && (b.type === 'scene_key' || b.type === 'scene_control'))
    || !!captured.scene?.sprites.some(s => s.motion?.controller && s.motion.controller !== 'none');
}
function startRun(captured: Compilation, focus = false, debug = false) {
  if (!captured.hasEntry || captured.source === null) return;
  soundEditor.close();
  if (captured.requiresSound) enableAudio();
  sceneEditor?.start(captured.scene ?? emptyScene()); output.textContent = ''; outputPanel.hidden = true; element('#error-details').hidden = true;
  outputAnnounced = false; badge.hidden = true; tabs.mark('output', false); outputState();
  // Touch screens: a program that listens for keys gets the on-screen controller, and it plays in
  // Large stage, where the controller docks under the stage instead of covering the small editor stage.
  if (coarse) {
    autoTouch = listensForKeys(captured);
    sceneEditor?.touchControls(autoTouch);
    if (autoTouch && !element<HTMLDialogElement>('#play-dialog').open) { element('#play-expand').click(); focus = true; }
  }
  runningCompilation = captured; replayCompilation = captured; guide.ran();
  replayDraftCheckpoint = pythonEditor?.replayCheckpoint() ?? null;
  eventReady = false; element('#event-input-status').textContent = ''; updateEventControls();
  run.disabled = true; stop.disabled = false; status.textContent = 'Starting Python…';
  debuggerView?.start(captured, debug);
  runner.run(captured.source, captured.executionMode, captured.files, captured.scene, undefined, debug ? debugOptions(captured) : undefined);
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
  if (installProject(prepared.project)) setTitle('My first drawing');
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
    else if (installProject(prepared.project)) { setTitle(file.name.replace(/\.python-blocks\.json$|\.json$/i, '') || 'My project'); offerLevel(); }
  } catch (error) { notice.textContent = `Could not open project: ${error instanceof Error ? error.message : error}. Your current work is unchanged.`; }
});
if (import.meta.hot) import.meta.hot.dispose(() => { disposeIcons(); disposeInputHints(); disposeKeyboard(); disposeHatGuard(); paletteHint.dispose(); menu.dispose(); gallery.dispose(); lessons.dispose(); fixes.dispose(); guide.dispose(); nudges.dispose(); levelControl.dispose(); pythonPlacement.dispose(); viewSwitch?.dispose(); blockSearch.dispose(); debuggerView?.dispose(); assist?.dispose(); pilot.dispose(); exportController?.abort(); pythonEditor?.dispose(); window.removeEventListener('pagehide', saveCurrentProject); playView.dispose(); runner.dispose(); soundEditor.dispose(); soundPlayer.dispose(); stage.dispose(); resizeObserver.disconnect(); disposeLanguageEditor(); sceneEditor?.dispose(); workspace.dispose(); });
