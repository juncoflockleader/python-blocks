import { builds, type Build } from './builds';
import { entries } from './gallery';
import { levelNames } from '../ui/levels';

/** The Lessons catalogue, kept apart from Examples: every lesson and guided
 * build, each with a picture of the game it ends in, how long it takes, and
 * buttons to start it or to play the finished game first. */
export interface LessonsHost {
  start(id: string): void;
  /** Open and run the finished game (a gallery entry). */
  play(entryId: string): void;
}
const thumbnail = (id: string) => `${import.meta.env.BASE_URL}gallery/${id}.png`;
const text = (tag: string, className: string, content = '') => Object.assign(document.createElement(tag), { className, textContent: content });

export function installLessons(host: LessonsHost) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="lessons-dialog" class="examples-dialog lessons-dialog" aria-labelledby="lessons-title"><header><h2 id="lessons-title">Lessons</h2><button id="lessons-close" class="button secondary">Close</button></header>
    <p>Build a whole game yourself, one checked step at a time. Lessons are longer and teach more; guided builds are quick.</p><ul id="lessons-list" class="example-list"></ul></dialog>`);
  const dialog = document.getElementById('lessons-dialog') as HTMLDialogElement, list = document.getElementById('lessons-list')!;
  const card = (build: Build) => {
    const game = entries.find(entry => entry.build === build.id);
    const item = document.createElement('li'), article = document.createElement('article');
    article.className = `example-card lesson-card${build.kind === 'lesson' ? ' lesson-card-main' : ''}`; article.dataset.lesson = build.id;
    const image = document.createElement('img'); image.className = 'example-thumb'; image.alt = ''; image.loading = 'lazy'; image.src = thumbnail(`${build.id}-game`);
    image.addEventListener('error', () => image.replaceWith(text('div', 'example-thumb')), { once: true });
    const kind = text('p', 'lesson-kind', build.kind === 'lesson' ? 'Lesson' : 'Guided build');
    const title = text('strong', '', build.title), summary = text('span', '', build.summary);
    const tags = text('p', 'recipe-tags');
    const length = build.kind === 'lesson' ? `${build.chapters?.length ?? 0} chapters · ${build.steps.length} steps` : `${build.steps.length} steps`;
    for (const label of [`${build.minutes} min`, length]) tags.append(text('span', '', label));
    tags.append(text('span', 'recipe-level', levelNames[build.level]));
    const actions = text('div', 'example-actions');
    const start = text('button', 'button primary', build.kind === 'lesson' ? 'Start lesson' : 'Start') as HTMLButtonElement;
    start.id = `lessons-start-${build.id}`; start.setAttribute('aria-label', `Start ${build.title}`);
    start.addEventListener('click', () => { dialog.close(); host.start(build.id); });
    actions.append(start);
    if (game) {
      const play = text('button', 'button secondary', 'Play the result') as HTMLButtonElement;
      play.id = `lessons-play-${build.id}`; play.setAttribute('aria-label', `Play the finished ${build.title}`);
      play.addEventListener('click', () => { dialog.close(); host.play(game.id); });
      actions.append(play);
    }
    article.append(image, kind, title, summary, tags, actions); item.append(article);
    return item;
  };
  list.append(...builds.map(card));
  const show = () => dialog.showModal();
  for (const id of ['lessons-open', 'menu-lessons']) document.getElementById(id)?.addEventListener('click', show);
  document.getElementById('lessons-close')!.addEventListener('click', () => dialog.close());
  return { open: show, dispose: () => dialog.remove() };
}
