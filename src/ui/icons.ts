import { iconArt, iconSvg, type IconName } from './icon-art';
import './icons.css';

// Keep action identity separate from its label: buttons such as Run and Python
// draft replace their text as state changes. CSS icons survive those updates
// without changing accessible names, focus order, or click handlers.
const actions: Record<string, IconName> = {};
const actionGroups: Partial<Record<IconName, string>> = {
  save: 'save art-save art-speed-save',
  folder: 'open python-recover',
  download: 'export export-playable recover python-download python-recovery-download module-export module-save-copy art-export pilot-download pilot-download-backup pilot-recovery',
  upload: 'module-import scene-import art-import sound-import',
  play: 'run play-run sound-preview art-play pilot-start',
  stop: 'stop play-stop sound-preview-stop sound-record-stop',
  restart: 'example scene-reset game-restart',
  undo: 'language-undo world-undo art-undo art-project-undo sound-undo art-revert python-discard pilot-return',
  redo: 'language-redo world-redo art-redo art-project-redo',
  close: 'export-cancel migration-cancel language-close lambda-close events-close modules-close module-inspector-close python-cancel question-cancel art-close world-close stock-close sound-close assist-cancel',
  plus: 'parameter-add lambda-parameter-add scene-add art-new art-frame-add world-new sound-new song-new watch-add',
  trash: 'function-delete handler-delete module-remove python-recovery-remove scene-delete data-remove art-delete art-frame-remove world-delete sound-delete song-clear pilot-clear',
  copy: 'function-copy handler-copy scene-copy art-duplicate art-save-copy art-frame-copy world-copy sound-copy',
  check: 'migration-apply function-apply variable-apply handler-apply lambda-apply python-apply motion-use-preset sound-apply pilot-finish',
  edit: 'module-rename python-edit',
  target: 'function-find handler-find lambda-find scene-locate scene-script-find',
  eye: 'module-inspect python-inspect assist-review',
  blocks: 'python-blocks python-use-blocks',
  function: 'language-manage',
  module: 'modules-manage',
  event: 'events-manage scene-events event-send',
  volume: 'audio-enable',
  mute: 'audio-mute',
  music: 'sound-open sound-example',
  microphone: 'sound-record',
  sprite: 'scene-example pilot-sprites',
  world: 'scene-worlds scene-world-example',
  image: 'scene-stock-backdrop',
  palette: 'scene-art scene-edit-costume',
  keyboard: 'scene-input-example',
  game: 'scene-game-example scene-star-game touch-toggle',
  pen: 'scene-drawing-example',
  move: 'scene-motion-example',
  message: 'scene-story-example assist-send',
  physics: 'scene-behavior-example data-behavior',
  library: 'scene-stock world-stock',
  eraser: 'appearance-clear art-clear',
  selection: 'art-deselect sound-select-all',
  flipX: 'art-flip-x', flipY: 'art-flip-y', rotate: 'art-rotate',
  resize: 'art-resize art-scale play-expand',
  up: 'art-frame-up', down: 'art-frame-down',
  left: 'song-prev play-close', right: 'song-next',
  clock: 'pilot-timer', assist: 'assist-enable', lock: 'assist-disable',
};
for (const [icon, ids] of Object.entries(actionGroups)) {
  for (const id of ids.split(' ')) actions[id] = icon as IconName;
}

const categories: Record<string, IconName> = {
  Program: 'play', 'Sensing & input': 'keyboard', Sounds: 'music', Game: 'game',
  Worlds: 'world', Sprites: 'sprite', Motion: 'move', Looks: 'eye', Physics: 'physics',
  'Sprite pen': 'pen', Draw: 'palette', Loops: 'loop', Logic: 'logic', Numbers: 'number',
  Text: 'text', Variables: 'variable', Functions: 'function', 'Function values': 'function',
  Events: 'event', Modules: 'module', Collections: 'list',
};
const labels: Record<string, IconName> = {
  'Apply sprite': 'check', 'Apply world settings': 'check', 'Apply game settings': 'check',
  'Apply appearance': 'check', 'Save entry': 'save', Answer: 'message',
  'Remove parameter': 'trash', 'Remove lambda parameter': 'trash', Remove: 'trash',
  'Move up': 'up', 'Move down': 'down',
  'Trim to selection': 'crop', Reverse: 'reverse', 'Fade in': 'fadeIn', 'Fade out': 'fadeOut',
  Louder: 'volume', Quieter: 'volume', Normalize: 'sliders',
  '1. Predict': 'help', '2. Edit and compare': 'edit', '3. Repair a draft': 'code',
  '4. Keep assets': 'image', '5. Handle a conflict': 'layers', '6. Deliver': 'download',
  'Learner pilot': 'learn', 'AI assist': 'assist', 'Facilitator notes': 'notes',
  'Saved project checkpoints & session data': 'save', 'Recover earlier Python': 'undo',
  'Pen & graphic effects': 'pen', 'Sprite data & behavior': 'variable',
  'Game motion & collisions': 'physics', 'Input help & touch buttons': 'keyboard',
  'Watch sprite values': 'eye', 'Python error details': 'alert', 'Send a test event': 'event',
  'Manage handlers': 'event', 'Manage lambdas': 'function', 'Manage modules': 'module',
  'Manage functions': 'function', 'Manage variables': 'variable',
  'Project notes': 'book', 'Editable project': 'blocks', 'Python source': 'code',
  'How to run': 'help', 'Credits & licenses': 'book',
};
const arrows: Record<string, IconName> = { '↑': 'up', '↓': 'down', '←': 'left', '→': 'right' };
const tools: Record<string, IconName> = {
  brush: 'brush', paint: 'brush', eraser: 'eraser', erase: 'eraser', fill: 'fill',
  line: 'line', rectangle: 'rectangle', ellipse: 'ellipse', select: 'selection',
  move: 'move', pick: 'pick', wall: 'wall', view: 'eye',
};
const images = new Map<IconName, string>();
function decorate(element: HTMLElement, icon: IconName) {
  if (element.dataset.uiIcon === icon) return;
  let url = images.get(icon);
  if (!url) { url = `url("data:image/svg+xml,${encodeURIComponent(iconSvg(icon))}")`; images.set(icon, url); }
  element.style.setProperty('--ui-icon', url);
  element.dataset.uiIcon = icon;
}

