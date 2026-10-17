import { recipeCard, type CardHost } from './card';
import { rankRecipes } from './match';
import { recipeById, recipes, type Recipe } from './recipes';
import { LEVELS, type Level } from '../ui/levels';

/** Ideas for a wish at a level. An idea above the level still appears, and
 * still comes first when it clearly fits best ("camera follow me" at Starter),
 * but a same-level idea wins a near tie, so a Starter learner is not moved to
 * Builder or Pro by a toss-up. */
export function rankIdeas(wish: string, level: Level, limit = 3): Recipe[] {
  const gap = (recipe: Recipe) => Math.max(0, LEVELS.indexOf(recipe.level) - LEVELS.indexOf(level));
  return rankRecipes(wish, recipes, limit * 2)
    .map(match => ({ recipe: match.recipe, score: match.score * (1 - 0.1 * gap(match.recipe)) }))
    .sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, limit).map(match => match.recipe);
}

export interface IdeasHost extends CardHost {
  /** Bring the Help tab forward. */
  reveal(): void;
  /** Second tier when nothing matches locally: hand the wish to the AI helper,
   * which the learner reviews and sends there. False when it is unavailable. */
  askAi?: (wish: string) => string | null;
}
const CHIPS = ['chase', 'jump', 'keep score', 'collect a coin', 'draw a star', 'say hello', 'countdown timer', 'shoot'];

/** “What do you want to make happen?”: a wish box that resolves locally to
 * reviewed recipes before anything else, so it works without any AI key. */
export function installIdeas(host: IdeasHost) {
  const slot = document.getElementById('ideas-slot')!;
  slot.innerHTML = `<section id="ideas" class="ideas" aria-labelledby="ideas-title"><h2 id="ideas-title">What do you want to make happen?</h2>
    <form id="ideas-form" role="search"><label class="visually-hidden" for="ideas-input">Describe your idea</label><input id="ideas-input" type="search" maxlength="200" placeholder="Try: make the enemy chase me" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button class="button primary" id="ideas-find">Find ideas</button></form>
    <div class="idea-chips" id="ideas-chips" aria-label="Idea suggestions"></div><p id="ideas-status" role="status"></p><div id="ideas-results" class="recipe-list"></div></section>`;
  const input = document.getElementById('ideas-input') as HTMLInputElement, status = document.getElementById('ideas-status')!, results = document.getElementById('ideas-results')!;
  const chips = document.getElementById('ideas-chips')!;
  for (const text of CHIPS) {
    const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'idea-chip'; chip.textContent = text;
    chip.addEventListener('click', () => { input.value = text; search(text); });
    chips.append(chip);
  }
  let generation = 0;
  function render(list: Recipe[]) {
    results.replaceChildren(...list.map((recipe, index) => recipeCard(recipe, { ...host, show }, { compact: index > 0 })));
  }
  function search(wish: string) {
    const current = ++generation;
    const matches = rankIdeas(wish, host.level());
    render(matches);
    if (matches.length) { status.textContent = matches.length === 1 ? 'One idea matches.' : `${matches.length} ideas match. The first is the closest.`; return matches; }
    status.textContent = wish.trim() ? 'No idea card matches yet. Try other words, like jump, chase or score.' : '';
    if (wish.trim() && host.askAi) {
      const ask = document.createElement('button'); ask.className = 'button secondary'; ask.id = 'ideas-ask-ai'; ask.textContent = 'Ask the AI helper to pick an idea';
      ask.addEventListener('click', () => { if (current === generation) status.textContent = host.askAi!(wish) ?? 'The AI helper is not available at this level.'; });
      results.replaceChildren(ask);
    }
    return matches;
  }
  function show(recipe: Recipe) { host.reveal(); generation++; input.value = recipe.title; render([recipe]); status.textContent = ''; document.getElementById('ideas')!.scrollIntoView({ block: 'start' }); }
  document.getElementById('ideas-form')!.addEventListener('submit', event => { event.preventDefault(); search(input.value); });
  return {
    search(wish: string) { host.reveal(); input.value = wish; return search(wish); },
    show,
    showId(id: string) { const recipe = recipeById(id); if (recipe) show(recipe); },
    focus() { host.reveal(); input.focus(); },
  };
}
