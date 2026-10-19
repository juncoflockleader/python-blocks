import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

/** Recipe previews and gallery thumbnails are rendered by the browser suite and
 * cached by a hash of everything that affects them. Change the renderer version
 * to re-render every preview. */
export const PREVIEW_RENDERER = 3; // 2: WebM plus MP4 (H.264) and a PNG still of the last frame. 3: rendered on a 2× screen and saved at 480 × 320.
/** The files one recipe preview consists of, from its `preview` name (`chase.webm`). */
export const previewOutputs = (preview: string) => { const stem = preview.replace(/\.webm$/, ''); return { webm: `public/recipes/${stem}.webm`, mp4: `public/recipes/${stem}.mp4`, poster: `public/recipes/${stem}.png` }; };
export interface RecipeFile { id: string; title: string; blocks?: unknown[]; variables?: string[]; needs?: { sprites?: number; worlds?: number }; demo?: unknown[]; preview?: string }
export const recipeFiles = (): RecipeFile[] => readdirSync('content/recipes').filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(`content/recipes/${f}`, 'utf8')));
export const recipeFixture = (recipe: RecipeFile) => recipe.needs?.worlds ? 'tests/fixtures/recipes/worlds.json' : 'tests/fixtures/recipes/stage.json';
const sha = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
export const recipeKey = (recipe: RecipeFile) => sha(JSON.stringify({ renderer: PREVIEW_RENDERER, blocks: recipe.blocks, variables: recipe.variables, needs: recipe.needs, demo: recipe.demo, fixture: readFileSync(recipeFixture(recipe), 'utf8') }));
export const galleryKey = (project: string) => sha(JSON.stringify({ renderer: PREVIEW_RENDERER, project: readFileSync(project, 'utf8') }));
export const PREVIEW_MANIFEST = 'public/recipes/manifest.json';
export const GALLERY_MANIFEST = 'public/gallery/manifest.json';
export const readManifest = (path: string): Record<string, string> => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; } };
