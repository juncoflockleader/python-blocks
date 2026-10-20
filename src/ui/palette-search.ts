import * as Blockly from 'blockly/core';
import { categoryItems, palette, type Level } from './levels';
import { keyword, searchTerms } from './block-captions';

/** Pro's search box at the top of the palette: typing shows the matching blocks
 * of every category in the picker, each captioned with its category, its number
 * there and its keyword, ready to drag. Starter and Builder keep the plain palette. */
type Item = Blockly.utils.toolbox.FlyoutItemInfo;
type BlockItem = Blockly.utils.toolbox.BlockInfo;
const LIMIT = 24;
const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();

export function installPaletteSearch(workspace: Blockly.WorkspaceSvg, level: () => Level) {
  const box = document.createElement('div'); box.className = 'palette-search';
  box.innerHTML = '<label class="visually-hidden" for="palette-search">Find a block</label><input id="palette-search" type="search" placeholder="Find a block" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60">';
  const input = box.querySelector('input')!;
  const toolbox = () => workspace.getToolbox() as Blockly.Toolbox | null;
  const mount = () => {
    const div = document.querySelector('.blocklyToolbox');
    if (div && box.parentElement !== div) div.prepend(box);
    box.hidden = level() !== 'pro';
  };
  function results(query: string): Item[] {
    const words = fold(query).split(/\s+/).filter(Boolean);
    // Blocks whose keyword says it come first, then those whose category does, then any other words.
    const found: { rank: number; caption: Item; block: Item }[] = [], seen = new Set<string>();
    for (const spec of palette[level()]) {
      let number = 0;
      const category = fold(spec.name);
      for (const item of categoryItems(workspace, level(), spec.name)) {
        if (item.kind !== 'block') continue;
        number++;
        const block = item as BlockItem, key = JSON.stringify([block.type, block.fields ?? {}, block.extraState ?? {}]);
        if (seen.has(key) || !words.every(word => `${searchTerms(block)} ${category}`.includes(word))) continue;
        seen.add(key);
        const named = fold(keyword(block)), rank = words.every(word => named.includes(word)) ? 0 : words.every(word => `${named} ${category}`.includes(word)) ? 1 : 2;
        found.push({ rank, caption: { kind: 'label', text: `${number}\u2002${spec.name} · ${keyword(block)}`, 'web-class': 'block-caption' } as Item, block: item });
      }
    }
    return found.sort((a, b) => a.rank - b.rank).slice(0, LIMIT).flatMap(match => [match.caption, match.block]);
  }
  function search() {
    const query = input.value.trim(), flyout = toolbox()?.getFlyout();
    if (!flyout) return;
    if (!query) { flyout.hide(); return; }
    toolbox()?.clearSelection();
    const items = results(query);
    flyout.show(items.length ? items : [{ kind: 'label', text: `No blocks match “${query}”` } as Item]);
  }
  input.addEventListener('input', search);
  input.addEventListener('keydown', event => { if (event.key === 'Escape') { input.value = ''; search(); } });
  // Choosing a category leaves the search.
  const selected = (event: Blockly.Events.Abstract) => { if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT && (event as Blockly.Events.ToolboxItemSelect).newItem && input.value) input.value = ''; };
  workspace.addChangeListener(selected);
  mount();
  return {
    /** After the level or the toolbox changes. */
    refresh() { mount(); if (box.hidden && input.value) { input.value = ''; search(); } },
    dispose() { workspace.removeChangeListener(selected); box.remove(); },
  };
}
