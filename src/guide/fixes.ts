import * as Blockly from 'blockly/core';
import type { Diagnostic } from '../language/compiler';
import { handlerState } from '../language/hats';
import { backdrops, costumes } from '../scene/model';
import { sceneState } from '../scene/state';
import type { Level } from '../ui/levels';
import { recipeById, type Recipe } from './recipes';
import type { FixKind } from './nudges';

/** Fix flows: what a block's warning ("!") means in learner words, the steps
 * that clear it, and a one-tap action where the fix is deterministic. At the
 * Starter and Builder levels, tapping the warning shows a non-modal popover
 * that offers the flow; the flow itself runs in the Help tab, re-evaluated
 * after every edit until the warning is gone. Nothing changes without a tap. */
export interface FixAction { label: string; run(): void }
export interface FixStep { text: string; highlight?: { category?: string; element?: string }; action?: FixAction }
export interface FixFlow { code: string; title: string; why: string; steps: FixStep[]; recipe?: Recipe }
export interface RuntimeFault { message: string; kind: FixKind | null }
/** Editor tools a flow's actions can open; the editor supplies them. */
export interface FixTools {
  openLibrary(kind: 'costume' | 'backdrop' | 'world'): void;
  openSounds(): void;
  makeVariable(): void;
  openHandlers(): void;
  showOutput(): void;
  showRecipe(recipe: Recipe): void;
}

const runtimeRecipes: Record<FixKind, string> = { loop: 'fix-loop-never-ends', name: 'fix-name-not-set', keys: 'fix-not-moving' };
const grouped = (fn: () => void) => { const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true); try { fn(); } finally { Blockly.Events.setGroup(group); } };
const removeBlock = (block: Blockly.Block): FixAction => ({ label: 'Remove this block', run: () => grouped(() => block.dispose(true)) });
const setField = (block: Blockly.Block, field: string, value: string, label: string): FixAction => ({ label, run: () => grouped(() => block.setFieldValue(value, field)) });

/** A fresh "when game starts" script placed where `near` is. */
function startScript(workspace: Blockly.Workspace, near?: Blockly.Block) {
  const handler = Blockly.serialization.blocks.append(handlerState(workspace, { kind: 'start' }), workspace, { recordUndo: true });
  if (near) { const at = near.getRelativeToSurfaceXY(), from = handler.getRelativeToSurfaceXY(); handler.moveBy(at.x - from.x, at.y - from.y); }
  return handler;
}
/** Append a stack to the end of a script's body. */
function attach(script: Blockly.Block, first: Blockly.Block) {
  const body = script.getInput('BODY')!.connection!;
  let last = body.targetBlock();
  if (!last) { body.connect(first.previousConnection!); return; }
  while (last.getNextBlock()) last = last.getNextBlock()!;
  last.nextConnection!.connect(first.previousConnection!);
}
function fillInput(workspace: Blockly.Workspace, block: Blockly.Block, name: string, kind: 'number' | 'text' | 'boolean') {
  grouped(() => {
    const input = block.getInput(name); if (!input?.connection) return;
    const state = kind === 'text' ? { type: 'text', fields: { TEXT: '' } } : kind === 'boolean' ? { type: 'logic_boolean', fields: { BOOL: 'TRUE' } } : { type: 'py_number', fields: { VALUE: '0' } };
    input.connection.connect(Blockly.serialization.blocks.append(state, workspace, { recordUndo: true }).outputConnection!);
  });
}
/** Move Program's actions into a new start script and drop the empty Program. */
export function programToStart(workspace: Blockly.Workspace) {
  const program = workspace.getTopBlocks(true).find(b => b.type === 'py_program'); if (!program) return;
  grouped(() => {
    const script = startScript(workspace, program), first = program.getInput('BODY')?.connection?.targetBlock();
    if (first) { first.previousConnection!.disconnect(); attach(script, first); }
    program.dispose(false);
  });
}
function mergePrograms(workspace: Blockly.Workspace, extra: Blockly.Block) {
  const keep = workspace.getTopBlocks(true).find(b => b.type === 'py_program' && b !== extra); if (!keep) return;
  grouped(() => {
    const first = extra.getInput('BODY')?.connection?.targetBlock();
    if (first) { first.previousConnection!.disconnect(); attach(keep, first); }
    extra.dispose(false);
  });
}
const inputLabel = (block: Blockly.Block, diagnostic: Diagnostic) => {
  const match = /parameter “([^”]+)”/.exec(diagnostic.message);
  if (match) return `the “${match[1]}” slot`;
  const input = diagnostic.input ? block.getInput(diagnostic.input) : null;
  const label = input?.fieldRow.map(f => f.getText()).join(' ').trim();
  return label ? `the slot after “${label}”` : 'the empty slot';
};

