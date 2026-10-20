import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

/** Recipe previews and gallery thumbnails are rendered by the browser suite and
 * cached by a hash of everything that affects them. Change the renderer version
 * to re-render every preview. */
export const PREVIEW_RENDERER = 5; // 2: WebM plus MP4 (H.264) and a PNG still of the last frame. 3: rendered on a 2× screen and saved at 480 × 320. 4: the redrawn built-ins and library art. 5: the score, messages and a sound badge recorded too; the poster is the moment of most change.
/** The files one recipe preview consists of, from its `preview` name (`chase.webm`). */
export const previewOutputs = (preview: string) => { const stem = preview.replace(/\.webm$/, ''); return { webm: `public/recipes/${stem}.webm`, mp4: `public/recipes/${stem}.mp4`, poster: `public/recipes/${stem}.png` }; };
export interface RecipeFile { id: string; title: string; blocks?: unknown[]; variables?: string[]; needs?: { sprites?: number; worlds?: number }; demo?: unknown[]; preview?: string; previewScene?: string }
export const recipeFiles = (): RecipeFile[] => readdirSync('content/recipes').filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(`content/recipes/${f}`, 'utf8')));
/** The project a recipe is shown in: its previewScene, a world, the stage with the hero walking
 * into the star when the recipe reacts to touching, or else the stage. */
export function recipeFixture(recipe: RecipeFile) {
  if (recipe.previewScene === 'music') return 'src/scene/sound-example.json';
  if (recipe.previewScene) return `tests/fixtures/recipes/${recipe.previewScene}.json`;
  if (recipe.needs?.worlds) return 'tests/fixtures/recipes/worlds.json';
  return (recipe.blocks as { handler?: { kind: string } }[] | undefined)?.some(b => b.handler?.kind === 'overlap') ? 'tests/fixtures/recipes/touch.json' : 'tests/fixtures/recipes/stage.json';
}
const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
export const recipeKey = (recipe: RecipeFile) => sha(JSON.stringify({ renderer: PREVIEW_RENDERER, blocks: recipe.blocks, variables: recipe.variables, needs: recipe.needs, demo: recipe.demo, fixture: readFileSync(recipeFixture(recipe), 'utf8') }));
export const GALLERY_RENDERER = 2; // 1: a still a second after Run. 2: a three-second loop (WebM and MP4; `loop` may shorten it) with the entry's key presses, its still the frame at 1.5 s.
export interface GalleryFile { id: string; project: string; demo?: unknown[]; loop?: number }
export const galleryKey = (entry: GalleryFile) => sha(JSON.stringify({ renderer: GALLERY_RENDERER, recording: PREVIEW_RENDERER, demo: entry.demo, loop: entry.loop, project: readFileSync(entry.project, 'utf8') }));
/** The files one gallery card's preview consists of. */
export const galleryOutputs = (id: string) => ({ webm: `public/gallery/${id}.webm`, mp4: `public/gallery/${id}.mp4`, poster: `public/gallery/${id}.png` });
export const PREVIEW_MANIFEST = 'public/recipes/manifest.json';
export const GALLERY_MANIFEST = 'public/gallery/manifest.json';
export const readManifest = (path: string): Record<string, string> => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; } };
