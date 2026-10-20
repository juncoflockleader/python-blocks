import type { Stage } from '../stage';

/** The learner's view of the stage while editing: pan and zoom around a world
 * bigger than one screen, a minimap, screen guides and buttons to add screens.
 * The view is an editing aid only: it is never saved and never moves the game's
 * camera. While the game runs the stage shows the camera and the map follows it.
 *
 * Pan: drag empty space (or anything with the Pan tool, while holding Space, or
 * with the middle button), two fingers, scroll, or the arrow keys. Zoom: pinch,
 * Ctrl/⌘ + scroll, + and −. F fits the world; Home goes to where the game starts. */
export interface View { x: number; y: number; zoom: number }
export type StageTool = 'select' | 'pan';
export interface StageViewHost {
  editing(): boolean;
  /** The current world's key ('' for the plain stage), to remember a view per world. */
  world(): string;
  /** Screens wide and tall, and the most the world can have. */
  screens(): { wide: number; tall: number; maxWide: number; maxTall: number };
  resize(wide: number, tall: number): boolean;
  /** The selected sprite's name, for the off-screen chip. */
  selectedName(): string;
}
export const MIN_ZOOM = 0.25, MAX_ZOOM = 1.5;
const SCREEN_W = 480, SCREEN_H = 320;