/** The flow for one block's warning. Steps are computed from the current
 * project, so calling again after an edit can offer the next step. */
export function fixFor(workspace: Blockly.Workspace, block: Blockly.Block, diagnostic: Diagnostic | null, runtime: RuntimeFault | null, tools: FixTools): FixFlow {
  const scene = sceneState(workspace);
  const code = diagnostic?.code ?? (runtime ? 'runtime' : 'unknown');
  const flow = (title: string, why: string, steps: FixStep[], recipe?: Recipe): FixFlow => ({ code, title, why, steps, recipe });
  if (code === 'runtime' && runtime) {
    const recipe = runtime.kind ? recipeById(runtimeRecipes[runtime.kind]) : undefined;
    return flow('Python stopped at this block', runtime.message, [recipe
      ? { text: `There is an idea for exactly this: “${recipe.title}”.`, action: { label: 'Show the fix idea', run: () => tools.showRecipe(recipe) } }
      : { text: 'Read the message in Output, change this block, then run again.', action: { label: 'Show the error', run: tools.showOutput } }], recipe);
  }
  switch (code) {
    case 'missing-input': {
      const check = diagnostic?.input ? block.getInput(diagnostic.input)?.connection?.getCheck() ?? null : null;
      // Untyped slots named like text (say, print, ask) get text; everything else a number.
      const kind = check?.includes('String') || (!check && /TEXT|MESSAGE|NAME|LABEL|QUESTION/.test(diagnostic?.input ?? '')) ? 'text' : check?.includes('Boolean') ? 'boolean' : 'number';
      const noun = kind === 'text' ? 'text' : kind === 'boolean' ? 'true/false' : 'number';
      const label = inputLabel(block, diagnostic!);
      return flow('This slot needs a value', `${label[0].toUpperCase()}${label.slice(1)} is empty, so Python has nothing to use there. Often a block fell out of it.`, [{
        text: `Drop a ${noun} block into ${inputLabel(block, diagnostic!)}, or let me fill it in.`,
        highlight: { category: kind === 'text' ? 'text' : kind === 'boolean' ? 'logic' : 'numbers' },
        action: diagnostic?.input ? { label: kind === 'text' ? 'Put empty text here' : kind === 'boolean' ? 'Put “true” here' : 'Put a 0 here', run: () => fillInput(workspace, block, diagnostic.input!, kind) } : undefined,
      }]);
    }
    case 'missing-sprite': {
      const first = scene.sprites[0];
      if (block.type === 'scene_sprite') return flow('This sprite is gone', 'The block points at a sprite that was deleted. Pick a sprite that exists, or add one.', first
        ? [{ text: 'Pick a sprite from this block’s menu.', action: setField(block, 'SPRITE_ID', first.id, `Use ${first.name} here`) }]
        : [{ text: 'Add a sprite first, then choose it in this block’s menu.', highlight: { element: '#scene-stock' }, action: { label: 'Open the Sprite library', run: () => tools.openLibrary('costume') } }]);
      return flow('This script is for a sprite that is gone', 'The script was attached to a sprite that was deleted.', [
        first ? { text: 'Choose a sprite for this script in Event handlers (Runs for).', action: { label: 'Open Event handlers', run: tools.openHandlers } }
          : { text: 'Add a sprite first, then choose it for this script in Event handlers.', highlight: { element: '#scene-stock' }, action: { label: 'Open the Sprite library', run: () => tools.openLibrary('costume') } },
      ]);
    }
    case 'missing-costume': {
      const first = costumes(scene)[0];
      return flow('This costume is gone', 'The block points at a costume that was deleted. Pick one that exists, or paint a new one in Artwork & frames.', [{ text: 'Pick a costume from this block’s menu.', action: setField(block, 'COSTUME_ID', first.id, `Use ${first.name} here`) }]);
    }
    case 'missing-backdrop': {
      const first = backdrops(scene)[0];
      return flow('This backdrop is gone', 'The block points at a backdrop that was deleted. Pick one that exists, or add one from the Backdrop library.', [{ text: 'Pick a backdrop from this block’s menu.', highlight: { element: '#scene-stock-backdrop' }, action: setField(block, 'BACKDROP_ID', first.id, `Use ${first.name} here`) }]);
    }
    case 'missing-sound': {
      const first = scene.sounds?.[0];
      return flow('This sound is gone', 'The block points at a sound that was deleted.', first
        ? [{ text: 'Pick a sound from this block’s menu.', action: setField(block, 'SOUND_ID', first.id, `Use ${first.name} here`) }]
        : [{ text: 'Add a sound first (New tone, Import or Record), then pick it in this block’s menu.', highlight: { element: '#sound-open' }, action: { label: 'Open Sounds & music', run: tools.openSounds } }]);
    }
    case 'missing-world': {
      const first = scene.worlds?.[0];
      return flow('This world is gone', 'The block points at a world that was deleted.', first
        ? [{ text: 'Pick a world from this block’s menu.', action: setField(block, 'WORLD_ID', first.id, `Use ${first.name} here`) }]
        : [{ text: 'Add a world first, then pick it in this block’s menu.', highlight: { element: '#scene-worlds' }, action: { label: 'Open the World library', run: () => tools.openLibrary('world') } }]);
    }
    case 'inactive-draft':
      return flow('This block is not in a script', 'Blocks only run inside Program or under an event hat. This one is floating on its own.', [{
        text: 'Drag it under a hat such as “when game starts”, or into Program.',
        highlight: { category: 'events' },
        action: block.previousConnection ? { label: 'Put it under “when game starts”', run: () => grouped(() => attach(startScript(workspace, block), block)) } : undefined,
      }]);
    case 'event-context': case 'wait-context': {
      const program = workspace.getTopBlocks(true).find(b => b.type === 'py_program');
      const inProgram = !!program && block.getRootBlock() === program;
      return flow('This needs an event script', 'Keys, timers, waits and glides only work inside a script that starts with an event hat, not inside Program.', [inProgram
        ? { text: 'Move the blocks from Program into a “when game starts” script.', highlight: { category: 'events' }, action: { label: 'Move Program into “when game starts”', run: () => programToStart(workspace) } }
        : { text: 'Move this block into a script that starts with an event hat, or mark its function async in Manage functions.', highlight: { category: 'events' } }]);
    }
    case 'unresolved-symbol':
      return flow('This variable is gone', 'The block uses a variable that was deleted. Pick another from its menu, or make a new one and then pick it.', [{ text: 'Pick a variable from this block’s menu, or make one.', highlight: { category: 'variables' }, action: { label: 'Make a variable', run: tools.makeVariable } }]);
    case 'unresolved-call': case 'unresolved-module-call':
      return flow('This call has nothing to run', 'The function it called is gone. Undo if that was an accident, or remove the call.', [{ text: 'Undo the deletion, or remove this block.', highlight: { category: 'functions' }, action: removeBlock(block) }]);
    case 'flow-outside-loop':
      return flow('Break and continue belong inside a loop', 'Python only knows which loop to leave when the block sits inside a repeat or forever loop.', [{ text: 'Drag it inside a loop, or remove it.', highlight: { category: 'control' }, action: removeBlock(block) }]);
    case 'return-outside-function':
      return flow('Return belongs inside a function', 'A return hands a value back to whoever called a function, so it needs to be inside one.', [{ text: 'Drag it inside a function definition, or remove it.', highlight: { category: 'functions' }, action: removeBlock(block) }]);
    case 'multiple-programs':
      return flow('Only one Program can run', 'Two Program blocks would both want to start first.', [{ text: 'Move these blocks into the other Program, then delete this one.', action: { label: 'Merge into the other Program', run: () => mergePrograms(workspace, block) } }]);
    case 'nested-program': case 'nested-function':
      return flow('Scripts stay at the top', 'Program, functions and event scripts cannot sit inside other blocks.', [{ text: 'Drag it out into free space.', action: { label: 'Move it out', run: () => grouped(() => { block.unplug(true); block.moveBy(40, 40); }) } }]);
    case 'invalid-number':
      return flow('This is not a number', 'Python numbers look like 12, -3 or 0.5.', [{ text: 'Type a number into this block.', action: setField(block, 'VALUE', '0', 'Set it to 0') }]);
    default:
      return flow('Something here needs a change', diagnostic?.message ?? runtime?.message ?? 'This block has a warning.', [{ text: 'Open the Output tab for the details, or ask for an idea in Help.', action: { label: 'Show the details', run: tools.showOutput } }]);
  }
}

