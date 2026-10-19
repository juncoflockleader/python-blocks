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
import { installPaintEditor } from './paint-editor';
import { installAppearanceEditor } from './appearance-editor';
import * as Blockly from 'blockly/core';
import { installScenePalette } from './palette';
import { Stage } from '../stage';
import { backdrops, builtins, costumes, spriteFrames, type SceneInput, type RotationStyle } from './model';
import { changeScene, sceneState } from './state';
import { installStageView } from './stage-view';
import { resizeWorld, screenLimits, worldScreens } from './world-size';

const numberField = (id: string, label: string, min: number, max: number) => `<label>${label} <input id="${id}" type="number" inputmode="decimal" min="${min}" max="${max}" step="any" required></label>`;
const nameAttributes = 'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"';

/** Sprite tab, sprite tray and the More settings sheet. The tab holds the seven
 * properties a learner changes constantly; each commits on change with Undo.
 * Everything else is layered into the sheet, nothing is removed. */
export interface SceneEvents { spriteAdded?(name: string): void }
export function installSceneEditor(workspace: Blockly.WorkspaceSvg, stage: Stage, input: (value: SceneInput) => boolean, events: SceneEvents = {}) {
  document.getElementById('panel-sprite')!.innerHTML = `<p id="scene-mode" class="tab-note"></p>
    <div class="sprite-head"><label>Sprite <select id="scene-selection"></select></label><button id="scene-add" class="button secondary">Add sprite</button></div>
    <form id="scene-properties" aria-label="Sprite properties"><fieldset id="scene-fields"><legend class="visually-hidden">Sprite properties</legend><div class="sprite-fields">
      <label class="field-wide">Name <input id="scene-name" maxlength="48" required ${nameAttributes}></label><label class="field-wide">Costume <select id="scene-costume"></select></label>
      ${numberField('scene-x', 'x', -1000000, 1000000)}${numberField('scene-y', 'y', -1000000, 1000000)}
      ${numberField('scene-size', 'Size %', 5, 400)}${numberField('scene-direction', 'Direction °', 0, 360)}
      <label class="field-check"><input id="scene-visible" type="checkbox"> Visible</label>
    </div><p class="tab-note">Changes save as you type. Undo restores them.</p></fieldset></form>
    <button id="sprite-more" class="button secondary more-button">More settings <span>layer · rotation · pen · data · motion</span></button>
    <div class="scene-toolbar"><button id="scene-locate" class="button secondary">Find on stage</button><button id="scene-edit-costume" class="button secondary">Edit costume</button><button id="scene-copy" class="button secondary">Duplicate sprite</button><button id="scene-delete" class="button secondary">Delete sprite</button></div>
    <div class="scene-toolbar"><label>Scripts for sprite <select id="scene-script"></select></label><button id="scene-script-find" class="button secondary">Go to script</button></div>
    <label class="scene-filter">Find sprite <input id="scene-filter" type="search" placeholder="Name, kind or world" ${nameAttributes}></label><p id="scene-filter-empty" hidden>No sprites match.</p>
    <p id="scene-live"></p><p id="scene-error" role="alert"></p>
    <section class="stage-settings" aria-labelledby="stage-settings-title"><h3 id="stage-settings-title">Stage &amp; assets</h3>
      <label class="level-pro">Starting world <select id="scene-browse-world"></select></label>
      <div class="world-screens level-builder" role="group" aria-labelledby="world-screens-title"><span id="world-screens-title" class="world-screens-title">World size</span>
        ${(['wide', 'tall'] as const).map(side => `<span class="stepper"><span id="world-${side}-label">Screens ${side}</span><button id="world-${side}-less" class="button secondary ui-icon-only" type="button" aria-label="One screen ${side === 'wide' ? 'narrower' : 'shorter'}" title="One screen ${side === 'wide' ? 'narrower' : 'shorter'}">Fewer</button><output id="world-${side}" aria-labelledby="world-${side}-label">1</output><button id="world-${side}-more" class="button secondary ui-icon-only" type="button" aria-label="One screen ${side === 'wide' ? 'wider' : 'taller'}" title="One screen ${side === 'wide' ? 'wider' : 'taller'}">More</button></span>`).join('')}
        <p class="tab-note">One screen is the stage. Removing a screen moves its sprites onto the screens that stay; Undo brings it back.</p></div>
      <div class="scene-toolbar"><label>Backdrop <select id="scene-backdrop"></select></label><label>Background <input id="scene-background" type="color" value="#fdfdf9"></label></div>
      <div class="scene-toolbar" id="stage-assets"><button id="scene-stock-backdrop" class="button secondary">Backdrop library</button><button id="scene-paint-backdrop" class="button secondary">Paint a backdrop</button><button id="scene-import" class="button secondary">Import costume</button><input id="scene-image" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
    </section>`;
  document.getElementById('sprite-tray')!.innerHTML = '<div id="scene-cards" class="tray-cards" role="group" aria-label="Choose a sprite"></div><button id="scene-stock" class="button secondary tray-button tray-sprites" title="Add sprites from the library" aria-label="Add sprites">Sprites</button><button id="tray-paint" class="button secondary tray-button" title="Paint this sprite\'s costumes, or a new sprite">Paint</button>';
  // A non-modal sheet over the tabs: the stage and sprite tray stay visible, so choosing another sprite updates it.
  document.querySelector('.right-column')!.insertAdjacentHTML('beforeend', `<dialog id="sprite-settings" class="sheet" aria-labelledby="sprite-settings-title"><header><h2 id="sprite-settings-title">More settings <span id="sprite-settings-name"></span></h2><button id="sprite-settings-done" class="button primary">Done</button></header>
    <div class="sheet-body scene-editor" id="sprite-settings-body"><form id="scene-more" aria-label="Where the sprite lives"><fieldset id="scene-more-fields"><legend>Where it lives</legend><div class="scene-properties-grid">
      <label class="level-pro">Belongs to <select id="scene-world"></select></label>${numberField('scene-layer', 'Layer', -1000, 1000)}
      <label>Rotation <select id="scene-rotation"><option value="all">All around</option><option value="left-right">Left/right only</option><option value="none">Do not rotate</option></select></label>
    </div></fieldset></form></div></dialog>`);
  document.querySelector('.stage-wrap')!.insertAdjacentHTML('beforeend', '<p id="stage-dialogue" class="stage-dialogue" role="status" aria-live="polite"></p>');
  document.getElementById('stage-toolbar')!.insertAdjacentHTML('afterbegin', '<button id="scene-reset" class="button secondary" title="Reset stage">Reset stage</button>');
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = el<HTMLCanvasElement>('stage'), select = el<HTMLSelectElement>('scene-selection');
  let running = false, ready = false, editing = true, saved = '', selected = '';
  document.querySelector('.stage-wrap')!.insertAdjacentHTML('beforeend', '<div id="touch-controls" class="touch-controls"></div>');
  const playInput = new PlayInput(canvas, stage, el('touch-controls'), input);
  // The editing view (pan, zoom, map) is installed before the sprite drag below, so it claims pans first.
  let layout = { world: '', wide: 1, tall: 1, maxWide: 1, maxTall: 1 }, cameraWorld: string | null = null, cameraKey = '';
  const view = installStageView(stage, canvas, {
    editing: () => editing, world: () => layout.world, screens: () => layout,
    resize: (wide, tall) => resize(wide, tall), selectedName: () => stage.getSprite(selected)?.name ?? '',
  });
  /** Grow or shrink the current world, in screens. One Undo step; false when it was refused. */
  const resize = (wide: number, tall: number) => {
    let done = false;
    attempt(() => { if (!editing) return; changeScene(workspace, resizeWorld(sceneState(workspace), wide, tall)); done = true; render(true); });
    return done;
  };
  /** The World size steppers show the current world's screens and stop at its limits. */
  const steppers = () => {
    for (const side of ['wide', 'tall'] as const) {
      el(`world-${side}`).textContent = String(layout[side]);
      el<HTMLButtonElement>(`world-${side}-less`).disabled = !editing || layout[side] <= 1;
      el<HTMLButtonElement>(`world-${side}-more`).disabled = !editing || layout[side] >= layout[side === 'wide' ? 'maxWide' : 'maxTall'];
    }
  };
  for (const side of ['wide', 'tall'] as const) for (const [delta, id] of [[-1, 'less'], [1, 'more']] as const) el(`world-${side}-${id}`).addEventListener('click', () => resize(layout.wide + (side === 'wide' ? delta : 0), layout.tall + (side === 'tall' ? delta : 0)));
  el('audio-controls').append(el('touch-toggle'));
  el('help-slot').insertAdjacentHTML('beforeend', '<details class="scene-input-settings"><summary>Input help & touch buttons</summary><p>Focus the stage for keys; hold touch buttons to move. A and B send the chosen keys. Answering questions or leaving the window releases held controls.</p><label>Action A key <select id="touch-key-a"></select></label><label>Action B key <select id="touch-key-b"></select></label></details>');
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
    if (added) events.spriteAdded?.(next.sprites.find(s => s.id === added)!.name);
  });
  el('scene-stock').addEventListener('click',() => stock.open('costume'));
  el('scene-stock-backdrop').addEventListener('click',() => stock.open('backdrop'));
  // The Paint editor: costumes from the tray or Edit costume, backdrops from Stage & assets, tiles from the world editor.
  const paint = installPaintEditor(workspace, {
    canEdit: () => editing, selected: () => selected,
    viewCentre: () => ({ x: Number(canvas.dataset.cameraX ?? 0), y: Number(canvas.dataset.cameraY ?? 0) }),
    library: (kind, add) => stock.open(kind, async (_kind, id) => add(id)),
    done: sprite => { if (sprite) selected = sprite; render(true); if (sprite) choose(sprite); },
  });
  const worlds = installWorldEditor(workspace, () => editing, () => stock.open('world'), id => { if (editing) paint.open({ kind: 'tile', id }); });
  el('tray-paint').addEventListener('click', () => { if (editing) paint.open({ kind: 'costume' }); });
  const choose = (id: string) => { selected = id; select.value = id; loadProperties(); workspace.refreshToolboxSelection(); select.dispatchEvent(new Event('sprite-selection-changed')); };
  const navigation = installSceneNavigation(workspace, choose, id => attempt(() => { if (!editing) return; const state = sceneState(workspace); state.world = id || null; changeScene(workspace,state); render(true); }), () => attempt(() => {
    if (!editing) return; const state = sceneState(workspace), sprite = state.sprites.find(s => s.id === selected); if (!sprite) return;
    if (sprite.world && sprite.world !== state.world) { state.world = sprite.world; changeScene(workspace,state); render(true); }
    view.centerOn(sprite.x,sprite.y); canvas.scrollIntoView({block:'nearest'}); canvas.focus({preventScroll:true});
  }), () => { if (editing) paint.open({ kind: 'costume', sprite: selected }); });
  const appearance = installAppearanceEditor(workspace, () => selected, () => editing);
  const dataEditor = installDataEditor(workspace, () => selected, () => editing);
  const motionEditor = installMotionEditor(workspace, () => selected, () => editing);
  const watchers = installWatchers(workspace);
  const settings = el<HTMLDialogElement>('sprite-settings');
  el('sprite-more').addEventListener('click', () => { loadProperties(); settings.show(); settings.querySelector<HTMLElement>('summary, input:not(:disabled), select:not(:disabled)')?.focus(); });
  el('sprite-settings-done').addEventListener('click', () => settings.close());
  settings.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); settings.close(); } });
  settings.addEventListener('close', () => { if (settings.contains(document.activeElement) || document.activeElement === document.body) el('sprite-more').focus({ preventScroll: true }); });
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
    el('sprite-settings-name').textContent = sprite ? `· ${sprite.name}` : '';
    el<HTMLSelectElement>('scene-world').replaceChildren(new Option('Global (all worlds)', ''), ...(scene.worlds ?? []).map(w => new Option(w.name, w.id))); el<HTMLSelectElement>('scene-world').value = sprite?.world ?? '';
    el<HTMLInputElement>('scene-visible').checked = sprite?.visible ?? true;
    el<HTMLSelectElement>('scene-rotation').value = sprite?.rotationStyle ?? 'all';
    el<HTMLInputElement>('scene-background').value = scene.worlds?.find(w => w.id === scene.world)?.background ?? scene.background;
    el<HTMLSelectElement>('scene-backdrop').replaceChildren(new Option('Plain color', ''), ...backdrops(scene).map(a => new Option(a.name, a.id))); el<HTMLSelectElement>('scene-backdrop').value = (scene.worlds?.find(w => w.id === scene.world) ?? scene).backdrop ?? '';
    for (const id of ['scene-fields', 'scene-more-fields']) el<HTMLFieldSetElement>(id).disabled = !editing || !sprite;
    for (const id of ['scene-copy', 'scene-delete']) el<HTMLButtonElement>(id).disabled = !editing || !sprite;
    for (const action of ['a', 'b'] as const) { el<HTMLSelectElement>('touch-key-' + action).value = (scene.controls ?? defaultControls())[action]; el<HTMLSelectElement>('touch-key-' + action).disabled = !editing; }
    if (editing) playInput.configure(scene.controls);
    stage.selected = editing ? selected : null; stage.paint(); live(); view.refresh();
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
    const screens = worldScreens(scene), limits = screenLimits(scene);
    layout = { world: scene.world ?? '', ...screens, maxWide: limits.wide, maxTall: limits.tall };
    steppers();
    // When the world's camera settings change (as with “Move camera here”), show where the game now starts.
    const camera = JSON.stringify((scene.worlds?.find(w => w.id === scene.world) ?? scene).camera ?? null), moved = layout.world === cameraWorld && camera !== cameraKey;
    cameraWorld = layout.world; cameraKey = camera;
    if (editing) { stage.reset(scene); view.sync(); if (moved) view.home(false); }
    loadProperties();
  }
  function controls() {
    for (const id of ['scene-add', 'scene-stock', 'tray-paint', 'scene-stock-backdrop', 'scene-import', 'scene-background', 'scene-backdrop', 'scene-paint-backdrop', 'scene-worlds']) (el(id) as HTMLButtonElement).disabled = !editing;
    steppers();
    el<HTMLButtonElement>('scene-reset').disabled = running;
    el('scene-mode').textContent = editing ? 'Drag sprites on the stage to place them before running. Drag empty space to look around.' : running ? 'Running. Runtime movement does not change your saved layout.' : 'Run result. Reset stage to edit the saved starting layout.';
    el('scene-mode').dataset.state = editing ? 'editing' : running ? 'running' : 'result';
    canvas.setAttribute('aria-label', editing ? 'Sprite placement and drawing stage. Arrow keys look around; plus and minus zoom.' : 'Interactive stage. Click to focus, then use arrow keys, letters, numbers, or space.');
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
  type Property = 'name' | 'costume' | 'x' | 'y' | 'direction' | 'size' | 'layer' | 'visible' | 'world' | 'rotation';
  /** Write one property of the selected sprite. Each committed change is one Undo step. */
  const commit = (key: Property) => { if (!editing) return; attempt(() => {
    const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected); if (!sprite) return;
    const field = el<HTMLInputElement>(`scene-${key}`);
    try {
      if (key === 'name') { const name = field.value.trim(); if (!name) throw new Error('Give the sprite a name.'); sprite.name = name; }
      else if (key === 'costume') sprite.costume = field.value;
      else if (key === 'visible') sprite.visible = field.checked;
      else if (key === 'world') { if (field.value) sprite.world = field.value; else delete sprite.world; }
      else if (key === 'rotation') sprite.rotationStyle = field.value as RotationStyle;
      else {
        const value = field.valueAsNumber;
        if (!Number.isFinite(value) || value < Number(field.min) || value > Number(field.max)) throw new Error(`Enter a number from ${field.min} to ${field.max}.`);
        sprite[key] = value;
      }
      changeScene(workspace, scene); render(true);
    } catch (e) { render(true); throw e; }
  }); };
  for (const key of ['name', 'costume', 'x', 'y', 'direction', 'size', 'layer', 'visible', 'world', 'rotation'] as const) {
    const field = el<HTMLInputElement>(`scene-${key}`);
    field.addEventListener('change', () => commit(key));
    if (field.tagName === 'INPUT' && field.type !== 'checkbox') field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(key); } });
  }
  for (const id of ['scene-properties', 'scene-more']) el(id).addEventListener('submit', event => event.preventDefault());
  el('scene-paint-backdrop').addEventListener('click', () => { if (editing) paint.open({ kind: 'backdrop' }); });
  el('scene-backdrop').addEventListener('change', () => attempt(() => { const scene = sceneState(workspace); (scene.worlds?.find(w => w.id === scene.world) ?? scene).backdrop = el<HTMLSelectElement>('scene-backdrop').value || null; changeScene(workspace, scene); render(true); }));
  el('scene-background').addEventListener('change', () => attempt(() => { const scene = sceneState(workspace); (scene.worlds?.find(w => w.id === scene.world) ?? scene).background = el<HTMLInputElement>('scene-background').value; changeScene(workspace, scene); render(true); }));
  el('scene-reset').addEventListener('click', () => { if (!running) { editing = true; watchers.restore(); render(true); controls(); } });
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
    choose(sprite.id);
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
    live, watch: watchers.accept, releaseInput: clearKeys, selected: () => selected,
    /** Select a sprite as the tray does (palette defaults, inspector and stage). */
    select(id: string) { if (sceneState(workspace).sprites.some(s => s.id === id)) choose(id); },
    /** Open the stock library on a kind, as the tray and settings buttons do. */
    openLibrary(kind: 'costume' | 'backdrop' | 'world') { if (editing) stock.open(kind); },
    /** On touch screens, show the on-screen controller when the program listens for keys. */
    touchControls(show: boolean) { playInput.showTouch(show); },
    start(scene = sceneState(workspace)) { stock.close(); worlds.close(); paint.close(); settings.close(); clearKeys(); drag = null; editing = false; running = true; ready = false; stage.selected = null; stage.reset(scene); view.sync(); playInput.configure(scene.controls); playInput.setEnabled(false); watchers.start(scene); controls(); },
    ready() { ready = true; playInput.setEnabled(true); },
    pause(paused: boolean) { clearKeys(); playInput.setEnabled(ready && !paused); },
    stop() { clearKeys(); playInput.setEnabled(false); ready = false; running = false; watchers.stop(); controls(); },
    /** Back to editing. A newly opened project (`fresh`) starts from its own starting views. */
    restore(fresh = false) { clearKeys(); playInput.setEnabled(false); ready = false; running = false; editing = true; if (fresh) view.forget(); watchers.restore(); render(true); controls(); },
    /** The stage's editing view: pan, zoom, fit and the tools rail. */
    view,
    dispose() { view.dispose(); settings.remove(); stock.dispose(); worlds.dispose(); paint.dispose(); playInput.dispose(); workspace.removeChangeListener(changed); window.removeEventListener('pointerup', endDrag); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(event, endDrag as EventListener); },
  };
}
