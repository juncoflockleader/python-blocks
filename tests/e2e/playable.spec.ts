import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { strFromU8 } from 'fflate';
import { exported, isolated, key, openProject, run } from './playable-support';

test('an exported input game runs offline on its own server, asks, watches, wins by touch and replays', async ({page,browser},info) => {
  const project = JSON.parse(await readFile('src/scene/input-example.json','utf8'));
  project.workspace.pythonScene.watchers = [{id:'player-x',sprite:'player',property:'x'}];
  await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'input.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  const files = await exported(page), saved = JSON.parse(strFromU8(files['project.python-blocks.json']));
  expect(saved.workspace.pythonScene).toEqual(project.workspace.pythonScene);
  expect(JSON.parse(strFromU8(files['scene.json']))).toEqual(project.workspace.pythonScene);
  expect(strFromU8(files['program.py'])).toBe(await page.locator('#python').textContent());
  expect(files['pyodide/pyodide.asm.wasm'].length).toBeGreaterThan(9_000_000);
  expect(strFromU8(files['licenses/pyodide-MPL-2.0.txt'])).toContain('Mozilla Public License Version 2.0');
  const play = await isolated(browser,files,info,true);
  try {
    await play.page.setViewportSize({width:390,height:844}); await play.page.goto(play.url); await expect(play.page.locator('#status')).toHaveText('Ready');
    await run(play.page); await expect(play.page.locator('#question-answer')).toBeFocused();
    await play.page.locator('#question-answer').fill('Ada'); await play.page.locator('#question-answer').press('Enter');
    await expect(play.page.locator('#game-message')).toContainText('Ada');
    const initial = await play.page.locator('[data-watch-id="player-x"]').textContent();
    await play.page.locator('#touch-toggle').click(); await play.page.locator('[data-control="ArrowRight"]').scrollIntoViewIfNeeded();
    const box = (await play.page.locator('[data-control="ArrowRight"]').boundingBox())!;
    const cdp = await play.page.context().newCDPSession(play.page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}]});
    await expect(play.page.locator('#game-result-title')).toHaveText('You win!',{timeout:6000});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect(await play.page.locator('[data-watch-id="player-x"]').textContent()).not.toBe(initial);
    await expect(play.page.locator('#question-form')).toBeHidden();
    expect(await play.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await play.page.screenshot({path:info.outputPath('portable-input-win.png'),fullPage:true});
    await play.page.locator('#game-restart').click(); await expect(play.page.locator('#question-answer')).toHaveValue('',{timeout:60_000});
    await expect(play.page.locator('#question-form')).toBeVisible(); await play.page.locator('#stop').click(); await expect(play.page.locator('#question-form')).toBeHidden();
    await play.page.reload(); await run(play.page); await expect(play.page.locator('#question-form')).toBeVisible();
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
  // The captured editable project still reopens through the normal migration/validation path.
  await page.locator('#example').click(); await page.locator('#project-file').setInputFiles({name:'captured.json',mimeType:'application/json',buffer:Buffer.from(files['project.python-blocks.json'])});
  await expect(page.locator('#watch-values')).toContainText(project.workspace.pythonScene.sprites[0].name + ' · x');
});

