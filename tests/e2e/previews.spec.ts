import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GALLERY_MANIFEST, LESSON_MANIFEST, PREVIEW_MANIFEST, galleryKey, galleryOutputs, lessonClipFixture, lessonClipId, lessonClipKey, lessonClipOutputs, lessonClips, previewOutputs, readManifest, recipeFiles, recipeFixture, recipeKey, type GalleryFile, type RecipeFile } from '../preview-key';
import { reveal } from './shell';

/** Recipe previews and gallery thumbnails are rendered here, from fixture
 * projects through the real editor, so they cannot drift from what the blocks
 * do. Each is cached by a hash of its inputs: in CI a stale preview fails, and
 * locally it is re-rendered and written next to the app's public files. */
test.describe.configure({ mode: 'serial' });
// A 2× screen draws the stage at 960 × 640; previews keep the stage's own 480 × 320.
test.use({ deviceScaleFactor: 2 });
const stale = (what: string) => { if (process.env.CI) throw new Error(`${what} is out of date. Run the previews spec locally and commit the result.`); };
const gallery = JSON.parse(readFileSync('content/gallery.json', 'utf8')) as GalleryFile[];

async function stagePoint(page: Page, x: number, y: number) {
  const r = (await page.locator('#stage').boundingBox())!;
  return { x: r.x + (240 + x) / 480 * r.width, y: r.y + (160 - y) / 320 * r.height };
}
/** Record the stage for `ms` (two seconds unless the demo runs longer) as WebM (VP9) and MP4 (H.264, for iPadOS),
 * plus a PNG poster, all returned as base64. Each frame also paints what the
 * page shows over the stage (score, lives, time, the message and the result
 * card) and a sound badge while sounds play, so a recipe whose effect is a
 * score or a sound still shows it. The poster is the frame that differs most
 * from the stage before Run: the moment the recipe's effect shows; or, with
 * `posterAt`, the frame that many milliseconds in (a gallery card's still). */
