import * as Blockly from 'blockly/core';
import './paint.css';
import { assetData, paintBuiltinBackdrop, paintBuiltinCostume } from './assets';
import { FRAMES_ANIMATION, ANIMATION_LIMITS, builtinBackdrops, builtins, isStock, resolutionOf, spriteFrames, validAnimationName, type Costume, type SceneState } from './model';
import { changeScene, sceneState } from './state';
import { blocky, contentBox, downsample, fillMask, floodMask, hex, lineCells, rgba, shapeCells, type Box, type FillStyle } from './paint-pixels';
import { findStock, stockCanvas } from './stock-art';

/** The Paint editor: a full-screen editor for a sprite's costumes, the stage's
 * backdrops or a world's tiles. Pictures are painted at 2× (two pixels per stage
 * unit) so they stay sharp on the stage; pixel art that stays blocky is stored at 1×.
 * Nothing is saved until Done, which writes every change as one project Undo step,
 * so no action is ever refused for unsaved work. */
const RES = 2;
const LIMITS = { costume: 256, tile: 64 };
type Kind = 'costume' | 'backdrop' | 'tile';
export type PaintTarget = { kind: 'costume'; sprite?: string } | { kind: 'backdrop' } | { kind: 'tile'; id: string };
type Tool = 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'text' | 'select' | 'pick';
/** `assetId` is the project picture this doc rewrites; built-ins and library art have none, so a change makes a new picture. */
interface Doc { key: string; assetId: string | null; origin: string | null; name: string; width: number; height: number; canvas: HTMLCanvasElement; changed: boolean; renamed: boolean; stock?: boolean }
/** One row of the costume strip: a named animation, or the sprite's frames list. `original` is its name when Paint opened. */
interface Row { name: string; original: string | null; docs: Doc[]; fps: number; seconds?: number; timed: boolean; frames: boolean }
type Step = { kind: 'pixels'; doc: Doc; image: ImageData; width: number; height: number } | { kind: 'frames'; rows: Row[]; row: number; current: number };
export interface PaintHost {
  canEdit(): boolean;
  /** The selected sprite ('' for none). */
  selected(): string;
  /** Where a sprite painted from scratch appears. */
  viewCentre(): { x: number; y: number };
  /** Open the stock library; `add` receives the chosen artwork's id. */
  library(kind: 'costume' | 'backdrop', add: (id: string) => Promise<void>): void;
  /** Called after Done with the sprite that was painted, if any. */
  done(sprite: string | null): void;
}

