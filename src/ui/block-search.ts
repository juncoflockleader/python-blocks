import * as Blockly from 'blockly/core';
type BlockInfo = Blockly.utils.toolbox.BlockInfo;
type ButtonInfo = Blockly.utils.toolbox.ButtonInfo;
type ToolboxInfo = Blockly.utils.toolbox.ToolboxInfo;
import './block-search.css';
import { insertHat, isHatState, templateOf } from '../language/hats';
import { keyword } from './block-captions';

export interface SearchEntry {
  category: string;
  label: string;
  description: string;
  terms: string;
  /** The block's short name, as its palette caption shows it ("a sprite"). */
  keyword?: string;
  block?: BlockInfo;
  action?: ButtonInfo;
  id?: string;
}
const normalize = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/_/g, ' ');
/** The blocks whose words include every word of the query, the best first: the block named just that
 * ("sprite" finds the plain sprite block before the many blocks that take a sprite), then blocks whose
 * name has the words, then whose text has them, then the rest, each in palette order. */
export function matchingBlocks(entries: SearchEntry[], query: string) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = (text: string) => words.every(word => text.includes(word));
  const rank = (entry: SearchEntry) => {
    const name = normalize(entry.keyword ?? '').replace(/^(a|an|the) /, '');
    return name && name === words.join(' ') ? 0 : name && all(name) ? 1 : all(normalize(entry.label)) ? 2 : 3;
  };
  return entries.filter(entry => all(normalize(entry.terms)))
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(match => match.entry);
}

function describe(block: Blockly.Block) {
  const label = block.toString(180);
  const description = block.getTooltip();
  const options: string[] = [];
  for (const input of block.inputList) for (const field of input.fieldRow) {
    if (field instanceof Blockly.FieldDropdown) for (const [text] of field.getOptions(false)) {
      if (typeof text === 'string') options.push(text);
    }
  }
  return { label, description, terms: `${label} ${description} ${options.join(' ')} ${block.type}` };
}

/** Index the same definitions and dynamic callbacks used by the real toolbox.
 * A disposable headless flyout resolves project references without editing it. */
export function blockCatalog(workspace: Blockly.WorkspaceSvg, toolbox: ToolboxInfo): SearchEntry[] {
  const preview = new Blockly.Workspace();
  (preview as Blockly.WorkspaceSvg).targetWorkspace = workspace;
  const entries: SearchEntry[] = [];
  Blockly.Events.disable();
  try {
    for (const category of toolbox.contents) {
      if (category.kind !== 'category' || !('name' in category)) continue;
      const name = String(category.name);
      const contents = 'custom' in category
        ? workspace.getToolboxCategoryCallback(String(category.custom))?.(workspace)
        : 'contents' in category ? category.contents : [];
      if (!Array.isArray(contents)) continue;
      for (const item of contents) {
        if (!('kind' in item)) continue;
        if (item.kind === 'button') {
          const action = item as ButtonInfo;
          entries.push({ category: name, label: action.text, description: `Open ${name.toLowerCase()} tools`, terms: `${name} ${action.text}`, action });
        } else if (item.kind === 'block' && 'type' in item && item.type) {
          const definition = structuredClone(item) as BlockInfo;
          const block = Blockly.serialization.blocks.append(definition as Blockly.serialization.blocks.State, preview);
          const text = describe(block);
          entries.push({ ...text, terms: `${name} ${text.terms}`, keyword: keyword(definition), category: name, block: definition });
          block.dispose(false);
        }
      }
    }
  } finally { preview.dispose(); Blockly.Events.enable(); }
  return entries;
}

/** The search lives behind a button in the workspace corner and indexes the
 * palette of the current level, so it never offers a hidden block. */
