import type * as Blockly from 'blockly/core';
import { assetCanvas, assetsFor, removeAsset, type AssetKind } from './assets';
import { spriteFrames, type Costume, type SceneState } from './model';
import { changeScene, sceneState } from './state';
import { Raster, hexColor, type Rect, type Color } from './raster';

export function installArtEditor(workspace: Blockly.WorkspaceSvg, selectedSprite: () => string, canEdit: () => boolean) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="art-dialog" aria-labelledby="art-title">
    <header class="art-heading"><div><h2 id="art-title">Artwork & animation</h2><p>Paint your own costumes and backdrops. Saving updates every sprite using that artwork; duplicate it for an independent copy.</p></div><button id="art-close" class="button secondary">Close</button></header>
    <div class="art-layout"><aside class="art-library">
      <label>Artwork type <select id="art-kind"><option value="costume">Costumes</option><option value="backdrop">Backdrops</option></select></label>
      <label>Artwork <select id="art-assets" size="7"></select></label>
      <div class="art-actions"><button id="art-new" class="button secondary">New artwork</button><button id="art-duplicate" class="button secondary">Duplicate artwork</button><button id="art-delete" class="button secondary">Delete artwork</button><button id="art-import" class="button secondary">Import image</button><input id="art-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
      <label>Name <input id="art-name" maxlength="48"></label>
      <div class="art-actions"><button id="art-save" class="button primary">Save artwork</button><button id="art-save-copy" class="button secondary">Save as new</button><button id="art-revert" class="button secondary">Discard draft</button><button id="art-export" class="button secondary">Download PNG</button></div>
      <p id="art-state" role="status"></p>
      <div class="art-actions"><button id="art-project-undo" class="button secondary">Undo project edit</button><button id="art-project-redo" class="button secondary">Redo project edit</button></div>
    </aside><section class="art-paint" aria-label="Painting tools">
      <div class="art-actions"><label>Tool <select id="art-tool"><option value="brush">Brush</option><option value="eraser">Eraser</option><option value="fill">Fill</option><option value="line">Line</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="select">Select rectangle</option><option value="move">Move selection</option><option value="pick">Pick color</option></select></label><label>Color <input id="art-color" type="color" value="#478b94"></label><label>Brush size <input id="art-size" type="number" min="1" max="32" value="3"></label><label><input id="art-filled" type="checkbox" checked> Filled shapes</label></div>
      <div class="art-canvas-wrap"><canvas id="art-canvas" width="64" height="64" tabindex="0" aria-label="Artwork canvas. Use the pointer to paint or select. Arrow keys move a selection; Delete clears it."></canvas></div>
      <p>Select an area to move, flip or rotate it. With no selection, transforms affect the whole canvas. Rotation keeps the canvas size and may clip corners.</p>
      <div class="art-actions"><button id="art-undo" class="button secondary">Undo stroke</button><button id="art-redo" class="button secondary">Redo stroke</button><button id="art-flip-x" class="button secondary">Flip horizontal</button><button id="art-flip-y" class="button secondary">Flip vertical</button><button id="art-rotate" class="button secondary">Rotate 90°</button><button id="art-clear" class="button secondary">Clear selection</button><button id="art-deselect" class="button secondary">Deselect</button></div>
      <div class="art-actions"><label>Width <input id="art-width" type="number" min="1" max="256" value="64"></label><label>Height <input id="art-height" type="number" min="1" max="256" value="64"></label><button id="art-resize" class="button secondary">Resize canvas</button><button id="art-scale" class="button secondary">Scale image</button><label>Zoom <select id="art-zoom"><option value="1">1×</option><option value="2">2×</option><option value="4" selected>4×</option><option value="8">8×</option></select></label><label><input id="art-onion" type="checkbox"> Previous frame overlay</label></div>
    </section></div>
    <fieldset id="art-animation"><legend>Sprite animation</legend><div class="art-animation-grid"><div>
      <label>Sprite <select id="art-sprite"></select></label><label>Ordered frames <select id="art-frames" size="4"></select></label>
      <div class="art-actions"><button id="art-frame-add" class="button secondary">Add artwork as frame</button><button id="art-frame-remove" class="button secondary">Remove frame</button><button id="art-frame-up" class="button secondary">Earlier frame</button><button id="art-frame-down" class="button secondary">Later frame</button><button id="art-frame-copy" class="button secondary">Duplicate frame</button></div>
    </div><div><canvas id="art-preview" width="160" height="120" aria-label="Animation preview"></canvas><label>Seconds per frame <input id="art-seconds" type="number" min="0.02" max="10" step="0.01" value="0.1"></label><button id="art-speed-save" class="button secondary">Save frame duration</button><button id="art-play" class="button secondary">Preview animation</button><p>Use “play sprite animation once and wait” in a handler. An ordinary loop repeats it.</p></div></div></fieldset>
    <p id="art-error" role="alert"></p>
  </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('art-dialog'), canvas = el<HTMLCanvasElement>('art-canvas'), ctx = canvas.getContext('2d')!;
  const list = el<HTMLSelectElement>('art-assets'), spriteSelect = el<HTMLSelectElement>('art-sprite'), framesSelect = el<HTMLSelectElement>('art-frames');
  let kind: AssetKind = 'costume', identity = '', raster = new Raster(64, 64), selection: Rect | null = null;
  let dirty = false, busy = false, revision = '', loadToken = 0, onionToken = 0, previewToken = 0, previewTimer: ReturnType<typeof setTimeout> | undefined;
  let onion: HTMLCanvasElement | null = null;
  const undo: Raster[] = [], redo: Raster[] = [];
  let drag: { pointer: number; x: number; y: number; lastX: number; lastY: number; before: Raster; selection: Rect | null; tool: string } | null = null;
  const scene = () => sceneState(workspace);
  const revisionNow = () => JSON.stringify(scene());
  const error = (e: unknown) => { el('art-error').textContent = e instanceof Error ? e.message : String(e); };
  async function attempt(action: () => void | Promise<void>) {
    if (busy) return; busy = true;
    try { if (!canEdit()) throw new Error('Reset the stage before editing artwork.'); el('art-error').textContent = ''; await action(); }
    catch (e) { error(e); } finally { busy = false; }
  }
  function clean() { if (dirty) throw new Error('Save artwork or discard the draft before switching assets or changing frames.'); }
  function remember(before = raster.copy()) { undo.push(before); if (undo.length > 30) undo.shift(); redo.length = 0; dirty = true; }
  function draftCanvas() { const c = document.createElement('canvas'); c.width = raster.width; c.height = raster.height; c.getContext('2d')!.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0); return c; }
  function paint() {
    canvas.width = raster.width; canvas.height = raster.height; canvas.style.width = `${raster.width * Number(el<HTMLSelectElement>('art-zoom').value)}px`;
    if (onion && el<HTMLInputElement>('art-onion').checked) { ctx.globalAlpha = 0.25; ctx.drawImage(onion, (raster.width - onion.width) / 2, (raster.height - onion.height) / 2); ctx.globalAlpha = 1; }
    ctx.drawImage(draftCanvas(), 0, 0);
    if (selection) { ctx.strokeStyle = '#172d51'; ctx.lineWidth = 1; ctx.setLineDash([2, 2]); ctx.strokeRect(selection.x + .5, selection.y + .5, selection.width - 1, selection.height - 1); ctx.setLineDash([]); }
    el<HTMLInputElement>('art-width').value = String(raster.width); el<HTMLInputElement>('art-height').value = String(raster.height);
    el<HTMLButtonElement>('art-undo').disabled = !undo.length; el<HTMLButtonElement>('art-redo').disabled = !redo.length;
    el('scene-art').textContent = dirty ? 'Artwork & frames · draft' : 'Artwork & frames';
    el('art-state').textContent = dirty ? 'Unsaved draft — save before reloading. Saving applies one project Undo step.' : 'Artwork saved. Painting edits a draft.';
  }
  function library() {
    const state = scene(); list.replaceChildren(...assetsFor(state, kind).map(a => new Option(a.name, a.id))); list.value = identity;
    el<HTMLButtonElement>('art-delete').disabled = !(kind === 'costume' ? state.assets : state.backdrops ?? []).some(a => a.id === identity);
    el<HTMLSelectElement>('art-kind').value = kind;
    el<HTMLInputElement>('art-width').max = kind === 'costume' ? '256' : '480'; el<HTMLInputElement>('art-height').max = kind === 'costume' ? '256' : '320';
    const current = spriteSelect.value; spriteSelect.replaceChildren(...state.sprites.map(s => new Option(s.name, s.id))); spriteSelect.value = state.sprites.some(s => s.id === current) ? current : selectedSprite();
    if (!spriteSelect.value && state.sprites.length) spriteSelect.value = state.sprites[0].id;
    frameControls();
  }
  async function load(id: string) {
    stopPreview(); onionToken++; onion = null; const token = ++loadToken, state = scene();
    const asset = assetsFor(state, kind).find(a => a.id === id) ?? assetsFor(state, kind)[0];
    identity = asset.id; const c = await assetCanvas(asset, kind); if (token !== loadToken) return;
    raster = new Raster(c.width, c.height, c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
    el<HTMLInputElement>('art-name').value = asset.name; dirty = false; undo.length = redo.length = 0; selection = null; revision = JSON.stringify(state);
    library(); paint(); await loadOnion();
  }
  function frameControls() {
    const state = scene(), sprite = state.sprites.find(s => s.id === spriteSelect.value), current = Number(framesSelect.value || 0);
    el<HTMLFieldSetElement>('art-animation').disabled = kind !== 'costume' || !sprite;
    framesSelect.replaceChildren(...(sprite ? spriteFrames(sprite).map((id, i) => new Option(`${i + 1}. ${assetsFor(state, 'costume').find(a => a.id === id)?.name ?? 'Unavailable'}`, String(i))) : []));
    framesSelect.value = String(Math.min(current, framesSelect.options.length - 1));
    el<HTMLInputElement>('art-seconds').value = String(sprite?.frameSeconds ?? 0.1);
  }
  async function loadOnion() {
    onion = null; const token = ++onionToken, state = scene(), sprite = state.sprites.find(s => s.id === spriteSelect.value);
    if (kind === 'costume' && sprite) {
      const frames = spriteFrames(sprite), selected = Number(framesSelect.value);
      const index = frames[selected] === identity ? selected : frames.indexOf(identity);
      const previous = assetsFor(state, 'costume').find(a => a.id === frames[index - 1]);
      if (previous) { const c = await assetCanvas(previous, 'costume'); if (token !== onionToken) return; onion = c; }
    }
    if (token === onionToken) paint();
  }
  function mutate(change: (state: SceneState) => void) { const state = scene(); change(state); changeScene(workspace, state); revision = revisionNow(); library(); }
  async function save(copy = false) {
    if (!copy && revision !== revisionNow()) throw new Error('The project changed while this draft was open. Save as new to keep your drawing, or discard the draft to reload.');
    const name = el<HTMLInputElement>('art-name').value.trim(); if (!name) throw new Error('Give your artwork a name.');
    const state = scene(), assets = kind === 'costume' ? state.assets : state.backdrops ??= [];
    const existing = copy ? undefined : assets.find(a => a.id === identity), id = existing?.id ?? crypto.randomUUID();
    const asset: Costume = { id, name, width: raster.width, height: raster.height, data: draftCanvas().toDataURL('image/png') };
    if (existing) Object.assign(existing, asset); else assets.push(asset);
    if (kind === 'backdrop') state.backdrop = id;
    else {
      const sprite = state.sprites.find(s => s.id === spriteSelect.value);
      if (sprite) { const frames = spriteFrames(sprite); sprite.costumes = frames.includes(id) ? [...frames] : [...frames, id]; sprite.costume = id; }
    }
    changeScene(workspace, state); identity = id; dirty = false; await load(id);
  }
  function stopPreview() { previewToken++; clearTimeout(previewTimer); el('art-play').textContent = 'Preview animation'; }
  async function preview() {
    clean(); if (el('art-play').textContent === 'Stop preview') { stopPreview(); return; }
    const state = scene(), sprite = state.sprites.find(s => s.id === spriteSelect.value); if (!sprite) return;
    const token = ++previewToken, frames = spriteFrames(sprite), seconds = sprite.frameSeconds ?? 0.1;
    const images = await Promise.all(frames.map(id => assetCanvas(assetsFor(state, 'costume').find(a => a.id === id)!, 'costume')));
    if (token !== previewToken) return; el('art-play').textContent = 'Stop preview'; let index = 0;
    const target = el<HTMLCanvasElement>('art-preview'), context = target.getContext('2d')!;
    function tick() {
      if (token !== previewToken || !dialog.open) return;
      const c = images[index++ % images.length], scale = Math.min(1, 150 / c.width, 110 / c.height);
      context.clearRect(0, 0, 160, 120); context.drawImage(c, (160 - c.width * scale) / 2, (120 - c.height * scale) / 2, c.width * scale, c.height * scale);
      target.dataset.frame = String((index - 1) % images.length); previewTimer = setTimeout(tick, seconds * 1000);
    }
    tick();
  }
  function newDraft() {
    clean(); stopPreview(); onionToken++; identity = ''; raster = new Raster(kind === 'costume' ? 64 : 480, kind === 'costume' ? 64 : 320); dirty = true; selection = null; onion = null; undo.length = redo.length = 0; revision = revisionNow();
    el<HTMLInputElement>('art-name').value = kind === 'costume' ? 'New costume' : 'New backdrop'; library(); paint();
  }
  function on(id: string, action: () => void | Promise<void>) { el(id).addEventListener('click', () => { void attempt(action); }); }
  on('art-new', newDraft); on('art-save', () => save()); on('art-save-copy', () => save(true));
  on('art-duplicate', async () => { clean(); el<HTMLInputElement>('art-name').value = el<HTMLInputElement>('art-name').value.slice(0, 40).trim() + ' copy'; await save(true); });
  on('art-delete', async () => { clean(); changeScene(workspace, removeAsset(scene(), kind, identity)); await load(''); });
  on('art-revert', () => load(identity));
  for (const [id, redo] of [['art-project-undo', false], ['art-project-redo', true]] as const) on(id, async () => { clean(); workspace.undo(redo); await load(identity); });
  list.addEventListener('change', () => { const next = list.value; list.value = identity; void attempt(async () => { clean(); await load(next); }); });
  el('art-kind').addEventListener('change', () => { const next = el<HTMLSelectElement>('art-kind').value as AssetKind; el<HTMLSelectElement>('art-kind').value = kind; void attempt(async () => { clean(); kind = next; await load(''); }); });
  el('art-name').addEventListener('input', () => { dirty = true; paint(); });
  el('art-zoom').addEventListener('change', paint); el('art-onion').addEventListener('change', () => { void attempt(loadOnion); });
  on('art-undo', () => { if (undo.length) { redo.push(raster); raster = undo.pop()!; dirty = true; selection = null; paint(); } });
  on('art-redo', () => { if (redo.length) { undo.push(raster); raster = redo.pop()!; dirty = true; selection = null; paint(); } });
  for (const operation of ['flip-x', 'flip-y', 'rotate'] as const) on(`art-${operation}`, () => { remember(); raster.transform(selection ?? raster.all(), operation); selection = null; paint(); });
  on('art-clear', () => { remember(); raster.clear(selection ?? raster.all()); paint(); }); on('art-deselect', () => { selection = null; paint(); });
  for (const scale of [false, true]) on(scale ? 'art-scale' : 'art-resize', () => {
    const width = el<HTMLInputElement>('art-width').valueAsNumber, height = el<HTMLInputElement>('art-height').valueAsNumber;
    if (kind === 'costume' && (width > 256 || height > 256)) throw new Error('Costumes fit within 256 × 256 pixels.');
    const next = raster.resize(width, height, scale); remember(); raster = next; selection = null; paint();
  });
  on('art-export', () => { const a = document.createElement('a'); a.href = draftCanvas().toDataURL('image/png'); a.download = (el<HTMLInputElement>('art-name').value.trim() || 'artwork') + '.png'; a.click(); });
  on('art-import', () => { clean(); el<HTMLInputElement>('art-file').click(); });
  el('art-file').addEventListener('change', () => { const file = el<HTMLInputElement>('art-file').files?.[0]; el<HTMLInputElement>('art-file').value = ''; if (!file) return;
    void attempt(async () => {
      clean(); if (file.size > 2_000_000 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG or WebP up to 2 MB.');
      const before = revisionNow(), bitmap = await createImageBitmap(file);
      try {
        if (before !== revisionNow()) throw new Error('The project changed during import. Choose the image again.');
        const scale = Math.min(1, (kind === 'costume' ? 256 : 480) / bitmap.width, (kind === 'costume' ? 256 : 320) / bitmap.height);
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bitmap.width * scale)); c.height = Math.max(1, Math.round(bitmap.height * scale)); const context = c.getContext('2d')!; context.drawImage(bitmap, 0, 0, c.width, c.height);
        onionToken++; identity = ''; raster = new Raster(c.width, c.height, context.getImageData(0, 0, c.width, c.height).data); revision = before; dirty = true; selection = null; onion = null; undo.length = redo.length = 0;
        el<HTMLInputElement>('art-name').value = file.name.slice(0, 48).trim() || 'Imported artwork'; library(); paint();
      } finally { bitmap.close(); }
    });
  });
  async function frameMutation(action: (frames: string[]) => number | void) {
    clean(); stopPreview(); let index = Number(framesSelect.value || 0);
    mutate(state => {
      const sprite = state.sprites.find(s => s.id === spriteSelect.value); if (!sprite) throw new Error('Choose a sprite.');
      const frames = [...spriteFrames(sprite)], result = action(frames); if (!frames.length) throw new Error('Keep at least one frame.');
      sprite.costumes = frames; index = result ?? Math.min(index, frames.length - 1);
    });
    framesSelect.value = String(index); const sprite = scene().sprites.find(s => s.id === spriteSelect.value)!; await load(spriteFrames(sprite)[index]);
  }
  spriteSelect.addEventListener('change', () => { frameControls(); stopPreview(); void loadOnion().catch(error); });
  framesSelect.addEventListener('change', () => { void attempt(async () => { clean(); const sprite = scene().sprites.find(s => s.id === spriteSelect.value); if (sprite) await load(spriteFrames(sprite)[Number(framesSelect.value)]); }); });
  on('art-frame-add', () => frameMutation(frames => { if (!assetsFor(scene(), 'costume').some(a => a.id === identity)) throw new Error('Save this artwork first.'); frames.push(identity); return frames.length - 1; }));
  on('art-frame-remove', () => frameMutation(frames => { frames.splice(Number(framesSelect.value), 1); }));
  for (const [id, shift] of [['art-frame-up', -1], ['art-frame-down', 1]] as const) on(id, () => { const index = Number(framesSelect.value); return frameMutation(frames => { const to = Math.max(0, Math.min(frames.length - 1, index + shift)); [frames[index], frames[to]] = [frames[to], frames[index]]; return to; }); });
  on('art-frame-copy', async () => { clean(); const sprite = scene().sprites.find(s => s.id === spriteSelect.value); if (!sprite) return; await load(spriteFrames(sprite)[Number(framesSelect.value)]); el<HTMLInputElement>('art-name').value = el<HTMLInputElement>('art-name').value.slice(0, 40).trim() + ' copy'; await save(true); });
  on('art-speed-save', () => { clean(); const seconds = el<HTMLInputElement>('art-seconds').valueAsNumber; mutate(state => { const sprite = state.sprites.find(s => s.id === spriteSelect.value); if (sprite) sprite.frameSeconds = seconds; }); stopPreview(); }); on('art-play', preview);
  const point = (event: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(raster.width - 1, Math.floor((event.clientX - r.left) * raster.width / r.width))), y: Math.max(0, Math.min(raster.height - 1, Math.floor((event.clientY - r.top) * raster.height / r.height))) }; };
  const rect = (x: number, y: number, nx: number, ny: number): Rect => ({ x: Math.min(x, nx), y: Math.min(y, ny), width: Math.abs(nx - x) + 1, height: Math.abs(ny - y) + 1 });
  function draw(x: number, y: number) {
    if (!drag) return; const d = drag, size = Math.max(1, Math.min(32, el<HTMLInputElement>('art-size').valueAsNumber || 1));
    const color: Color = d.tool === 'eraser' ? [0, 0, 0, 0] : hexColor(el<HTMLInputElement>('art-color').value);
    if (d.tool === 'brush' || d.tool === 'eraser') raster.line(d.lastX, d.lastY, x, y, color, size);
    else {
      raster = d.before.copy();
      if (d.tool === 'select') selection = rect(d.x, d.y, x, y);
      if (d.tool === 'move' && d.selection) {
        const dx = Math.max(-d.selection.x, Math.min(raster.width - d.selection.x - d.selection.width, x - d.x)), dy = Math.max(-d.selection.y, Math.min(raster.height - d.selection.y - d.selection.height, y - d.y));
        raster.move(d.selection, dx, dy); selection = { ...d.selection, x: d.selection.x + dx, y: d.selection.y + dy };
      }
      if (d.tool === 'line') raster.line(d.x, d.y, x, y, color, size);
      if (d.tool === 'rectangle' || d.tool === 'ellipse') raster.shape(rect(d.x, d.y, x, y), d.tool, color, el<HTMLInputElement>('art-filled').checked, size);
    }
    d.lastX = x; d.lastY = y; paint();
  }
  canvas.addEventListener('pointerdown', event => {
    if (busy || !canEdit() || !event.isPrimary || event.button !== 0) return;
    canvas.focus(); const { x, y } = point(event), tool = el<HTMLSelectElement>('art-tool').value;
    if (tool === 'pick') { el<HTMLInputElement>('art-color').value = '#' + raster.color(x, y).slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); return; }
    if (tool === 'fill') { remember(); raster.fill(x, y, hexColor(el<HTMLInputElement>('art-color').value)); paint(); return; }
    if (tool === 'move' && !selection) { error(new Error('Select a rectangle first.')); return; }
    drag = { pointer: event.pointerId, x, y, lastX: x, lastY: y, before: raster.copy(), selection: selection && { ...selection }, tool };
    canvas.setPointerCapture(event.pointerId); draw(x, y);
  });
  canvas.addEventListener('pointermove', event => { if (drag?.pointer === event.pointerId) { const p = point(event); draw(p.x, p.y); } });
  function end(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return; const d = drag; drag = null;
    if (event.type === 'pointerup') { if (d.tool !== 'select') remember(d.before); }
    else { raster = d.before; selection = d.selection; }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); paint();
  }
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('keydown', event => {
    if (!selection || busy || !canEdit()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remember(); raster.clear(selection); paint(); return; }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key]; if (!move) return; event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    const dx = Math.max(-selection.x, Math.min(raster.width - selection.x - selection.width, move[0] * step)), dy = Math.max(-selection.y, Math.min(raster.height - selection.y - selection.height, move[1] * step));
    remember(); raster.move(selection, dx, dy); selection = { ...selection, x: selection.x + dx, y: selection.y + dy }; paint();
  });
  el('art-close').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', stopPreview);
  return {
    open(target?: {kind:'costume'|'backdrop';id:string}) { dialog.showModal(); if (!dirty) void attempt(async () => { spriteSelect.value = selectedSprite(); if (target) kind = target.kind; await load(target?.id ?? (identity || (kind === 'costume' ? scene().sprites.find(s => s.id === selectedSprite())?.costume ?? 'bird' : scene().backdrop ?? 'backdrop_meadow'))); }); else { paint(); if (target) el('art-state').textContent = 'Your unsaved artwork draft is still open. Save or discard it before changing artwork.'; } },
    close() { dialog.close(); stopPreview(); },
    dispose() { stopPreview(); loadToken++; onionToken++; dialog.remove(); },
  };
}