const TOOLS: [Tool, string, string, string, string][] = [
  ['brush', 'Brush', 'B', 'm10 13 9-11 3 3-10 10ZM10 14c-4-2-6 2-6 4s-2 3-2 3 8 2 10-3c1-2 0-3-2-4Z', 'Drag to paint. Choose a colour and a size on the left.'],
  ['eraser', 'Eraser', 'E', 'm3 13 10-10 8 8-10 10H7ZM8 8l8 8M11 21h11', 'Drag over what you want to remove.'],
  ['fill', 'Fill', 'F', 'm3 12 9-9 9 9-9 9Zm1 0h16M8 2l5 5M20 16s-2 2-2 3a2 2 0 0 0 4 0c0-1-2-3-2-3Z', 'Tap an area to fill it. “Down” fades the colour for skies and water.'],
  ['line', 'Line', 'L', 'M4 20 20 4', 'Drag from where the line starts to where it ends. Hold Shift for straight lines.'],
  ['rect', 'Box', 'R', 'M3 5h18v14H3Z', 'Drag from one corner to the other. Hold Shift for a square.'],
  ['ellipse', 'Oval', 'O', 'M2 12a10 7 0 1 0 20 0a10 7 0 1 0-20 0', 'Drag to size it. Hold Shift for a circle.'],
  ['text', 'Text', 'T', 'M5 5h14M12 5v14M9 19h6', 'Tap where the words go, type, then press Enter.'],
  ['select', 'Select', 'S', 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M11 3h2M3 11v2m18-2v2m-10 8h2', 'Drag a box around part of the picture, then drag it or use the bar above.'],
  ['pick', 'Pick', 'I', 'm14 3 7 7m-6-5L4 16l-1 5 5-1L19 9M6 14l4 4', 'Tap the picture to take a colour from it.'],
];
const SWATCHES: [string, string][] = [['#263f4b', 'Ink'], ['#ffffff', 'White'], ['#d7794c', 'Fox orange'], ['#e8b94f', 'Gold'], ['#f2da7a', 'Sun yellow'], ['#83aa70', 'Leaf green'], ['#4d8e73', 'Pine'], ['#478b94', 'Teal'], ['#5d9ba7', 'Sky'], ['#9c83ba', 'Lilac'], ['#d88da4', 'Pink'], ['#926744', 'Bark']];
const icon = (d: string, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const ICONS = { undo: 'm9 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3', redo: 'm15 4 6 6-6 6m6-6H10a7 7 0 0 0-7 7v3', check: 'm4 12 5 6L21 5', more: 'M5 12h.1M12 12h.1M19 12h.1', plus: 'M12 4v16M4 12h16', minus: 'M4 12h16', fit: 'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6', play: 'm8 4 13 8-13 8Z', pause: 'M8 5v14M16 5v14', flipX: 'M12 2v3m0 3v3m0 3v3m0 3v2M8 6v12H2Zm8 0v12h6Z', flipY: 'M2 12h3m3 0h3m3 0h3m3 0h2M6 8h12V2Zm0 8h12v6Z', turn: 'M4 10a8 8 0 1 1 2 8M4 3v7h7', copy: 'M8 8h13v13H8ZM16 4V3H3v13h1', trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15', resize: 'M14 3h7v7m0-7-8 8M3 14v7h7m-7 0 8-8', centre: 'M12 2v4m0 12v4M2 12h4m12 0h4M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0', download: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6', clear: 'm6 6 12 12M18 6 6 18', onion: 'M3 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0M15 6.5a6 6 0 0 1 0 11', paint: 'm10 13 9-11 3 3-10 10ZM10 14c-4-2-6 2-6 4s-2 3-2 3 8 2 10-3c1-2 0-3-2-4Z', library: 'M3 3h4v18H3Zm7 0h4v18h-4Zm6 1 3-1 3 17-3 1Z', picture: 'M2 3h20v18H2ZM6 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0M3 19l6-6 4 4 4-6 5 7', earlier: 'M12 19V5M5 12l7-7 7 7', later: 'M12 5v14m-7-7 7 7 7-7', done: 'm4 12 5 6L21 5' };

export function installPaintEditor(workspace: Blockly.WorkspaceSvg, host: PaintHost) {
  const dialog = document.createElement('dialog');
  dialog.id = 'paint-dialog'; dialog.setAttribute('aria-labelledby', 'paint-title');
  dialog.innerHTML = `
    <header class="paint-top">
      <h2 id="paint-title" class="visually-hidden">Paint</h2>
      <div class="paint-chip"><canvas id="paint-chip-thumb" width="64" height="64" aria-hidden="true"></canvas><span id="paint-owner"></span></div>
      <label class="paint-name"><span id="paint-name-label">Costume</span><input id="paint-name" maxlength="48" autocomplete="off" spellcheck="false"></label>
      <div class="paint-history"><button id="paint-undo" class="paint-icon-button" type="button" aria-label="Undo" title="Undo (Ctrl+Z)">${icon(ICONS.undo, 18)}</button><button id="paint-redo" class="paint-icon-button" type="button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${icon(ICONS.redo, 18)}</button></div>
      <span class="paint-spacer"></span>
      <button id="paint-onion" class="paint-toggle" type="button" aria-pressed="false" hidden>${icon(ICONS.onion, 18)}<span>Show the frame before</span></button>
      <div class="paint-segment" role="group" aria-label="Brush style"><button id="paint-smooth" type="button" aria-pressed="true">Smooth</button><button id="paint-pixel" type="button" aria-pressed="false">Pixel</button></div>
      <button id="paint-done" class="paint-done" type="button">${icon(ICONS.done, 16)}Done</button>
    </header>
    <div class="paint-body">
      <nav class="paint-tools" aria-label="Tools">${TOOLS.map(([id, name, key, d]) => `<button type="button" class="paint-tool" data-tool="${id}" aria-pressed="false" title="${name} (${key})">${icon(d, 22)}<span>${name}</span></button>`).join('')}</nav>
      <aside class="paint-panel" aria-label="Colour and size">
        <div class="paint-current"><span id="paint-color-dot" aria-hidden="true"></span><div><span class="paint-label">Colour</span><strong id="paint-color-name"></strong></div></div>
        <div class="paint-swatches" role="group" aria-label="Colours">${SWATCHES.map(([color, name]) => `<button type="button" class="paint-swatch" data-color="${color}" aria-label="${name}" title="${name}" aria-pressed="false" style="--swatch:${color}"></button>`).join('')}</div>
        <div class="paint-recent"><button id="paint-custom" type="button" class="paint-custom" aria-label="Custom colour" title="Custom colour"><span aria-hidden="true"></span></button><input id="paint-custom-input" type="color" value="#d7794c" tabindex="-1" aria-hidden="true"><div id="paint-recent" class="paint-recent-list" role="group" aria-label="Recent colours"></div></div>
        <div class="paint-size"><span class="paint-label" id="paint-size-label">Size</span><div><span class="paint-size-preview" aria-hidden="true"><span id="paint-size-dot"></span></span><input id="paint-size" type="range" min="1" max="32" step="1" value="4" aria-labelledby="paint-size-label"></div></div>
        <div id="paint-shape-style" class="paint-segment wide" role="group" aria-label="Shape style" hidden><button id="paint-filled" type="button" aria-pressed="true">Filled</button><button id="paint-outline" type="button" aria-pressed="false">Outline</button></div>
        <div id="paint-fill-style" class="paint-fill-styles" role="group" aria-label="Fill style" hidden>${[['solid', 'Solid'], ['down', 'Down'], ['glow', 'Glow']].map(([id, label]) => `<button type="button" data-fill="${id}" aria-pressed="${id === 'solid'}"><span class="paint-fill-sample ${id}" aria-hidden="true"></span>${label}</button>`).join('')}</div>
        <p id="paint-hint" class="paint-hint"></p>
      </aside>
      <section id="paint-view" class="paint-view" aria-label="Canvas">
        <div id="paint-board" class="paint-board"><canvas id="paint-onion-layer" class="paint-onion" aria-hidden="true" hidden></canvas><div id="paint-doc-slot"></div><canvas id="paint-float" class="paint-float" aria-hidden="true" hidden></canvas><div id="paint-grid" class="paint-grid" aria-hidden="true" hidden></div><div id="paint-marquee" class="paint-marquee" aria-hidden="true" hidden><span></span><span></span><span></span><span></span></div><span id="paint-centre" class="paint-centre" aria-hidden="true"></span><input id="paint-text" class="paint-text" aria-label="Words to paint" hidden></div>
        <div id="paint-selection-bar" class="paint-selection-bar" role="toolbar" aria-label="Selection" hidden>
          <button type="button" data-select="flip-x">${icon(ICONS.flipX)}<span>Flip ↔</span></button><button type="button" data-select="flip-y">${icon(ICONS.flipY)}<span>Flip ↕</span></button><button type="button" data-select="turn">${icon(ICONS.turn)}<span>Turn</span></button><button type="button" data-select="copy">${icon(ICONS.copy)}<span>Copy</span></button><button type="button" data-select="delete">${icon(ICONS.trash)}<span>Delete</span></button><button type="button" data-select="done">${icon(ICONS.check)}<span>Place</span></button>
        </div>
        <button id="paint-more" class="paint-more" type="button" aria-haspopup="menu" aria-expanded="false">${icon(ICONS.more, 18)}<span>More</span></button>
        <div id="paint-more-menu" class="paint-menu paint-more-menu" role="menu" hidden>
          <button type="button" role="menuitem" data-more="flip-x">${icon(ICONS.flipX, 18)}Flip left to right</button><button type="button" role="menuitem" data-more="flip-y">${icon(ICONS.flipY, 18)}Flip upside down</button><button type="button" role="menuitem" data-more="turn">${icon(ICONS.turn, 18)}Turn a quarter</button><button type="button" role="menuitem" data-more="size">${icon(ICONS.resize, 18)}Canvas size…</button><button type="button" role="menuitem" data-more="centre">${icon(ICONS.centre, 18)}Centre the drawing</button><button type="button" role="menuitem" data-more="download">${icon(ICONS.download, 18)}Download PNG</button><button type="button" role="menuitem" data-more="clear" class="danger">${icon(ICONS.trash, 18)}Clear the canvas</button>
        </div>
        <div id="paint-size-box" class="paint-popover paint-size-box" role="dialog" aria-label="Canvas size" hidden>
          <strong>Canvas size</strong>
          <div class="paint-stepper"><span id="paint-width-label">Width</span><button type="button" data-step="width:-8" aria-label="Narrower">−</button><output id="paint-width" aria-labelledby="paint-width-label"></output><button id="paint-wider" type="button" data-step="width:8" aria-label="Wider">+</button></div>
          <div class="paint-stepper"><span id="paint-height-label">Height</span><button type="button" data-step="height:-8" aria-label="Shorter">−</button><output id="paint-height" aria-labelledby="paint-height-label"></output><button id="paint-taller" type="button" data-step="height:8" aria-label="Taller">+</button></div>
          <div class="paint-segment wide" role="group" aria-label="When the size changes"><button id="paint-keep" type="button" aria-pressed="true">Keep the picture</button><button id="paint-stretch" type="button" aria-pressed="false">Stretch it</button></div>
          <div class="paint-popover-actions"><button id="paint-size-cancel" type="button" class="paint-plain">Cancel</button><button id="paint-size-apply" type="button" class="paint-done">Apply</button></div>
        </div>
        <div class="paint-zoom" role="group" aria-label="Zoom"><button id="paint-zoom-out" class="paint-icon-button" type="button" aria-label="Zoom out">${icon(ICONS.minus, 18)}</button><button id="paint-zoom-fit" type="button" class="paint-zoom-level" title="Fit the canvas">100%</button><button id="paint-zoom-in" class="paint-icon-button" type="button" aria-label="Zoom in">${icon(ICONS.plus, 18)}</button></div>
        <p class="paint-gesture keyboard-hidden">Pinch to zoom · two fingers to pan</p>
      </section>
      <aside class="paint-strip" aria-label="Costumes">
        <div class="paint-strip-head"><span id="paint-strip-title">Costumes</span><span id="paint-strip-count"></span></div>
        <div id="paint-rows" class="paint-rows" role="group" aria-label="Animations"></div>
        <button id="paint-new-anim" class="paint-plain paint-new-anim" type="button">${icon(ICONS.plus, 16)}New animation</button>
        <div id="paint-anim" class="paint-anim"><label for="paint-anim-name">Animation</label><input id="paint-anim-name" maxlength="24" autocomplete="off" spellcheck="false"><button id="paint-anim-delete" class="paint-icon-button" type="button" aria-label="Delete this animation">${icon(ICONS.trash, 18)}</button></div>
        <div id="paint-cards" class="paint-cards" role="listbox" aria-label="Costumes"></div>
        <button id="paint-new" class="paint-new" type="button" aria-haspopup="dialog">${icon(ICONS.plus, 16)}New</button>
        <button id="paint-options" class="paint-plain" type="button" aria-haspopup="menu">${icon(ICONS.more, 16)}<span id="paint-options-label">Costume options</span></button>
        <div id="paint-preview-box" class="paint-preview">
          <canvas id="paint-preview" width="300" height="200" role="img" aria-label="Animation preview"></canvas>
          <div class="paint-preview-controls"><button id="paint-play" class="paint-play" type="button" aria-label="Play the animation">${icon(ICONS.play, 16)}</button><input id="paint-fps" type="range" min="1" max="12" step="1" value="10" aria-label="Frames a second"></div>
          <span id="paint-fps-label" class="paint-small"></span>
        </div>
      </aside>
    </div>
    <div id="paint-card-menu" class="paint-menu" role="menu" hidden></div>
    <div id="paint-sheet" class="paint-popover paint-sheet" role="dialog" aria-labelledby="paint-sheet-title" hidden>
      <div class="paint-sheet-head"><h3 id="paint-sheet-title">New costume</h3><button id="paint-sheet-close" class="paint-icon-button" type="button" aria-label="Close">${icon(ICONS.clear, 18)}</button></div>
      <div id="paint-sheet-options" class="paint-sheet-options"></div>
      <p id="paint-sheet-note" class="paint-small"></p>
      <input id="paint-file" type="file" accept="image/*" hidden>
    </div>
    <p id="paint-toast" class="paint-toast" role="status" hidden></p>
    <p id="paint-loading" class="paint-loading" hidden>Opening…</p>`;
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => dialog.querySelector<T>('#' + id)!;
  const view = el('paint-view'), board = el('paint-board'), slot = el('paint-doc-slot');

  // Session state
  let kind: Kind = 'costume', spriteId: string | null = null, docs: Doc[] = [], current = 0, token = 0, loading = false;
  // Costume rows: the open row's docs are `docs`. framesFollow names the animation the frames list matched when Paint opened.
  let rows: Row[] = [], row = 0, framesFollow: string | null = null, rowsChanged = false;
  let tool: Tool = 'brush', color = '#d7794c', size = 4, pixel = false, filled = true, fillStyle: FillStyle = 'solid', onion = false;
  let recent: string[] = ['#263f4b', '#fff5dc', '#b85f43'];
  let undo: Step[] = [], redo: Step[] = [];
  let zoom = 4, pan = { x: 0, y: 0 }, fps = 10, playing = false, playFrame = 0, playTimer: ReturnType<typeof setTimeout> | undefined;
  let fpsChanged = false, structureChanged = false, toastTimer: ReturnType<typeof setTimeout> | undefined, keySerial = 0;
  let selection: { box: Box; float: HTMLCanvasElement | null; before: ImageData | null; beforeSize: [number, number] } | null = null;
  let stroke: { pointer: number; start: { x: number; y: number }; last: { x: number; y: number }; before: ImageData; doc: Doc; mode: 'paint' | 'shape' | 'marquee' | 'move'; offset?: { x: number; y: number } } | null = null;
  let text: { x: number; y: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { distance: number; mid: { x: number; y: number }; zoom: number; pan: { x: number; y: number } } | null = null;

  const doc = () => docs[current];
  const ctxOf = (d: Doc) => d.canvas.getContext('2d', { willReadFrequently: true })!;
  const nextKey = () => `doc${++keySerial}`;
  const unique = () => [...new Set(kind === 'costume' ? rows.flatMap(r => r.docs) : docs)];
  const idOf = (d: Doc) => d.assetId ?? d.origin;
  const fpsOf = (seconds: number | undefined) => Math.max(1, Math.min(12, Math.round(1 / (seconds ?? 0.1))));
  const label = (k: Kind) => k === 'costume' ? 'costume' : k === 'backdrop' ? 'backdrop' : 'tile';
  function newCanvas(width: number, height: number) { const c = document.createElement('canvas'); c.width = width * RES; c.height = height * RES; c.className = 'paint-doc'; return c; }

  // ── Loading artwork into the editor ──
  async function docFor(id: string, assetKind: 'costume' | 'backdrop', scene: SceneState): Promise<Doc> {
    const list: (Costume | { id: string; name: string; width: number; height: number })[] = assetKind === 'costume' ? [...builtins, ...scene.assets] : [...builtinBackdrops, ...(scene.backdrops ?? [])];
    const asset = list.find(a => a.id === id) ?? list[0];
    const canvas = newCanvas(asset.width, asset.height), ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const data = assetData(asset), stock = isStock(asset);
    if (data) {
      const image = new Image(); image.src = data; await image.decode();
      // 1× art is enlarged without blurring, so pixel art stays pixel art.
      ctx.imageSmoothingEnabled = resolutionOf(asset) >= RES; ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else { ctx.save(); ctx.scale(RES, RES); if (assetKind === 'costume') { ctx.translate(asset.width / 2, asset.height / 2); paintBuiltinCostume(ctx, asset.id); } else paintBuiltinBackdrop(ctx, asset.id); ctx.restore(); }
    return { key: nextKey(), assetId: data && !stock ? asset.id : null, origin: asset.id, name: asset.name, width: asset.width, height: asset.height, canvas, changed: false, renamed: false, stock };
  }
  function blank(width: number, height: number, name: string): Doc { return { key: nextKey(), assetId: null, origin: null, name, width, height, canvas: newCanvas(width, height), changed: true, renamed: false }; }

  async function open(target: PaintTarget) {
    if (!host.canEdit()) return;
    const ticket = ++token, scene = sceneState(workspace);
    kind = target.kind; undo = []; redo = []; selection = null; text = null; stroke = null; fpsChanged = false; structureChanged = false; playing = false; clearTimeout(playTimer);
    docs = []; current = 0; spriteId = null; loading = true; render(); dialog.showModal(); el('paint-loading').hidden = false;
    try {
      if (target.kind === 'costume') {
        const sprite = scene.sprites.find(s => s.id === (target.sprite ?? host.selected()));
        spriteId = sprite?.id ?? null;
        if (sprite) {
          const frames = spriteFrames(sprite), named = sprite.animations ?? [], loaded = new Map<string, Doc>();
          for (const id of [...frames, ...named.flatMap(a => a.frames)]) if (!loaded.has(id)) loaded.set(id, await docFor(id, 'costume', scene));
          const spriteFps = fpsOf(sprite.frameSeconds);
          rows = named.map(a => ({ name: a.name, original: a.name, docs: a.frames.map(id => loaded.get(id)!), fps: a.seconds ? fpsOf(a.seconds) : spriteFps, seconds: a.seconds, timed: false, frames: false }));
          // The frames list gets its own row unless it is one of the animations (a library character's walk).
          const same = named.find(a => a.frames.length === frames.length && a.frames.every((f, i) => f === frames[i]));
          framesFollow = same?.name ?? null;
          if (!same) rows.unshift({ name: FRAMES_ANIMATION, original: null, docs: frames.map(id => loaded.get(id)!), fps: spriteFps, timed: false, frames: true });
          row = Math.max(0, rows.findIndex(r => r.docs.some(d => idOf(d) === sprite.costume)));
          docs = rows[row].docs; current = Math.max(0, docs.findIndex(d => idOf(d) === sprite.costume)); fps = rows[row].fps;
        } else { docs = [blank(64, 64, 'Costume 1')]; fps = 10; rows = [{ name: FRAMES_ANIMATION, original: null, docs, fps, timed: false, frames: true }]; row = 0; framesFollow = null; }
        rowsChanged = false;
        pixel = false;
      } else if (target.kind === 'backdrop') {
        const world = scene.worlds?.find(w => w.id === scene.world), start = world ? world.backdrop : scene.backdrop;
        const ids = [...builtinBackdrops.map(a => a.id), ...(scene.backdrops ?? []).map(a => a.id)];
        for (const id of ids) docs.push(await docFor(id, 'backdrop', scene));
        if (start) current = Math.max(0, ids.indexOf(start)); else { docs.push(blank(480, 320, uniqueName('Backdrop', scene))); current = docs.length - 1; }
        pixel = false; rows = [{ name: '', original: null, docs, fps, timed: false, frames: true }]; row = 0;
      } else {
        const world = scene.worlds?.find(w => w.id === scene.world);
        const ids = [...new Set([target.id, ...(world?.map.tiles ?? []).filter((t): t is string => !!t)])];
        for (const id of ids) docs.push(await docFor(id, 'costume', scene));
        current = 0; pixel = true; rows = [{ name: '', original: null, docs, fps, timed: false, frames: true }]; row = 0;
      }
      if (ticket !== token) return;
      size = pixel ? 1 : 4; tool = 'brush';
      loading = false; el('paint-loading').hidden = true; show(); fit(); render();
    } catch (error) { loading = false; el('paint-loading').hidden = true; toast(error instanceof Error ? error.message : String(error), el('paint-done')); }
  }
  function uniqueName(base: string, scene = sceneState(workspace)) {
    const names = new Set([...scene.assets, ...(scene.backdrops ?? []), ...docs].map(a => a.name)); let n = 1;
    while (names.has(`${base} ${n}`)) n++; return `${base} ${n}`;
  }

  // ── History ──
  const pixelsOf = (d: Doc) => ctxOf(d).getImageData(0, 0, d.canvas.width, d.canvas.height);
  const capture = (d: Doc): Step => ({ kind: 'pixels', doc: d, image: pixelsOf(d), width: d.width, height: d.height });
  const structure = (): Step => ({ kind: 'frames', rows: rows.map(r => ({ ...r, docs: [...r.docs] })), row, current });
  function remember(step: Step) {
    undo.push(step); redo = [];
    // About 96 MB of pictures: a backdrop is 2.4 MB, a 64-unit costume 64 KB.
    let bytes = undo.reduce((n, s) => n + (s.kind === 'pixels' ? s.image.data.length : 0), 0);
    while (bytes > 96_000_000 && undo.length > 1) { const old = undo.shift()!; if (old.kind === 'pixels') bytes -= old.image.data.length; }
  }
  function restore(step: Step): Step {
    if (step.kind === 'frames') { const inverse = structure(); rows = step.rows; row = Math.min(step.row, rows.length - 1); docs = rows[row].docs; fps = rows[row].fps; current = Math.min(step.current, docs.length - 1); structureChanged = true; rowsChanged = true; show(); return inverse; }
    const inverse = capture(step.doc), d = step.doc;
    d.width = step.width; d.height = step.height; d.canvas.width = step.image.width; d.canvas.height = step.image.height;
    ctxOf(d).putImageData(step.image, 0, 0); d.changed = true;
    const at = docs.indexOf(d); if (at >= 0 && at !== current) { current = at; show(); } else layout();
    return inverse;
  }
  function stepBack(forward: boolean) {
    place(); commitText();
    const from = forward ? redo : undo, to = forward ? undo : redo, step = from.pop(); if (!step) return;
    to.push(restore(step)); thumbs(); render();
  }

  // ── Showing the current picture ──
  function show() {
    place(); commitText();
    slot.replaceChildren(doc()?.canvas ?? '');
    el<HTMLInputElement>('paint-name').value = doc()?.name ?? '';
    onionLayer(); layout(); cards(); render();
    if (!playing) preview(current);
  }
  function onionLayer() {
    const layer = el<HTMLCanvasElement>('paint-onion-layer'), show = onion && kind === 'costume' && docs.length > 1;
    layer.hidden = !show; if (!show) return;
    const before = docs[(current - 1 + docs.length) % docs.length], d = doc();
    layer.width = d.canvas.width; layer.height = d.canvas.height;
    const ctx = layer.getContext('2d')!; ctx.clearRect(0, 0, layer.width, layer.height);
    ctx.drawImage(before.canvas, (layer.width - before.canvas.width) / 2, (layer.height - before.canvas.height) / 2);
  }
  function layout() {
    const d = doc(); if (!d) return;
    board.style.width = `${d.width * zoom}px`; board.style.height = `${d.height * zoom}px`;
    board.style.setProperty('--pan-x', `${pan.x}px`); board.style.setProperty('--pan-y', `${pan.y}px`);
    // Zoomed in far enough that each picture pixel is 2+ screen pixels: show them as crisp squares, not a blur.
    board.classList.toggle('pixel', pixel || zoom / RES >= 2);
    const grid = el('paint-grid'); grid.hidden = !(pixel && zoom >= 6); grid.style.backgroundSize = `${zoom}px ${zoom}px`;
    el('paint-centre').hidden = kind === 'backdrop';
    el('paint-zoom-fit').textContent = `${Math.round(zoom * 100)}%`;
    marquee();
  }
  function fit() {
    const d = doc(); if (!d) return;
    const box = view.getBoundingClientRect(), w = box.width || 600, h = box.height || 600;
    // Fit the canvas, but at most 8× so a small costume still looks like a costume.
    zoom = Math.max(.25, Math.min(8, (w - 72) / d.width, (h - 120) / d.height));
    if (pixel || zoom > 2) zoom = Math.max(1, Math.floor(zoom));
    pan = { x: 0, y: 0 }; layout();
  }
  function zoomTo(next: number, at?: { x: number; y: number }) {
    next = Math.max(.25, Math.min(32, next));
    if (at) {
      // Keep the picture point under `at` in place.
      const box = view.getBoundingClientRect(), cx = box.left + box.width / 2 + pan.x, cy = box.top + box.height / 2 + pan.y;
      pan = { x: pan.x + (at.x - cx) * (1 - next / zoom), y: pan.y + (at.y - cy) * (1 - next / zoom) };
    }
    zoom = next; layout();
  }

  // ── Drawing ──
  /** A pointer position in the picture's pixels (2 per stage unit). */
  function at(event: { clientX: number; clientY: number }) {
    const box = board.getBoundingClientRect(), d = doc();
    return { x: (event.clientX - box.left) / box.width * d.canvas.width, y: (event.clientY - box.top) / box.height * d.canvas.height };
  }
  const cell = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / RES), y: Math.floor(p.y / RES) });
  function paintCells(ctx: CanvasRenderingContext2D, cells: [number, number][], erase: boolean) {
    ctx.save(); ctx.fillStyle = color;
    for (const [x, y] of cells) { if (erase) ctx.clearRect(x * RES, y * RES, RES, RES); else ctx.fillRect(x * RES, y * RES, RES, RES); }
    ctx.restore();
  }
  function dab(d: Doc, from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = ctxOf(d), erase = tool === 'eraser';
    if (pixel) { const a = cell(from), b = cell(to); paintCells(ctx, lineCells(a.x, a.y, b.x, b.y, size), erase); return; }
    ctx.save(); ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = size * RES; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (from.x === to.x && from.y === to.y) { ctx.beginPath(); ctx.arc(to.x, to.y, size * RES / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); }
    ctx.restore();
  }
  function shape(d: Doc, from: { x: number; y: number }, to: { x: number; y: number }, square: boolean) {
    const ctx = ctxOf(d);
    if (square) {
      if (tool === 'line') { const dx = to.x - from.x, dy = to.y - from.y, angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, length = Math.hypot(dx, dy); to = { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }; }
      else { const side = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)); to = { x: from.x + Math.sign(to.x - from.x || 1) * side, y: from.y + Math.sign(to.y - from.y || 1) * side }; }
    }
    if (pixel) {
      const a = cell(from), b = cell(to);
      if (tool === 'line') { paintCells(ctx, lineCells(a.x, a.y, b.x, b.y, size), false); return; }
      const box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x) + 1, height: Math.abs(b.y - a.y) + 1 };
      paintCells(ctx, shapeCells(box, tool === 'rect' ? 'rect' : 'ellipse', filled, size), false); return;
    }
    ctx.save(); ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = size * RES; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke(); ctx.restore(); return; }
    const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y), w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y), inset = filled ? 0 : size * RES / 2;
    if (tool === 'rect') ctx.rect(x + inset, y + inset, Math.max(0, w - inset * 2), Math.max(0, h - inset * 2));
    else ctx.ellipse(x + w / 2, y + h / 2, Math.max(.5, w / 2 - inset), Math.max(.5, h / 2 - inset), 0, 0, Math.PI * 2);
    if (filled) ctx.fill(); else ctx.stroke();
    ctx.restore();
  }
  function fill(d: Doc, p: { x: number; y: number }) {
    const ctx = ctxOf(d), image = ctx.getImageData(0, 0, d.canvas.width, d.canvas.height);
    const x = Math.floor(p.x), y = Math.floor(p.y); if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false;
    const mask = floodMask(image, x, y, pixel ? 0 : 48);
    fillMask(image, mask, rgba(color), fillStyle, !pixel); ctx.putImageData(image, 0, 0); return true;
  }
  function changed(d: Doc) { d.changed = true; thumbs(); render(); }

  function pointerDown(event: PointerEvent) {
    if (loading || !doc() || event.button > 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { cancelStroke(); startGesture(); return; }
    if (pointers.size > 2 || !board.contains(event.target as Node) && event.target !== board) return;
    closeMenus();
    const d = doc(), p = at(event);
    if (tool !== 'text') commitText();
    if (tool === 'pick') { const data = ctxOf(d).getImageData(Math.max(0, Math.min(d.canvas.width - 1, Math.floor(p.x))), Math.max(0, Math.min(d.canvas.height - 1, Math.floor(p.y))), 1, 1).data; if (data[3]) useColor(hex(data)); return; }
    if (tool === 'fill') { const before = capture(d); if (fill(d, p)) { remember(before); changed(d); } return; }
    if (tool === 'text') { commitText(); openText(p); event.preventDefault(); return; }
    if (tool === 'select') {
      if (selection && inside(selection.box, p)) { lift(); stroke = { pointer: event.pointerId, start: p, last: p, before: selection.before!, doc: d, mode: 'move', offset: { x: selection.box.x, y: selection.box.y } }; }
      else { place(); stroke = { pointer: event.pointerId, start: p, last: p, before: pixelsOf(d), doc: d, mode: 'marquee' }; }
      board.setPointerCapture(event.pointerId); event.preventDefault(); return;
    }
    place();
    const before = pixelsOf(d);
    stroke = { pointer: event.pointerId, start: p, last: p, before, doc: d, mode: tool === 'brush' || tool === 'eraser' ? 'paint' : 'shape' };
    board.setPointerCapture(event.pointerId); event.preventDefault();
    if (stroke.mode === 'paint') dab(d, p, p); else shape(d, p, p, event.shiftKey);
  }
  function pointerMove(event: PointerEvent) {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture) { moveGesture(); return; }
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const p = at(event), d = stroke.doc;
    // Every position the pointer passed through, for smooth fast strokes (the list may be empty).
    if (stroke.mode === 'paint') { const passed = event.getCoalescedEvents?.(); for (const e of passed?.length ? passed : [event]) { const q = at(e); dab(d, stroke.last, q); stroke.last = q; } return; }
    if (stroke.mode === 'shape') { ctxOf(d).putImageData(stroke.before, 0, 0); shape(d, stroke.start, p, event.shiftKey); stroke.last = p; return; }
    if (stroke.mode === 'marquee') { const a = stroke.start; selection = { box: snap({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), width: Math.abs(p.x - a.x), height: Math.abs(p.y - a.y) }), float: null, before: null, beforeSize: [d.width, d.height] }; marquee(); return; }
    if (stroke.mode === 'move' && selection) { const step = pixel ? RES : 1; selection.box = { ...selection.box, x: stroke.offset!.x + Math.round((p.x - stroke.start.x) / step) * step, y: stroke.offset!.y + Math.round((p.y - stroke.start.y) / step) * step }; marquee(); }
  }
  function pointerUp(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (gesture) { if (pointers.size < 2) gesture = null; return; }
    if (!stroke || stroke.pointer !== event.pointerId) return;
    const s = stroke; stroke = null;
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    if (event.type === 'pointercancel') { if (s.mode === 'paint' || s.mode === 'shape') ctxOf(s.doc).putImageData(s.before, 0, 0); return; }
    if (s.mode === 'marquee') { if (selection && (selection.box.width < RES || selection.box.height < RES)) selection = null; marquee(); render(); return; }
    if (s.mode === 'move') { render(); return; }
    remember({ kind: 'pixels', doc: s.doc, image: s.before, width: s.doc.width, height: s.doc.height }); changed(s.doc);
  }
  function cancelStroke() {
    if (!stroke) return;
    if (stroke.mode === 'paint' || stroke.mode === 'shape') ctxOf(stroke.doc).putImageData(stroke.before, 0, 0);
    stroke = null;
  }
  function startGesture() {
    const [a, b] = [...pointers.values()];
    gesture = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom, pan: { ...pan } };
  }
  function moveGesture() {
    if (!gesture || pointers.size < 2) return;
    const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, g = gesture;
    zoom = g.zoom; pan = { x: g.pan.x + mid.x - g.mid.x, y: g.pan.y + mid.y - g.mid.y };
    zoomTo(g.zoom * Math.hypot(a.x - b.x, a.y - b.y) / g.distance, mid);
  }
  const inside = (box: Box, p: { x: number; y: number }) => p.x >= box.x && p.y >= box.y && p.x <= box.x + box.width && p.y <= box.y + box.height;
  /** Selections cover whole stage units, so pixel art keeps its blocks. */
  function snap(box: Box): Box {
    const d = doc(), x0 = Math.max(0, Math.floor(box.x / RES) * RES), y0 = Math.max(0, Math.floor(box.y / RES) * RES);
    const x1 = Math.min(d.canvas.width, Math.ceil((box.x + box.width) / RES) * RES), y1 = Math.min(d.canvas.height, Math.ceil((box.y + box.height) / RES) * RES);
    return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
  }

  // ── Selection: lifted into a floating layer, placed back when done ──
  function lift() {
    if (!selection || selection.float) return;
    const d = doc(), ctx = ctxOf(d), b = selection.box, float = document.createElement('canvas');
    selection.before = ctx.getImageData(0, 0, d.canvas.width, d.canvas.height); selection.beforeSize = [d.width, d.height];
    float.width = b.width; float.height = b.height; float.getContext('2d')!.drawImage(d.canvas, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
    ctx.clearRect(b.x, b.y, b.width, b.height); selection.float = float; marquee();
  }
  function place() {
    if (!selection) return;
    const s = selection; selection = null;
    if (s.float) {
      const d = doc(); ctxOf(d).drawImage(s.float, s.box.x, s.box.y);
      remember({ kind: 'pixels', doc: d, image: s.before!, width: s.beforeSize[0], height: s.beforeSize[1] }); changed(d);
    }
    marquee(); render();
  }
  function selectionAction(action: string) {
    if (!selection) return;
    if (action === 'done') { place(); return; }
    lift(); const s = selection, float = s.float!;
    if (action === 'delete') { s.float = document.createElement('canvas'); s.float.width = s.float.height = 1; place(); return; }
    if (action === 'copy') {
      // Leave a copy where it is and keep moving the other, a little to the side.
      const d = doc(); ctxOf(d).drawImage(float, s.box.x, s.box.y);
      s.box = { ...s.box, x: Math.min(d.canvas.width - RES, s.box.x + 8 * RES), y: Math.min(d.canvas.height - RES, s.box.y + 8 * RES) };
      marquee(); return;
    }
    const next = document.createElement('canvas'), turn = action === 'turn';
    next.width = turn ? float.height : float.width; next.height = turn ? float.width : float.height;
    const c = next.getContext('2d')!; c.translate(next.width / 2, next.height / 2);
    if (action === 'flip-x') c.scale(-1, 1); else if (action === 'flip-y') c.scale(1, -1); else c.rotate(Math.PI / 2);
    c.drawImage(float, -float.width / 2, -float.height / 2);
    if (turn) s.box = { x: s.box.x + (s.box.width - next.width) / 2, y: s.box.y + (s.box.height - next.height) / 2, width: next.width, height: next.height };
    s.float = next; marquee();
  }
  function marquee() {
    const m = el('paint-marquee'), f = el<HTMLCanvasElement>('paint-float'), bar = el('paint-selection-bar'), d = doc();
    m.hidden = f.hidden = bar.hidden = !selection || !d;
    if (!selection || !d) return;
    const k = zoom / RES, b = selection.box;
    for (const node of [m, f]) { node.style.left = `${b.x * k}px`; node.style.top = `${b.y * k}px`; node.style.width = `${b.width * k}px`; node.style.height = `${b.height * k}px`; }
    f.hidden = !selection.float;
    if (selection.float) { f.width = selection.float.width; f.height = selection.float.height; const c = f.getContext('2d')!; c.clearRect(0, 0, f.width, f.height); c.drawImage(selection.float, 0, 0); }
  }

  // ── Text ──
  function openText(p: { x: number; y: number }) {
    const input = el<HTMLInputElement>('paint-text'), k = zoom / RES;
    text = { x: p.x, y: p.y }; input.value = ''; input.hidden = false;
    input.style.left = `${p.x * k}px`; input.style.top = `${p.y * k}px`; input.style.color = color;
    input.style.font = `700 ${fontSize() * k}px "DM Sans", system-ui, sans-serif`;
    input.focus({ preventScroll: true });
  }
  const fontSize = () => (8 + size * 2) * RES;
  function commitText() {
    const input = el<HTMLInputElement>('paint-text'); if (!text) { input.hidden = true; return; }
    const value = input.value.trim(), p = text; text = null; input.hidden = true;
    if (!value || !doc()) return;
    const d = doc(), before = capture(d), ctx = ctxOf(d);
    ctx.save(); ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.font = `700 ${fontSize()}px "DM Sans", system-ui, sans-serif`; ctx.fillText(value, p.x, p.y); ctx.restore();
    remember(before); changed(d);
  }

  // ── Whole-picture actions (More) ──
  function transform(action: 'flip-x' | 'flip-y' | 'turn' | 'clear' | 'centre') {
    const d = doc(), before = capture(d), source = document.createElement('canvas');
    source.width = d.canvas.width; source.height = d.canvas.height; source.getContext('2d')!.drawImage(d.canvas, 0, 0);
    const ctx = ctxOf(d);
    if (action === 'turn') {
      if (kind === 'backdrop') { toast('Backdrops always fill the stage, so they cannot turn. Flip them instead.', el('paint-more')); return; }
      [d.width, d.height] = [d.height, d.width]; d.canvas.width = d.width * RES; d.canvas.height = d.height * RES;
      ctx.translate(d.canvas.width / 2, d.canvas.height / 2); ctx.rotate(Math.PI / 2); ctx.drawImage(source, -source.width / 2, -source.height / 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else if (action === 'clear') ctx.clearRect(0, 0, d.canvas.width, d.canvas.height);
    else if (action === 'centre') {
      const box = contentBox(ctx.getImageData(0, 0, source.width, source.height)); if (!box) return;
      const dx = Math.round((source.width - box.width) / 2 / RES) * RES - box.x, dy = Math.round((source.height - box.height) / 2 / RES) * RES - box.y;
      if (!dx && !dy) { toast('The drawing is already in the middle.', el('paint-more')); return; }
      ctx.clearRect(0, 0, source.width, source.height); ctx.drawImage(source, dx, dy);
    } else {
      ctx.clearRect(0, 0, source.width, source.height); ctx.save(); ctx.translate(action === 'flip-x' ? source.width : 0, action === 'flip-y' ? source.height : 0); ctx.scale(action === 'flip-x' ? -1 : 1, action === 'flip-y' ? -1 : 1); ctx.drawImage(source, 0, 0); ctx.restore();
    }
    remember(before); changed(d); layout(); onionLayer();
  }
  let sizing = { width: 64, height: 64, stretch: false };
  function openSize() {
    const d = doc(); if (kind === 'backdrop') { toast('Backdrops are always the size of the stage, 480 × 320.', el('paint-more')); return; }
    sizing = { width: d.width, height: d.height, stretch: false }; el('paint-size-box').hidden = false; sizeControls(); el<HTMLButtonElement>('paint-size-apply').focus();
  }
  function sizeControls(message = '') {
    const limit = kind === 'tile' ? LIMITS.tile : LIMITS.costume;
    el('paint-width').textContent = String(sizing.width); el('paint-height').textContent = String(sizing.height);
    el<HTMLButtonElement>('paint-wider').disabled = sizing.width >= limit; el<HTMLButtonElement>('paint-taller').disabled = sizing.height >= limit;
    el('paint-keep').setAttribute('aria-pressed', String(!sizing.stretch)); el('paint-stretch').setAttribute('aria-pressed', String(sizing.stretch));
    if (message) toast(message, el(sizing.width >= limit ? 'paint-wider' : 'paint-taller'));
  }
  function applySize() {
    const d = doc(), before = capture(d), source = document.createElement('canvas');
    source.width = d.canvas.width; source.height = d.canvas.height; source.getContext('2d')!.drawImage(d.canvas, 0, 0);
    d.width = sizing.width; d.height = sizing.height; d.canvas.width = d.width * RES; d.canvas.height = d.height * RES;
    const ctx = ctxOf(d); ctx.imageSmoothingEnabled = !pixel;
    if (sizing.stretch) ctx.drawImage(source, 0, 0, d.canvas.width, d.canvas.height);
    else ctx.drawImage(source, Math.round((d.canvas.width - source.width) / 2 / RES) * RES, Math.round((d.canvas.height - source.height) / 2 / RES) * RES);
    el('paint-size-box').hidden = true; remember(before); changed(d); fit(); onionLayer();
  }
  function download() {
    const d = doc(), out = encode(d), a = document.createElement('a');
    a.href = out.data; a.download = `${d.name.trim() || 'artwork'}.png`; a.click();
  }

  // ── Costumes, backdrops or tiles beside the canvas ──
  function cards() {
    const list = el('paint-cards'); list.replaceChildren();
    docs.forEach((d, i) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'paint-card'; card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(i === current)); card.setAttribute('aria-label', `${label(kind)} ${i + 1}: ${d.name}`); card.dataset.index = String(i);
      const thumb = document.createElement('canvas'); thumb.width = 120; thumb.height = 96; thumb.setAttribute('aria-hidden', 'true');
      const number = document.createElement('span'); number.textContent = String(i + 1);
      card.append(thumb, number); list.append(card); drawThumb(thumb, d);
      card.addEventListener('click', () => { if (dragged) return; select(i); });
      card.addEventListener('contextmenu', event => { event.preventDefault(); cardMenu(i, card); });
      card.addEventListener('pointerdown', event => cardDown(event, i, card));
    });
    el('paint-strip-count').textContent = `${unique().length} ${unique().length === 1 ? label(kind) : label(kind) + 's'}`;
    rowsView();
  }
  function select(i: number) { if (i === current || i < 0 || i >= docs.length) return; place(); commitText(); current = i; show(); }

  // ── Animation rows ──
  function rowsView() {
    const list = el('paint-rows'), named = kind === 'costume';
    list.hidden = !named; el('paint-new-anim').hidden = !named; el('paint-anim').hidden = !named || rows[row]?.frames !== false;
    if (!named) return;
    list.replaceChildren(...rows.map((r, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'paint-row'; button.dataset.row = String(i);
      button.setAttribute('aria-pressed', String(i === row)); button.setAttribute('aria-label', `${r.name}: ${r.docs.length} ${r.docs.length === 1 ? 'costume' : 'costumes'}`);
      const name = document.createElement('span'); name.className = 'paint-row-name'; name.textContent = r.name;
      const count = document.createElement('span'); count.className = 'paint-row-count'; count.textContent = String(r.docs.length);
      const strip = document.createElement('span'); strip.className = 'paint-row-strip'; strip.setAttribute('aria-hidden', 'true');
      for (const d of r.docs.slice(0, 3)) { const c = document.createElement('canvas'); c.width = 52; c.height = 52; drawThumb(c, d); strip.append(c); }
      button.append(name, strip, count);
      button.addEventListener('click', () => openRow(i));
      return button;
    }));
    const open = rows[row];
    list.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
    if (open && !open.frames && document.activeElement !== el('paint-anim-name')) el<HTMLInputElement>('paint-anim-name').value = open.name;
    el<HTMLButtonElement>('paint-new-anim').disabled = rows.filter(r => !r.frames).length >= ANIMATION_LIMITS.animations;
  }
  function openRow(i: number) {
    if (i === row || !rows[i]) return;
    place(); commitText(); if (playing) play(false);
    row = i; docs = rows[i].docs; fps = rows[i].fps; current = 0; show(); fit();
  }
  function newAnimation() {
    const names = new Set(rows.map(r => r.name)); let n = 1; while (names.has(`animation ${n}`)) n++;
    remember(structure()); structureChanged = true; rowsChanged = true;
    rows.push({ name: `animation ${n}`, original: null, docs: doc() ? [doc()] : [], fps, timed: true, frames: false });
    openRow(rows.length - 1);
    const field = el<HTMLInputElement>('paint-anim-name'); field.focus(); field.select();
  }
  function renameAnimation() {
    const open = rows[row], field = el<HTMLInputElement>('paint-anim-name'); if (!open || open.frames) return;
    const name = field.value.trim();
    if (name === open.name) return;
    const problem = !validAnimationName(name) ? 'Start the name with a letter; use letters, numbers and spaces, up to 24.' : name === FRAMES_ANIMATION || rows.some((r, i) => i !== row && r.name === name) ? `There is already an animation called “${name}”.` : '';
    if (problem) { toast(problem, field); field.value = open.name; return; }
    remember(structure()); open.name = name; structureChanged = true; rowsChanged = true; rowsView();
  }
  function deleteAnimation() {
    const open = rows[row]; if (!open || open.frames) return;
    remember(structure()); structureChanged = true; rowsChanged = true;
    rows.splice(row, 1);
    if (!rows.length) rows.push({ name: FRAMES_ANIMATION, original: null, docs: [...open.docs], fps: open.fps, timed: false, frames: true });
    row = Math.max(0, Math.min(row, rows.length - 1)); docs = rows[row].docs; fps = rows[row].fps; current = 0; show();
  }
  /** Put the chosen costume into another animation too (the same picture, not a copy). */
  function copyToRow(target: number) {
    const d = doc(), to = rows[target]; if (!d || !to) return;
    if (to.docs.length >= ANIMATION_LIMITS.frames) { toast(`An animation holds up to ${ANIMATION_LIMITS.frames} costumes.`, el('paint-cards')); return; }
    remember(structure()); structureChanged = true; rowsChanged = true; to.docs.push(d); rowsView();
    toast(`Added to ${to.name}.`, el('paint-rows'));
  }
  function drawThumb(canvas: HTMLCanvasElement, d: Doc) {
    const ctx = canvas.getContext('2d')!, k = Math.min((canvas.width - 8) / d.canvas.width, (canvas.height - 8) / d.canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.imageSmoothingEnabled = !pixel || k < 1;
    ctx.drawImage(d.canvas, (canvas.width - d.canvas.width * k) / 2, (canvas.height - d.canvas.height * k) / 2, d.canvas.width * k, d.canvas.height * k);
  }
  let thumbFrame = 0;
  function thumbs() {
    if (thumbFrame) return;
    thumbFrame = requestAnimationFrame(() => {
      thumbFrame = 0;
      el('paint-cards').querySelectorAll<HTMLButtonElement>('.paint-card').forEach(card => { const d = docs[Number(card.dataset.index)]; if (d) drawThumb(card.querySelector('canvas')!, d); });
      const chip = el<HTMLCanvasElement>('paint-chip-thumb'); if (doc()) drawThumb(chip, doc());
      if (!playing) preview(current);
    });
  }
  // Long-press for a card's menu; drag to reorder costumes.
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number; index: number; pointer: number; card: HTMLElement } | null = null, dragged = false;
  function cardDown(event: PointerEvent, index: number, card: HTMLElement) {
    if (event.button > 0) return;
    dragged = false;
    press = { timer: setTimeout(() => { if (press && !dragged) { cardMenu(index, card); press = null; } }, 550), x: event.clientX, y: event.clientY, index, pointer: event.pointerId, card };
  }
  function cardMove(event: PointerEvent) {
    if (!press || press.pointer !== event.pointerId) return;
    if (!dragged && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 10) return;
    if (kind !== 'costume') { clearTimeout(press.timer); press = null; return; }
    if (!dragged) { dragged = true; clearTimeout(press.timer); remember(structure()); press.card.classList.add('dragging'); }
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.paint-card');
    const to = over ? Number(over.dataset.index) : -1;
    if (to >= 0 && to !== press.index) { const [moved] = docs.splice(press.index, 1); docs.splice(to, 0, moved); if (current === press.index) current = to; else if (press.index < current && to >= current) current--; else if (press.index > current && to <= current) current++; press.index = to; structureChanged = true; cards(); el('paint-cards').querySelector(`[data-index="${to}"]`)?.classList.add('dragging'); }
  }
  function cardUp() { if (press) clearTimeout(press.timer); press = null; setTimeout(() => { dragged = false; }, 0); el('paint-cards').querySelectorAll('.dragging').forEach(c => c.classList.remove('dragging')); }
  function cardMenu(index: number, anchor: HTMLElement) {
    closeMenus(); select(index);
    const menu = el('paint-card-menu'), noun = label(kind);
    const items: [string, string, string, boolean?][] = [['duplicate', 'Duplicate', ICONS.copy]];
    if (kind === 'costume') items.push(['earlier', 'Move earlier', ICONS.earlier, index === 0], ['later', 'Move later', ICONS.later, index === docs.length - 1]);
    if (kind === 'costume') rows.forEach((r, i) => { if (i !== row) items.push([`row:${i}`, `Also use in ${r.name}`, ICONS.copy, r.docs.includes(doc())]); });
    items.push(['download', 'Download PNG', ICONS.download]);
    if (kind === 'costume') items.push(['delete', `Delete this ${noun}`, ICONS.trash, docs.length < 2]);
    menu.innerHTML = `<span class="paint-menu-title">${noun[0].toUpperCase() + noun.slice(1)} ${index + 1}</span>` + items.map(([id, text, d, off]) => `<button type="button" role="menuitem" data-card="${id}" ${off ? 'disabled' : ''} class="${id === 'delete' ? 'danger' : ''}">${icon(d, 18)}${text}</button>`).join('');
    menu.hidden = false; position(menu, anchor);
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  function cardAction(action: string) {
    closeMenus(); const d = doc();
    if (action.startsWith('row:')) { copyToRow(Number(action.slice(4))); return; }
    if (action === 'download') { download(); return; }
    if (action === 'duplicate') {
      if (!room(1)) return;
      const copy = blank(d.width, d.height, `${d.name.slice(0, 40)} copy`); ctxOf(copy).drawImage(d.canvas, 0, 0);
      insert(copy); return;
    }
    remember(structure()); structureChanged = true;
    if (action === 'delete' && docs.length > 1) { docs.splice(current, 1); current = Math.min(current, docs.length - 1); }
    else if (action === 'earlier' && current > 0) { [docs[current - 1], docs[current]] = [docs[current], docs[current - 1]]; current--; }
    else if (action === 'later' && current < docs.length - 1) { [docs[current + 1], docs[current]] = [docs[current], docs[current + 1]]; current++; }
    show();
  }
  function insert(d: Doc) { remember(structure()); structureChanged = true; docs.splice(current + 1, 0, d); current++; show(); fit(); }
  /** Room for `count` more pieces of artwork within the project's limits. */
  function room(count: number) {
    // Art that will be new after Done: painted, copied or imported here, or a built-in shape that was changed.
    const scene = sceneState(workspace), fresh = unique().filter(d => !d.assetId && (d.changed || !d.origin)).length;
    // Library art does not use the project's own slots.
    const [used, limit] = kind === 'backdrop' ? [(scene.backdrops ?? []).filter(a => !isStock(a)).length + fresh, 12] : [scene.assets.filter(a => !isStock(a)).length + fresh, 24];
    if (used + count <= limit) return true;
    toast(`This project can hold ${limit} ${label(kind)}s of your own. Delete or reuse one first.`, el('paint-new')); return false;
  }


  // ── + New ──
  function openSheet() {
    closeMenus(); const sheet = el('paint-sheet'), noun = label(kind), d = doc();
    el('paint-sheet-title').textContent = kind === 'costume' ? `New costume${spriteId ? '' : ' for a new sprite'}` : `New ${noun}`;
    const sizes = kind === 'costume' ? [32, 64, 128] : kind === 'tile' ? [16, 32, 64] : [];
    const option = (id: string, d: string, title: string, text: string, extra = '') => `<button type="button" class="paint-option" data-new="${id}"><span class="paint-option-icon">${icon(d, 22)}</span><strong>${title}</strong><span>${text}</span>${extra}</button>`;
    el('paint-sheet-options').innerHTML = [
      option('paint', ICONS.paint, 'Paint', kind === 'backdrop' ? 'A blank backdrop the size of the stage' : `A blank ${noun}`, sizes.length ? `<span class="paint-sizes">${sizes.map(s => `<span role="button" tabindex="0" data-new-size="${s}" aria-pressed="${s === Math.min(d?.width ?? 64, LIMITS.costume)}">${s}</span>`).join('')}</span>` : ''),
      kind !== 'tile' ? option('library', ICONS.library, 'From the library', kind === 'backdrop' ? 'Forest, reef, city and more, ready to change' : 'Characters and objects, ready to change') : '',
      option('picture', ICONS.picture, 'A picture or a photo', `From your files or photos, or the camera on a tablet. Shrunk to fit ${kind === 'backdrop' ? 'the stage' : '256 × 256'}.`),
      d ? option('copy', ICONS.copy, `A copy of “${d.name}”`, kind === 'costume' ? 'The quickest start for the next frame' : 'To try a change without losing this one') : '',
    ].join('');
    const scene = sceneState(workspace);
    el('paint-sheet-note').textContent = kind === 'backdrop' ? `${(scene.backdrops ?? []).length} of 12 backdrop slots used.` : `${scene.assets.length} of 24 costume slots used in this project. New ${noun}s go after the selected one.`;
    sheet.hidden = false; position(sheet, el('paint-new'), 'left'); sheet.querySelector<HTMLButtonElement>('.paint-option')?.focus();
  }
  async function newFrom(source: string, sizeChoice?: number) {
    const d = doc(), noun = label(kind);
    if (source === 'paint') {
      if (!room(1)) return;
      const s = kind === 'backdrop' ? [480, 320] : [sizeChoice ?? Math.min(d?.width ?? 64, LIMITS.costume), sizeChoice ?? Math.min(d?.height ?? 64, LIMITS.costume)];
      insert(blank(s[0], s[1], uniqueName(kind === 'costume' ? 'Costume' : kind === 'tile' ? 'Tile' : 'Backdrop'))); closeMenus(); return;
    }
    if (source === 'copy') { closeMenus(); cardAction('duplicate'); return; }
    if (source === 'picture') { el<HTMLInputElement>('paint-file').click(); return; }
    if (source === 'library') {
      if (!room(1)) return; closeMenus();
      host.library(kind === 'backdrop' ? 'backdrop' : 'costume', async id => {
        const art = findStock(kind === 'backdrop' ? 'backdrop' : 'costume', id); if (!art) throw new Error(`Choose available ${noun} artwork.`);
        const canvas = art.builtin ? null : await stockCanvas(art, RES);
        const fresh = blank(art.width, art.height, art.name);
        if (canvas) ctxOf(fresh).drawImage(canvas, 0, 0);
        else { const c = ctxOf(fresh); c.save(); c.scale(RES, RES); if (art.kind === 'costume') { c.translate(art.width / 2, art.height / 2); paintBuiltinCostume(c, art.id); } else paintBuiltinBackdrop(c, art.id); c.restore(); }
        insert(fresh);
      });
    }
  }
  async function importPicture(file: File) {
    closeMenus();
    if (file.size > 10_000_000 || !file.type.startsWith('image/')) { toast('Choose a picture (PNG, JPEG or WebP) up to 10 MB.', el('paint-new')); return; }
    if (!room(1)) return;
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(file);
      const [maxW, maxH] = kind === 'backdrop' ? [480, 320] : kind === 'tile' ? [LIMITS.tile, LIMITS.tile] : [LIMITS.costume, LIMITS.costume];
      const k = kind === 'backdrop' ? Math.max(maxW / bitmap.width, maxH / bitmap.height) : Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      const width = kind === 'backdrop' ? 480 : Math.max(1, Math.round(bitmap.width * k)), height = kind === 'backdrop' ? 320 : Math.max(1, Math.round(bitmap.height * k));
      const fresh = blank(width, height, file.name.replace(/\.[^.]+$/, '').slice(0, 48).trim() || 'Picture');
      // Backdrops are cropped to fill the stage; costumes keep their whole picture.
      ctxOf(fresh).drawImage(bitmap, (fresh.canvas.width - bitmap.width * k * RES) / 2, (fresh.canvas.height - bitmap.height * k * RES) / 2, bitmap.width * k * RES, bitmap.height * k * RES);
      insert(fresh);
    } catch { toast('That picture could not be opened. Try a PNG or JPEG.', el('paint-new')); } finally { bitmap?.close(); }
  }

  // ── Preview of the animation ──
  function preview(index: number) {
    const canvas = el<HTMLCanvasElement>('paint-preview'), ctx = canvas.getContext('2d')!, d = docs[index % docs.length]; if (!d) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = Math.min(1, (canvas.width - 24) / d.canvas.width, (canvas.height - 24) / d.canvas.height) * Math.min(1, 2 * 64 * RES / Math.max(d.canvas.width, d.canvas.height));
    ctx.imageSmoothingEnabled = true; ctx.drawImage(d.canvas, (canvas.width - d.canvas.width * k) / 2, (canvas.height - d.canvas.height * k) / 2, d.canvas.width * k, d.canvas.height * k);
    canvas.dataset.frame = String(index % docs.length);
  }
  function play(on: boolean) {
    playing = on; clearTimeout(playTimer);
    const button = el('paint-play'); button.innerHTML = icon(on ? ICONS.pause : ICONS.play, 16); button.setAttribute('aria-label', on ? 'Pause the animation' : 'Play the animation');
    if (!on) { preview(current); return; }
    playFrame = current;
    const tick = () => { if (!playing || !dialog.open) return; preview(playFrame++); playTimer = setTimeout(tick, 1000 / fps); };
    tick();
  }

  // ── Done: one project Undo step ──
  function encode(d: Doc) {
    const image = ctxOf(d).getImageData(0, 0, d.canvas.width, d.canvas.height), out = document.createElement('canvas');
    if (blocky(image, RES)) { const small = downsample(image, RES); out.width = small.width; out.height = small.height; out.getContext('2d')!.putImageData(new ImageData(small.data as Uint8ClampedArray<ArrayBuffer>, small.width, small.height), 0, 0); return { data: out.toDataURL('image/png'), resolution: 1 }; }
    let data = d.canvas.toDataURL('image/png');
    const limit = (kind === 'backdrop' ? 900_000 : 350_000);
    if (data.length <= limit * RES * RES) return { data, resolution: RES };
    // Too detailed to keep at 2×: store it at 1×.
    out.width = d.width; out.height = d.height; const c = out.getContext('2d')!; c.imageSmoothingEnabled = true; c.drawImage(d.canvas, 0, 0, d.width, d.height);
    data = out.toDataURL('image/png'); if (data.length > limit) throw new Error(`“${d.name}” is too detailed to save. Try a smaller canvas or fewer colours.`);
    return { data, resolution: 1 };
  }
  function done() {
    if (loading) { dialog.close(); return; }
    place(); commitText();
    const touched = unique().some(d => d.changed || d.renamed) || structureChanged || fpsChanged || rowsChanged;
    if (!touched) { close(); return; }
    try {
      const scene = sceneState(workspace), next = structuredClone(scene), ids = new Map<Doc, string>(), renames = new Map<string, string>();
      const list = kind === 'backdrop' ? (next.backdrops ??= []) : next.assets;
      for (const d of unique()) {
        // Unchanged pictures keep their id; library art can be renamed in place, built-ins cannot.
        if (!d.changed && !(d.renamed && !d.assetId && !d.stock) && d.origin) {
          const id = d.assetId ?? d.origin; ids.set(d, id);
          const asset = list.find(a => a.id === id); if (asset && d.renamed) asset.name = d.name.trim() || asset.name;
          continue;
        }
        const out = encode(d), existing = d.assetId ? list.find(a => a.id === d.assetId) : undefined;
        const asset: Costume = { id: existing?.id ?? crypto.randomUUID(), name: d.name.trim() || `${label(kind)} ${docs.indexOf(d) + 1}`, width: d.width, height: d.height, data: out.data, ...(out.resolution === RES ? { resolution: RES } : {}) };
        if (existing) { Object.assign(existing, asset); if (out.resolution !== RES) delete existing.resolution; } else list.push(asset);
        ids.set(d, asset.id);
      }
      let painted: string | null = null;
      if (kind === 'costume') {
        let sprite = next.sprites.find(s => s.id === spriteId);
        if (!sprite) {
          const names = new Set(next.sprites.map(s => s.name)); let n = 1; while (names.has(`Sprite ${n}`)) n++;
          const centre = host.viewCentre();
          sprite = { id: crypto.randomUUID(), name: `Sprite ${n}`, x: Math.round(centre.x), y: Math.round(centre.y), ...(next.world ? { world: next.world } : {}), direction: 0, size: 100, layer: 0, visible: true, costume: ids.get(doc())! };
          next.sprites.push(sprite);
        }
        const id = (d: Doc) => ids.get(d)!, framesRow = rows.find(r => r.frames), named = rows.filter(r => !r.frames);
        const seconds = (r: Row) => Math.round(100 / r.fps) / 100;
        if (framesRow) {
          const frames = framesRow.docs.map(id);
          if (frames.length > 1 || sprite.costumes) sprite.costumes = frames;
          if (framesRow.timed) sprite.frameSeconds = seconds(framesRow);
        } else { const follow = named.find(r => r.original === framesFollow); if (follow) sprite.costumes = follow.docs.map(id); }
        if (named.length) sprite.animations = named.map(r => ({ name: r.name, frames: r.docs.map(id), ...(r.timed ? { seconds: seconds(r) } : r.seconds ? { seconds: r.seconds } : {}) }));
        else delete sprite.animations;
        // Animate while moving follows a renamed animation and lets go of a deleted one.
        const now = (n: string) => n === '' || n === FRAMES_ANIMATION ? n : named.find(r => r.original === n)?.name ?? (named.some(r => r.name === n) ? n : '');
        if (sprite.autoAnimate) sprite.autoAnimate = { ...sprite.autoAnimate, moving: now(sprite.autoAnimate.moving), air: now(sprite.autoAnimate.air), still: now(sprite.autoAnimate.still) };
        for (const r of named) if (r.original && r.original !== r.name) renames.set(r.original, r.name);
        sprite.costume = id(doc());
        painted = sprite.id;
      } else if (kind === 'backdrop') {
        const world = next.worlds?.find(w => w.id === next.world);
        if (world) world.backdrop = ids.get(doc())!; else next.backdrop = ids.get(doc())!;
      }
      // One Undo step: the scene and any blocks that name a renamed animation.
      const group = Blockly.Events.getGroup(); if (!group) Blockly.Events.setGroup(true);
      try {
        changeScene(workspace, next);
        if (renames.size) for (const block of workspace.getAllBlocks(false)) {
          const field = block.getField('ANIMATION'), name = field?.getValue();
          if (field && typeof name === 'string' && renames.has(name)) field.setValue(renames.get(name)!);
        }
      } finally { if (!group) Blockly.Events.setGroup(false); }
      close(); host.done(painted);
    } catch (error) { toast(error instanceof Error ? error.message : String(error), el('paint-done')); }
  }
  function close() { play(false); token++; stroke = null; selection = null; text = null; closeMenus(); if (dialog.open) dialog.close(); docs = []; rows = []; slot.replaceChildren(); undo = []; redo = []; }

  // ── Messages next to the control that caused them ──
  function toast(message: string, anchor: HTMLElement) {
    const node = el('paint-toast'); node.textContent = message; node.hidden = false; position(node, anchor);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 5000);
  }
  function position(node: HTMLElement, anchor: HTMLElement, side: 'below' | 'left' = 'below') {
    const a = anchor.getBoundingClientRect(), d = dialog.getBoundingClientRect(); node.style.visibility = 'hidden'; node.style.left = '0px'; node.style.top = '0px';
    const n = node.getBoundingClientRect(); node.style.visibility = '';
    let left = side === 'left' ? a.left - n.width - 10 : a.left + a.width / 2 - n.width / 2, top = side === 'left' ? a.bottom - n.height : a.bottom + 8;
    if (top + n.height > d.height - 8) top = a.top - n.height - 8;
    // Keep clear of the top bar unless the anchor is in it.
    const floor = a.top < 56 ? 8 : 64;
    left = Math.max(8, Math.min(d.width - n.width - 8, left)); top = Math.max(floor, Math.min(d.height - n.height - 8, top));
    node.style.left = `${left}px`; node.style.top = `${top}px`;
  }
  function closeMenus() { for (const id of ['paint-card-menu', 'paint-more-menu', 'paint-sheet', 'paint-size-box']) el(id).hidden = true; el('paint-more').setAttribute('aria-expanded', 'false'); }

  // ── Controls ──
  function render() {
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('.paint-tool')) button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('.paint-swatch')) button.setAttribute('aria-pressed', String(button.dataset.color === color));
    el('paint-color-dot').style.background = color; el('paint-color-name').textContent = SWATCHES.find(([c]) => c === color)?.[1] ?? color;
    el('paint-recent').innerHTML = recent.map(c => `<button type="button" data-color="${c}" aria-label="Recent colour ${c}" style="--swatch:${c}"></button>`).join('');
    const sizeInput = el<HTMLInputElement>('paint-size'); sizeInput.value = String(size); sizeInput.max = pixel ? '8' : '32';
    const dot = el('paint-size-dot'), shown = Math.min(40, Math.max(2, size * (pixel ? 4 : 1.5)));
    dot.style.width = dot.style.height = `${shown}px`; dot.style.background = color; dot.style.borderRadius = pixel ? '2px' : '50%';
    el('paint-size-label').textContent = tool === 'text' ? 'Letter size' : pixel ? `Size · ${size} pixel${size === 1 ? '' : 's'}` : 'Size';
    el('paint-shape-style').hidden = tool !== 'rect' && tool !== 'ellipse';
    el('paint-filled').setAttribute('aria-pressed', String(filled)); el('paint-outline').setAttribute('aria-pressed', String(!filled));
    el('paint-fill-style').hidden = tool !== 'fill';
    for (const button of el('paint-fill-style').querySelectorAll<HTMLButtonElement>('button')) button.setAttribute('aria-pressed', String(button.dataset.fill === fillStyle));
    el('paint-hint').textContent = TOOLS.find(t => t[0] === tool)![4];
    el('paint-smooth').setAttribute('aria-pressed', String(!pixel)); el('paint-pixel').setAttribute('aria-pressed', String(pixel));
    el<HTMLButtonElement>('paint-undo').disabled = !undo.length; el<HTMLButtonElement>('paint-redo').disabled = !redo.length;
    el('paint-owner').textContent = kind === 'costume' ? (sceneState(workspace).sprites.find(s => s.id === spriteId)?.name ?? 'New sprite') : kind === 'backdrop' ? 'Stage backdrops' : 'World tiles';
    el('paint-name-label').textContent = kind === 'costume' ? 'Costume' : kind === 'backdrop' ? 'Backdrop' : 'Tile';
    el('paint-strip-title').textContent = kind === 'costume' ? 'Costumes' : kind === 'backdrop' ? 'Backdrops' : 'Tiles';
    el('paint-cards').setAttribute('aria-label', el('paint-strip-title').textContent!);
    el('paint-options-label').textContent = `${kind === 'costume' ? 'Costume' : kind === 'backdrop' ? 'Backdrop' : 'Tile'} options`;
    const onionButton = el('paint-onion'); onionButton.hidden = kind !== 'costume' || docs.length < 2; onionButton.setAttribute('aria-pressed', String(onion));
    el('paint-preview-box').hidden = kind !== 'costume';
    el<HTMLInputElement>('paint-fps').value = String(fps); el('paint-fps-label').textContent = `${fps} frame${fps === 1 ? '' : 's'} a second`;
    board.style.cursor = tool === 'pick' ? 'copy' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair';
    layout();
  }
  function setTool(next: Tool) { if (next !== 'select') place(); if (next !== 'text') commitText(); tool = next; render(); }
  function useColor(next: string) { color = next; recent = [next, ...recent.filter(c => c !== next)].slice(0, 3); el<HTMLInputElement>('paint-custom-input').value = next; if (text) el('paint-text').style.color = next; render(); }
  dialog.addEventListener('click', event => {
    const target = event.target as HTMLElement, button = target.closest<HTMLElement>('button, [data-new-size]');
    if (!button || !dialog.contains(button)) { if (!target.closest('.paint-menu, .paint-popover, #paint-more')) closeMenus(); return; }
    if (button.dataset.tool) setTool(button.dataset.tool as Tool);
    else if (button.dataset.color) useColor(button.dataset.color);
    else if (button.dataset.fill) { fillStyle = button.dataset.fill as FillStyle; render(); }
    else if (button.dataset.select) selectionAction(button.dataset.select);
    else if (button.dataset.more) { closeMenus(); const action = button.dataset.more; if (action === 'size') openSize(); else if (action === 'download') download(); else transform(action as 'flip-x'); }
    else if (button.dataset.card) cardAction(button.dataset.card);
    else if (button.dataset.newSize) { void newFrom('paint', Number(button.dataset.newSize)); event.stopPropagation(); }
    else if (button.dataset.new) void newFrom(button.dataset.new);
    else if (button.dataset.step) { const [axis, delta] = button.dataset.step.split(':'), limit = kind === 'tile' ? LIMITS.tile : LIMITS.costume, key = axis as 'width' | 'height', want = sizing[key] + Number(delta); sizing[key] = Math.max(8, Math.min(limit, want)); sizeControls(Number(delta) > 0 && sizing[key] >= limit ? `${kind === 'tile' ? 'Tiles' : 'Costumes'} fit within ${limit} × ${limit}.${kind === 'tile' ? '' : ' For something bigger, make it a backdrop.'}` : ''); }
  });
  const on = (id: string, action: () => void) => el(id).addEventListener('click', event => { event.stopPropagation(); action(); });
  on('paint-done', done); on('paint-undo', () => stepBack(false)); on('paint-redo', () => stepBack(true));
  on('paint-smooth', () => { pixel = false; size = Math.max(size, 2); render(); thumbs(); });
  on('paint-pixel', () => { pixel = true; size = Math.min(size, 2); render(); thumbs(); });
  on('paint-filled', () => { filled = true; render(); }); on('paint-outline', () => { filled = false; render(); });
  on('paint-onion', () => { onion = !onion; onionLayer(); render(); });
  on('paint-custom', () => el<HTMLInputElement>('paint-custom-input').click());
  el<HTMLInputElement>('paint-custom-input').addEventListener('input', () => useColor(el<HTMLInputElement>('paint-custom-input').value));
  el<HTMLInputElement>('paint-size').addEventListener('input', () => { size = Number(el<HTMLInputElement>('paint-size').value); render(); if (text) el('paint-text').style.font = `700 ${fontSize() * zoom / RES}px "DM Sans", system-ui, sans-serif`; });
  el<HTMLInputElement>('paint-name').addEventListener('input', () => { const d = doc(); if (!d) return; d.name = el<HTMLInputElement>('paint-name').value; d.renamed = true; cards(); });
  on('paint-zoom-in', () => zoomTo(zoom * 1.25)); on('paint-zoom-out', () => zoomTo(zoom / 1.25)); on('paint-zoom-fit', fit);
  on('paint-more', () => { const menu = el('paint-more-menu'), open = menu.hidden; closeMenus(); menu.hidden = !open; el('paint-more').setAttribute('aria-expanded', String(open)); if (open) { position(menu, el('paint-more')); menu.querySelector<HTMLButtonElement>('button')?.focus(); } });
  on('paint-new', openSheet); on('paint-sheet-close', closeMenus);
  on('paint-options', () => cardMenu(current, el('paint-options')));
  on('paint-keep', () => { sizing.stretch = false; sizeControls(); }); on('paint-stretch', () => { sizing.stretch = true; sizeControls(); });
  on('paint-size-apply', applySize); on('paint-size-cancel', () => { el('paint-size-box').hidden = true; });
  on('paint-play', () => play(!playing));
  el<HTMLInputElement>('paint-fps').addEventListener('input', () => { fps = Number(el<HTMLInputElement>('paint-fps').value); fpsChanged = true; if (rows[row]) { rows[row].fps = fps; rows[row].timed = true; } render(); });
  el('paint-new-anim').addEventListener('click', () => newAnimation());
  el('paint-anim-delete').addEventListener('click', () => deleteAnimation());
  const animName = el<HTMLInputElement>('paint-anim-name');
  animName.addEventListener('change', () => renameAnimation());
  animName.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); renameAnimation(); animName.blur(); } else if (event.key === 'Escape') { event.stopPropagation(); animName.value = rows[row]?.name ?? ''; animName.blur(); } });
  el<HTMLInputElement>('paint-file').addEventListener('change', () => { const file = el<HTMLInputElement>('paint-file').files?.[0]; el<HTMLInputElement>('paint-file').value = ''; if (file) void importPicture(file); });
  el<HTMLInputElement>('paint-text').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commitText(); } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); text = null; el('paint-text').hidden = true; } });
  el<HTMLInputElement>('paint-text').addEventListener('blur', () => setTimeout(commitText, 0));
  board.addEventListener('pointerdown', pointerDown); view.addEventListener('pointerdown', event => { if (event.target === view) { pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 2) startGesture(); } });
  window.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('pointermove', cardMove); window.addEventListener('pointerup', cardUp); window.addEventListener('pointercancel', cardUp);
  view.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) zoomTo(zoom * Math.exp(-event.deltaY * 0.0025), { x: event.clientX, y: event.clientY });
    else { pan = { x: pan.x - event.deltaX, y: pan.y - event.deltaY }; layout(); }
  }, { passive: false });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (text) { text = null; el('paint-text').hidden = true; return; } if (![...dialog.querySelectorAll<HTMLElement>('.paint-menu, .paint-popover')].every(m => m.hidden)) { closeMenus(); return; } if (selection) { place(); return; } done(); });
  dialog.addEventListener('keydown', event => {
    if ((event.target as HTMLElement).matches('input:not([type=range]):not([type=color])')) return;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); stepBack(event.shiftKey); return; }
    if ((event.ctrlKey || event.metaKey) && key === 'y') { event.preventDefault(); stepBack(true); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (selection && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); selectionAction('delete'); return; }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (selection && arrows[event.key]) { event.preventDefault(); lift(); const [dx, dy] = arrows[event.key], step = (event.shiftKey ? 10 : 1) * RES; selection.box = { ...selection.box, x: selection.box.x + dx * step, y: selection.box.y + dy * step }; marquee(); return; }
    const found = TOOLS.find(t => t[2].toLowerCase() === key); if (found && (event.target as HTMLElement).closest('.paint-body, .paint-top')) { setTool(found[0]); }
  });

  return {
    open: (target: PaintTarget) => { void open(target); },
    get isOpen() { return dialog.open; },
    close,
    dispose() { close(); dialog.remove(); for (const [type, handler] of [['pointermove', pointerMove], ['pointerup', pointerUp], ['pointercancel', pointerUp], ['pointermove', cardMove], ['pointerup', cardUp], ['pointercancel', cardUp]] as const) window.removeEventListener(type, handler as EventListener); },
  };
}