export function installStageView(stage: Stage, canvas: HTMLCanvasElement, host: StageViewHost) {
  const wrap = canvas.closest<HTMLElement>('.stage-wrap')!;
  wrap.insertAdjacentHTML('beforeend', `<div id="stage-map" class="stage-map" hidden><div class="stage-map-head"><span id="stage-map-title">Map</span><button id="stage-map-hide" class="stage-map-hide" type="button" aria-label="Hide the map" title="Hide the map">–</button></div>
      <div id="stage-map-body" class="stage-map-body"><canvas id="stage-map-canvas" width="180" height="120" aria-hidden="true"></canvas><div id="stage-map-screens" class="stage-map-screens" role="group" aria-label="Screens: arrow keys choose one, Enter shows it"></div></div>
      <p id="stage-map-note" class="stage-map-note">Tap to jump · drag to pan</p></div>
    <button id="stage-map-show" class="stage-map-show" type="button" hidden aria-label="Show the map of the world">Map</button>
    <button id="stage-offscreen" class="stage-offscreen" type="button" hidden></button>
    <button id="stage-add-right" class="stage-add level-builder" type="button" hidden aria-label="Add a screen to the right">Add screen</button>
    <button id="stage-add-down" class="stage-add level-builder" type="button" hidden aria-label="Add a screen below">Add screen</button>`);
  document.getElementById('stage-toolbar')!.insertAdjacentHTML('beforeend', `<div id="stage-zoom" class="stage-zoom" role="group" aria-label="Zoom"><button id="stage-zoom-out" class="button secondary ui-icon-only" type="button" title="Zoom out (−)">Zoom out</button><button id="stage-zoom-fit" class="button secondary stage-zoom-level" type="button" title="Fit the world, or back to 100%">100%</button><button id="stage-zoom-in" class="button secondary ui-icon-only" type="button" title="Zoom in (+)">Zoom in</button></div>`);
  document.getElementById('stage-rail')?.insertAdjacentHTML('beforeend', `<button id="stage-tool-select" class="button secondary ui-icon-only rail-button" type="button" aria-pressed="true" title="Select and drag sprites">Select</button>
    <button id="stage-tool-pan" class="button secondary ui-icon-only rail-button" type="button" aria-pressed="false" title="Pan: drag to look around (or hold Space)">Pan</button>
    <span class="rail-divider" aria-hidden="true"></span>
    <button id="stage-fit" class="button secondary ui-icon-only rail-button" type="button" title="Fit the whole world (F)">Fit world</button>
    <button id="stage-home" class="button secondary ui-icon-only rail-button" type="button" title="Where the game starts (Home)">Start view</button>
    <button id="stage-grid" class="button secondary ui-icon-only rail-button" type="button" aria-pressed="true" title="Screen lines and numbers">Screen lines</button>`);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const map = el<HTMLCanvasElement>('stage-map-canvas'), mapContext = map.getContext('2d')!;
  const views = new Map<string, View>();
  let tool: StageTool = 'select', space = false, mapHidden: boolean | null = null, frame = 0, focusScreen = 0;
  const pointers = new Map<number, { x: number; y: number }>(), claimed = new Set<number>();
  let gesture: { kind: 'pan'; id: number; x: number; y: number; view: View } | { kind: 'pinch'; distance: number; mid: { x: number; y: number }; view: View } | null = null;

  const rect = () => stage.worldRect();
  const stageView = () => document.documentElement.dataset.view === 'stage';
  /** The zoom that shows the whole world with a small margin (never above 100%). */
  const fitZoom = () => { const r = rect(); return Math.min(1, SCREEN_W / r.width, SCREEN_H / r.height) * 0.94; };
  const minZoom = () => Math.min(MIN_ZOOM, fitZoom());
  const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(minZoom(), zoom));
  /** Keep the view on the world: centred along a side that fits, otherwise with at least a quarter of the view on it. */
  const clamp = (view: View): View => {
    const r = rect(), zoom = clampZoom(view.zoom), viewW = SCREEN_W / zoom, viewH = SCREEN_H / zoom;
    const x = r.width <= viewW ? r.left + r.width / 2 : Math.min(r.left + r.width + viewW / 4, Math.max(r.left - viewW / 4, view.x));
    const y = r.height <= viewH ? r.top - r.height / 2 : Math.max(r.top - r.height - viewH / 4, Math.min(r.top + viewH / 4, view.y));
    return { x, y, zoom };
  };
  const current = (): View => views.get(host.world()) ?? { ...stage.startView(), zoom: 1 };
  function set(view: View) {
    if (!host.editing()) return;
    const next = clamp(view); views.set(host.world(), next); stage.setView(next); controls();
  }
  /** Re-apply the remembered view after the scene changes, or show the camera while the game runs. */
  function sync() {
    if (host.editing()) { const view = clamp(current()); views.set(host.world(), view); stage.setView(view); }
    else stage.setView(null);
    controls();
  }
  /** A client point in canvas units from the centre (y up). */
  const offset = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect();
    return { x: (clientX - box.left) * SCREEN_W / box.width - SCREEN_W / 2, y: SCREEN_H / 2 - (clientY - box.top) * SCREEN_H / box.height };
  };
  /** Zoom to `zoom`, keeping the world point under `at` (default the centre) in place. */
  function zoomTo(zoom: number, at?: { x: number; y: number }, from = stage.shown()) {
    const next = clampZoom(zoom), o = at ? offset(at.x, at.y) : { x: 0, y: 0 };
    set({ x: from.x + o.x / from.zoom - o.x / next, y: from.y + o.y / from.zoom - o.y / next, zoom: next });
  }
  const zoomBy = (factor: number, at?: { x: number; y: number }) => zoomTo(stage.shown().zoom * factor, at);
  const fit = () => { const r = rect(); set({ x: r.left + r.width / 2, y: r.top - r.height / 2, zoom: fitZoom() }); };
  /** Where the game starts, at 100% (or keeping the zoom). */
  const home = (reset = true) => set({ ...stage.startView(), zoom: reset ? 1 : stage.shown().zoom });
  const centerOn = (x: number, y: number) => set({ ...stage.shown(), x, y });
  const screenCentre = (index: number) => { const wide = host.screens().wide, r = rect(); return { x: r.left + SCREEN_W * (index % wide + .5), y: r.top - SCREEN_H * (Math.floor(index / wide) + .5) }; };

  // Pointer gestures. The sprite editor drags sprites; these listeners are added
  // first, so a pan or pinch claims its pointers before the editor sees them.
  const claim = (event: Event) => { event.stopImmediatePropagation(); event.preventDefault(); };
  const down = (event: PointerEvent) => {
    if (!host.editing()) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: stage.shown() };
      for (const id of pointers.keys()) claimed.add(id);
      canvas.setPointerCapture(event.pointerId); claim(event); return;
    }
    if (!event.isPrimary || pointers.size > 2) return;
    const point = stage.point(event.clientX, event.clientY);
    const pan = tool === 'pan' || space || event.button === 1 || (event.button === 0 && !stage.hit(point.x, point.y));
    if (!pan) return;
    gesture = { kind: 'pan', id: event.pointerId, x: event.clientX, y: event.clientY, view: stage.shown() }; claimed.add(event.pointerId);
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); canvas.classList.add('stage-panning');
    claim(event);
  };
  const move = (event: PointerEvent) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!claimed.has(event.pointerId)) return;
    event.stopImmediatePropagation();
    if (!gesture || !host.editing()) return;
    if (gesture.kind === 'pan' && gesture.id === event.pointerId) {
      const box = canvas.getBoundingClientRect(), k = SCREEN_W / box.width / gesture.view.zoom;
      set({ ...gesture.view, x: gesture.view.x - (event.clientX - gesture.x) * k, y: gesture.view.y + (event.clientY - gesture.y) * k });
    } else if (gesture.kind === 'pinch' && pointers.size >= 2) {
      // The world point under the first midpoint stays under the fingers' midpoint.
      const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, from = gesture.view;
      const zoom = clampZoom(from.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance), o0 = offset(gesture.mid.x, gesture.mid.y), o1 = offset(mid.x, mid.y);
      set({ x: from.x + o0.x / from.zoom - o1.x / zoom, y: from.y + o0.y / from.zoom - o1.y / zoom, zoom });
    }
  };
  const up = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (!claimed.delete(event.pointerId)) return;
    event.stopImmediatePropagation();
    if (gesture?.kind === 'pan' || claimed.size === 0) gesture = null;
    if (!gesture) canvas.classList.remove('stage-panning');
  };
  const wheel = (event: WheelEvent) => {
    if (!host.editing()) return;
    event.preventDefault();
    const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 320 : 1;
    if (event.ctrlKey || event.metaKey) { zoomBy(Math.exp(-event.deltaY * line * 0.0025), { x: event.clientX, y: event.clientY }); return; }
    const view = stage.shown(), box = canvas.getBoundingClientRect(), k = SCREEN_W / box.width / view.zoom;
    set({ ...view, x: view.x + event.deltaX * line * k, y: view.y - event.deltaY * line * k });
  };
  const keydown = (event: KeyboardEvent) => {
    if (!host.editing() || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') { if (!event.repeat) { space = true; canvas.classList.add('stage-pan-ready'); } event.preventDefault(); return; }
    const view = stage.shown(), step = 60 / view.zoom;
    const actions: Record<string, () => void> = {
      '+': () => zoomBy(1.25), '=': () => zoomBy(1.25), '-': () => zoomBy(0.8), _: () => zoomBy(0.8), f: fit, F: fit, Home: () => home(),
      ArrowLeft: () => set({ ...view, x: view.x - step }), ArrowRight: () => set({ ...view, x: view.x + step }),
      ArrowUp: () => set({ ...view, y: view.y + step }), ArrowDown: () => set({ ...view, y: view.y - step }),
    };
    const action = actions[event.key]; if (!action) return;
    event.preventDefault(); action();
  };
  const release = () => { space = false; canvas.classList.remove('stage-pan-ready'); };
  const keyup = (event: KeyboardEvent) => { if (event.key === ' ') release(); };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', keydown); canvas.addEventListener('keyup', keyup); canvas.addEventListener('blur', release);

  // The minimap: tap or drag to move the view there. Its screen buttons sit over
  // the map for the keyboard (one tab stop; arrows choose, Enter jumps).
  const body = el('stage-map-body'), screens = el('stage-map-screens');
  const mapPoint = (event: PointerEvent) => {
    const box = map.getBoundingClientRect(), r = rect();
    return { x: r.left + (event.clientX - box.left) / box.width * r.width, y: r.top - (event.clientY - box.top) / box.height * r.height };
  };
  let mapDrag: number | null = null;
  const mapDown = (event: PointerEvent) => { if (!host.editing() || event.button !== 0) return; mapDrag = event.pointerId; body.setPointerCapture(event.pointerId); const p = mapPoint(event); centerOn(p.x, p.y); event.preventDefault(); };
  const mapMove = (event: PointerEvent) => { if (mapDrag !== event.pointerId) return; const p = mapPoint(event); centerOn(p.x, p.y); };
  const mapUp = (event: PointerEvent) => { if (mapDrag === event.pointerId) mapDrag = null; };
  body.addEventListener('pointerdown', mapDown); body.addEventListener('pointermove', mapMove); body.addEventListener('pointerup', mapUp); body.addEventListener('pointercancel', mapUp);
  screens.addEventListener('keydown', event => {
    const { wide, tall } = host.screens(), count = wide * tall;
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -wide, ArrowDown: wide };
    let next = focusScreen;
    if (event.key in delta) next = focusScreen + delta[event.key];
    else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = count - 1; else return;
    event.preventDefault(); event.stopPropagation();
    if (next < 0 || next >= count) return;
    focusScreen = next; screenButtons(); screens.querySelector<HTMLElement>(`[data-screen="${next}"]`)?.focus();
  });
  screens.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLElement>('[data-screen]'); if (!button || !host.editing()) return;
    focusScreen = Number(button.dataset.screen); const p = screenCentre(focusScreen); set({ ...p, zoom: Math.max(stage.shown().zoom, Math.min(1, fitZoom() / 0.94)) });
  });
  el('stage-map-hide').addEventListener('click', () => { mapHidden = true; controls(); el('stage-map-show').focus(); });
  el('stage-map-show').addEventListener('click', () => { mapHidden = false; controls(); el('stage-map-hide').focus(); });
  function screenButtons() {
    const { wide, tall } = host.screens(), count = wide * tall;
    if (screens.childElementCount !== count || screens.style.getPropertyValue('--wide') !== String(wide)) {
      screens.style.setProperty('--wide', String(wide)); screens.style.setProperty('--tall', String(tall));
      screens.replaceChildren(...Array.from({ length: count }, (_, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.dataset.screen = String(i);
        button.textContent = `Screen ${i + 1}`; return button;
      }));
    }
    focusScreen = Math.min(focusScreen, count - 1);
    for (const button of screens.children) (button as HTMLElement).tabIndex = Number((button as HTMLElement).dataset.screen) === focusScreen ? 0 : -1;
  }

  function drawMap() {
    frame = 0;
    if (el('stage-map').hidden) return;
    const o = stage.overview(), r = o.rect;
    // At most 180 × 140, keeping the world's shape.
    const k = Math.min(180 / r.width, 140 / r.height), width = Math.max(24, Math.round(r.width * k)), height = Math.max(24, Math.round(r.height * k));
    // Drawn at the screen's pixel density, shown at its CSS size.
    const ratio = Math.max(1, Math.min(3, Math.round(globalThis.devicePixelRatio || 1)));
    if (map.width !== width * ratio || map.height !== height * ratio) { map.width = width * ratio; map.height = height * ratio; map.style.width = `${width}px`; map.style.height = `${height}px`; }
    const sx = width / r.width, sy = height / r.height, X = (x: number) => (x - r.left) * sx, Y = (y: number) => (r.top - y) * sy;
    const ctx = mapContext; ctx.save(); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = o.background; ctx.fillRect(0, 0, width, height);
    if (o.tiles) { ctx.imageSmoothingEnabled = false; ctx.drawImage(o.tiles, 0, 0, width, height); }
    const wide = Math.ceil(r.width / SCREEN_W - 1e-9), tall = Math.ceil(r.height / SCREEN_H - 1e-9);
    ctx.strokeStyle = 'rgba(38, 56, 47, 0.35)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 1; i < wide; i++) { const x = Math.round(SCREEN_W * i * sx) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let j = 1; j < tall; j++) { const y = Math.round(SCREEN_H * j * sy) + .5; ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
    ctx.setLineDash([3, 2]); ctx.strokeStyle = '#dd9250'; ctx.lineWidth = 1.5; ctx.strokeRect(X(o.start.x - 240), Y(o.start.y + 160), SCREEN_W * sx, SCREEN_H * sy); ctx.setLineDash([]);
    for (const s of o.sprites) {
      ctx.fillStyle = s.selected ? '#267c70' : '#26382f'; ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), s.selected ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill();
      if (s.selected) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
    const v = o.editing ? o.view : { left: o.camera.x - 240, top: o.camera.y + 160, width: SCREEN_W, height: SCREEN_H };
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'; ctx.fillRect(X(v.left), Y(v.top), v.width * sx, v.height * sy);
    ctx.strokeStyle = '#1d2e26'; ctx.lineWidth = 2; ctx.strokeRect(X(v.left) + 1, Y(v.top) + 1, v.width * sx - 2, v.height * sy - 2);
    ctx.restore();
  }
  /** Place an add-screen button at the world's right or bottom edge, on the part of that edge in view. */
  function placeAdd(button: HTMLElement, side: 'right' | 'down', view: View) {
    const r = rect(), fx = (x: number) => (SCREEN_W / 2 + (x - view.x) * view.zoom) / SCREEN_W, fy = (y: number) => (SCREEN_H / 2 - (y - view.y) * view.zoom) / SCREEN_H;
    const span = (a: number, b: number) => (Math.max(0, Math.min(1, a)) + Math.max(0, Math.min(1, b))) / 2;
    // Outside the edge when there is room beyond it, otherwise just inside.
    if (side === 'right') { const edge = Math.min(1, fx(r.left + r.width)); button.style.left = `${edge * 100}%`; button.style.top = `${span(fy(r.top), fy(r.top - r.height)) * 100}%`; button.toggleAttribute('data-outside', edge < .75); }
    else { const edge = Math.min(1, fy(r.top - r.height)); button.style.left = `${span(fx(r.left), fx(r.left + r.width)) * 100}%`; button.style.top = `${edge * 100}%`; button.toggleAttribute('data-outside', edge < .8); }
  }
  /** Everything around the canvas: zoom, rail, map, add-screen and off-screen buttons. */
  function controls() {
    const editing = host.editing(), view = stage.shown(), r = rect(), size = host.screens(), wide = stageView();
    const viewW = SCREEN_W / view.zoom, viewH = SCREEN_H / view.zoom, bigger = r.width > SCREEN_W || r.height > SCREEN_H;
    const overflowing = r.width > viewW + 1 || r.height > viewH + 1;
    el('stage-zoom-fit').textContent = `${Math.round(view.zoom * 100)}%`;
    el('stage-zoom').toggleAttribute('data-plain', !bigger && Math.abs(view.zoom - 1) < 1e-6);
    el('stage-zoom-fit').title = Math.abs(view.zoom - 1) < 1e-6 && bigger ? 'Fit the whole world (F)' : 'Back to 100%';
    el<HTMLButtonElement>('stage-zoom-fit').disabled = !editing;
    el<HTMLButtonElement>('stage-zoom-out').disabled = !editing || view.zoom <= minZoom() + 1e-6;
    el<HTMLButtonElement>('stage-zoom-in').disabled = !editing || view.zoom >= MAX_ZOOM - 1e-6;
    for (const id of ['stage-tool-select', 'stage-tool-pan', 'stage-fit', 'stage-home', 'stage-grid']) { const button = document.getElementById(id) as HTMLButtonElement | null; if (button) button.disabled = !editing; }
    // The map shows while part of the world is out of view. It starts folded in the small (Blocks view) stage.
    const hidden = mapHidden ?? !wide;
    el('stage-map').hidden = !overflowing || hidden; el('stage-map-show').hidden = !overflowing || !hidden;
    el('stage-map-title').textContent = `Map · ${size.wide} × ${size.tall} screen${size.wide * size.tall === 1 ? '' : 's'}`;
    el('stage-map-note').textContent = editing ? 'Tap to jump · drag to pan' : 'Follows the camera while playing';
    el('stage-map').classList.toggle('stage-map-live', !editing);
    screenButtons(); for (const button of screens.children) (button as HTMLButtonElement).disabled = !editing;
    // Add a screen where the world's right or bottom edge is in view (Stage view, while editing).
    const right = view.x + viewW / 2 >= r.left + r.width - 1, bottom = view.y - viewH / 2 <= r.top - r.height + 1;
    const addRight = el('stage-add-right'), addDown = el('stage-add-down');
    addRight.hidden = !(editing && wide && right && size.wide < size.maxWide); addDown.hidden = !(editing && wide && bottom && size.tall < size.maxTall);
    if (!addRight.hidden) placeAdd(addRight, 'right', view);
    if (!addDown.hidden) placeAdd(addDown, 'down', view);
    // An arrow chip at the edge points to the selected sprite when it is out of view.
    const chip = el<HTMLButtonElement>('stage-offscreen'), selected = editing ? stage.overview().sprites.find(s => s.selected) : undefined;
    const dx = selected ? (selected.x - view.x) / (viewW / 2) : 0, dy = selected ? (selected.y - view.y) / (viewH / 2) : 0;
    chip.hidden = !selected || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1);
    if (!chip.hidden) {
      const k = 1 / Math.max(Math.abs(dx), Math.abs(dy)), name = host.selectedName();
      const arrow = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↑' : '↓');
      chip.textContent = arrow === '←' || arrow === '↑' ? `${arrow} ${name}` : `${name} ${arrow}`;
      chip.setAttribute('aria-label', `Show ${name}, which is out of view`); chip.dataset.side = arrow;
      chip.style.setProperty('--fx', String((1 + dx * k) / 2)); chip.style.setProperty('--fy', String((1 - dy * k) / 2));
    }
    if (!frame) frame = requestAnimationFrame(drawMap);
  }
  const press = (id: string, on: boolean) => document.getElementById(id)?.setAttribute('aria-pressed', String(on));
  function setTool(next: StageTool) {
    tool = next; canvas.classList.toggle('stage-pan-tool', next === 'pan');
    press('stage-tool-select', next === 'select'); press('stage-tool-pan', next === 'pan');
  }
  el('stage-offscreen').addEventListener('click', () => { const s = stage.overview().sprites.find(s => s.selected); if (s) centerOn(s.x, s.y); });
  el('stage-zoom-in').addEventListener('click', () => zoomBy(1.25));
  el('stage-zoom-out').addEventListener('click', () => zoomBy(0.8));
  el('stage-zoom-fit').addEventListener('click', () => { const r = rect(); if (Math.abs(stage.shown().zoom - 1) < 1e-6 && (r.width > SCREEN_W || r.height > SCREEN_H)) fit(); else zoomTo(1); });
  // A new screen comes into view as it is added.
  el('stage-add-right').addEventListener('click', () => { const s = host.screens(); if (host.resize(s.wide + 1, s.tall)) centerOn(rect().left + SCREEN_W * (s.wide + .5), stage.shown().y); });
  el('stage-add-down').addEventListener('click', () => { const s = host.screens(); if (host.resize(s.wide, s.tall + 1)) centerOn(stage.shown().x, rect().top - SCREEN_H * (s.tall + .5)); });
  document.getElementById('stage-tool-select')?.addEventListener('click', () => setTool('select'));
  document.getElementById('stage-tool-pan')?.addEventListener('click', () => setTool('pan'));
  document.getElementById('stage-fit')?.addEventListener('click', fit);
  document.getElementById('stage-home')?.addEventListener('click', () => home());
  document.getElementById('stage-grid')?.addEventListener('click', () => { stage.showGuides = !stage.showGuides; press('stage-grid', stage.showGuides); stage.paint(); });
  stage.onPaint = () => { if (!frame) frame = requestAnimationFrame(drawMap); };

  return {
    sync, fit, home, centerOn, zoomBy, setTool,
    get tool() { return tool; },
    /** A newly opened project starts from its own starting views; the next sync applies them. */
    forget() { views.clear(); mapHidden = null; focusScreen = 0; },
    refresh: controls,
    dispose() {
      cancelAnimationFrame(frame); stage.onPaint = () => {};
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('keyup', keyup); canvas.removeEventListener('blur', release);
      for (const id of ['stage-map', 'stage-map-show', 'stage-offscreen', 'stage-add-right', 'stage-add-down']) document.getElementById(id)?.remove();
      el('stage-zoom')?.remove(); document.getElementById('stage-rail')?.replaceChildren();
    },
  };
}