function menuIcon(label: string): IconName | undefined {
  const rules: [RegExp, IconName][] = [
    [/^undo/i, 'undo'], [/^redo/i, 'redo'], [/^duplicate|^copy/i, 'copy'],
    [/^delete|^remove comment/i, 'trash'], [/comment/i, 'message'],
    [/^collapse|^expand/i, 'layers'], [/^disable/i, 'stop'], [/^enable/i, 'play'],
    [/^clean up/i, 'sliders'], [/help/i, 'help'], [/^paste/i, 'notes'],
    [/^cut/i, 'crop'], [/^download/i, 'download'], [/^create/i, 'plus'],
    [/^(inline|external) inputs/i, 'blocks'], [/^edit|^rename/i, 'edit'],
  ];
  return rules.find(([pattern]) => pattern.test(label))?.[1];
}

const targets = 'button, summary, .design-link, .player footer a, .blocklyToolboxCategory, .blocklyFlyoutButton, .blocklyContextMenu .blocklyMenuItem, #art-tool, #world-tool';

/** Decorate newly rendered controls, including dialogs and Blockly flyouts.
 * The observer only visits changed controls/subtrees, never the whole document
 * on each runtime update. Styles and data attributes are not observed. */
export function installIcons(root: HTMLElement = document.body) {
  function apply(element: Element) {
    if (element.matches('.blocklyFlyoutButton')) {
      if (element.querySelector('.ui-flyout-icon')) return;
      const name = labels[element.querySelector('text')?.textContent?.trim() ?? ''];
      const background = element.querySelector('rect.blocklyFlyoutButtonBackground');
      if (!name || !background) return;
      // Blockly reserves this space through its public TEXT_MARGIN_X setting.
      // Keep its own measured bounds, label and focusable group intact.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ui-flyout-icon'); svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false'); svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('x', '6');
      svg.setAttribute('y', String((Number(background.getAttribute('height')) - 16) / 2));
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.8'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = iconArt[name]; // Trusted, local SVG constants only.
      element.append(svg); return;
    }
    if (!(element instanceof HTMLElement)) return;
    if (element.matches('.blocklyToolboxCategory')) {
      const name = categories[element.querySelector('.blocklyToolboxCategoryLabel')?.textContent?.trim() ?? ''];
      const icon = element.querySelector<HTMLElement>('.blocklyToolboxCategoryIcon');
      if (name && icon) { icon.setAttribute('aria-hidden', 'true'); decorate(icon, name); }
      return;
    }
    if (element instanceof HTMLSelectElement) {
      const name = tools[element.value]; if (!name) return;
      const label = element.closest('label'); if (!label) return;
      let caption = label.querySelector<HTMLElement>('.ui-tool-caption');
      if (!caption) {
        caption = document.createElement('span'); caption.className = 'ui-tool-caption'; caption.textContent = 'Tool';
        const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
        if (text) text.replaceWith(caption); else label.prepend(caption);
      }
      decorate(caption, name); return;
    }
    // Thumbnails, note/hold marks and controller A/B already are visual icons.
    if (element.matches('.stock-card, #scene-cards button, #song-grid button, [data-control="a"], [data-control="b"]')) return;
    const label = element.tagName === 'SUMMARY'
      ? [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()
      : element.textContent?.trim() ?? '';
    let name: IconName | undefined = actions[element.id] ?? labels[label] ?? arrows[label];
    if (element.id === 'audio-mute') name = label === 'Unmute' ? 'volume' : 'mute';
    if (element.id === 'art-play') name = label === 'Stop preview' ? 'stop' : 'play';
    if (element.id === 'pilot-timer') name = label.startsWith('Pause') ? 'pause' : 'clock';
    if (element.matches('.python-error-link, #diagnostics button')) name = 'alert';
    if (element.matches('.blocklyContextMenu .blocklyMenuItem')) name = menuIcon(label);
    if (name) {
      decorate(element, name);
      if (arrows[label] && element.hasAttribute('aria-label')) element.classList.add('ui-icon-only');
    }
  }
  function scan(element: Element) {
    if (element.matches(targets)) apply(element);
    element.querySelectorAll(targets).forEach(apply);
  }
  scan(root);
  const observer = new MutationObserver(records => {
    const changed = new Set<Element>();
    for (const record of records) {
      const parent = record.target instanceof Element ? record.target : record.target.parentElement;
      const control = parent?.closest(targets); if (control && root.contains(control)) changed.add(control);
      for (const node of record.addedNodes) if (node instanceof Element && root.contains(node)) scan(node);
    }
    changed.forEach(apply);
  });
  observer.observe(root, { subtree: true, childList: true, characterData: true });
  const change = (event: Event) => {
    if (event.target instanceof Element && event.target.matches('#art-tool, #world-tool')) apply(event.target);
  };
  root.addEventListener('change', change);
  return () => { observer.disconnect(); root.removeEventListener('change', change); };
}