function record(page: Page, ms = 2000, posterAt?: number) {
  return page.evaluate(async ([ms, posterAt]) => {
    // Copy the stage every frame: a canvas stream only emits frames when it is drawn,
    // and a still scene would otherwise record almost nothing.
    const stage = document.querySelector<HTMLCanvasElement>('#stage')!, copy = document.createElement('canvas');
    copy.width = 480; copy.height = 320; copy.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(copy);
    const context = copy.getContext('2d')!; let frame = 0;
    const box = stage.getBoundingClientRect(), k = 480 / box.width;
    const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: (r.left - box.left) * k, y: (r.top - box.top) * k, w: r.width * k, h: r.height * k }; };
    const shown = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)].filter(el => el.offsetParent !== null && el.textContent);
    const label = (el: HTMLElement, fill: string, ink: string, radius: number, align: CanvasTextAlign = 'left') => {
      const r = rect(el), style = getComputedStyle(el);
      if (fill) { context.fillStyle = fill; context.beginPath(); context.roundRect(r.x, r.y, r.w, r.h, radius * k); context.fill(); }
      context.fillStyle = ink; context.font = `${style.fontWeight} ${parseFloat(style.fontSize) * k}px system-ui, sans-serif`; context.textBaseline = 'middle'; context.textAlign = align;
      context.fillText(el.textContent!.trim(), align === 'center' ? r.x + r.w / 2 : r.x + parseFloat(style.paddingLeft) * k, r.y + r.h / 2, r.w);
    };
    const overlays = () => {
      for (const el of shown('#game-hud .game-counters span, #game-hud #game-message')) label(el, '#203d38ed', '#fffdf1', 6);
      const result = document.querySelector<HTMLElement>('#game-result');
      if (result && !result.hidden) {
        context.fillStyle = '#132c2d8c'; context.fillRect(0, 0, 480, 320);
        const card = rect(result.querySelector('.game-result-card')!);
        context.fillStyle = '#fffdf3'; context.strokeStyle = '#b1c8a0'; context.lineWidth = 2 * k; context.beginPath(); context.roundRect(card.x, card.y, card.w, card.h, 12 * k); context.fill(); context.stroke();
        for (const el of shown('#game-result h3, #game-result p')) label(el, '', '#203d38', 0, 'center');
        for (const el of shown('#game-restart')) label(el, '#267c70', '#ffffff', 8, 'center');
      }
      // A sound badge while the program plays sounds.
      if (Number(document.querySelector<HTMLElement>('#audio-status')?.dataset.voices ?? 0) > 0) {
        context.fillStyle = '#203d38ed'; context.beginPath(); context.roundRect(426, 270, 42, 38, 9); context.fill();
        context.fillStyle = '#fffdf1'; context.beginPath(); context.moveTo(434, 283); context.lineTo(440, 283); context.lineTo(448, 276); context.lineTo(448, 302); context.lineTo(440, 295); context.lineTo(434, 295); context.closePath(); context.fill();
        context.strokeStyle = '#fffdf1'; context.lineWidth = 2.4; context.lineCap = 'round';
        for (const r of [6, 11]) { context.beginPath(); context.arc(449, 289, r, -0.8, 0.8); context.stroke(); }
      }
    };
    // Compare small copies of each frame with the stage before Run (saved by baseline()).
    const small = document.createElement('canvas'); small.width = 48; small.height = 32; const sc = small.getContext('2d', { willReadFrequently: true })!;
    const before = (window as unknown as { previewBaseline?: Uint8ClampedArray }).previewBaseline;
    const poster = document.createElement('canvas'); poster.width = 480; poster.height = 320; let best = -1;
    const began = performance.now(); let posed = false;
    const draw = () => {
      context.drawImage(stage, 0, 0, 480, 320); overlays();
      if (posterAt !== undefined) {
        if (!posed && performance.now() - began >= posterAt) { posed = true; poster.getContext('2d')!.drawImage(copy, 0, 0); }
        frame = requestAnimationFrame(draw); return;
      }
      sc.drawImage(copy, 0, 0, 48, 32); const now = sc.getImageData(0, 0, 48, 32).data;
      let change = 0; if (before) for (let i = 0; i < now.length; i += 4) change += Math.abs(now[i] - before[i]) + Math.abs(now[i + 1] - before[i + 1]) + Math.abs(now[i + 2] - before[i + 2]);
      // Near-ties (within 2%) go to the later frame, so a score that counts up shows its last value,
      // while a speech bubble still outweighs the moment after it is gone.
      if (change >= best * 0.98) { best = Math.max(best, change); poster.getContext('2d')!.drawImage(copy, 0, 0); }
      frame = requestAnimationFrame(draw);
    };
    draw();
    const stream = copy.captureStream(24);
    const start = (mimeType: string) => {
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 350_000 }), chunks: Blob[] = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
      recorder.start();
      return async () => { recorder.stop(); await stopped; return new Blob(chunks); };
    };
    const stops = [start('video/webm;codecs=vp9'), start('video/mp4;codecs=avc1')];
    await new Promise(resolve => setTimeout(resolve, ms));
    const blobs = await Promise.all(stops.map(stop => stop()));
    cancelAnimationFrame(frame); copy.remove();
    const base64 = async (blob: Blob) => { const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
    if (posterAt !== undefined && !posed) poster.getContext('2d')!.drawImage(copy, 0, 0);
    return { webm: await base64(blobs[0]), mp4: await base64(blobs[1]), poster: poster.toDataURL('image/png').split(',')[1] };
  }, [ms, posterAt] as const);
}
/** How long a recipe's demo takes, plus time to see its result: at least 2 s, at most 6 s. */
const demoLength = (recipe: RecipeFile) => Math.min(6000, Math.max(2000, 700 + ((recipe.demo ?? []) as Record<string, number | string>[]).reduce((sum, a) => sum + ('wait' in a ? Number(a.wait) : 'key' in a ? Number(a.ms ?? 80) : 120), 0)));
/** Keep a small copy of the stage before Run, for choosing the poster. */
const baseline = (page: Page) => page.evaluate(() => {
  const small = document.createElement('canvas'); small.width = 48; small.height = 32; const c = small.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(document.querySelector<HTMLCanvasElement>('#stage')!, 0, 0, 48, 32);
  (window as unknown as { previewBaseline?: Uint8ClampedArray }).previewBaseline = c.getImageData(0, 0, 48, 32).data;
});
/** Play a recipe's or gallery entry's demo: key presses, waits and clicks on its sprites. */
async function demo(page: Page, actions: unknown[] | undefined, project: string) {
  const sprites = JSON.parse(readFileSync(project, 'utf8')).workspace.pythonScene.sprites as { x: number; y: number }[];
  await page.locator('#stage').focus();
  for (const action of (actions ?? []) as ({ key: string; ms?: number } | { click: string } | { wait: number })[]) {
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
  await baseline(page);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running|Finished/, { timeout: 60_000 });
  await page.waitForTimeout(300);
  const recording = record(page, demoLength(recipe)); await demo(page, recipe.demo, recipeFixture(recipe));
  const outputs = await recording;
  for (const kind of ['webm', 'mp4', 'poster'] as const) {
    const bytes = Buffer.from(outputs[kind], 'base64');
    expect(bytes.length, `${recipe.id} ${kind}`).toBeGreaterThan(1000);
    writeFileSync(files[kind], bytes);
  }
  writeFileSync(PREVIEW_MANIFEST, JSON.stringify({ ...readManifest(PREVIEW_MANIFEST), [recipe.id]: key }, null, 1) + '\n');
});

