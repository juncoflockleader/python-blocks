import { recipeById, type Recipe } from './recipes';

/** Small, deterministic prompts in the Help tab (never modal), plus the card
 * an empty workspace shows. Each prompt offers reviewed ideas as chips. */
export interface NudgeHost {
  reveal(): void;
  notify(): void;
  showRecipe(recipe: Recipe): void;
  search(wish: string): void;
  openGallery(): void;
  startBuild(id: string): void;
  handlerCount(): number;
  /** Up to three gallery picks for the empty-workspace card. */
  picks(): { id: string; title: string; open(): void }[];
}
export type FixKind = 'loop' | 'name' | 'keys';
const fixes: Record<FixKind, string> = { loop: 'fix-loop-never-ends', name: 'fix-name-not-set', keys: 'fix-not-moving' };
const IDLE_MS = 30_000;

export function installNudges(host: NudgeHost) {
  const slot = document.getElementById('nudge-slot')!;
  slot.innerHTML = '<section id="nudges" class="nudges" aria-label="Suggestions"></section>';
  const list = document.getElementById('nudges')!;
  document.querySelector('.blocks-panel')!.insertAdjacentHTML('beforeend', `<section id="start-card" class="start-card" aria-labelledby="start-card-title" hidden><h2 id="start-card-title">Start something</h2><p>Open an example, follow a guided build, or describe an idea.</p><div id="start-picks" class="start-picks"></div>
    <p class="start-ideas">Or search an idea: <button class="idea-chip" data-wish="jump">jump</button><button class="idea-chip" data-wish="chase">chase</button><button class="idea-chip" data-wish="score">score</button></p>
    <div class="start-actions"><button id="start-build" class="button primary">Guided build: Catch the star</button><button id="start-gallery" class="button secondary">All examples</button></div></section>`);
  const card = document.getElementById('start-card')!;
  for (const chip of card.querySelectorAll<HTMLButtonElement>('[data-wish]')) chip.addEventListener('click', () => host.search(chip.dataset.wish!));
  document.getElementById('start-build')!.addEventListener('click', () => host.startBuild('catch-the-star'));
  document.getElementById('start-gallery')!.addEventListener('click', () => host.openGallery());
  let idle = 0, last: Recipe | null = null, shownFor: string | null = null;

  function nudge(id: string, text: string, chips: { label: string; act(): void }[], items: string[] = []) {
    list.querySelector(`[data-nudge="${id}"]`)?.remove();
    const item = document.createElement('article'); item.className = 'nudge'; item.dataset.nudge = id;
    const message = document.createElement('p'); message.textContent = text;
    const row = document.createElement('div'); row.className = 'idea-chips';
    for (const chip of chips) { const button = document.createElement('button'); button.className = 'idea-chip'; button.textContent = chip.label; button.addEventListener('click', chip.act); row.append(button); }
    const close = document.createElement('button'); close.className = 'nudge-close button secondary ui-icon-only'; close.textContent = 'Dismiss'; close.title = 'Dismiss';
    close.addEventListener('click', () => item.remove());
    const bullets = document.createElement('ul'); bullets.className = 'nudge-list';
    for (const text of items) { const li = document.createElement('li'); li.textContent = text; bullets.append(li); }
    item.append(close, message, ...(items.length ? [bullets] : []), ...(chips.length ? [row] : [])); list.prepend(item);
    while (list.children.length > 3) list.lastElementChild!.remove();
    host.notify();
  }
  const recipeChip = (id: string, label?: string) => { const recipe = recipeById(id)!; return { label: label ?? recipe.title, act: () => host.showRecipe(recipe) }; };

  return {
    /** Show or hide the start card for an empty workspace, with a matching Help prompt. */
    empty(isEmpty: boolean) {
      if (isEmpty && card.hidden) {
        document.getElementById('start-picks')!.replaceChildren(...host.picks().map(pick => { const b = document.createElement('button'); b.className = 'start-pick'; b.id = `start-pick-${pick.id}`; b.textContent = pick.title; b.addEventListener('click', pick.open); return b; }));
        nudge('empty', 'An empty workspace. Pick a starting point, or search an idea:', [{ label: 'jump', act: () => host.search('jump') }, { label: 'chase', act: () => host.search('chase') }, { label: 'score', act: () => host.search('score') }]);
      }
      if (!isEmpty) list.querySelector('[data-nudge="empty"]')?.remove();
      card.hidden = !isEmpty;
    },
    /** After opening an example: what to notice and try. */
    tryChanging(title: string, ideas: string[]) { nudge('try', `You opened ${title}. Try changing…`, [], ideas); },
    spriteAdded(name: string) { nudge('sprite', `You added ${name}. What should it do?`, [recipeChip('arrow-keys', 'Make it move'), recipeChip('say-something', 'Make it talk')]); },
    error(kind: FixKind) { nudge('fix', 'Something went wrong. This idea may help:', [recipeChip(fixes[kind])]); },
    inserted(recipe: Recipe) { last = recipe; shownFor = null; },
    /** Any workspace edit restarts the idle timer behind the “Try next” prompt. */
    activity() {
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        if (!last?.tryNext?.length || shownFor === last.id || host.handlerCount() !== 1) return;
        shownFor = last.id;
        nudge('next', `Nice work on “${last.title}”. Try next:`, last.tryNext.map(id => recipeChip(id)));
      }, IDLE_MS);
    },
    dispose() { clearTimeout(idle); card.remove(); slot.replaceChildren(); },
  };
}
