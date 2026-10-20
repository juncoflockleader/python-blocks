import { iconMarkup, type IconName } from '../ui/icon-art';
import { categoryIcons, controlIcon } from '../ui/icons';
import { palette } from '../ui/levels';

/** Controls that lesson and build text can point at. Writing [[Paint]] in a
 * step shows the control as the learner will see it, its own icon and label,
 * so they can find it by sight; {{Events}} does the same for a palette
 * category, with its coloured disc. A control is named by its label here and
 * takes its icon from the element it stands for.
 *
 * Three more pieces of markup help young readers: ((Physics|set sprite Bird vy to 300))
 * draws a block as a small picture in its category's colour, so "find this
 * block" is something to look for rather than to read; <<gravity|ay>> makes a
 * word a button that opens its word card (words.ts); and [space], [←], [→],
 * [↑] and [↓] show keys as key caps. */
const CONTROLS: Record<string, { id?: string; icon?: IconName }> = {
  Sprites: { id: 'scene-stock' },
  Paint: { id: 'tray-paint' },
  'Run code': { id: 'run' },
  'More settings': { id: 'sprite-more' },
  'Sprite data & behavior': { icon: controlIcon('', 'Sprite data & behavior') },
  'Worlds & tilemaps': { id: 'scene-worlds' },
  'World library': { id: 'world-stock' },
  'Stage view': { id: 'view-stage' },
  'Add screen': { id: 'stage-add-right', icon: 'plus' },
  New: { icon: 'plus' },
  'Import costume': { id: 'scene-import' },
  'Sprite tab': { id: 'tab-sprite' },
  Solid: {},
  'Try it': { id: 'guide-try', icon: 'play' },
  'Check my answer': { id: 'guide-check-answer', icon: 'check' },
};
const categoryColour = (name: string) => Object.values(palette).flat().find(c => c.name === name)?.colour;
/** Where a block is in the picker at the learner's level: its category and its number there (the editor
 * sets this; block-captions.ts numbers the picker). */
let numberLookup: (category: string, ref: string) => { category: string; number: number } | undefined = () => undefined;
export function setBlockNumbers(lookup: typeof numberLookup) { numberLookup = lookup; }
export const knownControl = (label: string) => label in CONTROLS;
export const knownCategory = (name: string) => !!categoryColour(name);

const MARKUP = /\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}|\(\(([^|)#]+)(?:#([^|)]+))?\|([^)]+)\)\)|<<([^>|]+)(?:\|([^>]+))?>>|\[(space|←|→|↑|↓)\]/g;
const KEY_NAMES: Record<string, string> = { space: 'space', '←': 'left arrow', '→': 'right arrow', '↑': 'up arrow', '↓': 'down arrow' };
/** Lesson text without its markup, for plain-text uses such as the timing download and reading aloud. */
export const plainText = (text: string) => text.replace(MARKUP, (_, control, category, _blockCategory, _ref, block, word, _id, key) => control ?? category ?? block ?? word ?? KEY_NAMES[key]);
/** The block categories, words and keys a piece of lesson text names, for checking that each resolves. */
export function markupIn(text: string) {
  const found = { controls: [] as string[], categories: [] as string[], words: [] as string[], blocks: [] as { category: string; ref: string }[] };
  for (const [, control, category, blockCategory, ref, , word, id] of text.matchAll(MARKUP)) {
    if (control !== undefined) found.controls.push(control);
    if (category !== undefined) found.categories.push(category);
    if (blockCategory !== undefined) found.categories.push(blockCategory);
    if (blockCategory !== undefined && ref !== undefined) found.blocks.push({ category: blockCategory, ref });
    if (word !== undefined) found.words.push(id ?? word);
  }
  return found;
}

function svg(icon: IconName) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) node.setAttribute(key, value);
  node.innerHTML = iconMarkup(icon); // Trusted, local SVG constants only.
  return node;
}

/** Give a block picture its category's colour and icon and its number in the picker. At another level
 * the block can be in another category; the picture then shows that one. */
function placeChip(chip: HTMLElement) {
  const named = chip.dataset.category!, ref = chip.dataset.ref, found = ref ? numberLookup(named, ref) : undefined, category = found?.category ?? named;
  chip.querySelectorAll(':scope > .block-ref-number, :scope > svg').forEach(node => node.remove());
  chip.style.setProperty('--block', categoryColour(category) ?? '#6c7c64');
  const icon = categoryIcons[category]; if (icon) chip.prepend(svg(icon));
  if (found) { const bubble = document.createElement('span'); bubble.className = 'block-ref-number'; bubble.textContent = String(found.number); bubble.title = `Number ${found.number} in ${category}`; chip.prepend(bubble); }
}
/** After the level changes: every block picture on the page shows where its block is now. */
export function renumberBlocks(root: ParentNode = document) { root.querySelectorAll<HTMLElement>('.block-ref[data-category]').forEach(placeChip); }

/** Lesson text as nodes: plain text, with each [[control]] and {{category}} as a chip,
 * each ((Category|block)) as a block picture, each <<word>> as a word button and each [key] as a key cap. */
export function richText(text: string): Node[] {
  const nodes: Node[] = []; let at = 0;
  for (const match of text.matchAll(MARKUP)) {
    if (match.index > at) nodes.push(document.createTextNode(text.slice(at, match.index)));
    const [, control, category, blockCategory, ref, block, word, id, key] = match, chip = document.createElement('span');
    if (block !== undefined) {
      // A block as it looks in the palette: its category's colour and icon, a hat's rounded top for "when …",
      // and the block's number in that category's picker, so it can be found without reading every block.
      chip.className = block.startsWith('when ') ? 'block-ref block-ref-hat' : 'block-ref';
      chip.dataset.category = blockCategory; if (ref) chip.dataset.ref = ref;
      chip.append(block); placeChip(chip);
    } else if (word !== undefined) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'word-ref'; button.dataset.word = id ?? word;
      button.textContent = word; button.setAttribute('aria-haspopup', 'dialog');
      nodes.push(button); at = match.index + match[0].length; continue;
    } else if (key !== undefined) {
      const cap = document.createElement('kbd'); cap.className = key === 'space' ? 'key-ref key-ref-wide' : 'key-ref';
      cap.textContent = key; cap.setAttribute('aria-label', KEY_NAMES[key]);
      nodes.push(cap); at = match.index + match[0].length; continue;
    } else if (control !== undefined) {
      const spec = CONTROLS[control], icon = spec?.icon ?? (spec?.id ? controlIcon(spec.id, control) : undefined);
      chip.className = 'ui-ref';
      if (icon) chip.append(svg(icon));
      chip.append(control);
    } else {
      const icon = categoryIcons[category], dot = document.createElement('span');
      chip.className = 'ui-ref ui-ref-category'; dot.className = 'ui-ref-dot';
      dot.style.background = categoryColour(category) ?? '#6c7c64';
      if (icon) dot.append(svg(icon));
      chip.append(dot, category);
    }
    nodes.push(chip); at = match.index + match[0].length;
  }
  if (at < text.length) nodes.push(document.createTextNode(text.slice(at)));
  return nodes;
}
/** Set an element's content to lesson text. */
export const setRichText = (element: HTMLElement, text: string) => element.replaceChildren(...richText(text));
