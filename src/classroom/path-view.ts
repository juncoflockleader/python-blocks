import './path.css';
import chapters from '../../content/academy/chapters.json';
import { buildById, type Build } from '../guide/builds';
import { loadProgress } from '../academy/progress';
import { iconMarkup, type IconName } from '../ui/icon-art';
import { stockDataUrl } from '../art/raster';
import { chapterPath, stopOf, type ChapterPath, type PathStop } from './path';
import type { StopKind } from './stops';

/** The chapter path: the Academy's front door. A chapter is one winding path of stops (each unit's
 * Story, puzzle stops, Bonus and Star check, then the big project), with the Chick at the stop to do
 * next and one Continue button, so a learner never has to choose where to go. Stops that are done
 * can be played again; stops further on are locked. The list of every chapter and unit, and the view
 * for grown-ups, are one button away (Chapters). Layout follows the "Chapter path" mock. */
export interface PathHost {
  /** Open a unit at a step, straight into it. */
  start(unit: string, at: number): void;
  /** The unit open in the lesson panel and its step, if any. */
  active(): { unit: string; index: number } | null;
  /** The list of every chapter and unit (the Academy dialog). */
  chapters(): void;
  /** The learner's coins as shown in the top bar; null when there is no account. */
  coins(): string | null;
}
interface ChapterUnit { id?: string; title: string; capstone?: boolean }
interface Chapter { number: number; title: string; units: ChapterUnit[] }

