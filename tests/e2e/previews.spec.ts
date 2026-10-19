import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GALLERY_MANIFEST, PREVIEW_MANIFEST, galleryKey, previewOutputs, readManifest, recipeFiles, recipeFixture, recipeKey, type RecipeFile } from '../preview-key';
import { reveal } from './shell';

/** Recipe previews and gallery thumbnails are rendered here, from fixture
 * projects through the real editor, so they cannot drift from what the blocks
 * do. Each is cached by a hash of its inputs: in CI a stale preview fails, and
 * locally it is re-rendered and written next to the app's public files. */
test.describe.configure({ mode: 'serial' });
// A 2× screen draws the stage at 960 × 640; previews keep the stage's own 480 × 320.
test.use({ deviceScaleFactor: 2 });
const stale = (what: string) => { if (process.env.CI) throw new Error(`${what} is out of date. Run the previews spec locally and commit the result.`); };
const gallery = JSON.parse(readFileSync('content/gallery.json', 'utf8')) as { id: string; project: string }[];

async function stagePoint(page: Page, x: number, y: number) {
  const r = (await page.locator('#stage').boundingBox())!;
  return { x: r.x + (240 + x) / 480 * r.width, y: r.y + (160 - y) / 320 * r.height };
}
/** Record the stage canvas for two seconds as WebM (VP9) and MP4 (H.264, for iPadOS),
 * plus a PNG still of the last frame, all returned as base64. */
function record(page: Page) {
  return page.evaluate(async () => {
    // Copy the stage every frame: a canvas stream only emits frames when it is drawn,
    // and a still scene would otherwise record almost nothing.
    const stage = document.querySelector<HTMLCanvasElement>('#stage')!, copy = document.createElement('canvas');
    copy.width = 480; copy.height = 320; copy.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(copy);
    const context = copy.getContext('2d')!; let frame = 0;
    const draw = () => { context.drawImage(stage, 0, 0, 480, 320); frame = requestAnimationFrame(draw); }; draw();
    const stream = copy.captureStream(24);
    const start = (mimeType: string) => {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 350_000 }), chunks: Blob[] = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      recorder.start();
      return async () => { recorder.stop(); await stopped; return new Blob(chunks); };
    };
    const stops = [start('video/webm;codecs=vp9'), start('video/mp4;codecs=avc1')];
    await new Promise(resolve => setTimeout(resolve, 2000));
    const blobs = await Promise.all(stops.map(stop => stop()));
    const still = document.createElement('canvas'); still.width = 480; still.height = 320; still.getContext('2d')!.drawImage(stage, 0, 0, 480, 320);
    cancelAnimationFrame(frame); copy.remove();
    const base64 = async (blob: Blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
    return { webm: await base64(blobs[0]), mp4: await base64(blobs[1]), poster: still.toDataURL('image/png').split(',')[1] };
  });
}
async function demo(page: Page, recipe: RecipeFile) {
  const sprites = JSON.parse(readFileSync(recipeFixture(recipe), 'utf8')).workspace.pythonScene.sprites as { x: number; y: number }[];
  await page.locator('#stage').focus();
  for (const action of (recipe.demo ?? []) as ({ key: string; ms?: number } | { click: string } | { wait: number })[]) {
    if ('wait' in action) await page.waitForTimeout(action.wait);
    else if ('key' in action) { await page.keyboard.down(action.key); await page.waitForTimeout(action.ms ?? 80); await page.keyboard.up(action.key); }
    else { const sprite = sprites[action.click === '$other' ? 1 : 0]; const point = await stagePoint(page, sprite.x, sprite.y); await page.mouse.click(point.x, point.y); await page.waitForTimeout(120); }
  }
}

for (const recipe of recipeFiles().filter(r => r.blocks)) test(`recipe preview: ${recipe.id}`, async ({ page }) => {
  const manifest = readManifest(PREVIEW_MANIFEST), key = recipeKey(recipe), files = previewOutputs(recipe.preview!);
  if (manifest[recipe.id] === key && Object.values(files).every(file => existsSync(file))) return;
  stale(`The preview for ${recipe.id}`);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles(recipeFixture(recipe));
  await expect(page.locator('#scene-cards button').first()).toBeVisible();
  await (await reveal(page, '#ideas-input')).fill(recipe.title); await page.locator('#ideas-find').click();
  await page.locator(`#ideas-results [data-recipe="${recipe.id}"] .recipe-insert`).click();
  await expect(page.locator(`#ideas-results [data-recipe="${recipe.id}"] .recipe-status`)).toContainText('Added');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running|Finished/, { timeout: 60_000 });
  await page.waitForTimeout(300);
  const recording = record(page); await demo(page, recipe);
  const outputs = await recording;
  for (const kind of ['webm', 'mp4', 'poster'] as const) {
    const bytes = Buffer.from(outputs[kind], 'base64');
    expect(bytes.length, `${recipe.id} ${kind}`).toBeGreaterThan(1000);
    writeFileSync(files[kind], bytes);
  }
  writeFileSync(PREVIEW_MANIFEST, JSON.stringify({ ...readManifest(PREVIEW_MANIFEST), [recipe.id]: key }, null, 1) + '\n');
});

for (const entry of gallery) test(`gallery thumbnail: ${entry.id}`, async ({ page }) => {
  const manifest = readManifest(GALLERY_MANIFEST), key = galleryKey(entry.project), file = `public/gallery/${entry.id}.png`;
  if (manifest[entry.id] === key && existsSync(file)) return;
  stale(`The gallery thumbnail for ${entry.id}`);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles(entry.project);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running|Finished|You win!|Game over|Let’s try again/, { timeout: 60_000 });
  await page.waitForTimeout(1200);
  const data = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#stage')!, small = document.createElement('canvas');
    small.width = 480; small.height = 320; small.getContext('2d')!.drawImage(source, 0, 0, 480, 320);
    return small.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(file, Buffer.from(data, 'base64'));
  writeFileSync(GALLERY_MANIFEST, JSON.stringify({ ...readManifest(GALLERY_MANIFEST), [entry.id]: key }, null, 1) + '\n');
});
