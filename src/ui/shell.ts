import logo from './logo.svg?raw';
import { LEVELS, atLeast, levelNames, storeLevel, storedLevel, type Level, type LevelNeed } from './levels';
import { iconSvg, type IconName } from './icon-art';
import './shell.css';

/** Each level's symbol and what it adds, shown in the level menu. */
const levelIcons: Record<Level, IconName> = { starter: 'sprout', builder: 'bricks', pro: 'rocket' };
const levelDescriptions: Record<Level, string> = {
  starter: '8 block groups for first games',
  builder: 'Adds logic, numbers, text, sensing and physics',
  pro: 'Every block group, worlds and modules',
};

export const TABS = ['sprite', 'python', 'output', 'help'] as const;
export type Tab = typeof TABS[number];
const tabLabels: Record<Tab, string> = { sprite: 'Sprite', python: 'Python', output: 'Output', help: 'Help' };
/** The Help tab is split so ideas, guided builds and the rest never scroll past each other. */
export const HELP_SECTIONS = ['ideas', 'builds', 'more'] as const;
export type HelpSection = typeof HELP_SECTIONS[number];
const helpLabels: Record<HelpSection, string> = { ideas: 'Ideas', builds: 'Lessons', more: 'More' };

/** The one-screen shell: a top bar, the blocks panel and a right column with the
 * stage, sprite tray and four tabs. Feature modules mount into the named slots. */
