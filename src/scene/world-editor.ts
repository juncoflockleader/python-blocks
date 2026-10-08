import type * as Blockly from 'blockly/core';
import { backdrops, costumes, type SceneState } from './model';
import { assetCanvas } from './assets';
import { sceneState, changeScene } from './state';
import { cameraPosition, defaultCamera, newMap, resizeMap, type World } from './world';

export function installWorldEditor(workspace: Blockly.WorkspaceSvg, editable: () => boolean, openLibrary: () => void) {
  document.getElementById('scene-art')!.insertAdjacentHTML('afterend', '<button id="scene-worlds" class="button secondary">Worlds & tilemaps</button>');
  document.body.insertAdjacentHTML('beforeend', `<dialog id="world-dialog" aria-labelledby="world-title"><h2 id="world-title">Worlds & tilemaps</h2>
    <p>Each world has its own tiles, backdrop and local sprites. Global sprites stay when worlds change. Choose the starting world here, then close to place sprites on the stage.</p>
    <div class="scene-toolbar"><label>Starting / editing world <select id="world-select"></select></label><button id="world-stock" class="button primary">World library</button><button id="world-new" class="button secondary">New world</button><button id="world-copy" class="button secondary">Duplicate world</button><button id="world-delete" class="button secondary">Remove world (keep sprites)</button></div>
    <form id="world-form"><fieldset id="world-fields"><legend>World settings</legend><div class="scene-properties-grid">
      <label>Name <input id="world-name" maxlength="48" required></label><label>Background <input id="world-background" type="color"></label><label>Backdrop <select id="world-backdrop"></select></label>
      <label>Columns <input id="world-columns" type="number" min="1" max="64" required></label><label>Rows <input id="world-rows" type="number" min="1" max="64" required></label><label>Tile pixels <select id="world-size"><option>8</option><option>16</option><option>32</option><option>64</option></select></label>
      <label>Camera x <input id="world-camera-x" type="number" min="-999000" max="999000" step="any" required></label><label>Camera y <input id="world-camera-y" type="number" min="-999000" max="999000" step="any" required></label><label>Follow <select id="world-follow"></select></label><label>Clamp camera to map <input id="world-clamp" type="checkbox"></label>
      </div><p>Resizing keeps the top-left tiles and crops tiles beyond the new bounds. Project Undo restores them. Column and row numbers start at 0.</p><button class="button primary" type="submit">Apply world settings</button></fieldset></form>
    <fieldset id="world-paint"><legend>Paint tiles & place the camera</legend><div class="scene-toolbar"><label>Tile artwork <select id="world-costume"></select></label><label>Tool <select id="world-tool"><option value="paint">Paint</option><option value="erase">Erase tile & wall</option><option value="fill">Fill connected area</option><option value="rectangle">Filled rectangle</option><option value="wall">Set wall only</option><option value="view">Move camera here</option></select></label><label>Solid <input id="world-solid" type="checkbox"></label><label>Map zoom <select id="world-zoom"><option value="0">Fit overview</option><option value="16">16 px cells</option><option value="32">32 px cells</option><option value="48">48 px cells</option></select></label></div>
      <p>Paint by dragging. Use arrow keys on the map to choose a tile; Enter or Space applies the tool. Orange outlines mark solid tiles; the blue box is the starting camera. Artwork & frames can create or edit tile costumes.</p>
      <div id="world-map-scroll"><canvas id="world-map" width="512" height="320" tabindex="0" role="img" aria-label="Tilemap editor. Arrow keys choose a tile; Enter paints it."></canvas></div><p id="world-cursor" role="status"></p>
    </fieldset><div class="scene-toolbar" aria-label="World edit history"><button id="world-undo" class="button secondary">Undo</button><button id="world-redo" class="button secondary">Redo</button></div><p id="world-error" role="alert"></p><button id="world-close" class="button secondary">Close</button></dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('world-dialog'), canvas = el<HTMLCanvasElement>('world-map'), ctx = canvas.getContext('2d')!;
  const active = (state: SceneState) => state.worlds?.find(w => w.id === state.world);
  let displayed = '', cursor = { column: 0, row: 0 }, images = new Map<string, HTMLCanvasElement>();
  let draft: SceneState | null = null, stroke: { pointer: number; column: number; row: number; before: string } | null = null;
  const attempt = (fn: () => void) => { try { el('world-error').textContent = ''; fn(); } catch (e) { el('world-error').textContent = e instanceof Error ? e.message : String(e); } };
  function save(state: SceneState) { if (!editable()) throw new Error('Stop and reset the stage before editing worlds.'); changeScene(workspace, state); refresh(); }
  function draw() {
    const state = draft ?? sceneState(workspace), world = active(state);
    ctx.clearRect(0, 0, canvas.width, canvas.height); if (!world) return;
    const m = world.map, zoom = Number(el<HTMLSelectElement>('world-zoom').value), scale = zoom || Math.min(512 / m.columns, 384 / m.rows);
    canvas.style.maxWidth = zoom ? 'none' : '100%'; canvas.style.width = zoom ? `${m.columns * scale}px` : '';
    canvas.width = Math.round(m.columns * scale); canvas.height = Math.round(m.rows * scale); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = world.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < m.rows; r++) for (let c = 0; c < m.columns; c++) {
      const i = r * m.columns + c, image = images.get(m.tiles[i] ?? '');
      if (image) ctx.drawImage(image, c * scale, r * scale, scale, scale);
      ctx.lineWidth = m.walls[i] ? 2 : .5; ctx.strokeStyle = m.walls[i] ? '#b34915' : '#9ca99d'; ctx.strokeRect(c * scale + .5, r * scale + .5, scale - 1, scale - 1);
    }
    const camera = cameraPosition(world.camera, m, state.sprites.find(s => s.id === world.camera.follow && (!s.world || s.world === world.id)));
    ctx.lineWidth = 2; ctx.strokeStyle = '#186ea5'; ctx.strokeRect(camera.x / m.tileSize * scale + 1, -camera.y / m.tileSize * scale + 1, 480 / m.tileSize * scale - 2, 320 / m.tileSize * scale - 2);
    for (const s of state.sprites.filter(s => !s.world || s.world === world.id)) { ctx.fillStyle = '#253e43'; ctx.beginPath(); ctx.arc((s.x + 240) / m.tileSize * scale, (160 - s.y) / m.tileSize * scale, 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#101b2b'; ctx.lineWidth = 2; ctx.strokeRect(cursor.column * scale + 2, cursor.row * scale + 2, scale - 4, scale - 4);
    el('world-cursor').textContent = `Column ${cursor.column}, row ${cursor.row} · ${m.columns * m.tileSize} × ${m.rows * m.tileSize} world pixels`;
  }
  function refresh() {
    if (!dialog.open || draft) return;
    const state = sceneState(workspace), fingerprint = JSON.stringify(state);
    if (fingerprint === displayed) return;
    displayed = fingerprint; const world = active(state);
    el<HTMLSelectElement>('world-select').replaceChildren(new Option('Base stage (no tilemap)', ''), ...(state.worlds ?? []).map(w => new Option(w.name, w.id))); el<HTMLSelectElement>('world-select').value = state.world ?? '';
    for (const id of ['world-fields', 'world-paint']) el<HTMLFieldSetElement>(id).disabled = !world || !editable();
    for (const id of ['world-copy', 'world-delete']) el<HTMLButtonElement>(id).disabled = !world || !editable();
    el<HTMLButtonElement>('world-new').disabled = !editable();
    el<HTMLButtonElement>('world-stock').disabled = !editable();
    const palette = el<HTMLSelectElement>('world-costume'), previous = palette.options.length ? palette.value : 'box';
    el<HTMLSelectElement>('world-costume').replaceChildren(new Option('Empty / invisible wall', ''), ...costumes(state).map(a => new Option(a.name, a.id))); el<HTMLSelectElement>('world-costume').value = previous;
    if (world) {
      el<HTMLInputElement>('world-name').value = world.name; el<HTMLInputElement>('world-background').value = world.background;
      el<HTMLSelectElement>('world-backdrop').replaceChildren(new Option('Plain color', ''), ...backdrops(state).map(a => new Option(a.name, a.id))); el<HTMLSelectElement>('world-backdrop').value = world.backdrop ?? '';
      for (const key of ['columns', 'rows'] as const) el<HTMLInputElement>('world-' + key).value = String(world.map[key]);
      el<HTMLSelectElement>('world-size').value = String(world.map.tileSize);
      for (const axis of ['x', 'y'] as const) el<HTMLInputElement>('world-camera-' + axis).value = String(world.camera[axis]);
      el<HTMLInputElement>('world-clamp').checked = world.camera.clamp;
      el<HTMLSelectElement>('world-follow').replaceChildren(new Option('Fixed position', ''), ...state.sprites.filter(s => !s.world || s.world === world.id).map(s => new Option(s.name, s.id))); el<HTMLSelectElement>('world-follow').value = world.camera.follow ?? '';
      cursor.column = Math.min(cursor.column, world.map.columns - 1); cursor.row = Math.min(cursor.row, world.map.rows - 1);
    }
    draw();
    void Promise.all(costumes(state).map(async a => [a.id, await assetCanvas(a, 'costume')] as const)).then(entries => { if (displayed !== fingerprint) return; images = new Map(entries); draw(); }).catch(e => { el('world-error').textContent = String(e); });
  }
  const newName = (state: SceneState) => { let n = 1; while (state.worlds?.some(w => w.name === `World ${n}`)) n++; return `World ${n}`; };
  el('world-stock').addEventListener('click', () => { if (editable()) openLibrary(); });
  el('world-new').addEventListener('click', () => attempt(() => {
    const state = sceneState(workspace), w: World = { id: crypto.randomUUID(), name: newName(state), background: state.background, backdrop: state.backdrop, map: newMap(), camera: defaultCamera() };
    (state.worlds ??= []).push(w); state.world = w.id; save(state);
  }));
  el('world-select').addEventListener('change', () => attempt(() => { const state = sceneState(workspace); state.world = el<HTMLSelectElement>('world-select').value || null; save(state); }));
  el('world-copy').addEventListener('click', () => attempt(() => {
    const state = sceneState(workspace), old = active(state)!; const world = structuredClone(old); world.id = crypto.randomUUID(); world.name = newName(state);
    const names = new Set(state.sprites.map(s => s.name));
    for (const original of state.sprites.filter(s => s.world === old.id)) {
      const sprite = structuredClone(original); sprite.id = crypto.randomUUID(); sprite.world = world.id; let n = 1; while (names.has(`${original.name.slice(0, 30)} copy ${n}`)) n++;
      sprite.name = `${original.name.slice(0, 30)} copy ${n}`; names.add(sprite.name); state.sprites.push(sprite);
      if (world.camera.follow === original.id) world.camera.follow = sprite.id;
    }
    state.worlds!.push(world); state.world = world.id; save(state);
  }));
  el('world-delete').addEventListener('click', () => attempt(() => {
    const state = sceneState(workspace); state.sprites.forEach(s => { if (s.world === state.world) delete s.world; }); state.worlds = state.worlds!.filter(w => w.id !== state.world); state.world = null; save(state);
  }));
  el('world-form').addEventListener('submit', event => { event.preventDefault(); attempt(() => {
    const state = sceneState(workspace), world = active(state)!;
    world.name = el<HTMLInputElement>('world-name').value.trim(); world.background = el<HTMLInputElement>('world-background').value; world.backdrop = el<HTMLSelectElement>('world-backdrop').value || null;
    world.map = resizeMap(world.map, el<HTMLInputElement>('world-columns').valueAsNumber, el<HTMLInputElement>('world-rows').valueAsNumber, Number(el<HTMLSelectElement>('world-size').value));
    world.camera = { x: el<HTMLInputElement>('world-camera-x').valueAsNumber, y: el<HTMLInputElement>('world-camera-y').valueAsNumber, follow: el<HTMLSelectElement>('world-follow').value || null, clamp: el<HTMLInputElement>('world-clamp').checked };
    save(state);
  }); });
  function applyCell(state: SceneState, column: number, row: number, tool = el<HTMLSelectElement>('world-tool').value) {
    const world = active(state)!; const map = world.map, index = row * map.columns + column;
    const costume = el<HTMLSelectElement>('world-costume').value || null, solid = el<HTMLInputElement>('world-solid').checked;
    if (tool === 'view') { world.camera = { ...world.camera, follow: null, x: -240 + (column + .5) * map.tileSize, y: 160 - (row + .5) * map.tileSize }; return; }
    const paint = (i: number) => { if (tool !== 'wall') map.tiles[i] = tool === 'erase' ? null : costume; map.walls[i] = tool === 'erase' ? false : solid; };
    if (tool !== 'fill') { paint(index); return; }
    const original = map.tiles[index], wall = map.walls[index], queue = [index], visited = new Set<number>();
    while (queue.length) {
      const i = queue.pop()!; if (visited.has(i)) continue; visited.add(i);
      if (map.tiles[i] !== original || map.walls[i] !== wall) continue;
      paint(i); if (i % map.columns) queue.push(i - 1); if (i % map.columns < map.columns - 1) queue.push(i + 1); if (i >= map.columns) queue.push(i - map.columns); if (i + map.columns < map.tiles.length) queue.push(i + map.columns);
    }
  }
  function point(event: PointerEvent) { const m = active(draft ?? sceneState(workspace))!.map, rect = canvas.getBoundingClientRect(); return { column: Math.max(0, Math.min(m.columns - 1, Math.floor((event.clientX - rect.left) / rect.width * m.columns))), row: Math.max(0, Math.min(m.rows - 1, Math.floor((event.clientY - rect.top) / rect.height * m.rows))) }; }
  canvas.addEventListener('pointerdown', event => {
    if (!editable() || !event.isPrimary || event.button !== 0 || !active(sceneState(workspace))) return;
    canvas.focus(); draft = sceneState(workspace); cursor = point(event); stroke = { pointer: event.pointerId, ...cursor, before: JSON.stringify(draft) }; canvas.setPointerCapture(event.pointerId);
    applyCell(draft, cursor.column, cursor.row); draw();
  });
  canvas.addEventListener('pointermove', event => {
    if (!draft || !stroke || event.pointerId !== stroke.pointer) return; const previous = cursor; cursor = point(event); const tool = el<HTMLSelectElement>('world-tool').value;
    if (tool === 'rectangle') { draft = JSON.parse(stroke.before) as SceneState; for (let r = Math.min(cursor.row, stroke.row); r <= Math.max(cursor.row, stroke.row); r++) for (let c = Math.min(cursor.column, stroke.column); c <= Math.max(cursor.column, stroke.column); c++) applyCell(draft, c, r); }
    else if (tool !== 'fill') { const steps = Math.max(Math.abs(cursor.column - previous.column), Math.abs(cursor.row - previous.row)); for (let i = 1; i <= steps; i++) applyCell(draft, Math.round(previous.column + (cursor.column - previous.column) * i / steps), Math.round(previous.row + (cursor.row - previous.row) * i / steps)); }
    draw();
  });
  function end(event: PointerEvent) {
    if (!stroke || !draft || event.pointerId !== stroke.pointer) return;
    const next = draft, before = stroke.before; draft = null; stroke = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    attempt(() => { if (event.type !== 'pointerup') { draw(); return; } if (before !== JSON.stringify(sceneState(workspace))) throw new Error('The project changed while painting. The stroke was not applied.'); save(next); });
  }
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, end as EventListener);
  canvas.addEventListener('keydown', event => {
    const state = sceneState(workspace), w = active(state); if (!w || !editable() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); cursor.column = Math.max(0, Math.min(w.map.columns - 1, cursor.column + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0))); cursor.row = Math.max(0, Math.min(w.map.rows - 1, cursor.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0))); draw(); const container = el('world-map-scroll'), x = cursor.column * canvas.clientWidth / w.map.columns, y = cursor.row * canvas.clientHeight / w.map.rows; if (x < container.scrollLeft || x > container.scrollLeft + container.clientWidth - 48) container.scrollLeft = Math.max(0, x - container.clientWidth / 2); if (y < container.scrollTop || y > container.scrollTop + container.clientHeight - 48) container.scrollTop = Math.max(0, y - container.clientHeight / 2); }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); attempt(() => { applyCell(state, cursor.column, cursor.row); save(state); }); }
  });
  el('world-zoom').addEventListener('change', draw);
  el('world-undo').addEventListener('click', () => { workspace.undo(false); refresh(); }); el('world-redo').addEventListener('click', () => { workspace.undo(true); refresh(); });
  el('scene-worlds').addEventListener('click', () => { if (!editable()) return; displayed = ''; dialog.showModal(); refresh(); });
  const close = () => { draft = null; stroke = null; dialog.close(); };
  el('world-close').addEventListener('click', close); dialog.addEventListener('cancel', close);
  const changed = () => refresh(); workspace.addChangeListener(changed);
  return { close, dispose() { workspace.removeChangeListener(changed); dialog.remove(); } };
}
