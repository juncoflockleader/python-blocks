import { iconMarkup, type IconName } from '../ui/icon-art';
import { categoryIcons, controlIcon } from '../ui/icons';
import { palette } from '../ui/levels';

/** Controls that lesson and build text can point at. Writing [[Paint]] in a
 * step shows the control as the learner will see it, its own icon and label,
 * so they can find it by sight; {{Events}} does the same for a palette
 * category, with its coloured disc. A control is named by its label here and
 * takes its icon from the element it stands for. */
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
};
const categoryColour = (name: string) => Object.values(palette).flat().find(c => c.name === name)?.colour;
export const knownControl = (label: string) => label in CONTROLS;
export const knownCategory = (name: string) => !!categoryColour(name);

const MARKUP = /\[\[([^\]]+)\]\]|\{\{([^}]+)\}\}/g;
/** Lesson text without its markup, for plain-text uses such as the timing download. */
export const plainText = (text: string) => text.replace(MARKUP, (_, control, category) => control ?? category);

function svg(icon: IconName) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) node.setAttribute(key, value);
  node.innerHTML = iconMarkup(icon); // Trusted, local SVG constants only.
  return node;
}

/** Lesson text as nodes: plain text, with each [[control]] and {{category}} as a chip. */
export function richText(text: string): Node[] {
  const nodes: Node[] = []; let at = 0;
  for (const match of text.matchAll(MARKUP)) {
    if (match.index > at) nodes.push(document.createTextNode(text.slice(at, match.index)));
    const [, control, category] = match, chip = document.createElement('span');
    if (control !== undefined) {
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
