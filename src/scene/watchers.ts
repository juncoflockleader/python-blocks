import * as Blockly from 'blockly/core';
import { changeScene, sceneState } from './state';
import type { SceneState } from './model';
import { initialWatch, validWatchValues, watchProperties, type Watch, type WatchValue } from './watch-model';

export function installWatchers(workspace: Blockly.WorkspaceSvg) {
  document.querySelector('#questions')!.insertAdjacentHTML('afterend', '<section id="watch-readouts" aria-label="Watched sprite values" hidden><p id="watch-phase"></p><ul id="watch-values"></ul></section>');
  document.querySelector('#scene-properties')!.insertAdjacentHTML('beforebegin', '<details id="watch-settings"><summary>Watch sprite values</summary><p>Pin up to 12 properties or data keys. Watchers are read-only; choose them before Run.</p><form id="watch-form"><label>Watched sprite <select id="watch-sprite"></select></label><label>Property <select id="watch-property"></select></label><label id="watch-key-label" hidden>Data key <input id="watch-key" maxlength="128"></label><button id="watch-add" class="button secondary">Add watcher</button></form><ul id="watch-config"></ul><p id="watch-error" role="alert"></p></details>');
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  el<HTMLSelectElement>('watch-property').replaceChildren(...watchProperties.map(p => new Option(p === 'data' ? 'Data key' : p,p)));
  el('watch-property').addEventListener('change', () => { el('watch-key-label').hidden = el<HTMLSelectElement>('watch-property').value !== 'data'; });
  let editing = true, captured: SceneState | null = null, phase = 'Starting values', signature = '';
  const output = new Map<string,HTMLElement>();
  const change = (fn: (state: SceneState) => void) => { if (!editing) return; try { const s = sceneState(workspace); fn(s); changeScene(workspace,s); el('watch-error').textContent = ''; refresh(s,true); } catch (error) { el('watch-error').textContent = error instanceof Error ? error.message : String(error); } };
  el('watch-form').addEventListener('submit', event => { event.preventDefault(); change(s => {
    const sprite = el<HTMLSelectElement>('watch-sprite').value, property = el<HTMLSelectElement>('watch-property').value as Watch['property'], key = el<HTMLInputElement>('watch-key').value;
    if (!sprite) throw new Error('Add a sprite first.');
    if (s.watchers?.some(w => w.sprite === sprite && w.property === property && (property !== 'data' || w.key === key))) throw new Error('That value already has a watcher.');
    s.watchers = [...(s.watchers ?? []),{id:crypto.randomUUID(),sprite,property,...(property === 'data' ? {key} : {})}];
  }); });
  function refresh(authored: SceneState, canEdit: boolean) {
    editing = canEdit; const s = captured ?? authored, watches = s.watchers ?? [];
    const selected = el<HTMLSelectElement>('watch-sprite').value;
    el<HTMLSelectElement>('watch-sprite').replaceChildren(...authored.sprites.map(s => new Option(s.name,s.id)));
    if (authored.sprites.some(s => s.id === selected)) el<HTMLSelectElement>('watch-sprite').value = selected;
    for (const input of el('watch-form').querySelectorAll<HTMLInputElement>('input,select,button')) input.disabled = !editing;
    el<HTMLButtonElement>('watch-add').disabled = !editing || !authored.sprites.length || (authored.watchers?.length ?? 0) >= 12;
    const json = JSON.stringify([watches,s.sprites.map(s => [s.id,s.name]),editing]);
    if (signature !== json) {
      signature = json; output.clear(); el('watch-values').replaceChildren(); el('watch-config').replaceChildren();
      for (const watch of watches) {
        const title = `${s.sprites.find(s => s.id === watch.sprite)?.name ?? 'Unavailable sprite'} · ${watch.property === 'data' ? 'data['+JSON.stringify(watch.key)+']' : watch.property}`;
        const item = document.createElement('li'), label = document.createElement('span'), value = document.createElement('output'); label.textContent = title; value.dataset.watchId = watch.id; value.setAttribute('aria-label',title); value.setAttribute('aria-live','off'); item.append(label,value); el('watch-values').append(item); output.set(watch.id,value);
        const config = document.createElement('li'), name = document.createElement('span'), remove = document.createElement('button'); name.textContent = title; remove.textContent = 'Remove'; remove.className = 'button secondary'; remove.setAttribute('aria-label','Remove watcher '+title); remove.disabled = !editing;
        remove.addEventListener('click', () => change(state => { state.watchers = state.watchers?.filter(w => w.id !== watch.id); })); config.append(name,remove); el('watch-config').append(config);
      }
    }
    el('watch-readouts').hidden = !watches.length; el('watch-phase').textContent = phase;
    if (!captured) accept(watches.map(w => initialWatch(w,authored.sprites.find(s => s.id === w.sprite))));
  }
  function accept(values: WatchValue[]) { if (!validWatchValues(values)) return; for (const value of values) { const node = output.get(value.id); if (node) { node.textContent = value.text; node.dataset.state = value.state; } } }
  return {
    refresh, accept,
    start(scene: SceneState) { captured = structuredClone(scene); phase = 'Live values'; signature = ''; refresh(scene,false); accept((scene.watchers ?? []).map(w => initialWatch(w,scene.sprites.find(s => s.id === w.sprite)))); },
    stop() { if (captured) { phase = 'Last run values'; el('watch-phase').textContent = phase; } },
    restore() { captured = null; phase = 'Starting values'; signature = ''; refresh(sceneState(workspace),true); },
  };
}