export interface FixHost extends FixTools {
  workspace: Blockly.WorkspaceSvg;
  level(): Level;
  diagnostics(): Diagnostic[];
  runtime(blockId: string): RuntimeFault | null;
  /** Bring the Help tab forward. */
  reveal(): void;
  notify(): void;
}

export function installFixes(host: FixHost) {
  const panel = document.querySelector<HTMLElement>('.blocks-panel')!;
  panel.insertAdjacentHTML('beforeend', `<div id="fix-popover" class="fix-popover" role="dialog" aria-labelledby="fix-popover-title" hidden><h3 id="fix-popover-title"></h3><p id="fix-popover-message"></p>
    <div class="guide-actions"><button id="fix-popover-start" class="button primary">Fix it step by step</button><button id="fix-popover-dismiss" class="button secondary">Not now</button></div></div>`);
  const slot = document.getElementById('fix-active-slot')!;
  slot.innerHTML = `<section id="fix-active" class="fix-active" aria-labelledby="fix-title" hidden><div class="guide-head"><h3 id="fix-title"></h3><span>Fix</span></div><p id="fix-why" class="fix-why"></p><ol id="fix-steps" class="fix-steps"></ol>
    <p id="fix-check" class="guide-check" role="status"></p><div class="guide-actions"><button id="fix-locate" class="button secondary">Show the block</button><button id="fix-stop" class="button secondary">Leave</button></div></section>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const popover = el('fix-popover'), active = el('fix-active');
  let shown: string | null = null, activeId: string | null = null, activeCode: string | null = null, highlighted: Element[] = [];

  const warningIcon = (block: Blockly.Block) => block.getIcons().find(icon => icon.getType().toString() === 'warning');
  const faultFor = (id: string) => {
    const diagnostics = host.diagnostics().filter(d => d.blockId === id);
    return { diagnostic: diagnostics.find(d => d.severity === 'error') ?? diagnostics[0] ?? null, runtime: host.runtime(id) };
  };
  function hide() { popover.hidden = true; shown = null; }
  function show(block: Blockly.BlockSvg) {
    const { diagnostic, runtime } = faultFor(block.id);
    if (!diagnostic && !runtime) return;
    const flow = fixFor(host.workspace, block, diagnostic, runtime, host);
    el('fix-popover-title').textContent = flow.title;
    el('fix-popover-message').textContent = diagnostic?.message ?? runtime?.message ?? '';
    shown = block.id; popover.hidden = false;
    const bounds = panel.getBoundingClientRect(), rect = block.getSvgRoot().getBoundingClientRect();
    const width = popover.offsetWidth, height = popover.offsetHeight;
    let x = rect.right - bounds.left + 10, y = rect.top - bounds.top;
    if (x + width > bounds.width - 8) { x = rect.left - bounds.left; y = rect.bottom - bounds.top + 8; } // no room beside it: below
    x = Math.min(Math.max(8, x), Math.max(8, bounds.width - width - 8)); y = Math.min(Math.max(8, y), Math.max(8, bounds.height - height - 8));
    popover.style.left = `${x}px`; popover.style.top = `${y}px`;
    el('fix-popover-start').focus({ preventScroll: true });
  }
  // The warning icon's tap goes to the popover instead of Blockly's bubble, at the learner levels.
  const onPointerDown = (event: PointerEvent) => {
    if (host.level() === 'pro') return;
    const group = (event.target as Element | null)?.closest?.('.blocklyIconGroup'); if (!group) return;
    const id = group.closest('[data-id]')?.getAttribute('data-id'), block = id ? host.workspace.getBlockById(id) : null;
    const icon = block && warningIcon(block), root = (icon as { svgRoot?: SVGGElement | null } | undefined)?.svgRoot;
    if (!block || !root || !root.contains(group)) return; // another icon, such as a mutator gear
    event.preventDefault(); event.stopPropagation();
    if (shown === block.id && !popover.hidden) hide(); else show(block as Blockly.BlockSvg);
  };
  const injection = host.workspace.getInjectionDiv();
  injection.addEventListener('pointerdown', onPointerDown, true);
  const outside = (event: PointerEvent) => { if (!popover.hidden && !(event.target as Element).closest('#fix-popover')) hide(); };
  document.addEventListener('pointerdown', outside);
  popover.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });
  el('fix-popover-dismiss').addEventListener('click', hide);
  el('fix-popover-start').addEventListener('click', () => { if (shown) begin(shown); hide(); });

  function clearHighlight() {
    for (const node of highlighted) node.classList.remove('guide-target', 'fix-target');
    highlighted = [];
  }
  function begin(id: string) {
    const { diagnostic, runtime } = faultFor(id);
    activeId = id; activeCode = diagnostic?.code ?? (runtime ? 'runtime' : null);
    render(); host.reveal();
  }
  function stop() { activeId = null; activeCode = null; clearHighlight(); active.hidden = true; }
  function render() {
    clearHighlight();
    if (!activeId) { active.hidden = true; return; }
    active.hidden = false;
    const block = host.workspace.getBlockById(activeId);
    const { diagnostic, runtime } = block ? faultFor(activeId) : { diagnostic: null, runtime: null };
    const fault = activeCode === 'runtime' ? runtime : diagnostic && diagnostic.code === activeCode ? diagnostic : null;
    const steps = el('fix-steps'), check = el('fix-check');
    if (!block || !fault) {
      steps.replaceChildren(); el('fix-why').textContent = '';
      check.textContent = block ? 'Fixed! The warning is gone.' : 'That block is gone, so there is nothing left to fix.'; check.classList.add('guide-done');
      el('fix-stop').textContent = 'Done'; el('fix-locate').hidden = true; host.notify();
      return;
    }
    const flow = fixFor(host.workspace, block, activeCode === 'runtime' ? null : diagnostic, activeCode === 'runtime' ? runtime : null, host);
    el('fix-title').textContent = flow.title; el('fix-why').textContent = flow.why;
    check.textContent = 'When the warning clears, this says Fixed.'; check.classList.remove('guide-done');
    el('fix-stop').textContent = 'Leave'; el('fix-locate').hidden = false;
    steps.replaceChildren(...flow.steps.map(step => {
      const item = document.createElement('li'); const text = document.createElement('span'); text.textContent = step.text; item.append(text);
      if (step.action) { const button = document.createElement('button'); button.className = 'button primary fix-action'; button.textContent = step.action.label; button.addEventListener('click', step.action.run); item.append(button); }
      return item;
    }));
    const targets = flow.steps.flatMap(step => [step.highlight?.category && document.getElementById(`category-${step.highlight.category}`), step.highlight?.element && document.querySelector(step.highlight.element)]).filter((n): n is Element => !!n);
    for (const node of targets) node.classList.add('guide-target');
    const svg = (block as Blockly.BlockSvg).getSvgRoot?.(); if (svg) { svg.classList.add('fix-target'); targets.push(svg); }
    highlighted = targets;
  }
  el('fix-stop').addEventListener('click', stop);
  el('fix-locate').addEventListener('click', () => { if (activeId && host.workspace.getBlockById(activeId)) host.workspace.centerOnBlock(activeId); });
  const changed = (event: Blockly.Events.Abstract) => { if (!popover.hidden && (event.type === Blockly.Events.VIEWPORT_CHANGE || event.type === Blockly.Events.BLOCK_MOVE || event.type === Blockly.Events.BLOCK_DELETE)) hide(); };
  host.workspace.addChangeListener(changed);
  return {
    /** Re-evaluate the active flow after the project compiled again. */
    refresh() { if (activeId) render(); },
    get active() { return activeId; },
    dispose() { injection.removeEventListener('pointerdown', onPointerDown, true); document.removeEventListener('pointerdown', outside); host.workspace.removeChangeListener(changed); clearHighlight(); popover.remove(); slot.replaceChildren(); },
  };
}