test('portable worlds scroll, open a solid tile gate and change scenes with authored assets', async ({page,browser},info) => {
  await openProject(page,'src/scene/world-example.json'); const play = await isolated(browser,await exported(page),info);
  try {
    await play.page.goto(play.url); await run(play.page); await expect(play.page.locator('#stage')).toHaveAttribute('data-world','meadow');
    await play.page.locator('#stage').focus(); await play.page.keyboard.down('ArrowRight');
    await expect(play.page.locator('#output')).toContainText('Gate opened!',{timeout:5000});
    await expect.poll(async () => Number(await play.page.locator('#stage').getAttribute('data-camera-x'))).toBeGreaterThan(250);
    await expect(play.page.locator('#stage')).toHaveAttribute('data-world','cavern',{timeout:8000});
    await expect(play.page.locator('#output')).toContainText('Journey complete!',{timeout:5000}); await play.page.keyboard.up('ArrowRight');
    await expect(play.page.locator('#stage-dialogue')).toContainText('Both worlds explored!');
    await play.page.screenshot({path:info.outputPath('portable-worlds.png'),fullPage:true});
    await play.page.locator('#stop').click(); await run(play.page); await expect(play.page.locator('#stage')).toHaveAttribute('data-world','meadow');
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('portable drawing preserves pen trails and stamps and clears them from keyboard input', async ({page,browser},info) => {
  await openProject(page,'src/scene/drawing-example.json'); const play = await isolated(browser,await exported(page),info);
  try {
    await play.page.goto(play.url); await run(play.page);
    await expect.poll(async () => Number(await play.page.locator('#stage').getAttribute('data-ink-count'))).toBeGreaterThan(490);
    await play.page.screenshot({path:info.outputPath('portable-drawing.png'),fullPage:true});
    await expect(play.page.locator('#stage')).toHaveAttribute('data-ink-count','501');
    const inkPixels = () => play.page.locator('#stage').evaluate(c => { const data = (c as HTMLCanvasElement).getContext('2d')!.getImageData(0,0,220,320).data; let colored = 0; for (let i=0;i<data.length;i+=4) if (data[i]<190 || data[i+1]<190 || data[i+2]<190) colored++; return colored; });
    expect(await inkPixels()).toBeGreaterThan(1000);
    await key(play.page,'Space'); await expect.poll(inkPixels).toBe(0);
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('portable storytelling animates saved frames and switches captured backdrops', async ({page,browser},info) => {
  const project = JSON.parse(await readFile('src/scene/story-example.json','utf8'));
  project.workspace.pythonScene.watchers = [{id:'costume',sprite:'player',property:'costume'}];
  await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'story.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  const play = await isolated(browser,await exported(page),info);
  try {
    await play.page.goto(play.url); await run(play.page);
    await expect(play.page.locator('#stage')).toHaveAttribute('data-backdrop','backdrop_meadow');
    const first = await play.page.locator('[data-watch-id="costume"]').textContent();
    await expect(play.page.locator('[data-watch-id="costume"]')).not.toHaveText(first!);
    await key(play.page,'Space'); await expect(play.page.locator('#stage-dialogue')).toContainText('Friend thinks: Night');
    await expect(play.page.locator('#stage')).toHaveAttribute('data-backdrop','backdrop_night');
    await play.page.screenshot({path:info.outputPath('portable-story.png'),fullPage:true});
    await play.page.locator('#stop').click(); await run(play.page);
    await expect(play.page.locator('#stage')).toHaveAttribute('data-backdrop','backdrop_meadow');
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('portable music produces real audio, overlaps, mutes and releases every voice on Stop', async ({page,browser},info) => {
  await openProject(page,'src/scene/sound-example.json'); const play = await isolated(browser,await exported(page),info);
  try {
    await play.page.addInitScript(() => {
      const state = window as any; state.monitors = []; const Native = window.AudioContext;
      window.AudioContext = class extends Native {
        private tapped = false;
        override createGain() { const gain = super.createGain(); if (!this.tapped) { this.tapped = true; const analyser = super.createAnalyser(); analyser.fftSize = 2048; gain.connect(analyser); state.monitors.push(analyser); } return gain; }
      };
    });
    const rms = () => play.page.evaluate(() => Math.max(0,...(window as any).monitors.map((a: AnalyserNode) => { const data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data); return Math.sqrt(data.reduce((s,x) => s+x*x,0)/data.length); })));
    await play.page.goto(play.url); await run(play.page); await expect.poll(rms).toBeGreaterThan(.001);
    await key(play.page,'Space'); await expect(play.page.locator('#audio-status')).toHaveAttribute('data-voices','2');
    await play.page.locator('#audio-mute').click(); await expect.poll(rms).toBeLessThan(.0001);
    await play.page.locator('#audio-mute').click(); await expect.poll(rms).toBeGreaterThan(.001);
    await play.page.screenshot({path:info.outputPath('portable-music.png'),fullPage:true});
    await play.page.locator('#stop').click(); await expect(play.page.locator('#audio-status')).toHaveAttribute('data-voices','0'); await expect.poll(rms).toBeLessThan(.0001);
    await run(play.page); await expect.poll(rms).toBeGreaterThan(.001);
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('portable exports carry transitive modules and show their original traceback on error', async ({page,browser},info) => {
  await openProject(page,'tests/fixtures/modules/transitive-consumer.json'); const files = await exported(page);
  expect(Object.keys(files).filter(n => /^_pb_module_/.test(n))).toHaveLength(2);
  const play = await isolated(browser,files,info,true);
  try {
    await play.page.goto(play.url); await run(play.page,false); await expect(play.page.locator('#output')).toHaveText('7\n');
    await run(play.page,false); await expect(play.page.locator('#output')).toHaveText('7\n');
    await writeFile(join(play.folder,'program.py'),'1 / 0\n'); await play.page.reload(); await play.page.locator('#run').click();
    await expect(play.page.locator('#output')).toContainText('ZeroDivisionError',{timeout:60_000}); await expect(play.page.locator('#traceback')).toContainText('program.py');
    await expect(play.page.locator('#run')).toBeEnabled(); expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});

test('export capture survives later edits; cancellation and damaged runtime files recover without losing work', async ({page}) => {
  await openProject(page,'src/scene/story-example.json');
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/player/bundle.json',async route => { await held; await route.continue(); });
  const pending = exported(page); await expect(page.locator('#export-cancel')).toBeVisible();
  await page.locator('#example').click(); release(); const files = await pending;
  const captured = JSON.parse(strFromU8(files['project.python-blocks.json'])); expect(captured.workspace.pythonScene.sprites.length).toBeGreaterThan(0);
  expect(strFromU8(files['program.py'])).not.toBe(await page.locator('#python').textContent());
  await page.unroute('**/player/bundle.json');
  let cancelRelease!: () => void; const cancelled = new Promise<void>(resolve => { cancelRelease = resolve; });
  await page.route('**/player/bundle.json',async route => { await cancelled; await route.continue().catch(() => {}); });
  const before = await page.locator('#python').textContent(); await page.locator('#export-playable').click(); await page.locator('#export-cancel').click();
  await expect(page.locator('#export-state')).toHaveText('Export cancelled.'); await expect(page.locator('#export-playable')).toBeEnabled(); cancelRelease(); await page.unroute('**/player/bundle.json');
  await page.route('**/player/pyodide/pyodide.mjs',route => route.fulfill({status:200,body:'broken'}));
  await page.locator('#export-playable').click(); await expect(page.locator('#export-state')).toContainText('changed or is incomplete');
  await expect(page.locator('#export-playable')).toBeEnabled(); expect(await page.locator('#python').textContent()).toBe(before);
  await page.unroute('**/player/pyodide/pyodide.mjs'); await exported(page); await expect(page.locator('#export-state')).toContainText('Playable ZIP saved');
});

test('missing player data presents recovery instructions without enabling Run', async ({page,browser},info) => {
  await page.goto('/'); const files = await exported(page); delete files['program.py']; const play = await isolated(browser,files,info);
  try { await play.page.goto(play.url); await expect(play.page.locator('#status')).toHaveText('Project could not load'); await expect(play.page.locator('#output')).toContainText('404'); await expect(play.page.locator('#run')).toBeDisabled(); expect(play.errors).toEqual([]); }
  finally { await play.close(); }
});

test('the portable watchdog stops a blocked event loop and a fresh run recovers', async ({page,browser},info) => {
  await page.goto('/'); const files = await exported(page);
  files['player.json'] = new TextEncoder().encode(JSON.stringify({format:'python-blocks-playable',version:1,executionMode:'events',requiresSound:false,scene:false,modules:[]}));
  files['program.py'] = new TextEncoder().encode('from playground import events\nasync def blocked(payload):\n    while True: pass\nevents.on("start", blocked)\n');
  const play = await isolated(browser,files,info);
  try {
    await play.page.goto(play.url); await play.page.locator('#run').click();
    await expect(play.page.locator('#output')).toContainText('stopped responding',{timeout:15_000});
    await expect(play.page.locator('#run')).toBeEnabled(); await expect(play.page.locator('#stop')).toBeDisabled();
    await writeFile(join(play.folder,'program.py'),'from playground import events\nasync def start(payload):\n    print("fresh worker")\nevents.on("start", start)\n');
    await play.page.reload(); await run(play.page); await expect(play.page.locator('#output')).toHaveText('fresh worker\n');
    await play.page.locator('#stop').click(); await expect(play.page.locator('#status')).toHaveText('Stopped');
    expect(play.blocked).toEqual([]); expect(play.errors).toEqual([]);
  } finally { await play.close(); }
});
