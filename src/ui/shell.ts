import { LEVELS, atLeast, levelNames, storeLevel, storedLevel, type Level, type LevelNeed } from './levels';
import './shell.css';

export const TABS = ['sprite', 'python', 'output', 'help'] as const;
export type Tab = typeof TABS[number];
const tabLabels: Record<Tab, string> = { sprite: 'Sprite', python: 'Python', output: 'Output', help: 'Help' };
/** The Help tab is split so ideas, guided builds and the rest never scroll past each other. */
export const HELP_SECTIONS = ['ideas', 'builds', 'more'] as const;
export type HelpSection = typeof HELP_SECTIONS[number];
const helpLabels: Record<HelpSection, string> = { ideas: 'Ideas', builds: 'Builds', more: 'More' };

/** The one-screen shell: a top bar, the blocks panel and a right column with the
 * stage, sprite tray and four tabs. Feature modules mount into the named slots. */
export const shellMarkup = `
  <div class="app-shell" id="shell">
    <header class="top-bar" aria-label="Project">
      <a class="brand-mark" href="./" aria-label="Python Blocks home">pb</a>
      <div class="project-title"><strong id="project-title">My project</strong><span id="save-state" class="project-notice" role="status"></span></div>
      <div class="top-history" id="top-history" aria-label="Edit history"></div>
      <span class="top-spacer"></span>
      <button id="run" class="button primary run-button">Run code</button><button id="stop" class="button secondary" disabled>Stop</button>
      <span class="top-divider" aria-hidden="true"></span>
      <label class="level-control">Level <select id="level-select">${LEVELS.map(level => `<option value="${level}">${levelNames[level]}</option>`).join('')}</select></label>
      <button id="examples-open" class="button secondary">Examples</button>
      <div class="menu-wrap"><button id="menu-button" class="button secondary ui-icon-only" aria-haspopup="true" aria-expanded="false" aria-controls="app-menu" title="More actions">More actions</button>
        <div id="app-menu" class="app-menu" hidden>
          <div class="menu-group" role="group" aria-label="Project file"><button id="save" class="button secondary">Save project</button><button id="open" class="button secondary">Open project</button><input id="project-file" type="file" accept=".json,application/json" hidden><button id="export" class="button secondary">Export Python</button><button id="export-playable" class="button secondary level-builder">Export playable</button><button id="example" class="button secondary">Reset example</button><button id="menu-examples" class="button secondary">Examples…</button></div>
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
  let toolbox: HTMLElement | null = null;
  const refresh = () => {
    if (!toolbox) { hint.hidden = true; return; }
    hint.hidden = toolbox.scrollHeight - toolbox.clientHeight - toolbox.scrollTop <= 4;
    hint.style.left = `${toolbox.offsetLeft + toolbox.offsetWidth / 2}px`;
  };
  const observer = new ResizeObserver(refresh);
  const attach = () => {
    const next = getToolbox();
    if (next !== toolbox) {
      if (toolbox) { toolbox.removeEventListener('scroll', refresh); observer.unobserve(toolbox); }
      toolbox = next;
      if (toolbox) { toolbox.addEventListener('scroll', refresh, { passive: true }); observer.observe(toolbox); }
    }
    refresh();
  };
  hint.addEventListener('click', () => toolbox?.scrollBy({ top: toolbox.clientHeight * 0.8, behavior: 'smooth' }));
  attach();
  return { refresh: attach, dispose: () => { observer.disconnect(); hint.remove(); } };
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

/** Python lives in its tab; on wide screens it can sit beside the workspace. */
export function installPythonPlacement(resize: () => void) {
  const toggle = document.getElementById('python-side-toggle') as HTMLButtonElement, side = document.getElementById('python-side')!;
  const home = document.getElementById('python-home')!, panel = home.querySelector<HTMLElement>('.python-panel')!, note = document.getElementById('python-side-note')!;
  // 1080 px is the narrowest iPad in landscape, so every tablet can read Python beside its blocks.
  const wide = matchMedia('(min-width: 1080px)');
  let wanted = false;
  const place = () => {
    const beside = wanted && wide.matches;
    (beside ? side : home).append(panel); side.hidden = !beside; note.hidden = !beside;
    document.getElementById('shell')!.toggleAttribute('data-python-side', beside);
    toggle.setAttribute('aria-pressed', String(beside)); toggle.disabled = !wide.matches;
    toggle.title = wide.matches ? '' : 'Side by side needs a window at least 1080 pixels wide.';
    resize();
  };
  toggle.addEventListener('click', () => { wanted = !(wanted && wide.matches); place(); });
  wide.addEventListener('change', place); place();
  return { dispose: () => wide.removeEventListener('change', place) };
}

/** Level control, persisted per browser, plus the one-time prompt shown when a
 * loaded project uses tools above the current level. */
export function installLevelControl(apply: (level: Level) => void) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="level-dialog" aria-labelledby="level-title"><h2 id="level-title">Show more tools?</h2><p id="level-reason"></p><p>Your blocks stay on the workspace either way. You can change the level any time from the top bar.</p><div class="dialog-actions"><button id="level-switch" class="button primary"></button><button id="level-keep" class="button secondary"></button></div></dialog>`);
  const select = document.getElementById('level-select') as HTMLSelectElement, dialog = document.getElementById('level-dialog') as HTMLDialogElement;
  let level = storedLevel(), offered: Level | null = null;
  const set = (next: Level, persist = true) => {
    level = next; select.value = next; document.documentElement.dataset.level = next;
    if (persist) storeLevel(next);
    apply(next);
  };
  select.addEventListener('change', () => set(select.value as Level));
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
    dispose() { dialog.remove(); },
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
