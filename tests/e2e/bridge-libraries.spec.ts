import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import type { ConvertedPython } from '../../src/bridge/converter';
import type { Project } from '../../src/project';
import { buildConverterHarness, prepare, convert, install } from './bridge-support';

test.beforeAll(buildConverterHarness);
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const messages: string[] = []; errors.set(page, messages); page.on('pageerror', error => messages.push(error.message)); });
test.afterEach(async ({ page }) => { await page.evaluate(() => (window as any).testBridge?.dispose()); expect(errors.get(page)).toEqual([]); });
const saved = (page: Page): Promise<Project> => page.evaluate(() => JSON.parse(localStorage.getItem('python-blocks.project.v1')!));
async function edited(page: Page, name: string, edit: (source: string) => string) {
  await prepare(page);
  await page.locator('#project-file').setInputFiles(`src/scene/${name}.json`);
  await expect(page.locator('#run')).toBeEnabled();
  const base = await saved(page), source = (await page.locator('#python').textContent())!, changed = edit(source);
  expect(changed).not.toBe(source);
  const result = await convert(page, changed, { project: base });
  expect(result.project.workspace.pythonScene).toEqual(base.workspace.pythonScene);
  await install(page, result);
  await expect(page.locator('#diagnostics-panel')).toBeHidden();
  return result;
}
async function exported(page: Page, result: ConvertedPython) {
  const download = page.waitForEvent('download'); await page.locator('#export').click();
  const files = unzipSync(readFileSync((await (await download).path())!));
  expect(strFromU8(files['program.py'])).toBe(result.compilation.source);
  expect(JSON.parse(strFromU8(files['scene.json']))).toEqual(result.project.workspace.pythonScene);
  expect((await saved(page)).workspace.pythonScene).toEqual(result.project.workspace.pythonScene);
}
async function run(page: Page) { await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running', { timeout: 60_000 }); }
async function key(page: Page, value: string) { await page.locator('#stage').focus(); await page.keyboard.press(value); }
async function x(page: Page) { return Number((await page.locator('#scene-live').textContent())!.match(/x (-?[\d.]+)/)![1]); }

test('edited sprite movement renders real blocks, keeps arrow handlers and exports the original scene', async ({ page }) => {
  const result = await edited(page, 'example', source => source.replace('.x) + (20)', '.x) + (35)'));
  await run(page); await key(page, 'ArrowRight'); await expect.poll(() => x(page)).toBe(-65);
  await key(page, 'ArrowLeft'); await expect.poll(() => x(page)).toBe(-85);
  await page.locator('#stop').click(); await run(page); await expect.poll(() => x(page)).toBe(-100);
  await exported(page, result);
});

test('edited story keeps awaited frames, dialogue and backdrop event handlers', async ({ page }, info) => {
  const result = await edited(page, 'story-example', source => source.replace('Press Space to change the backdrop.', 'My edited story: press Space.'));
  await run(page); await expect(page.locator('#stage-dialogue')).toContainText('My edited story: press Space.');
  await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_meadow');
  await key(page, 'Space'); await expect(page.locator('#stage')).toHaveAttribute('data-backdrop', 'backdrop_night');
  await expect(page.locator('#stage-dialogue')).toContainText('Friend thinks: Night');
  await page.screenshot({ path: info.outputPath('converted-story.png'), fullPage: true });
  await exported(page, result);
});

test('edited drawing keeps independent pens, stamps and event erasure', async ({ page }) => {
  const result = await edited(page, 'drawing-example', source => source.replace('range(18)', 'range(19)'));
  await run(page); await expect(page.locator('#scene-live')).toContainText('hidden');
  await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-ink-count')), { timeout: 8000 }).toBeGreaterThan(500);
  // Ink count is a cumulative work budget, not the number of visible marks.
  // Inspect the hidden flower sprite's green trail in the rendered stage.
  const greenPixels = () => page.locator('#stage').evaluate(canvas => {
    const data = (canvas as HTMLCanvasElement).getContext('2d')!.getImageData(10, 10, 220, 300).data;
    let count = 0; for (let i = 0; i < data.length; i += 4) if (data[i + 1] > data[i] * 1.3 && data[i + 1] > data[i + 2]) count++;
    return count;
  });
  await expect.poll(greenPixels).toBeGreaterThan(100);
  await key(page, 'Space'); await expect.poll(greenPixels).toBe(0);
  await exported(page, result);
});

test('edited instance behavior keeps clone ownership, data and click cancellation', async ({ page }) => {
  const result = await edited(page, 'behavior-example', source => source.replace('.data["speed"] = 3', '.data["speed"] = 0'));
  await run(page); await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '3');
  await page.locator('#stage').scrollIntoViewIfNeeded();
  const bounds = (await page.locator('#stage').boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.mouse.move(point.x, point.y); await key(page, 'Space');
  await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '4');
  await page.mouse.click(point.x, point.y); await expect(page.locator('#stage')).toHaveAttribute('data-sprite-count', '3');
  await expect(page.locator('#status')).toHaveText('Event session running');
  await exported(page, result);
});