export const shellMarkup = `
  <div class="app-shell" id="shell">
    <header class="top-bar" aria-label="Project">
      <a class="brand-mark" href="./" aria-label="Python Blocks home">${logo.replace(/role="img" aria-label="Python Blocks"/, 'aria-hidden="true" focusable="false"')}</a>
      <div class="project-title"><strong id="project-title">My project</strong><span id="save-state" class="project-notice" role="status"></span></div>
      <div class="top-history" id="top-history" aria-label="Edit history"></div>
      <div class="view-switch" id="view-switch" role="group" aria-label="View"><button id="view-blocks" class="view-option" type="button" aria-pressed="true" title="Blocks view: code first, with a small stage">Blocks</button><button id="view-stage" class="view-option" type="button" aria-pressed="false" title="Stage view: a large stage to place sprites, build big worlds and play">Stage</button></div>
      <span class="top-spacer"></span>
      <button id="run" class="button primary run-button">Run code</button><button id="stop" class="button secondary" disabled>Stop</button>
      <span class="top-divider" aria-hidden="true"></span>
      <div class="level-control" id="level-control">
        <button id="level-button" class="level-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="level-list" title="Level: how many blocks and tools the palette shows"><span class="level-icon" aria-hidden="true"></span><span id="level-name" class="level-name"></span></button>
        <select id="level-select" class="level-native" aria-hidden="true" tabindex="-1">${LEVELS.map(level => `<option value="${level}">${levelNames[level]}</option>`).join('')}</select>
        <ul id="level-list" class="level-list" role="listbox" aria-label="Level" tabindex="-1" hidden>${LEVELS.map(level => `<li id="level-option-${level}" role="option" data-level="${level}" aria-selected="false"><span class="level-icon" aria-hidden="true"></span><span class="level-text"><strong>${levelNames[level]}</strong><small>${levelDescriptions[level]}</small></span></li>`).join('')}</ul>
      </div>
      <button id="examples-open" class="button secondary" title="Examples to play and remix">Examples</button><button id="lessons-open" class="button secondary" title="Step-by-step lessons">Lessons</button><button id="academy-open" class="button secondary" title="Academy: learn one idea at a time">Academy</button>
      <div id="account-slot" class="account-slot" hidden></div>
      <div class="menu-wrap"><button id="menu-button" class="button secondary ui-icon-only" aria-haspopup="true" aria-expanded="false" aria-controls="app-menu" title="More actions">More actions</button>
        <div id="app-menu" class="app-menu" hidden>
          <div class="menu-group" role="group" aria-label="Project"><button id="save" class="button secondary" title="Save to My projects in your account" hidden>Save project</button><button id="open" class="button secondary" title="Open a project from My projects" hidden>Open project</button><button id="import-project" class="button secondary" title="Open a project file from this computer">Import project</button><input id="project-file" type="file" accept=".json,application/json" hidden><button id="export-project" class="button secondary" title="Download this project as a file">Export project</button><button id="export" class="button secondary">Export Python</button><button id="export-playable" class="button secondary level-builder">Export playable</button><button id="example" class="button secondary">Reset example</button><button id="menu-examples" class="button secondary">Examples…</button><button id="menu-lessons" class="button secondary">Lessons…</button><button id="menu-academy" class="button secondary">Academy…</button></div>
          <div class="menu-group level-builder" id="menu-tools" role="group" aria-label="Tools"></div>
          <div class="menu-group level-builder" role="group" aria-label="Learning"><button id="menu-pilot" class="button secondary">Learner pilot</button><button id="menu-assist" class="button secondary">AI assist</button></div>
          <a class="design-link" href="https://github.com/juncoflockleader/python-blocks/tree/main/docs" target="_blank" rel="noreferrer">Project notes</a>
        </div>
      </div>
    </header>
    <div class="shell-notices" id="shell-notices"><p id="export-state" class="project-notice" role="status"></p><button id="export-cancel" class="button secondary" hidden>Cancel export</button><button id="recover" class="button secondary" hidden>Download recovery file</button></div>
    <main class="shell-body" id="shell-body">
      <section class="blocks-panel" aria-labelledby="blocks-title"><h2 id="blocks-title" class="visually-hidden">Build with blocks</h2>
        <div id="blockly" aria-label="Visual programming workspace"></div>
        <div class="workspace-tools" id="workspace-tools" aria-label="Workspace tools"><button id="block-search-toggle" class="button secondary ui-icon-only" aria-expanded="false" aria-controls="block-search" title="Find blocks">Find blocks</button><button id="zoom-in" class="button secondary ui-icon-only" title="Zoom in">Zoom in</button><button id="zoom-out" class="button secondary ui-icon-only" title="Zoom out">Zoom out</button><button id="zoom-reset" class="button secondary ui-icon-only" title="Center blocks">Center blocks</button></div>
      </section>
      <section class="python-side" id="python-side" aria-label="Python beside blocks" hidden></section>
      <nav class="stage-rail" id="stage-rail" aria-label="Stage tools"></nav>
      <section class="stage-main" id="stage-main" aria-label="Stage view"></section>
      <aside class="right-column" aria-label="Stage and tools">
        <section class="stage-panel" aria-labelledby="stage-title"><h2 id="stage-title" class="visually-hidden">Stage</h2>
          <div class="stage-wrap"><div class="stage-surface"><canvas id="stage" width="480" height="320" aria-label="Drawing stage">Your drawing appears here.</canvas><div id="game-overlay"></div></div>
            <span id="status" role="status" aria-live="polite">Ready</span><button id="stage-badge" class="stage-badge" hidden></button>
          </div>
          <div class="stage-toolbar" id="stage-toolbar" aria-label="Stage tools"><div class="audio-controls" id="audio-controls"></div><span class="top-spacer"></span></div>
        </section>
        <div class="sprite-tray" id="sprite-tray" aria-label="Sprites"></div>
        <div class="tab-bar" role="tablist" aria-label="Editor panels">${TABS.map((tab, index) => `<button role="tab" id="tab-${tab}" class="tab" aria-controls="panel-${tab}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${tabLabels[tab]}<span class="tab-dot" hidden></span></button>`).join('')}</div>
        <div class="tab-panels">
          <section role="tabpanel" id="panel-sprite" class="tab-panel scene-editor" aria-labelledby="tab-sprite"></section>
          <section role="tabpanel" id="panel-python" class="tab-panel" aria-labelledby="tab-python" hidden><div class="python-tab-tools"><span>program.py · follows the selected block</span><button id="python-side-toggle" class="button secondary" aria-pressed="false">Side by side</button></div><div id="python-home"><section class="python-panel" aria-label="Python"></section></div><p id="python-side-note" class="tab-note" hidden>Python is shown beside the blocks. Use Side by side again to bring it back here.</p></section>
          <section role="tabpanel" id="panel-output" class="tab-panel" aria-labelledby="tab-output" hidden>
            <p id="output-empty" class="tab-note">Run your program. Printed text and error messages appear here.</p>
            <section id="diagnostics-panel" class="diagnostics-panel" hidden aria-label="Program diagnostics"><ul id="diagnostics"></ul></section>
            <div id="debug-slot"></div>
            <section id="output-panel" class="output-panel" hidden aria-labelledby="output-title"><h2 id="output-title">Program output</h2><pre id="output" aria-live="polite"></pre><details id="error-details" hidden><summary>Python error details</summary><pre id="traceback"></pre></details></section>
            <div id="watch-slot"></div>
            <form id="event-input" class="event-input" hidden aria-label="Send a test event"><h2>Send a test event</h2><p>Run the project, then send input to its handlers.</p><label>Event name <input id="event-name" value="message" spellcheck="false" autocapitalize="off" autocorrect="off"></label><label>Payload (JSON) <textarea id="event-payload" rows="2" maxlength="32768" spellcheck="false" autocapitalize="off" autocorrect="off">null</textarea></label><button id="event-send" class="button secondary" disabled>Send event</button><p id="event-input-status" role="status"></p></form>
          </section>
          <section role="tabpanel" id="panel-help" class="tab-panel" aria-labelledby="tab-help" hidden>
            <div id="nudge-slot"></div><div id="fix-active-slot"></div><div id="guide-active-slot"></div>
            <div class="help-nav" role="group" aria-label="Help sections">${HELP_SECTIONS.map((section, index) => `<button type="button" id="help-nav-${section}" class="help-nav-button" aria-pressed="${index === 0}" aria-controls="help-${section}">${helpLabels[section]}</button>`).join('')}</div>
            <section id="help-ideas" class="help-section" data-section="ideas" aria-label="Ideas"><div id="ideas-slot"></div></section>
            <section id="help-builds" class="help-section" data-section="builds" aria-label="Guided builds" hidden><div id="guide-slot"></div></section>
            <section id="help-more" class="help-section" data-section="more" aria-label="More help" hidden>
              <h2 class="help-heading">Getting started</h2>
              <ul class="help-tips"><li>Drag a block from the palette on the left into the workspace. Blocks snap together.</li><li>Press <strong>Run code</strong> to start. Printed text and errors appear in the <strong>Output</strong> tab.</li><li class="keyboard-only">Click the stage first, then use the keys your project listens for.</li><li class="touch-only">Use the controller button under the stage to press keys on a tablet.</li><li>Find a block by name with the magnifier in the corner of the workspace.</li></ul>
              <div id="help-slot"></div>
            </section>
          </section>
        </div>
      </aside>
    </main>
    <section class="phone-message" aria-labelledby="phone-title"><h2 id="phone-title">Turn your tablet sideways</h2><p>Editing needs a larger screen. You can still play this project.</p><button id="phone-play" class="button primary">Play project</button></section>
  </div>`;

/** The shell fills the window and never scrolls; something that scrolls it anyway (a scrollIntoView or a
 * focus inside a panel) would slide the whole editor up and leave a gap below, so it is put back at once. */
export function keepShellInPlace() {
  const shell = document.getElementById('shell'); if (!shell) return;
  shell.addEventListener('scroll', () => { if (shell.scrollTop || shell.scrollLeft) shell.scrollTo(0, 0); });
}
export function installTabs(onChange: (tab: Tab) => void = () => {}) {
  const tabs = TABS.map(tab => document.getElementById(`tab-${tab}`) as HTMLButtonElement);
  let current: Tab = 'sprite';
  const activate = (next: Tab, focus = false) => {
    current = next;
    for (const [index, tab] of TABS.entries()) {
      const selected = tab === next;
      tabs[index].setAttribute('aria-selected', String(selected)); tabs[index].tabIndex = selected ? 0 : -1;
      document.getElementById(`panel-${tab}`)!.hidden = !selected;
    }
    if (focus) tabs[TABS.indexOf(next)].focus();
    mark(next, false); onChange(next);
  };
  const mark = (tab: Tab, on: boolean) => { tabs[TABS.indexOf(tab)].querySelector<HTMLElement>('.tab-dot')!.hidden = !on; };
  for (const [index, tab] of tabs.entries()) {
    tab.addEventListener('click', () => activate(TABS[index]));
    tab.addEventListener('keydown', event => {
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (delta) { event.preventDefault(); activate(TABS[(index + delta + TABS.length) % TABS.length], true); }
      if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); activate(TABS[event.key === 'Home' ? 0 : TABS.length - 1], true); }
    });
  }
  return { activate, mark, get current() { return current; } };
}

/** The Help tab's sections. Nudges and an active guided-build step stay above them. */
export function installHelpSections() {
  let current: HelpSection = 'ideas';
  const show = (next: HelpSection) => {
    current = next;
    for (const section of HELP_SECTIONS) {
      document.getElementById(`help-nav-${section}`)!.setAttribute('aria-pressed', String(section === next));
      document.getElementById(`help-${section}`)!.hidden = section !== next;
    }
  };
  for (const section of HELP_SECTIONS) document.getElementById(`help-nav-${section}`)!.addEventListener('click', () => show(section));
  return { show, get current() { return current; } };
}

/** A hint at the foot of the palette whenever more categories sit below the fold;
 * tapping it scrolls them into view. Blockly's toolbox scrolls but shows no cue. */
export function installPaletteHint(getToolbox: () => HTMLElement | null) {
  const hint = document.createElement('button');
  hint.type = 'button'; hint.id = 'palette-more'; hint.className = 'palette-more'; hint.hidden = true;
  hint.textContent = 'More'; hint.title = 'More categories'; hint.setAttribute('aria-label', 'Scroll the palette to more categories');
  document.querySelector('.blocks-panel')!.append(hint);
  const panel = document.querySelector<HTMLElement>('.blocks-panel')!;
  const STRIP = 44; // the cue's strip height, as in shell.css
  let toolbox: HTMLElement | null = null, atEnd = false;
  // While the categories overflow, the palette ends above a strip holding the cue
  // (CSS: .palette-overflow), so the cue never covers a category. At the end of
  // the list the cue scrolls back to the top instead of disappearing.
  const refresh = () => {
    // Measure against the palette's full height: the strip itself must not keep the strip.
    const full = toolbox ? toolbox.clientHeight + (panel.classList.contains('palette-overflow') ? STRIP : 0) : 0;
    const overflowing = !!toolbox && toolbox.scrollHeight - full > 4;
    panel.classList.toggle('palette-overflow', overflowing);
    hint.hidden = !overflowing;
    if (!toolbox || !overflowing) return;
    atEnd = toolbox.scrollHeight - toolbox.clientHeight - toolbox.scrollTop <= 4;
    hint.textContent = atEnd ? 'Top' : 'More'; hint.classList.toggle('palette-more-up', atEnd);
    hint.title = atEnd ? 'Back to the first categories' : 'More categories';
    hint.setAttribute('aria-label', atEnd ? 'Scroll the palette back to the top' : 'Scroll the palette to more categories');
    hint.style.left = `${toolbox.offsetLeft}px`; hint.style.width = `${toolbox.offsetWidth}px`;
  };
  const observer = new ResizeObserver(refresh);
  // The palette is sized by Blockly at 100% of the panel; watch the panel and the window as well.
  observer.observe(panel); window.addEventListener('resize', refresh);
  const attach = () => {
    const next = getToolbox();
    if (next !== toolbox) {
      if (toolbox) { toolbox.removeEventListener('scroll', refresh); observer.unobserve(toolbox); }
      toolbox = next;
      if (toolbox) { toolbox.addEventListener('scroll', refresh, { passive: true }); observer.observe(toolbox); }
    }
    refresh();
  };
  hint.addEventListener('click', () => { if (atEnd) toolbox?.scrollTo({ top: 0, behavior: 'smooth' }); else toolbox?.scrollBy({ top: toolbox.clientHeight * 0.8, behavior: 'smooth' }); });
  attach();
  return { refresh: attach, dispose: () => { observer.disconnect(); window.removeEventListener('resize', refresh); hint.remove(); } };
}

/** A disclosure menu: Escape or an outside tap closes it; choosing an item closes it too. */
export function installMenu() {
  const button = document.getElementById('menu-button') as HTMLButtonElement, menu = document.getElementById('app-menu')!;
  const set = (open: boolean, restore = false) => {
    menu.hidden = !open; button.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLElement>('button:not([disabled]):not([hidden]), a')?.focus();
    else if (restore) button.focus();
  };
  button.addEventListener('click', () => set(!!menu.hidden));
  menu.addEventListener('click', event => { if ((event.target as Element).closest('button, a')) set(false); });
  menu.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); set(false, true); } });
  const outside = (event: PointerEvent) => { if (!menu.hidden && !(event.target as Element).closest('.menu-wrap')) set(false); };
  document.addEventListener('pointerdown', outside);
  return { open: () => set(true), close: () => set(false), dispose: () => document.removeEventListener('pointerdown', outside) };
}

export const VIEWS = ['blocks', 'stage'] as const;
export type ShellView = typeof VIEWS[number];
const VIEW_KEY = 'python-blocks.view.v1';
/** Blocks view (code first, small stage) or Stage view (a large stage between a
 * tools rail and the sprite column). Same project and Undo; only the layout
 * changes. The choice is remembered per browser; Stage view needs 900 px. */
export function installViewSwitch(changed: (view: ShellView) => void) {
  const root = document.documentElement, wide = matchMedia('(min-width: 900px)');
  const panel = document.querySelector<HTMLElement>('.stage-panel')!, main = document.getElementById('stage-main')!, column = document.querySelector<HTMLElement>('.right-column')!;
  let wanted: ShellView = 'blocks', current: ShellView | null = null;
  try { if (localStorage.getItem(VIEW_KEY) === 'stage') wanted = 'stage'; } catch { /* Blocks view */ }
  const place = () => {
    const next: ShellView = wanted === 'stage' && wide.matches ? 'stage' : 'blocks';
    for (const view of VIEWS) document.getElementById(`view-${view}`)!.setAttribute('aria-pressed', String(view === next));
    if (next === current) return;
    current = next; root.dataset.view = next;
    // The hidden workspace can be neither focused nor reached by assistive technology.
    document.querySelector<HTMLElement>('.blocks-panel')!.inert = next === 'stage';
    // The stage keeps its element (and canvas) as it moves; only its place in the layout changes.
    if (next === 'stage') main.append(panel); else column.prepend(panel);
    changed(next);
  };
  const show = (view: ShellView) => {
    wanted = view;
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* this tab still switches */ }
    place();
  };
  for (const view of VIEWS) document.getElementById(`view-${view}`)!.addEventListener('click', () => show(view));
  wide.addEventListener('change', place); place();
  return { show, get current() { return current ?? 'blocks'; }, dispose: () => wide.removeEventListener('change', place) };
}

/** Python lives in its tab; on wide screens it can sit beside the workspace. */
export function installPythonPlacement(resize: () => void) {
  const toggle = document.getElementById('python-side-toggle') as HTMLButtonElement, side = document.getElementById('python-side')!;
  const home = document.getElementById('python-home')!, panel = home.querySelector<HTMLElement>('.python-panel')!, note = document.getElementById('python-side-note')!;
  // 1080 px is the narrowest iPad in landscape, so every tablet can read Python beside its blocks.
  const wide = matchMedia('(min-width: 1080px)');
  let wanted = false;
  const place = () => {
    // Stage view has no workspace to sit beside, so Python goes back to its tab.
    const blocks = document.documentElement.dataset.view !== 'stage', beside = wanted && wide.matches && blocks;
    (beside ? side : home).append(panel); side.hidden = !beside; note.hidden = !beside;
    document.getElementById('shell')!.toggleAttribute('data-python-side', beside);
    toggle.setAttribute('aria-pressed', String(beside)); toggle.disabled = !wide.matches || !blocks;
    toggle.title = !blocks ? 'Side by side shows Python beside the blocks, in Blocks view.' : wide.matches ? '' : 'Side by side needs a window at least 1080 pixels wide.';
    resize();
  };
  toggle.addEventListener('click', () => { wanted = !(wanted && wide.matches); place(); });
  wide.addEventListener('change', place); place();
  return { refresh: place, dispose: () => wide.removeEventListener('change', place) };
}

/** Level control, persisted per browser, plus the one-time prompt shown when a
 * loaded project uses tools above the current level. */
export function installLevelControl(apply: (level: Level) => void) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="level-dialog" aria-labelledby="level-title"><h2 id="level-title">Show more tools?</h2><p id="level-reason"></p><p>Your blocks stay on the workspace either way. You can change the level any time from the top bar.</p><div class="dialog-actions"><button id="level-switch" class="button primary"></button><button id="level-keep" class="button secondary"></button></div></dialog>`);
  const select = document.getElementById('level-select') as HTMLSelectElement, dialog = document.getElementById('level-dialog') as HTMLDialogElement;
  const button = document.getElementById('level-button') as HTMLButtonElement, list = document.getElementById('level-list')!, control = document.getElementById('level-control')!;
  const options = [...list.querySelectorAll<HTMLElement>('[role=option]')];
  for (const node of [button.querySelector<HTMLElement>('.level-icon')!, ...options.map(option => option.querySelector<HTMLElement>('.level-icon')!)]) node.dataset.uiIcon = '';
  const paint = (node: HTMLElement, value: Level) => node.style.setProperty('--ui-icon', `url("data:image/svg+xml,${encodeURIComponent(iconSvg(levelIcons[value]))}")`);
  options.forEach(option => paint(option.querySelector<HTMLElement>('.level-icon')!, option.dataset.level as Level));
  let level = storedLevel(), offered: Level | null = null, active = 0;
  const set = (next: Level, persist = true) => {
    level = next; select.value = next; document.documentElement.dataset.level = next;
    control.dataset.level = next; paint(button.querySelector<HTMLElement>('.level-icon')!, next);
    document.getElementById('level-name')!.textContent = levelNames[next];
    button.setAttribute('aria-label', `Level: ${levelNames[next]}`);
    for (const option of options) option.setAttribute('aria-selected', String(option.dataset.level === next));
    if (persist) storeLevel(next);
    apply(next);
  };
  select.addEventListener('change', () => set(select.value as Level));
  // The level menu: a button and a listbox of the three levels, each with its symbol and what it adds.
  const highlight = (index: number) => {
    active = (index + options.length) % options.length;
    options.forEach((option, i) => option.classList.toggle('level-active', i === active));
    list.setAttribute('aria-activedescendant', options[active].id);
  };
  const open = (show: boolean, restore = false) => {
    list.hidden = !show; button.setAttribute('aria-expanded', String(show));
    if (show) { highlight(LEVELS.indexOf(level)); list.focus(); } else if (restore) button.focus();
  };
  const choose = (index: number) => { const next = options[index].dataset.level as Level; open(false, true); if (next !== level) set(next); };
  button.addEventListener('click', () => open(!!list.hidden));
  button.addEventListener('keydown', event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open(true); } });
  options.forEach((option, index) => {
    option.addEventListener('click', () => choose(index));
    option.addEventListener('pointermove', () => highlight(index));
  });
  list.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); highlight(active + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); highlight(active - 1); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); highlight(event.key === 'Home' ? 0 : options.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); open(false, event.key === 'Escape'); }
  });
  const outside = (event: PointerEvent) => { if (!list.hidden && !control.contains(event.target as Node)) open(false); };
  document.addEventListener('pointerdown', outside);
  document.getElementById('level-switch')!.addEventListener('click', () => { if (offered) set(offered); dialog.close(); });
  document.getElementById('level-keep')!.addEventListener('click', () => { storeLevel(level); dialog.close(); });
  set(level, false);
  const join = (names: string[]) => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return {
    get level() { return level; },
    set,
    /** Offer the level a project needs, once per loaded project. */
    offer(need: LevelNeed) {
      if (atLeast(level, need.level)) return false;
      offered = need.level;
      const names = need.uses.filter(use => !atLeast(level, use.level)).map(use => use.name);
      document.getElementById('level-reason')!.textContent = `This project uses ${join(names)}, which the ${levelNames[need.level]} level shows in the palette and menus.`;
      document.getElementById('level-switch')!.textContent = `Switch to ${levelNames[need.level]}`;
      document.getElementById('level-keep')!.textContent = `Keep ${levelNames[level]}`;
      if (!dialog.open) dialog.showModal();
      return true;
    },
    dispose() { dialog.remove(); document.removeEventListener('pointerdown', outside); },
  };
}

