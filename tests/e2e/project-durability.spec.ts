import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeWave } from '../../src/scene/sound';

test('a near-limit project with sounds and full maps saves a file it can reopen', async ({page}) => {
  const project = JSON.parse(readFileSync('tests/fixtures/scene/sequential.json','utf8'));
  const scene = project.workspace.pythonScene;
  const wav = encodeWave(new Float32Array(22_050 * 60));
  scene.sounds = Array.from({length:3},(_,i) => ({id:'clip'+i,name:'Clip '+i,kind:'clip',data:wav}));
  scene.worlds = Array.from({length:8},(_,i) => ({id:'world'+i,name:'World '+i,background:'#ffffff',camera:{x:0,y:0,clamp:true},map:{columns:64,rows:64,tileSize:16,tiles:Array(4096).fill(null),walls:Array(4096).fill(false)}}));
  scene.world = 'world0';
  // Inactive text is legitimate editable project content and creates no long-running Python.
  const draft = {type:'text',id:'long-draft',fields:{TEXT:''},x:700,y:50}; project.workspace.blocks.blocks.push(draft);
  draft.fields.TEXT = '.'.repeat(15_850_000-Buffer.byteLength(JSON.stringify(project)));
  const bytes = Buffer.from(JSON.stringify(project)); expect(bytes.length).toBeLessThan(16_000_000);
  expect(Buffer.byteLength(JSON.stringify(project,null,2))).toBeGreaterThan(16_000_000);
  await page.goto('/'); await page.locator('#project-file').setInputFiles({name:'large.json',mimeType:'application/json',buffer:bytes});
  await expect(page.locator('#scene-selection')).toHaveValue('player'); await expect(page.locator('#save-state')).not.toContainText('could not');
  const pending = page.waitForEvent('download'); await page.locator('#save').click(); const download = await pending;
  const chunks: Buffer[] = []; for await (const chunk of (await download.createReadStream())!) chunks.push(Buffer.from(chunk));
  const saved = Buffer.concat(chunks); expect(saved.length).toBeLessThanOrEqual(16_000_000);
  const captured = JSON.parse(saved.toString()); expect(captured.workspace.pythonScene).toEqual(scene);
  expect(captured.workspace.blocks.blocks.find((b: any) => b.id === 'long-draft').fields.TEXT).toBe(draft.fields.TEXT);
  await page.locator('#example').click();
  await page.locator('#project-file').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:saved});
  await expect(page.locator('#scene-selection')).toHaveValue('player'); await expect(page.locator('#save-state')).not.toContainText('unchanged');
  await page.locator('#run').click(); await expect(page.locator('#status')).toHaveText('Event session running',{timeout:60_000});
  await expect(page.locator('#output')).toHaveText('-80\n');
  await page.locator('#stop').click(); await expect(page.locator('#status')).toHaveText('Stopped');
});
