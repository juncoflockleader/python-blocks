import gallery from '../../content/gallery.json';
import { concepts } from '../assist/catalog';
import { levelNames, type Level } from '../ui/levels';

/** One gallery record: a project fixture plus what to notice and try. The
 * academy can reuse the same loader. Ids double as the Open buttons' ids. */
export const GALLERY_KINDS = ['game', 'story', 'drawing', 'music', 'world', 'sprites'] as const;
export type GalleryKind = typeof GALLERY_KINDS[number];
export interface GalleryEntry {
  id: string; title: string; description: string; kind: GalleryKind; project: string; level: Level;
  tags: (keyof typeof concepts)[]; tryChanging: string[]; build?: string;
}
export const entries = gallery as GalleryEntry[];
// Bundled like the examples always were, so opening one replaces the project at once.
const projects = import.meta.glob(['../scene/*.json', '../../content/builds/*-game.json'], { eager: true, import: 'default' });
/** Load a gallery project by its repository path, for example src/scene/example.json. */
export function loadProject(path: string): unknown {
  const project = projects[path.startsWith('src/') ? `../${path.slice(4)}` : `../../${path}`];
  if (!project) throw new Error(`The example ${path} is missing.`);
  return project;
}

export interface GalleryHost {
  /** Replace the project with an example; false when a Python draft must be saved first. */
  open(entry: GalleryEntry, project: unknown): boolean;
  play(): void;
}
const thumbnail = (id: string) => `${import.meta.env.BASE_URL}gallery/${id}.png`;
/** Filter chips: everything, then one chip per kind. */
const FILTERS: [string, string][] = [['all', 'All'], ['game', 'Games'], ['story', 'Stories'], ['drawing', 'Drawing'], ['music', 'Music'], ['world', 'Worlds'], ['sprites', 'Sprites']];
/** Examples are finished projects to play and change. The games that lessons
 * build are listed under Lessons instead (lessons.ts), with a way to start them. */
const examples = entries.filter(entry => !entry.build);

export function installGallery(host: GalleryHost) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="examples-dialog" class="examples-dialog" aria-labelledby="examples-title"><header><h2 id="examples-title">Examples</h2><button id="examples-close" class="button secondary">Close</button></header>
    <p>Play an example, or open it to explore and change it. Opening replaces the project in the editor; Save project first to keep yours.</p>
    <div class="example-filters"><div class="idea-chips" id="examples-filters" role="group" aria-label="Show">${FILTERS.map(([id, label], index) => `<button type="button" class="idea-chip" data-filter="${id}" aria-pressed="${index === 0}">${label}</button>`).join('')}</div>
      <label class="example-search"><span class="visually-hidden">Search examples</span><input id="examples-search" type="search" placeholder="Search" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></label></div>
    <p id="examples-status" role="status"></p><ul class="example-list"></ul></dialog>`);
  const dialog = document.getElementById('examples-dialog') as HTMLDialogElement, list = dialog.querySelector('ul')!, status = document.getElementById('examples-status')!;
  const search = document.getElementById('examples-search') as HTMLInputElement, chips = [...dialog.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  let filter = 'all', message = '';
  function open(entry: GalleryEntry, play: boolean) {
    try {
      const project = loadProject(entry.project);
      if (!host.open(entry, project)) { message = 'Save or apply your Python draft first.'; render(); return; }
      message = ''; dialog.close();
      if (play) host.play();
    } catch (error) { message = error instanceof Error ? error.message : String(error); render(); }
  }
  const items = new Map<GalleryEntry, HTMLLIElement>();
  for (const entry of examples) {
    const item = document.createElement('li'), card = document.createElement('article');
    card.className = 'example-card'; card.dataset.example = entry.id;
    const image = document.createElement('img'); image.className = 'example-thumb'; image.alt = ''; image.loading = 'lazy'; image.src = thumbnail(entry.id);
    image.addEventListener('error', () => image.replaceWith(Object.assign(document.createElement('div'), { className: 'example-thumb' })), { once: true });
    const title = document.createElement('strong'), text = document.createElement('span'), tags = document.createElement('p');
    title.textContent = entry.title; text.textContent = entry.description; tags.className = 'recipe-tags';
    for (const tag of entry.tags) { const span = document.createElement('span'); span.textContent = concepts[tag][0]; tags.append(span); }
    const level = document.createElement('span'); level.className = 'recipe-level'; level.textContent = levelNames[entry.level]; tags.append(level);
    const actions = document.createElement('div'); actions.className = 'example-actions';
    const play = document.createElement('button'); play.className = 'button primary'; play.id = `${entry.id}-play`; play.textContent = 'Play';
    play.setAttribute('aria-label', `Play ${entry.title}`); play.addEventListener('click', () => open(entry, true));
    const edit = document.createElement('button'); edit.className = 'button secondary'; edit.id = entry.id; edit.textContent = 'Open to edit';
    edit.setAttribute('aria-label', `Open ${entry.title} to edit`); edit.addEventListener('click', () => open(entry, false));
    actions.append(play, edit);
    card.append(image, title, text, tags, actions); item.append(card); list.append(item); items.set(entry, item);
  }
  const words = (entry: GalleryEntry) => `${entry.title} ${entry.description} ${entry.tags.map(tag => concepts[tag][0]).join(' ')} ${levelNames[entry.level]}`.toLowerCase();
  function render() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    for (const [entry, item] of items) {
      const visible = (filter === 'all' || entry.kind === filter) && (!query || words(entry).includes(query));
      item.hidden = !visible; if (visible) shown++;
    }
    for (const chip of chips) chip.setAttribute('aria-pressed', String(chip.dataset.filter === filter));
    status.textContent = message || (shown === items.size ? '' : shown ? `${shown} of ${items.size} examples` : 'No example matches. Try another word or filter.');
  }
  for (const chip of chips) chip.addEventListener('click', () => { filter = chip.dataset.filter!; render(); });
  search.addEventListener('input', render);
  const show = () => { message = ''; render(); dialog.showModal(); };
  for (const id of ['examples-open', 'menu-examples']) document.getElementById(id)!.addEventListener('click', show);
  document.getElementById('examples-close')!.addEventListener('click', () => dialog.close());
  render();
  return {
    open: show,
    /** Open an entry directly (used by the empty-workspace card). */
    load: (id: string) => { const entry = entries.find(e => e.id === id); if (entry) open(entry, false); },
    /** Open an entry and run it (used by Lessons' "Play the result"). */
    play: (id: string) => { const entry = entries.find(e => e.id === id); if (entry) open(entry, true); },
    dispose: () => dialog.remove(),
  };
}
