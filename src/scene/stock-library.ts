import { findStock, stockArtwork, stockCanvas } from './stock-art';
import { stockAssetById } from '../art/catalog';
import { paintStockBox } from '../art/raster';
import { templateLayout, worldTemplates } from './world-templates';

export type StockKind = 'costume' | 'backdrop' | 'world';
export function installStockLibrary(add: (kind: StockKind, id: string, signal: AbortSignal) => Promise<void>) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="stock-dialog" aria-labelledby="stock-title">
    <header class="stock-heading"><div><h2 id="stock-title">Make something yours</h2><p>Choose artwork or a world to start with. Every addition is editable.</p></div><button id="stock-close" class="button secondary">Close</button></header>
    <div class="stock-filters"><label>Browse <select id="stock-kind"><option value="costume">Sprites</option><option value="backdrop">Backdrops</option><option value="world">Worlds</option></select></label><label>Search <input id="stock-search" type="search" placeholder="Try robot, forest, or tiles"></label><label id="stock-category-label">Category <select id="stock-category"><option value="">All</option><option>Characters</option><option>Objects</option><option>Tiles</option></select></label></div>
    <p id="stock-help">Choose a sprite to add it to the starting scene.</p><p id="stock-count" role="status"></p><div id="stock-grid" class="stock-grid"></div><p id="stock-error" role="alert"></p>
  </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('stock-dialog'), kind = el<HTMLSelectElement>('stock-kind'), search = el<HTMLInputElement>('stock-search'), category = el<HTMLSelectElement>('stock-category');
  let generation = 0, operation: AbortController | undefined, override: typeof add | undefined;
  async function preview(type: StockKind, id: string) {
    if (type !== 'world') return stockCanvas(findStock(type, id)!, 2);
    const template = worldTemplates.find(t => t.id === id)!, world = templateLayout(template);
    const canvas = document.createElement('canvas'); canvas.width = world.map.columns * 32; canvas.height = 320;
    const c = canvas.getContext('2d')!; c.drawImage(await stockCanvas(findStock('backdrop', template.backdrop)!),0,0,canvas.width,canvas.height);
    const images = new Map<string,HTMLCanvasElement>();
    for(const id of new Set(world.map.tiles.filter((id): id is string => id !== null))) {
      const art = stockAssetById(id)!, image = document.createElement('canvas'); image.width = 64; image.height = 64;
      const ic = image.getContext('2d')!; ic.scale(64 / art.width, 64 / art.height); paintStockBox(ic, art.ref); images.set(id, image);
    }
    world.map.tiles.forEach((id,i) => { if(id) c.drawImage(images.get(id)!,i%world.map.columns*32,Math.floor(i/world.map.columns)*32,32,32); });
    return canvas;
  }
  function render() {
    const version = ++generation, type = kind.value as StockKind, query = search.value.trim().toLowerCase();
    el('stock-category-label').hidden = type !== 'costume';
    el('stock-help').textContent = type === 'world' ? 'Add a new editable tilemap and its artwork. Orange tile outlines in the world editor mark solid walls. Add your own characters and code.' : type === 'backdrop' ? 'Choose the backdrop for the current world or base stage.' : 'Choose a sprite to add at the center of the current view. Press Paint under the stage to change it.';
    const entries = type === 'world' ? worldTemplates.map(t => ({...t,category:'Worlds'})) : stockArtwork.filter(a => a.kind === type).map(a => ({...a,description:a.detail}));
    const shown = entries.filter(a => `${a.name} ${a.description}`.toLowerCase().includes(query) && (type !== 'costume' || !category.value || category.value === a.category));
    const noun = type === 'world' ? 'world' : type === 'backdrop' ? 'backdrop' : 'sprite';
    el('stock-count').textContent = `${shown.length} ${noun}${shown.length === 1 ? '' : 's'}${shown.length ? ' · choose one to add' : ' · try another search'}`;
    const grid = el('stock-grid'); grid.replaceChildren();
    for(const entry of shown) {
      const button = document.createElement('button'); button.className = 'stock-card'; button.dataset.stockId = entry.id; button.dataset.stockKind = type;
      button.setAttribute('aria-label', `Add ${entry.name}`); button.disabled = !!operation;
      const thumbnail = document.createElement('div'); thumbnail.className = 'stock-thumbnail';
      const title = document.createElement('strong'); title.textContent = entry.name;
      const detail = document.createElement('span'); detail.textContent = entry.description;
      button.append(thumbnail,title,detail); grid.append(button);
      void preview(type,entry.id).then(canvas => { if(version === generation) { canvas.setAttribute('aria-hidden','true'); thumbnail.append(canvas); } }).catch(error => { if(version === generation) el('stock-error').textContent = String(error); });
      button.addEventListener('click',async () => {
        if(operation) return;
        const request = new AbortController(); operation = request; el('stock-error').textContent = '';
        grid.querySelectorAll('button').forEach(b => { b.disabled = true; });
        try { await (override ?? add)(type,entry.id,request.signal); if(!request.signal.aborted) dialog.close(); }
        catch(error) { if(!request.signal.aborted) el('stock-error').textContent = error instanceof Error ? error.message : String(error); }
        finally { if(operation === request) { operation = undefined; if(dialog.open) render(); } }
      });
    }
  }
  const close = () => { generation++; operation?.abort(); operation = undefined; override = undefined; dialog.close(); };
  el('stock-close').addEventListener('click',close); dialog.addEventListener('cancel',close); dialog.addEventListener('close', () => { override = undefined; });
  kind.addEventListener('change',render); category.addEventListener('change',render); search.addEventListener('input',render);
  // `use` replaces adding to the scene for this opening (the Paint editor adds a frame instead).
  return { open(type: StockKind, use?: typeof add) { override = use; kind.value=type; search.value=''; category.value=''; el('stock-error').textContent=''; dialog.showModal(); render(); search.focus(); }, close, dispose() { close(); dialog.remove(); } };
}
