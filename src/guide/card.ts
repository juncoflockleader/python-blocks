import './guide.css';
import { concepts } from '../assist/catalog';
import { atLeast, levelNames, type Level } from '../ui/levels';
import { recipeById, usesOther, type Recipe } from './recipes';

export interface CardHost {
  level(): Level;
  /** Insert the recipe's blocks; returns a status message for the learner. */
  insert(recipe: Recipe, target?: string): string;
  /** Sprites in the project, the selected one, and a preferred target (a guided step may set it). */
  sprites(): { id: string; name: string }[];
  selected(): string;
  target(): string | undefined;
  /** Show another recipe (a Try next chip). */
  show(recipe: Recipe): void;
}
const previewUrl = (file: string) => `${import.meta.env.BASE_URL}recipes/${file}`;
/** A preview is rendered as WebM and MP4 (iPadOS plays H.264 everywhere) plus a still of its last frame. */
export const previewFiles = (preview: string) => { const stem = preview.replace(/\.webm$/, ''); return { webm: `${stem}.webm`, mp4: `${stem}.mp4`, poster: `${stem}.png` }; };

/** One reviewed idea: preview, steps, concept tags and an Insert button. */
export function recipeCard(recipe: Recipe, host: CardHost, options: { compact?: boolean } = {}) {
  const card = document.createElement('article'); card.className = 'recipe-card'; card.dataset.recipe = recipe.id;
  card.classList.toggle('recipe-card-compact', !!options.compact);
  card.setAttribute('aria-labelledby', `recipe-${recipe.id}-title`);
  if (recipe.preview) {
    const files = previewFiles(recipe.preview), video = document.createElement('video');
    video.className = 'recipe-preview'; video.poster = previewUrl(files.poster);
    video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-hidden', 'true');
    for (const [type, file] of [['video/mp4', files.mp4], ['video/webm', files.webm]]) {
      const source = document.createElement('source'); source.type = type; source.src = previewUrl(file); video.append(source);
    }
    // When no format plays, the still frame stands in; without that, nothing.
    const still = () => {
      const image = document.createElement('img'); image.className = 'recipe-preview'; image.alt = ''; image.src = previewUrl(files.poster);
      image.addEventListener('error', () => image.remove(), { once: true }); video.replaceWith(image);
    };
    video.lastElementChild!.addEventListener('error', still, { once: true }); // the last source failing means none played
    video.addEventListener('error', still, { once: true });
    card.append(video);
  }
  const body = document.createElement('div'); body.className = 'recipe-body';
  const title = document.createElement('h3'); title.id = `recipe-${recipe.id}-title`; title.textContent = recipe.title;
  const tags = document.createElement('p'); tags.className = 'recipe-tags';
  for (const concept of recipe.concepts) { const tag = document.createElement('span'); tag.textContent = concepts[concept][0]; tags.append(tag); }
  if (!atLeast(host.level(), recipe.level)) { const tag = document.createElement('span'); tag.className = 'recipe-level'; tag.textContent = `${levelNames[recipe.level]} level`; tags.append(tag); }
  body.append(title, tags);
  if (!options.compact) {
    const steps = document.createElement('ol'); steps.className = 'recipe-steps';
    for (const step of recipe.steps) { const item = document.createElement('li'); item.textContent = step.say; steps.append(item); }
    body.append(steps);
  }
  const actions = document.createElement('div'); actions.className = 'recipe-actions';
  const status = document.createElement('p'); status.className = 'recipe-status'; status.setAttribute('role', 'status');
  let target: HTMLSelectElement | undefined;
  if (recipe.blocks && usesOther(recipe)) {
    // Ideas about two sprites say which is which; the selected sprite acts on the target.
    const others = host.sprites().filter(s => s.id !== host.selected());
    const actor = host.sprites().find(s => s.id === host.selected())?.name;
    if (others.length) {
      const label = document.createElement('label'); label.className = 'recipe-target';
      target = document.createElement('select'); target.setAttribute('aria-label', `Other sprite for ${recipe.title}`);
      target.append(...others.map(s => new Option(s.name, s.id)));
      if (others.some(s => s.id === host.target())) target.value = host.target()!;
      label.append(`${actor ?? 'Selected sprite'} with `, target);
      actions.append(label);
    }
  }
  if (recipe.blocks) {
    const insert = document.createElement('button'); insert.className = 'button primary recipe-insert';
    insert.textContent = atLeast(host.level(), recipe.level) ? 'Insert' : `Switch to ${levelNames[recipe.level]} and insert`;
    insert.setAttribute('aria-label', `${insert.textContent}: ${recipe.title}`);
    insert.addEventListener('click', () => {
      try { status.textContent = host.insert(recipe, target?.value); status.classList.remove('recipe-error'); }
      catch (error) { status.textContent = error instanceof Error ? error.message : String(error); status.classList.add('recipe-error'); }
    });
    actions.append(insert);
  }
  if (options.compact) {
    const more = document.createElement('button'); more.className = 'button secondary'; more.textContent = 'Show steps';
    more.addEventListener('click', () => host.show(recipe)); actions.append(more);
  }
  body.append(actions, status);
  const next = (recipe.tryNext ?? []).map(recipeById).filter((r): r is Recipe => !!r);
  if (next.length && !options.compact) {
    const chips = document.createElement('div'); chips.className = 'idea-chips'; chips.setAttribute('aria-label', 'Try next');
    const label = document.createElement('span'); label.textContent = 'Try next:'; chips.append(label);
    for (const other of next) { const chip = document.createElement('button'); chip.className = 'idea-chip'; chip.textContent = other.title; chip.addEventListener('click', () => host.show(other)); chips.append(chip); }
    body.append(chips);
  }
  card.append(body);
  return card;
}
