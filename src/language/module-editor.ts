import { loadWorkspace } from './serialization';
import * as Blockly from 'blockly/core';
import { compileModuleDefinition } from './compiler';
import { exportImportedModule, exportModule, importModule, prepareModule } from './module-format';
import { changeModules, moduleCallState, moduleReferenceState, moduleKey, moduleState, removeModule, renameModule, samePin, type ModuleBundle } from './modules';
import { installPythonVariables } from './variables';
import { signatureOf } from './functions';

export function installModuleEditor(workspace: Blockly.WorkspaceSvg) {
  document.querySelector('.blocks-panel .panel-heading')!.insertAdjacentHTML('beforeend', '<button class="button secondary" id="modules-manage">Modules</button>');
  document.body.insertAdjacentHTML('beforeend', `<dialog id="modules-dialog" aria-labelledby="modules-title">
    <h2 id="modules-title">Reusable function modules</h2>
    <p>Import a saved copy of functions and their helpers. Each namespace keeps its own names. Imports stay pinned until you explicitly choose another revision.</p>
    <fieldset><legend>Export local functions</legend>
      <label>Module name <input id="module-name" spellcheck="false" value="my_tools"></label>
      <div id="module-export-functions" class="module-choices"></div>
      <p>Selected functions are public; needed helpers travel with them. Pass project state through parameters. Startup code and handlers stay here.</p>
      <button id="module-export" class="button secondary">Export module</button>
    </fieldset>
    <fieldset><legend>Import a module file</legend>
      <label>Module file <input id="module-file" type="file" accept=".json,application/json"></label>
      <p id="module-preview"></p>
      <label>Namespace <input id="module-import-alias" spellcheck="false"></label>
      <button id="module-import" class="button primary" disabled>Import module</button>
    </fieldset>
    <fieldset><legend>Saved imports</legend>
      <label>Choose import <select id="module-select"></select></label>
      <label>Namespace <input id="module-alias" spellcheck="false"></label>
      <button id="module-rename" class="button secondary">Rename namespace</button>
      <button id="module-inspect" class="button secondary">Inspect module</button>
      <button id="module-save-copy" class="button secondary">Export saved copy</button>
      <button id="module-remove" class="button secondary">Remove import</button>
      <p>Call blocks appear in Modules. Removing an import keeps its calls and arguments for repair or Undo.</p>
    </fieldset>
    <p id="modules-error" role="alert"></p><p id="modules-status" role="status"></p>
    <button id="modules-close" class="button secondary">Close</button>
  </dialog>
  <dialog id="module-inspector" aria-labelledby="module-inspector-title">
    <h2 id="module-inspector-title">Inspect saved module</h2>
    <p>This copy is read-only. Export a new revision from its source project to make changes.</p>
    <label>Definition and dependencies <select id="module-inspector-select"></select></label>
    <div class="module-inspection"><div id="module-inspector-blocks" aria-label="Imported module blocks"></div><pre id="module-inspector-source" tabindex="0" aria-label="Imported module Python"></pre></div>
    <button id="module-inspector-close" class="button secondary">Close inspector</button>
  </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('modules-dialog'); const inspector = el<HTMLDialogElement>('module-inspector');
  const selected = el<HTMLSelectElement>('module-select');
  let pending: ModuleBundle | null = null;
  let inspection: Blockly.WorkspaceSvg | null = null;
  const error = (action: () => void) => { try { el('modules-error').textContent = ''; el('modules-status').textContent = ''; action(); } catch (e) { el('modules-error').textContent = e instanceof Error ? e.message : String(e); } };
  const download = (name: string, bundle: ModuleBundle) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `${name}.python-blocks-module.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  function loadSelected() {
    const binding = moduleState(workspace).imports.find(i => i.id === selected.value);
    el<HTMLInputElement>('module-alias').value = binding?.alias ?? '';
    for (const id of ['module-rename', 'module-inspect', 'module-save-copy', 'module-remove']) el<HTMLButtonElement>(id).disabled = !binding;
  }
  function refresh() {
    const state = moduleState(workspace); const previous = selected.value; selected.replaceChildren();
    for (const item of state.imports) selected.add(new Option(item.alias, item.id));
    if (state.imports.some(i => i.id === previous)) selected.value = previous;
    loadSelected();
    el<HTMLInputElement>('module-name').value = state.authoring?.name ?? 'my_tools';
    el('module-export-functions').replaceChildren();
    for (const model of workspace.getProcedureMap().getProcedures().filter(f => !signatureOf(f).handler)) {
      const label = document.createElement('label'); const input = document.createElement('input'); input.type = 'checkbox'; input.value = model.getId();
      input.checked = state.authoring?.functions.includes(model.getId()) ?? false;
      label.append(input, ` ${model.getName()}`); el('module-export-functions').append(label);
    }
  }
  function open() { refresh(); pending = null; el<HTMLInputElement>('module-file').value = ''; el('module-preview').textContent = ''; el<HTMLButtonElement>('module-import').disabled = true; el('modules-error').textContent = ''; el('modules-status').textContent = ''; dialog.showModal(); }
  el('modules-manage').addEventListener('click', open); el('modules-close').addEventListener('click', () => dialog.close());
  selected.addEventListener('change', loadSelected);
  el('module-export').addEventListener('click', () => error(() => {
    const state = moduleState(workspace);
    const functions = [...el('module-export-functions').querySelectorAll<HTMLInputElement>('input:checked')].map(input => input.value);
    const name = el<HTMLInputElement>('module-name').value.trim();
    const bundle = exportModule(workspace, { moduleId: state.authoring?.moduleId, name, functions });
    state.authoring = { moduleId: bundle.entry.moduleId, name, functions }; changeModules(workspace, state);
    download(name, bundle); el('modules-status').textContent = 'Exported functions and their dependency closure.';
  }));
  el<HTMLInputElement>('module-file').addEventListener('change', async () => {
    const file = el<HTMLInputElement>('module-file').files?.[0]; pending = null; el<HTMLButtonElement>('module-import').disabled = true;
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('The module bundle exceeds 2 MB.');
      const text = await file.text();
      if (el<HTMLInputElement>('module-file').files?.[0] !== file) return;
      error(() => {
        pending = prepareModule(text); const entry = pending.definitions.find(d => samePin(d, pending!.entry))!;
        el('module-preview').textContent = `${entry.name}: ${entry.exports.map(f => `${f.async ? 'async ' : ''}${f.name}(${f.parameters.map(p => p.name).join(', ')})`).join('; ')}. Includes ${pending.definitions.length - 1} pinned dependencies.`;
        el<HTMLInputElement>('module-import-alias').value = entry.name; el<HTMLButtonElement>('module-import').disabled = false;
      });
    } catch (e) { el('modules-error').textContent = e instanceof Error ? e.message : String(e); }
  });
  el('module-import').addEventListener('click', () => error(() => {
    if (!pending) throw new Error('Choose a valid module file first.');
    const binding = importModule(workspace, pending, el<HTMLInputElement>('module-import-alias').value.trim());
    refresh(); selected.value = binding.id; loadSelected(); el('modules-status').textContent = `Imported ${binding.alias}. Its calls are in the Modules category.`;
  }));
  el('module-rename').addEventListener('click', () => error(() => { renameModule(workspace, selected.value, el<HTMLInputElement>('module-alias').value.trim()); refresh(); el('modules-status').textContent = 'Namespace renamed; call targets are unchanged.'; }));
  el('module-remove').addEventListener('click', () => error(() => { removeModule(workspace, selected.value); refresh(); el('modules-status').textContent = 'Import removed. Undo restores it and repairs its calls.'; }));
  el('module-save-copy').addEventListener('click', () => error(() => { const bundle = exportImportedModule(workspace, selected.value); download(bundle.definitions.find(d => samePin(d, bundle.entry))!.name, bundle); }));
  function renderInspection() {
    const state = moduleState(workspace); const key = el<HTMLSelectElement>('module-inspector-select').value;
    const definition = state.definitions.find(d => moduleKey(d) === key); if (!definition) return;
    const files = new Map(state.definitions.map((d, index) => [moduleKey(d), `_pb_module_${index}.py`]));
    el('module-inspector-source').textContent = compileModuleDefinition(definition, state, files).source ?? 'This module cannot compile.';
    inspection?.dispose(); inspection = Blockly.inject('module-inspector-blocks', { readOnly: true, oneBasedIndex: false, media: `${import.meta.env.BASE_URL}blockly/`, scrollbars: true, zoom: { controls: true, wheel: true } });
    installPythonVariables(inspection); Blockly.Events.disable();
    try { loadWorkspace({ ...definition.workspace, pythonModules: { ...state, imports: definition.dependencies } }, inspection); }
    finally { Blockly.Events.enable(); }
    const current = inspection; requestAnimationFrame(() => { if (inspection === current) { Blockly.svgResize(current); current.zoomToFit(); } });
  }
  el('module-inspect').addEventListener('click', () => error(() => {
    const bundle = exportImportedModule(workspace, selected.value); const choice = el<HTMLSelectElement>('module-inspector-select'); choice.replaceChildren();
    for (const d of bundle.definitions) choice.add(new Option(`${d.name} · ${d.revision.slice(0, 8)}`, moduleKey(d)));
    choice.value = moduleKey(bundle.entry); inspector.showModal(); renderInspection();
  }));
  el('module-inspector-select').addEventListener('change', renderInspection);
  el('module-inspector-close').addEventListener('click', () => inspector.close());
  inspector.addEventListener('close', () => { inspection?.dispose(); inspection = null; });
  workspace.registerButtonCallback('PY_MANAGE_MODULES', open);
  workspace.registerToolboxCategoryCallback('PY_MODULES', () => [
    { kind: 'button', text: 'Manage modules', callbackkey: 'PY_MANAGE_MODULES' },
    ...moduleState(workspace).imports.flatMap(binding => moduleState(workspace).definitions.find(d => samePin(d, binding))!.exports.flatMap(f => [
      ...[false, true].map(value => ({ kind: 'block', ...moduleCallState(binding, f, value) })),
      ...(!f.async ? [{ kind: 'block', ...moduleReferenceState(binding, f) }] : []),
    ])),
  ]);
  return () => { inspection?.dispose(); inspector.remove(); dialog.remove(); el('modules-manage').remove(); };
}
