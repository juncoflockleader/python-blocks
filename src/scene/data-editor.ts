import type * as Blockly from 'blockly/core';
import { validData } from './model';
import { changeScene, sceneState } from './state';

export function installDataEditor(workspace: Blockly.WorkspaceSvg, selected: () => string, editable: () => boolean) {
  document.getElementById('scene-properties')!.insertAdjacentHTML('afterend', `<details id="scene-data"><summary>Sprite data & behavior</summary>
    <p>Each sprite has its own data dictionary. Clones start with a separate copy. Running blocks can change these values without changing the saved starting data.</p>
    <form id="data-form"><fieldset id="data-fields"><legend>Starting data</legend>
      <div class="scene-properties-grid"><label>Entry <select id="data-entry"></select></label><label>Name <input id="data-name" maxlength="100" required></label>
      <label>Type <select id="data-type"><option value="number">Number</option><option value="text">Text</option><option value="boolean">True / false</option><option value="list">List</option><option value="dictionary">Dictionary</option><option value="none">None</option></select></label>
      <label>Value <input id="data-value" value="0" aria-describedby="data-hint"></label></div>
      <p id="data-hint">Enter a number.</p><div class="scene-toolbar"><button class="button primary" type="submit">Save entry</button><button id="data-remove" class="button secondary" type="button">Remove entry</button><button id="data-behavior" class="button secondary" type="button">Add sprite behavior</button></div>
    </fieldset></form><p id="data-error" role="alert"></p></details>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const entry = el<HTMLSelectElement>('data-entry'), name = el<HTMLInputElement>('data-name'), type = el<HTMLSelectElement>('data-type'), value = el<HTMLInputElement>('data-value');
  let spriteId = '', displayed = '';
  const entryKey = () => entry.selectedIndex > 0 ? entry.value : null;
  function hint() {
    const hints: Record<string, string> = { number: 'Enter a number.', text: 'Enter any text.', boolean: 'Enter true or false.', list: 'Use a JSON list, for example [1, 2, 3].', dictionary: 'Use a JSON dictionary, for example {"score": 0}.', none: 'None represents an empty value.' };
    el('data-hint').textContent = hints[type.value]; value.disabled = type.value === 'none';
  }
  function load() {
    const data = sceneState(workspace).sprites.find(s => s.id === selected())?.data ?? {}, key = entryKey(), item = key === null ? undefined : data[key];
    name.value = key ?? '';
    type.value = key === null ? 'number' : item === null ? 'none' : Array.isArray(item) ? 'list' : typeof item === 'object' ? 'dictionary' : typeof item === 'string' ? 'text' : typeof item;
    value.value = key === null ? '0' : typeof item === 'string' ? item : JSON.stringify(item); hint();
    el<HTMLButtonElement>('data-remove').disabled = key === null;
  }
  function refresh() {
    const sprite = sceneState(workspace).sprites.find(s => s.id === selected()), previous = spriteId === selected() ? entryKey() : null;
    const fingerprint = JSON.stringify([selected(), editable(), sprite?.data]);
    if (fingerprint === displayed) return;
    displayed = fingerprint;
    spriteId = selected(); entry.replaceChildren(new Option('New entry', ''), ...Object.keys(sprite?.data ?? {}).map(key => new Option(key || '(empty name)', key)));
    entry.selectedIndex = previous === null ? 0 : Object.keys(sprite?.data ?? {}).indexOf(previous) + 1;
    el<HTMLFieldSetElement>('data-fields').disabled = !editable() || !sprite; load();
  }
  function save(remove = false) {
    if (!editable()) return;
    try {
      const scene = sceneState(workspace), sprite = scene.sprites.find(s => s.id === selected()); if (!sprite) return;
      const data = { ...sprite.data }, key = name.value.trim(), previous = entryKey();
      if (remove && previous !== null) delete data[previous];
      else {
        if (!key) throw new Error('Give this entry a name.');
        if (previous !== key && Object.hasOwn(data, key)) throw new Error('That name already exists. Select the entry to change it.');
        let item: unknown;
        if (type.value === 'text') item = value.value;
        else if (type.value === 'none') item = null;
        else {
          try { item = JSON.parse(value.value); } catch { throw new Error('Enter a valid value for the selected type.'); }
          if (type.value === 'number' && typeof item !== 'number' || type.value === 'boolean' && typeof item !== 'boolean' || type.value === 'list' && !Array.isArray(item) || type.value === 'dictionary' && (!item || typeof item !== 'object' || Array.isArray(item))) throw new Error('The value does not match the selected type.');
        }
        if (previous !== null && previous !== key) delete data[previous];
        Object.defineProperty(data, key, { value: item, enumerable: true, writable: true, configurable: true });
      }
      if (!validData(data)) throw new Error('Use finite JSON values with at most 16 nested levels, 1,024 values and 16 KB per sprite.');
      sprite.data = data; changeScene(workspace, scene); refresh(); if (!remove) { entry.value = key; load(); }
      el('data-error').textContent = '';
    } catch (error) { el('data-error').textContent = error instanceof Error ? error.message : String(error); }
  }
  entry.addEventListener('change', load); type.addEventListener('change', hint);
  el('data-form').addEventListener('submit', event => { event.preventDefault(); save(); });
  el('data-remove').addEventListener('click', () => save(true));
  el('data-behavior').addEventListener('click', () => {
    el('events-manage').click();
    const handler = el<HTMLSelectElement>('handler-select'); handler.value = ''; handler.dispatchEvent(new Event('change'));
    const target = el<HTMLSelectElement>('handler-sprite'); target.value = selected(); target.dispatchEvent(new Event('change'));
    el('handler-name').focus();
  });
  return { refresh };
}
