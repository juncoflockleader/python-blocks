import { defaultControls } from './touch';
import { PlayInput } from './play-input';
import { installSceneNavigation } from './navigation';
import { installWatchers } from './watchers';
import { includeStock, stockArtwork } from './stock-art';
import { includeWorldTemplate } from './world-templates';
import { installStockLibrary } from './stock-library';
import { keys } from './model';
import { installWorldEditor } from './world-editor';
import { installMotionEditor } from './motion-editor';
import { installDataEditor } from './data-editor';
import { installArtEditor } from './art-editor';
import { installAppearanceEditor } from './appearance-editor';
import * as Blockly from 'blockly/core';
import { installScenePalette } from './palette';
import { Stage } from '../stage';
import { backdrops, builtins, costumes, spriteFrames, type SceneInput, type RotationStyle } from './model';
import { changeScene, sceneState } from './state';

export function installSceneEditor(workspace: Blockly.WorkspaceSvg, stage: Stage, input: (value: SceneInput) => boolean, example: () => void, motionExample: () => void, storyExample: () => void, drawingExample: () => void, behaviorExample: () => void, gameExample: () => void, worldExample: () => void) {
  document.querySelector('.stage-caption')!.insertAdjacentHTML('afterend', `<section class="scene-editor" aria-label="Scene editor">
    <p id="stage-dialogue" class="stage-dialogue" role="status" aria-live="polite"></p>
    <div class="scene-toolbar"><strong>Starting scene</strong><button id="scene-example" class="button secondary">Sprite example</button><button id="scene-motion-example" class="button secondary">Motion example</button><button id="scene-story-example" class="button secondary">Story example</button><button id="scene-reset" class="button secondary">Reset stage</button><button id="scene-events" class="button secondary">Input events</button></div>
    <p id="scene-mode">Place sprites here before running. Drag on the stage or edit their properties.</p>
    <div class="scene-toolbar"><label>Sprite <select id="scene-selection"></select></label><button id="scene-stock" class="button secondary">Sprite library</button><button id="scene-add" class="button secondary">Add sprite</button><button id="scene-copy" class="button secondary">Duplicate sprite</button><button id="scene-delete" class="button secondary">Delete sprite</button></div>
    <form id="scene-properties"><fieldset id="scene-fields"><legend>Initial properties</legend><div class="scene-properties-grid">
      <label>Name <input id="scene-name" maxlength="48" required></label><label>Costume <select id="scene-costume"></select></label>
      <label>x <input id="scene-x" type="number" min="-1000000" max="1000000" step="any" required></label><label>y <input id="scene-y" type="number" min="-1000000" max="1000000" step="any" required></label>
      <label>Direction ° <input id="scene-direction" type="number" min="0" max="360" step="any" required></label><label>Size % <input id="scene-size" type="number" min="5" max="400" step="any" required></label>
      <label>Belongs to <select id="scene-world"></select></label><label>Layer <input id="scene-layer" type="number" min="-1000" max="1000" step="any" required></label><label>Visible <input id="scene-visible" type="checkbox"></label>
      <label>Rotation <select id="scene-rotation"><option value="all">All around</option><option value="left-right">Left/right only</option><option value="none">Do not rotate</option></select></label>
      </div><button class="button primary" type="submit">Apply sprite</button></fieldset></form>
    <div class="scene-toolbar"><label>Backdrop <select id="scene-backdrop"></select></label><button id="scene-stock-backdrop" class="button secondary">Backdrop library</button><button id="scene-art" class="button secondary">Artwork & frames</button></div>
    <div class="scene-toolbar"><label>Background <input id="scene-background" type="color" value="#fdfdf9"></label><button id="scene-import" class="button secondary">Import costume</button><input id="scene-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
    <p id="scene-live"></p><p id="scene-error" role="alert"></p>
  </section>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = el<HTMLCanvasElement>('stage'), select = el<HTMLSelectElement>('scene-selection');
  let running = false, ready = false, editing = true, saved = '', selected = '';
  document.querySelector('.stage-wrap')!.insertAdjacentHTML('afterend', '<div id="touch-controls" class="touch-controls"></div>');
  const playInput = new PlayInput(canvas, stage, el('touch-controls'), input);
  el('scene-mode').insertAdjacentHTML('afterend', '<details class="scene-input-settings"><summary>Input help & touch buttons</summary><p>Focus the stage for keys; hold touch buttons to move. A and B send the chosen keys. Answering questions or leaving the window releases held controls.</p><label>Action A key <select id="touch-key-a"></select></label><label>Action B key <select id="touch-key-b"></select></label></details>');
  for (const action of ['a', 'b'] as const) { const select = el<HTMLSelectElement>('touch-key-' + action); select.replaceChildren(...keys.map(([label, key]) => new Option(label, key))); select.addEventListener('change', () => attempt(() => { if (!editing) return; const next = sceneState(workspace); next.controls = { ...(next.controls ?? defaultControls()), [action]: select.value }; changeScene(workspace, next); render(true); })); }
  const stock = installStockLibrary(async (kind,id,signal) => {
    if (!editing) throw new Error('Stop and reset the stage before adding artwork.');
    const before = sceneState(workspace), next = structuredClone(before); let added = '';
    if (kind === 'world') await includeWorldTemplate(next,id);
    else {
      const asset = await includeStock(next,kind,id);
      if (kind === 'backdrop') (next.worlds?.find(w => w.id === next.world) ?? next).backdrop = asset;
      else {
        added = crypto.randomUUID();
        next.sprites.push({ id: added, name: uniqueName(stockArtwork.find(a => a.kind === kind && a.id === id)!.name), x: Number(canvas.dataset.cameraX ?? 0), y: Number(canvas.dataset.cameraY ?? 0), ...(next.world ? { world: next.world } : {}), direction: 0, size: 100, layer: 0, visible: true, costume: asset });
      }
    }
    signal.throwIfAborted();
    if (!editing || JSON.stringify(before) !== JSON.stringify(sceneState(workspace))) throw new Error('The project changed while adding artwork. Choose it again when ready.');
    changeScene(workspace,next); if(added) selected=added; render(true);
  });
  el('scene-stock').addEventListener('click',() => stock.open('costume'));
  el('scene-stock-backdrop').addEventListener('click',() => stock.open('backdrop'));
  const worlds = installWorldEditor(workspace, () => editing, () => stock.open('world'));
  const artwork = installArtEditor(workspace, () => selected, () => editing);
  const choose = (id: string) => { selected = id; select.value = id; loadProperties(); workspace.refreshToolboxSelection(); };
  const navigation = installSceneNavigation(workspace, choose, id => attempt(() => { if (!editing) return; const state = sceneState(workspace); state.world = id || null; changeScene(workspace,state); render(true); }), () => attempt(() => {
    if (!editing) return; const state = sceneState(workspace), sprite = state.sprites.find(s => s.id === selected); if (!sprite) return;
    if (sprite.world && sprite.world !== state.world) { state.world = sprite.world; changeScene(workspace,state); render(true); }
    stage.previewCamera(sprite.x,sprite.y); canvas.scrollIntoView({block:'nearest'}); canvas.focus({preventScroll:true});
  }), () => { const sprite = sceneState(workspace).sprites.find(s => s.id === selected); if (sprite) artwork.open({kind:'costume',id:sprite.costume}); });
  const motionEditor = installMotionEditor(workspace, () => selected, () => editing);
  const dataEditor = installDataEditor(workspace, () => selected, () => editing);
  const appearance = installAppearanceEditor(workspace, () => selected, () => editing);
  const watchers = installWatchers(workspace);
  el('scene-story-example').insertAdjacentHTML('afterend', '<button id="scene-drawing-example" class="button secondary">Drawing example</button>');
  el('scene-drawing-example').addEventListener('click', drawingExample);
  el('scene-drawing-example').insertAdjacentHTML('afterend', '<button id="scene-behavior-example" class="button secondary">Behavior example</button>');
  el('scene-behavior-example').addEventListener('click', behaviorExample);
  el('scene-behavior-example').insertAdjacentHTML('afterend', '<button id="scene-game-example" class="button secondary">Platformer example</button>');
  el('scene-game-example').addEventListener('click', gameExample);
  el('scene-game-example').insertAdjacentHTML('afterend', '<button id="scene-world-example" class="button secondary">Worlds example</button>');
  el('scene-world-example').addEventListener('click', worldExample);
  let drag: { pointer: number; id: string; x: number; y: number; originX: number; originY: number } | null = null;
  const error = (e: unknown) => { el('scene-error').textContent = e instanceof Error ? e.message : String(e); };
  const attempt = (fn: () => void) => { try { el('scene-error').textContent = ''; fn(); } catch (e) { error(e); } };
  const clearKeys = () => playInput.release();
  function loadProperties() {
    appearance.refresh(); dataEditor.refresh(); motionEditor.refresh();
    const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected);
    navigation.refresh(scene, selected, editing);
    watchers.refresh(scene, editing);
    el<HTMLSelectElement>('scene-costume').replaceChildren(...costumes(scene).map(a => new Option(a.name, a.id)));
    for (const key of ['name', 'x', 'y', 'direction', 'size', 'layer', 'costume'] as const) (el(`scene-${key}`) as HTMLInputElement).value = sprite ? String(sprite[key]) : '';
    el<HTMLSelectElement>('scene-world').replaceChildren(new Option('Global (all worlds)', ''), ...(scene.worlds ?? []).map(w => new Option(w.name, w.id))); el<HTMLSelectElement>('scene-world').value = sprite?.world ?? '';
    el<HTMLInputElement>('scene-visible').checked = sprite?.visible ?? true;
    el<HTMLSelectElement>('scene-rotation').value = sprite?.rotationStyle ?? 'all';
    el<HTMLInputElement>('scene-background').value = scene.worlds?.find(w => w.id === scene.world)?.background ?? scene.background;
    el<HTMLSelectElement>('scene-backdrop').replaceChildren(new Option('Plain color', ''), ...backdrops(scene).map(a => new Option(a.name, a.id))); el<HTMLSelectElement>('scene-backdrop').value = (scene.worlds?.find(w => w.id === scene.world) ?? scene).backdrop ?? '';
    el<HTMLFieldSetElement>('scene-fields').disabled = !editing || !sprite;
    for (const id of ['scene-copy', 'scene-delete']) el<HTMLButtonElement>(id).disabled = !editing || !sprite;
    for (const action of ['a', 'b'] as const) { el<HTMLSelectElement>('touch-key-' + action).value = (scene.controls ?? defaultControls())[action]; el<HTMLSelectElement>('touch-key-' + action).disabled = !editing; }
    if (editing) playInput.configure(scene.controls);
    stage.selected = editing ? selected : null; stage.paint(); live();
  }
  function live() {
    const sprite = stage.getSprite(selected);
    el('scene-live').textContent = sprite ? `${sprite.name}: x ${Math.round(sprite.x * 10) / 10}, y ${Math.round(sprite.y * 10) / 10}${sprite.visible ? '' : ' · hidden'}${sprite.motion?.body === 'moving' ? ` · vx ${Math.round(sprite.motion.vx ?? 0)}, vy ${Math.round(sprite.motion.vy ?? 0)}` : ''}` : '';
    const dialogue = stage.dialogue();
    if (el('stage-dialogue').textContent !== dialogue) el('stage-dialogue').textContent = dialogue;
  }
  function render(force = false) {
    const scene = sceneState(workspace), json = JSON.stringify(scene);
    if (!force && json === saved) return;
    saved = json;
    if (!scene.sprites.some(s => s.id === selected)) selected = scene.sprites[0]?.id ?? '';
    select.replaceChildren(...(scene.sprites.length ? scene.sprites.map(s => new Option(s.name + (s.world ? ` · ${scene.worlds?.find(w => w.id === s.world)?.name ?? 'world'}` : ''), s.id)) : [new Option('No sprites yet', '')])); select.value = selected;
    if (editing) stage.reset(scene);
    loadProperties();
  }
  function controls() {
    for (const id of ['scene-add', 'scene-stock', 'scene-stock-backdrop', 'scene-import', 'scene-background', 'scene-backdrop', 'scene-art', 'scene-worlds']) (el(id) as HTMLButtonElement).disabled = !editing;
    el<HTMLButtonElement>('scene-reset').disabled = running;
    el('scene-mode').textContent = editing ? 'Place sprites before running. Drag on the stage or edit their properties.' : running ? 'Click the stage to use keys. Tab returns to the editor. Runtime movement does not change your saved layout.' : 'Run result. Reset stage to edit the saved starting layout.';
    canvas.setAttribute('aria-label', editing ? 'Sprite placement and drawing stage' : 'Interactive stage. Click to focus, then use arrow keys, letters, numbers, or space.');
    loadProperties();
  }
  const uniqueName = (base: string) => { const names = sceneState(workspace).sprites.map(s => s.name); let n = 1; while (names.includes(`${base} ${n}`)) n++; return `${base} ${n}`; };
  el('scene-add').addEventListener('click', () => attempt(() => {
    const scene = sceneState(workspace); selected = crypto.randomUUID();
    scene.sprites.push({ id: selected, name: uniqueName('Sprite'), x: Number(canvas.dataset.cameraX ?? 0), y: Number(canvas.dataset.cameraY ?? 0), ...(scene.world ? { world: scene.world } : {}), direction: 0, size: 100, layer: 0, visible: true, costume: builtins[scene.sprites.length % builtins.length].id });
    changeScene(workspace, scene); render(true);
  }));
  el('scene-copy').addEventListener('click', () => attempt(() => {
    const scene = sceneState(workspace), original = scene.sprites.find(s => s.id === selected)!; selected = crypto.randomUUID();
    scene.sprites.push({ ...original, id: selected, name: uniqueName(original.name.slice(0, 32) + ' copy'), x: Math.min(1e6, original.x + 20), y: Math.max(-1e6, original.y - 20) });
    changeScene(workspace, scene); render(true);
  }));
  el('scene-delete').addEventListener('click', () => attempt(() => { const scene = sceneState(workspace); scene.sprites = scene.sprites.filter(s => s.id !== selected); for (const camera of [scene.camera, ...(scene.worlds ?? []).map(w => w.camera)]) if (camera?.follow === selected) camera.follow = null; changeScene(workspace, scene); render(true); }));
  select.addEventListener('change', () => choose(select.value));
  el('scene-properties').addEventListener('submit', event => { event.preventDefault(); if (!editing) return; attempt(() => {
    const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected)!;
    sprite.name = el<HTMLInputElement>('scene-name').value.trim(); sprite.costume = el<HTMLSelectElement>('scene-costume').value;
    for (const key of ['x', 'y', 'direction', 'size', 'layer'] as const) sprite[key] = el<HTMLInputElement>(`scene-${key}`).valueAsNumber;
    sprite.visible = el<HTMLInputElement>('scene-visible').checked;
    const world = el<HTMLSelectElement>('scene-world').value; if (world) sprite.world = world; else delete sprite.world;
    sprite.rotationStyle = el<HTMLSelectElement>('scene-rotation').value as RotationStyle;
    changeScene(workspace, scene); render(true);
  }); });
  el('scene-art').addEventListener('click', () => artwork.open());
  el('scene-backdrop').addEventListener('change', () => attempt(() => { const scene = sceneState(workspace); (scene.worlds?.find(w => w.id === scene.world) ?? scene).backdrop = el<HTMLSelectElement>('scene-backdrop').value || null; changeScene(workspace, scene); render(true); }));
  el('scene-background').addEventListener('change', () => attempt(() => { const scene = sceneState(workspace); (scene.worlds?.find(w => w.id === scene.world) ?? scene).background = el<HTMLInputElement>('scene-background').value; changeScene(workspace, scene); render(true); }));
  el('scene-reset').addEventListener('click', () => { if (!running) { editing = true; watchers.restore(); render(true); controls(); } });
  el('scene-example').addEventListener('click', example);
  el('scene-motion-example').addEventListener('click', motionExample);
  el('scene-story-example').addEventListener('click', storyExample);
  el('scene-events').addEventListener('click', () => el('events-manage').click());
  el('scene-import').addEventListener('click', () => el<HTMLInputElement>('scene-image').click());
  el('scene-image').addEventListener('change', async () => {
    const file = el<HTMLInputElement>('scene-image').files?.[0]; el<HTMLInputElement>('scene-image').value = ''; if (!file) return;
    const before = JSON.stringify(sceneState(workspace)); let bitmap: ImageBitmap | undefined;
    try {
      if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
      bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height)); const image = document.createElement('canvas');
      image.width = Math.max(1, Math.round(bitmap.width * scale)); image.height = Math.max(1, Math.round(bitmap.height * scale)); image.getContext('2d')!.drawImage(bitmap, 0, 0, image.width, image.height);
      if (!editing || before !== JSON.stringify(sceneState(workspace))) throw new Error('The scene changed during image import. Choose the image again.');
      const scene = sceneState(workspace), id = crypto.randomUUID();
      scene.assets.push({ id, name: file.name.slice(0, 48).trim() || 'Imported costume', width: image.width, height: image.height, data: image.toDataURL('image/png') });
      const sprite = scene.sprites.find(s => s.id === selected);
      if (sprite) { sprite.costumes = [...spriteFrames(sprite), id]; sprite.costume = id; }
      changeScene(workspace, scene); render(true); el('scene-error').textContent = '';
    } catch (e) { error(e); } finally { bitmap?.close(); }
  });
  const pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    canvas.focus(); const point = stage.point(event.clientX, event.clientY), sprite = stage.hit(point.x, point.y);
    if (!editing || !sprite) return;
    selected = sprite.id; select.value = selected; loadProperties();
    drag = { pointer: event.pointerId, id: sprite.id, x: sprite.x, y: sprite.y, originX: point.x, originY: point.y }; canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    if (ready) return;
    if (!drag || drag.pointer !== event.pointerId) return; const point = stage.point(event.clientX, event.clientY);
    stage.previewPosition(drag.id, Math.round(drag.x + point.x - drag.originX), Math.round(drag.y + point.y - drag.originY)); live();
  };
  const endDrag = (event: PointerEvent) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const current = drag; drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.type !== 'pointerup' || !editing) { render(true); return; }
    attempt(() => { const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === current.id), next = stage.getSprite(current.id); if (sprite && next) { sprite.x = next.x; sprite.y = next.y; changeScene(workspace, scene); } render(true); });
  };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag); canvas.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('pointerup', endDrag);
  const changed = () => render(); workspace.addChangeListener(changed);
  installScenePalette(workspace, () => selected);
  render(true); controls();
  return {
    live, watch: watchers.accept, releaseInput: clearKeys,
    start(scene = sceneState(workspace)) { stock.close(); worlds.close(); artwork.close(); clearKeys(); drag = null; editing = false; running = true; ready = false; stage.selected = null; stage.reset(scene); playInput.configure(scene.controls); playInput.setEnabled(false); watchers.start(scene); controls(); },
    ready() { ready = true; playInput.setEnabled(true); },
    stop() { clearKeys(); playInput.setEnabled(false); ready = false; running = false; watchers.stop(); controls(); },
    restore() { clearKeys(); playInput.setEnabled(false); ready = false; running = false; editing = true; watchers.restore(); render(true); controls(); },
    dispose() { stock.dispose(); worlds.dispose(); artwork.dispose(); playInput.dispose(); workspace.removeChangeListener(changed); window.removeEventListener('pointerup', endDrag); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(event, endDrag as EventListener); },
  };
}