// Each gallery card has a three-second loop, played while the card is hovered or on screen on a tablet,
// with its still (the frame at 1.5 s) shown otherwise.
for (const entry of gallery) test(`gallery loop: ${entry.id}`, async ({ page }) => {
  const manifest = readManifest(GALLERY_MANIFEST), key = galleryKey(entry), files = galleryOutputs(entry.id);
  if (manifest[entry.id] === key && Object.values(files).every(file => existsSync(file))) return;
  stale(`The gallery loop for ${entry.id}`);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles(entry.project);
  await baseline(page);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running|Finished|You win!|Game over|Let’s try again/, { timeout: 60_000 });
  // No settling time: Flappy's bird reaches the ground 0.6 s after Run unless it flaps.
  const recording = record(page, (entry.loop ?? 3) * 1000, 1500); await demo(page, entry.demo, entry.project);
  const outputs = await recording;
  for (const kind of ['webm', 'mp4', 'poster'] as const) {
    const bytes = Buffer.from(outputs[kind], 'base64');
    expect(bytes.length, `${entry.id} ${kind}`).toBeGreaterThan(1000);
    writeFileSync(files[kind], bytes);
  }
  writeFileSync(GALLERY_MANIFEST, JSON.stringify({ ...readManifest(GALLERY_MANIFEST), [entry.id]: key }, null, 1) + '\n');
});

// Each lesson step with a clip: its project, built step by step, run with the step's keys; shown on the step's card as "Watch".
for (const clip of lessonClips()) test(`lesson clip: ${lessonClipId(clip)}`, async ({ page }) => {
  const manifest = readManifest(LESSON_MANIFEST), key = lessonClipKey(clip), files = lessonClipOutputs(clip);
  if (manifest[lessonClipId(clip)] === key && Object.values(files).every(file => existsSync(file))) return;
  stale(`The clip for ${lessonClipId(clip)}`);
  await page.goto('/'); await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#project-file').setInputFiles(lessonClipFixture(clip));
  await expect(page.locator('#scene-cards button').first()).toBeVisible();
  await baseline(page);
  await page.locator('#run').click();
  await expect(page.locator('#status')).toHaveText(/Event session running|Finished|You win!|Game over|Let’s try again/, { timeout: 60_000 });
  const recording = record(page, (clip.clip.seconds ?? 3) * 1000); await demo(page, clip.clip.demo, lessonClipFixture(clip));
  const outputs = await recording;
  mkdirSync('public/lessons', { recursive: true });
  for (const kind of ['webm', 'mp4', 'poster'] as const) {
    const bytes = Buffer.from(outputs[kind], 'base64');
    expect(bytes.length, `${lessonClipId(clip)} ${kind}`).toBeGreaterThan(1000);
    writeFileSync(files[kind], bytes);
  }
  writeFileSync(LESSON_MANIFEST, JSON.stringify({ ...readManifest(LESSON_MANIFEST), [lessonClipId(clip)]: key }, null, 1) + '\n');
});