test('edited platformer runs kind handlers, projectile collision and motion bootstrap', async ({ page }) => {
  const result = await edited(page, 'game-example', source => source.replace('Target hit!', 'Python hit the target!'));
  await run(page); await key(page, 'f'); await expect(page.locator('#output')).toContainText('Python hit the target!');
  const before = await x(page); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight');
  await expect.poll(() => x(page)).toBeGreaterThan(before + 30); await page.keyboard.up('ArrowRight');
  await page.locator('#stop').click(); await run(page); await expect(page.locator('#output')).not.toContainText('Python hit the target!');
  await key(page, 'f'); await expect(page.locator('#output')).toContainText('Python hit the target!');
  await exported(page, result);
});

test('edited world adventure opens tiles, scrolls, switches worlds and exports the authored maps', async ({ page }) => {
  const result = await edited(page, 'world-example', source => source.replace('Gate opened!', 'Python opened the gate!').replace('Journey complete!', 'Python journey complete!'));
  await run(page); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight');
  await expect(page.locator('#output')).toContainText('Python opened the gate!', { timeout: 5000 });
  await expect.poll(async () => Number(await page.locator('#stage').getAttribute('data-camera-x'))).toBeGreaterThan(250);
  await expect(page.locator('#stage')).toHaveAttribute('data-world', 'cavern', { timeout: 8000 });
  await expect(page.locator('#output')).toContainText('Python journey complete!', { timeout: 5000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#stage-dialogue')).toContainText('Both worlds explored!');
  await exported(page, result);
});

test('edited music emits actual audio and keeps await, owner effects and Stop', async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext; (window as any).bridgeAudio = []; (window as any).bridgeGains = [];
    window.AudioContext = class extends Native {
      private tapped = false;
      override createGain() {
        const gain = super.createGain();
        (window as any).bridgeGains.push(gain);
        if (!this.tapped) { this.tapped = true; const analyser = super.createAnalyser(); gain.connect(analyser); (window as any).bridgeAudio.push(analyser); }
        return gain;
      }
    };
  });
  const rms = () => page.evaluate(() => Math.max(0, ...(window as any).bridgeAudio.map((analyser: AnalyserNode) => {
    const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
    return Math.sqrt(values.reduce((total, value) => total + value * value, 0) / values.length);
  })));
  const result = await edited(page, 'sound-example', source => source.replace('.note(84, 1,', '.note(72, 8,').replace('Your turn!', 'Your Python melody!'));
  expect(result.compilation.source).toContain('.note(72, 8,');
  await run(page); await expect.poll(rms).toBeGreaterThan(.001);
  await key(page, 'Space'); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices', '2');
  await page.evaluate(() => { (window as any).bridgeBirdGain = (window as any).bridgeGains.at(-1); });
  const birdVolume = () => page.evaluate(() => (window as any).bridgeBirdGain.gain.value as number);
  // M/U affect only the bird's chime. The stage-owned song keeps playing.
  await key(page, 'm'); await expect.poll(birdVolume).toBeLessThan(.0001); await expect.poll(rms).toBeGreaterThan(.001);
  await key(page, 'u'); await expect.poll(birdVolume).toBeGreaterThan(.99);
  await expect(page.locator('#stage-dialogue')).toContainText('Your Python melody!', { timeout: 10_000 });
  await page.locator('#stop').click(); await expect(page.locator('#audio-status')).toHaveAttribute('data-voices', '0');
  await exported(page, result);
});

test('edited question and color game keeps answer focus, timers and generated text joins', async ({ page }) => {
  const result = await edited(page, 'input-example', source => source.replace('What is your explorer name?', 'Who is exploring in Python?').replace('You found red in ', 'Python found red in '));
  await run(page); await expect(page.locator('#question-text')).toHaveText('Who is exploring in Python?');
  await expect(page.locator('#question-answer')).toBeFocused(); await page.locator('#question-answer').fill('Ada'); await page.keyboard.press('Enter');
  await expect(page.locator('#game-message')).toContainText('Ada'); await page.locator('#stage').focus(); await page.keyboard.down('ArrowRight');
  await expect(page.locator('#game-result-message')).toContainText('Python found red in ', { timeout: 8000 }); await page.keyboard.up('ArrowRight');
  await expect(page.locator('#status')).toHaveText('You win!');
  await exported(page, result);
});