const X0 = 120, GAP = 130, LOW = 250, HIGH = 190, BONUS = 372, HEIGHT = 440;
const ICONS: Record<StopKind, IconName> = { story: 'book', puzzles: 'blocks', bonus: 'wand', stars: 'star', project: 'rocket' };
const icon = (name: IconName, size: number, width = 2) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(name)}</svg>`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const number = (unit: Build) => `${unit.unit?.chapter}.${unit.unit?.number}`;
const STATE_WORDS = { done: 'done, play it again', now: 'next', open: 'open', locked: 'locked' } as const;

/** Where a stop sits on the track: needed stops step along it, low then high; a Bonus hangs under the path after the stop before it. */
const place = (stop: PathStop) => stop.required ? { x: X0 + stop.slot * GAP, y: stop.slot % 2 ? HIGH : LOW } : { x: X0 + (stop.slot + 0.5) * GAP, y: BONUS };
/** The path's line through the first `slots` needed stops. */
function line(slots: number, tail: boolean) {
  let d = `M-40 ${LOW}L${X0} ${LOW}`;
  for (let slot = 1; slot < slots; slot++) { const x = X0 + slot * GAP, y = slot % 2 ? HIGH : LOW, from = slot % 2 ? LOW : HIGH; d += `C${x - GAP / 2} ${from} ${x - GAP / 2} ${y} ${x} ${y}`; }
  if (tail) d += `L${X0 + (slots - 1) * GAP + 400} ${(slots - 1) % 2 ? HIGH : LOW}`;
  return d;
}
function words(path: ChapterPath, fresh: boolean) {
  const now = path.now;
  if (!now) return { bubble: 'You finished the chapter!', title: 'Chapter finished', text: 'Tap any stop to play it again.' };
  const unit = `${number(now.unit)} · ${now.unit.title}`, going = now.done > 0;
  const about: Record<StopKind, [string, string]> = {
    story: [fresh ? 'Hi! Start here.' : 'A new story. Come and see!', 'Watch, guess and try it'],
    puzzles: ['Puzzles next. You can do it!', `${now.steps} puzzles`],
    bonus: ['', ''],
    stars: ['Show what you know!', `${now.steps} problems on your own`],
    project: ['Time for the big project!', 'Build it step by step'],
  };
  return { bubble: going ? 'Keep going!' : about[now.kind][0], title: now.title, text: `${unit} · ${about[now.kind][1]}` };
}

export function installPath(host: PathHost) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="chapter-path" class="chapter-path" aria-labelledby="path-chapter-title">
    <header class="path-bar">
      <button id="path-chapters" class="button secondary" type="button" title="Every chapter and unit, and the view for grown-ups">${icon('grid', 18)}<span>Chapters</span></button>
      <div class="path-chapter"><span id="path-chapter-number" class="path-eyebrow"></span><h2 id="path-chapter-title"></h2></div>
      <span class="path-spacer"></span>
      <span id="path-coins" class="path-chip path-coins" hidden>${icon('coin', 18)}<span></span><span class="visually-hidden"> coins</span></span>
      <span id="path-learner" class="path-chip" hidden><span class="path-initial" aria-hidden="true"></span><span></span></span>
      <button id="path-close" class="button secondary" type="button" title="Close the map">${icon('close', 18)}<span>Close</span></button>
    </header>
    <div id="path-scroll" class="path-scroll"><div id="path-track" class="path-track"></div></div>
    <footer class="path-foot">
      <div class="path-count"><p id="path-count"></p><div id="path-dots" class="path-dots" role="img"></div></div>
      <div class="path-next"><span id="path-next-eyebrow" class="path-eyebrow"></span><strong id="path-next-title"></strong><span id="path-next-text"></span></div>
      <button id="path-go" class="button primary" type="button"><span></span></button>
    </footer></dialog>`);
  const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('chapter-path'), track = get('path-track'), scroll = get('path-scroll');
  const chick = stockDataUrl('cast/chick-happy@1');
  let shown: ChapterPath | null = null;

  /** The chapter to show: the first with units that is not finished, or the last that has units. */
  function chapter(progress = loadProgress()) {
    const ready = (chapters as Chapter[]).map(entry => ({ entry, units: entry.units.flatMap(unit => { const build = unit.id ? buildById(unit.id) : undefined; return build ? [build] : []; }) })).filter(c => c.units.length);
    const paths = ready.map(c => ({ ...c, path: chapterPath(c.units, progress) }));
    return { ...(paths.find(c => c.path.now) ?? paths.at(-1)!), name: progress.learner.name };
  }
  function go(stop: PathStop) {
    const active = host.active();
    dialog.close();
    // The stop that is open already just comes back into view.
    if (active && shown && stopOf(shown, active.unit, active.index) === stop) return;
    host.start(stop.unit.id, stop.next);
  }
  function stopButton(stop: PathStop, now: boolean) {
    const at = place(stop), item = el('li', `path-stop path-stop-${stop.state} path-kind-${stop.kind}`);
    item.style.left = `${at.x}px`; item.style.top = `${at.y}px`;
    const button = el('button', 'path-stop-button'); button.type = 'button';
    button.dataset.unit = stop.unit.id; button.dataset.stop = stop.kind; button.dataset.state = stop.state;
    button.disabled = stop.state === 'locked';
    button.setAttribute('aria-label', `${number(stop.unit)} ${stop.title}: ${STATE_WORDS[stop.state]}`);
    if (now) button.setAttribute('aria-current', 'step');
    const node = el('span', 'path-node');
    node.innerHTML = stop.state === 'now' ? icon('play', 34) : icon(ICONS[stop.kind], stop.required ? 30 : 24);
    if (stop.state === 'done') node.insertAdjacentHTML('beforeend', `<span class="path-badge path-badge-done">${icon('check', 13, 3.2)}</span>`);
    if (stop.state === 'locked') node.insertAdjacentHTML('beforeend', `<span class="path-badge path-badge-locked">${icon('lock', 12, 2.4)}</span>`);
    button.append(node, el('span', 'path-label', stop.title));
    button.addEventListener('click', () => go(stop));
    item.append(button);
    return item;
  }
  function render() {
    const { entry, units, path, name } = chapter(); shown = path;
    get('path-chapter-number').textContent = `Chapter ${entry.number}`; get('path-chapter-title').textContent = entry.title;
    const coins = host.coins(); get('path-coins').hidden = coins === null; get('path-coins').children[1].textContent = coins ?? '';
    get('path-learner').hidden = !name; get('path-learner').children[0].textContent = name.slice(0, 1).toUpperCase(); get('path-learner').children[1].textContent = name;

    const slots = path.needed, width = X0 * 2 + (slots - 1) * GAP + 110, target = path.now ?? path.stops.filter(stop => stop.required).at(-1)!, fresh = !path.stops.some(stop => stop.done);
    track.style.width = `${width}px`; track.style.height = `${HEIGHT}px`;
    const say = words(path, fresh), reachedSlots = path.now ? path.now.slot + 1 : slots;
    const branches = path.stops.filter(stop => !stop.required).map(stop => { const at = place(stop); return `<path class="path-branch" d="M${at.x} ${(LOW + HIGH) / 2}L${at.x} ${BONUS - 34}"/>`; }).join('');
    track.innerHTML = `<svg class="path-line" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" aria-hidden="true">
      ${branches}<path class="path-edge" d="${line(slots, true)}"/><path class="path-road" d="${line(slots, true)}"/><path class="path-walked" d="${line(reachedSlots, false)}"/><path class="path-dashes" d="${line(slots, true)}"/></svg>`;
    const list = el('ol', 'path-stops'); list.setAttribute('aria-label', `Chapter ${entry.number} stops`);
    list.append(...path.stops.map(stop => stopButton(stop, stop === path.now)));
    track.append(list);
    for (const unit of units) {
      const first = path.stops.find(stop => stop.unit === unit)!, label = el('span', 'path-unit', `${number(unit)} · ${unit.title}`);
      label.style.left = `${place(first).x - 44}px`; track.append(label);
    }
    const at = place(target), guide = el('div', 'path-guide');
    guide.style.left = `${at.x}px`; guide.style.top = `${at.y - (path.now ? 48 : 34) - 6}px`;
    const bubble = el('p', 'path-bubble', say.bubble); bubble.id = 'path-bubble';
    const bird = el('img', 'path-chick'); bird.src = chick; bird.alt = '';
    guide.append(bubble, bird); track.append(guide);

    const position = path.now ? path.stops.indexOf(path.now) + 1 : 0;
    get('path-count').innerHTML = path.now ? `Stop <strong>${position}</strong> of ${path.stops.length} in this chapter` : `All <strong>${path.needed}</strong> stops done`;
    const dots = get('path-dots'); dots.setAttribute('aria-label', `${path.done} of ${path.needed} stops done`);
    dots.replaceChildren(...units.map(unit => { const group = el('span', 'path-dot-group'); group.append(...path.stops.filter(stop => stop.unit === unit).map(stop => el('span', `path-dot path-dot-${stop.state}${stop.required ? '' : ' path-dot-bonus'}${stop.kind === 'project' ? ' path-dot-project' : ''}`))); return group; }));
    get('path-next-eyebrow').textContent = path.now ? 'Next up' : 'Well done'; get('path-next-title').textContent = say.title; get('path-next-text').textContent = say.text;
    const button = get<HTMLButtonElement>('path-go'); button.hidden = !path.now; button.lastElementChild!.textContent = fresh ? 'Start' : 'Continue';
    return { x: at.x };
  }
  get('path-go').addEventListener('click', () => { if (shown?.now) go(shown.now); });
  get('path-close').addEventListener('click', () => dialog.close());
  get('path-chapters').addEventListener('click', () => host.chapters());
  return {
    get isOpen() { return dialog.open; },
    open() {
      const { x } = render();
      if (!dialog.open) dialog.showModal();
      // The stop to do next is in the middle of the view.
      scroll.scrollLeft = Math.max(0, x - scroll.clientWidth / 2);
      get('path-go').hidden ? get('path-close').focus() : get('path-go').focus();
    },
    close() { if (dialog.open) dialog.close(); },
    dispose() { dialog.remove(); },
  };
}