/** True once a physical keyboard is likely: no touch points, or a key was typed. */
export function trackKeyboard(root: HTMLElement) {
  const set = (on: boolean) => root.toggleAttribute('data-keyboard', on);
  set(navigator.maxTouchPoints === 0);
  const seen = (event: KeyboardEvent) => { if (event.key.length === 1 || event.key.startsWith('Arrow') || event.key === 'Tab') set(true); };
  window.addEventListener('keydown', seen, { capture: true });
  return () => window.removeEventListener('keydown', seen, { capture: true });
}

/** Tablet keyboards: numeric fields get the decimal keypad and identifier-like
 * fields skip autocorrect. Applies to dialogs and panels as they are added. */
export function installInputHints(root: HTMLElement = document.body) {
  const names = /(^|-)(name|alias|kind|event|payload|key|filter|answer|message)$/;
  const apply = (scope: ParentNode) => {
    for (const input of scope.querySelectorAll<HTMLInputElement>('input[type=number]:not([inputmode])')) input.inputMode = 'decimal';
    for (const input of scope.querySelectorAll<HTMLInputElement>('input:not([type]), input[type=text], input[type=search]')) {
      if (!names.test(input.id) || input.hasAttribute('autocorrect')) continue;
      input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off'); input.spellcheck = false;
    }
  };
  apply(root);
  const observer = new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) apply(node); });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