/** Idea cards (reviewed recipes) shown above matching blocks in the Ideas scope. */
export interface IdeaSource { match(query: string): HTMLElement[]; preferred(): boolean }
export function installBlockSearch(workspace: Blockly.WorkspaceSvg, toolbox: () => ToolboxInfo, ideas?: IdeaSource) {
  const section = document.createElement('section');
  section.className = 'block-search'; section.id = 'block-search'; section.hidden = true; section.setAttribute('aria-label', 'Block search');
  section.innerHTML = `<div class="block-search-controls"><label for="block-search-input">Find blocks</label><input id="block-search-input" type="search" placeholder="Try move, repeat, or sound" maxlength="100" autocomplete="off" aria-controls="block-search-results"><label class="block-search-scope">Look in <select id="block-search-scope">${ideas ? '<option value="ideas">Ideas and blocks</option>' : ''}<option value="library">Block library</option><option value="project">This project</option></select></label><button id="block-search-clear" class="button secondary" type="button">Clear search</button></div><p id="block-search-status" role="status"></p><ul id="block-search-results" aria-label="Matching blocks" hidden></ul>`;
  document.querySelector('.blocks-panel')!.append(section);
  const toggle = document.querySelector<HTMLButtonElement>('#block-search-toggle')!;
  const show = (open: boolean) => {
    section.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (open && !input.value && ideas) scope.value = ideas.preferred() ? 'ideas' : 'library';
    if (open) { input.focus(); input.select(); } else toggle.focus();
  };
  toggle.addEventListener('click', () => show(!!section.hidden));
  const input = section.querySelector<HTMLInputElement>('input')!;
  const scope = section.querySelector<HTMLSelectElement>('select')!;
  const results = section.querySelector<HTMLUListElement>('ul')!;
  const status = section.querySelector<HTMLParagraphElement>('p')!;
  let catalog: SearchEntry[] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const add = (entry: SearchEntry) => {
    if (entry.id) {
      const block = workspace.getBlockById(entry.id);
      if (block) { block.select(); workspace.centerOnBlock(block.id); workspace.highlightBlock(block.id); }
    } else if (entry.action) {
      // Use Blockly's button callback, preserving the existing editor workflow.
      const flyout = workspace.getFlyout();
      if (flyout) {
        flyout.show([entry.action]);
        const button = flyout.getContents().find(item => item.getType() === 'button')?.getElement();
        if (button) workspace.getButtonCallback(entry.action.callbackkey)?.(button as Blockly.FlyoutButton);
        flyout.hide();
      }
    } else if (entry.block) {
      Blockly.Events.setGroup(true);
      try {
        const state = structuredClone(entry.block) as Blockly.serialization.blocks.State;
        const block = (isHatState(state) ? insertHat(workspace, templateOf(state)) : Blockly.serialization.blocks.append(state, workspace, { recordUndo: true })) as Blockly.BlockSvg;
        const metrics = workspace.getMetrics();
        block.moveBy((metrics.viewLeft + metrics.viewWidth / 3) / workspace.scale, (metrics.viewTop + 40) / workspace.scale);
        block.select(); workspace.centerOnBlock(block.id);
        status.textContent = `Added ${entry.label}. Connect it to your program. Undo removes it.`;
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      finally { Blockly.Events.setGroup(false); }
    }
  };
  const render = () => {
    clearTimeout(timer);
    results.replaceChildren(); results.hidden = !input.value.trim();
    if (results.hidden) { status.textContent = ''; return; }
    const cards = scope.value === 'ideas' && ideas ? ideas.match(input.value) : [];
    for (const card of cards) { const li = document.createElement('li'); li.className = 'block-search-idea'; li.append(card); results.append(li); }
    const entries = scope.value !== 'project'
      ? catalog ??= blockCatalog(workspace, toolbox())
      : workspace.getAllBlocks(false).filter(b => !b.isShadow()).map(block => ({ ...describe(block), category: 'In this project', id: block.id }));
    const matches = matchingBlocks(entries, input.value);
    const ideasText = cards.length ? `${cards.length === 1 ? 'One idea' : `${cards.length} ideas`} and ` : '';
    status.textContent = matches.length || cards.length ? `${ideasText}${matches.length} matching blocks${matches.length > 60 ? ' · showing the first 60; add words to narrow your search' : ''}. ${scope.value === 'project' ? 'Choose a block to find it.' : 'Choose a block to add it.'}` : 'No matching blocks. Try another word or change where you look.';
    for (const entry of matches.slice(0, 60)) {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'block-search-result';
      button.setAttribute('aria-label', `${entry.id ? 'Find' : entry.action ? 'Open' : 'Add'} ${entry.label} (${entry.category})`);
      const category = document.createElement('small'), label = document.createElement('strong'), description = document.createElement('span');
      category.textContent = entry.category; label.textContent = entry.label; description.textContent = entry.description;
      button.append(category, label, description); button.addEventListener('click', () => add(entry)); li.append(button); results.append(li);
    }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(render, 120); });
  scope.addEventListener('change', render);
  const clear = () => { if (!input.value) { show(false); return; } input.value = ''; render(); input.focus(); };
  section.querySelector('button')!.addEventListener('click', clear);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); clear(); }
    if (event.key === 'ArrowDown' || event.key === 'Enter') { event.preventDefault(); render(); results.querySelector('button')?.focus(); }
  });
  results.addEventListener('keydown', event => {
    const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); input.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus(); }
  });
  const invalidate = () => { catalog = undefined; if (input.value.trim()) { clearTimeout(timer); timer = setTimeout(render, 150); } };
  const changed = (event: Blockly.Events.Abstract) => { if (!event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) invalidate(); };
  const selectionChanged = () => { catalog = undefined; if (input.value.trim()) render(); };
  workspace.addChangeListener(changed);
  document.querySelector('#scene-selection')?.addEventListener('sprite-selection-changed', selectionChanged);
  return {
    refresh: invalidate,
    dispose() { clearTimeout(timer); workspace.removeChangeListener(changed); document.querySelector('#scene-selection')?.removeEventListener('sprite-selection-changed', selectionChanged); section.remove(); },
  };
}
