import * as Blockly from 'blockly/core';
import type { SceneState } from './model';
import { builtins } from './model';
import { paintBuiltinCostume } from './assets';
import { handlerSignatures, type FunctionBlock } from '../language/functions';

export function installSceneNavigation(workspace: Blockly.WorkspaceSvg, select: (id: string) => void, world: (id: string) => void, locate: () => void, art: () => void) {
  document.querySelector('#scene-properties')!.insertAdjacentHTML('beforebegin', '<section class="scene-navigation" aria-label="Sprite browser"><label>Starting world <select id="scene-browse-world"></select></label><label>Find sprite <input id="scene-filter" type="search" placeholder="Name, kind or world"></label><div id="scene-cards" role="group" aria-label="Choose a sprite"></div><p id="scene-filter-empty" hidden>No sprites match.</p><div class="scene-toolbar"><button id="scene-locate" class="button secondary">Find on stage</button><button id="scene-edit-costume" class="button secondary">Edit costume</button></div><label>Scripts for sprite <select id="scene-script"></select></label><button id="scene-script-find" class="button secondary">Go to script</button></section>');
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  let previous = '', current = '', scene: SceneState, editing = true;
  el('scene-filter').addEventListener('input', filter);
  el('scene-browse-world').addEventListener('change', () => world(el<HTMLSelectElement>('scene-browse-world').value));
  el('scene-locate').addEventListener('click', locate); el('scene-edit-costume').addEventListener('click', art);
  el('scene-script-find').addEventListener('click', () => { const block = workspace.getAllBlocks(false).find(b => b.type === 'py_handler' && (b as unknown as FunctionBlock).functionId === el<HTMLSelectElement>('scene-script').value); if (block) { workspace.centerOnBlock(block.id); workspace.highlightBlock(block.id); block.select(); document.querySelector('#blockly')!.scrollIntoView({block:'nearest'}); } });
  function filter() { const q = el<HTMLInputElement>('scene-filter').value.trim().toLocaleLowerCase(); let count = 0; for (const card of el('scene-cards').querySelectorAll<HTMLButtonElement>('button')) { card.hidden = !card.dataset.search!.includes(q); if (!card.hidden) count++; } el('scene-filter-empty').hidden = count > 0; }
  function refresh(next: SceneState, id: string, canEdit: boolean) {
    scene = next; current = id; editing = canEdit;
    const json = JSON.stringify([scene.sprites.map(s => [s.id,s.name,s.costume,s.kind,s.world]),scene.assets,scene.worlds?.map(w => [w.id,w.name])]);
    if (previous !== json) {
      previous = json; el('scene-cards').replaceChildren();
      for (const s of scene.sprites) {
        const card = document.createElement('button'); card.type = 'button'; card.dataset.sprite = s.id; card.setAttribute('aria-label', `Select sprite ${s.name}`);
        const worldName = scene.worlds?.find(w => w.id === s.world)?.name ?? 'Global'; card.dataset.search = `${s.name} ${s.kind ?? ''} ${worldName}`.toLocaleLowerCase();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48; canvas.setAttribute('aria-hidden','true');
        const ctx = canvas.getContext('2d')!, asset = [...builtins,...scene.assets].find(a => a.id === s.costume);
        if (asset) { const scale = Math.min(40/asset.width,40/asset.height); ctx.translate(24,24); ctx.scale(scale,scale); if ('data' in asset) { const img = new Image(); img.onload = () => { if (card.isConnected) ctx.drawImage(img,-asset.width/2,-asset.height/2); }; img.src = asset.data; } else paintBuiltinCostume(ctx,asset.id); }
        const name = document.createElement('strong'), scope = document.createElement('small'); name.textContent = s.name; scope.textContent = worldName;
        card.append(canvas,name,scope); card.addEventListener('click', () => select(s.id)); el('scene-cards').append(card);
      }
      filter(); el<HTMLSelectElement>('scene-browse-world').replaceChildren(new Option('Base stage',''),...(scene.worlds ?? []).map(w => new Option(w.name,w.id)));
    }
    el<HTMLSelectElement>('scene-browse-world').value = scene.world ?? ''; el<HTMLSelectElement>('scene-browse-world').disabled = !editing;
    for (const card of el('scene-cards').querySelectorAll('button')) card.setAttribute('aria-pressed',String((card as HTMLElement).dataset.sprite === current));
    const sprite = scene.sprites.find(s => s.id === current);
    el<HTMLButtonElement>('scene-locate').disabled = !editing || !sprite; el<HTMLButtonElement>('scene-edit-costume').disabled = !editing || !sprite;
    const handlers = handlerSignatures(workspace).filter(h => h.handler!.sprite === current || !!sprite?.kind && h.handler!.kind === sprite.kind || !h.handler!.sprite && !h.handler!.kind);
    const chosen = el<HTMLSelectElement>('scene-script').value;
    el<HTMLSelectElement>('scene-script').replaceChildren(...handlers.map(h => new Option(`${h.name} · ${h.handler!.event}${h.handler!.sprite || h.handler!.kind ? '' : ' · project'}`,h.id)));
    if (handlers.some(h => h.id === chosen)) el<HTMLSelectElement>('scene-script').value = chosen;
    el<HTMLButtonElement>('scene-script-find').disabled = !handlers.length;
  }
  return {refresh};
}
