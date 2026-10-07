import * as Blockly from 'blockly/core';
import { callState, defineFunction, referenceState } from '../blocks/core/functions';
import { allSymbols, createVariable, editSignature, enclosingFunction, nameError, refreshSymbols, signatureOf, type FunctionBlock, type Parameter } from './functions';
import { installLanguageClipboard } from './clipboard';
import { installEventEditor } from './event-editor';
import { installModuleEditor } from './module-editor';
import { installLambdaEditor } from './lambda-editor';

/** Small accessible forms complement the block workspace. Semantic validation
 * stays in the model/compiler, so files and headless compilation use it too. */
export function installLanguageEditor(workspace: Blockly.WorkspaceSvg) {
  installLanguageClipboard();
  document.querySelector('.blocks-panel .panel-heading')!.insertAdjacentHTML('beforeend', '<button class="button secondary" id="language-manage">Functions &amp; variables</button>');
  document.querySelector('.blocks-panel .panel-footer')!.insertAdjacentHTML('beforeend', '<button id="language-undo" class="button secondary">Undo</button><button id="language-redo" class="button secondary">Redo</button>');
  document.body.insertAdjacentHTML('beforeend', `<dialog id="language-dialog" aria-labelledby="language-title">
    <h2 id="language-title">Functions and variables</h2>
    <p>Functions have their own parameters and local variables. Project variables are shared.</p>
    <fieldset><legend>Function</legend>
      <label>Choose function <select id="function-select"></select></label>
      <label>Function name <input id="function-name" spellcheck="false"></label>
      <label>Async function <input id="function-async" type="checkbox"></label>
      <small>Async functions can wait. Their calls are awaited inside handlers or other async functions.</small>
      <ol id="function-parameters"></ol>
      <button id="parameter-add" class="button secondary">Add parameter</button>
      <button id="function-apply" class="button primary">Apply function</button>
      <button id="function-find" class="button secondary">Go to definition</button>
      <button id="function-copy" class="button secondary">Duplicate function</button>
      <button id="function-delete" class="button secondary">Delete function</button>
    </fieldset>
    <fieldset><legend>Variable</legend>
      <label>Choose variable <select id="variable-select"></select></label>
      <label>Variable name <input id="variable-name" spellcheck="false"></label>
      <label>Scope <select id="variable-scope" aria-label="Scope"></select></label>
      <button id="variable-apply" class="button primary">Apply variable</button>
    </fieldset>
    <p id="language-error" role="alert"></p>
    <button id="language-close" class="button secondary">Close</button>
  </dialog>`);
  const disposeEventEditor = installEventEditor(workspace);
  const disposeModuleEditor = installModuleEditor(workspace);
  const disposeLambdaEditor = installLambdaEditor(workspace);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('language-dialog');
  el('language-undo').addEventListener('click', () => workspace.undo(false));
  el('language-redo').addEventListener('click', () => workspace.undo(true));
  const selected = el<HTMLSelectElement>('function-select');
  const name = el<HTMLInputElement>('function-name');
  const variableSelect = el<HTMLSelectElement>('variable-select');
  const variableName = el<HTMLInputElement>('variable-name');
  const variableScope = el<HTMLSelectElement>('variable-scope');
  let parameters: Parameter[] = [];
  const error = (action: () => void) => { try { el('language-error').textContent = ''; action(); } catch (e) { el('language-error').textContent = e instanceof Error ? e.message : String(e); } };
  function refreshLists() {
    const functionId = selected.value; const variableId = variableSelect.value; const scope = variableScope.value;
    selected.replaceChildren(new Option('New function', ''));
    variableScope.replaceChildren(new Option('Project (shared)', ''));
    for (const model of workspace.getProcedureMap().getProcedures()) {
      if (!signatureOf(model).handler) selected.add(new Option(model.getName(), model.getId()));
      variableScope.add(new Option(`Local to ${model.getName()}`, model.getId()));
    }
    selected.value = workspace.getProcedureMap().has(functionId) ? functionId : '';
    variableScope.value = workspace.getProcedureMap().has(scope) ? scope : '';
    variableSelect.replaceChildren(new Option('New variable', ''));
    const symbols = allSymbols(workspace).filter(s => s.kind !== 'parameter');
    for (const s of symbols) variableSelect.add(new Option(`${s.name} (${s.owner ? workspace.getProcedureMap().get(s.owner)?.getName() ?? 'missing function' : 'project'})`, s.id));
    variableSelect.value = symbols.some(s => s.id === variableId) ? variableId : '';
  }
  function renderParameters() {
    el('function-parameters').replaceChildren();
    parameters.forEach((p, index) => {
      const row = document.createElement('li');
      const input = document.createElement('input'); input.value = p.name; input.spellcheck = false; input.setAttribute('aria-label', `Parameter ${index + 1} name`);
      input.addEventListener('input', () => p.name = input.value); row.append(input);
      for (const [label, delta] of [['Move parameter up', -1], ['Move parameter down', 1]] as const) {
        const button = document.createElement('button'); button.textContent = delta < 0 ? '↑' : '↓'; button.setAttribute('aria-label', label); button.className = 'button secondary'; button.disabled = index + delta < 0 || index + delta >= parameters.length;
        button.addEventListener('click', () => { [parameters[index], parameters[index + delta]] = [parameters[index + delta], parameters[index]]; renderParameters(); }); row.append(button);
      }
      const remove = document.createElement('button'); remove.textContent = 'Remove parameter'; remove.className = 'button secondary';
      remove.addEventListener('click', () => { parameters.splice(index, 1); renderParameters(); }); row.append(remove);
      el('function-parameters').append(row);
    });
  }
  function loadFunction() {
    const model = workspace.getProcedureMap().get(selected.value);
    name.value = model?.getName() ?? '';
    el<HTMLInputElement>('function-async').checked = !!(model && signatureOf(model).async);
    parameters = model ? signatureOf(model).parameters : [];
    el<HTMLButtonElement>('function-find').disabled = !model;
    el<HTMLButtonElement>('function-delete').disabled = !model;
    el<HTMLButtonElement>('function-copy').disabled = !model;
    if (!variableSelect.value) variableScope.value = model?.getId() ?? '';
    renderParameters();
  }
  function loadVariable() {
    const variable = allSymbols(workspace).find(s => s.id === variableSelect.value);
    const selectedBlock = Blockly.common.getSelected();
    const context = selectedBlock instanceof Blockly.Block ? enclosingFunction(selectedBlock)?.functionId : undefined;
    variableName.value = variable?.name ?? ''; variableScope.value = variable ? variable.owner ?? '' : context ?? selected.value;
    variableScope.disabled = !!variable;
  }
  function open() { refreshLists(); loadFunction(); loadVariable(); el('language-error').textContent = ''; dialog.showModal(); }
  el('language-manage').addEventListener('click', open);
  el('language-close').addEventListener('click', () => dialog.close());
  selected.addEventListener('change', loadFunction);
  variableSelect.addEventListener('change', loadVariable);
  el('parameter-add').addEventListener('click', () => { parameters.push({ id: Blockly.utils.idGenerator.genUid(), name: '' }); renderParameters(); el('function-parameters').querySelectorAll('input').item(parameters.length - 1).focus(); });
  el('function-apply').addEventListener('click', () => error(() => {
    const signature = { id: selected.value || Blockly.utils.idGenerator.genUid(), name: name.value.trim(), parameters: parameters.map(p => ({ ...p, name: p.name.trim() })), ...(el<HTMLInputElement>('function-async').checked ? { async: true } : {}) };
    if (selected.value) editSignature(workspace, signature);
    else {
      const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
      try {
        const block = defineFunction(workspace, signature) as Blockly.BlockSvg & FunctionBlock;
        block.moveBy(80 - block.getRelativeToSurfaceXY().x, 80 - block.getRelativeToSurfaceXY().y);
        workspace.centerOnBlock(block.id); block.select();
      } finally { Blockly.Events.setGroup(group); }
    }
    refreshLists(); selected.value = signature.id; loadFunction(); dialog.close();
  }));
  el('function-find').addEventListener('click', () => {
    const block = workspace.getAllBlocks(false).find(b => b.type === 'py_function' && (b as unknown as FunctionBlock).functionId === selected.value);
    if (block) { dialog.close(); workspace.centerOnBlock(block.id); block.select(); }
  });
  el('function-delete').addEventListener('click', () => error(() => {
    const block = workspace.getAllBlocks(false).find(b => b.type === 'py_function' && (b as unknown as FunctionBlock).functionId === selected.value);
    if (block) { const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(true); try { block.dispose(false); } finally { Blockly.Events.setGroup(group); } }
    refreshLists(); loadFunction(); dialog.close();
  }));
  el('function-copy').addEventListener('click', () => error(() => {
    const block = workspace.getAllBlocks(false).find(b => b.type === 'py_function' && (b as unknown as FunctionBlock).functionId === selected.value);
    const data = block?.toCopyData();
    if (!data) throw new Error('The function definition is missing.');
    const duplicate = Blockly.clipboard.paste(data, workspace) as Blockly.BlockSvg & FunctionBlock | null;
    if (duplicate) { selected.value = ''; refreshLists(); selected.value = duplicate.functionId; loadFunction(); dialog.close(); workspace.centerOnBlock(duplicate.id); }
  }));
  el('variable-apply').addEventListener('click', () => error(() => {
    const value = variableName.value.trim(); const owner = variableScope.value || undefined;
    const invalid = nameError(value); if (invalid) throw new Error(invalid);
    if (variableSelect.value) {
      if (allSymbols(workspace).some(s => s.id !== variableSelect.value && s.owner === owner && s.name === value)) throw new Error('This name is already used in this scope.');
      if (!owner && workspace.getProcedureMap().getProcedures().some(f => f.getName() === value)) throw new Error('A function already has this name.');
      const variable = workspace.getVariableMap().getVariableById(variableSelect.value);
      if (!variable) throw new Error('The variable no longer exists.');
      const existing = workspace.getVariableMap().getVariable(value, variable.getType());
      if (existing && existing.getId() !== variable.getId()) throw new Error('This name is already used in this scope.');
      workspace.getVariableMap().renameVariable(variable, value);
    } else createVariable(workspace, value, owner);
    refreshSymbols(workspace); dialog.close();
  }));
  workspace.registerButtonCallback('PY_MANAGE_FUNCTIONS', open);
  workspace.registerToolboxCategoryCallback('PY_FUNCTIONS', () => [
    { kind: 'button', text: 'Manage functions', callbackkey: 'PY_MANAGE_FUNCTIONS' },
    ...workspace.getProcedureMap().getProcedures().filter(model => !signatureOf(model).handler).flatMap(model => {
      const signature = signatureOf(model);
      return [...[false, true].map(value => ({ kind: 'block', ...callState(signature, value) })), ...(!signature.async ? [{ kind: 'block', ...referenceState(signature) }] : [])];
    }),
    { kind: 'block', type: 'py_return' }, { kind: 'block', type: 'py_return_value' },
  ]);
  workspace.registerToolboxCategoryCallback('PY_VARIABLES', () => [
    { kind: 'button', text: 'Manage variables', callbackkey: 'PY_MANAGE_FUNCTIONS' },
    ...allSymbols(workspace).flatMap(s => ['py_get', 'py_set'].map(type => ({ kind: 'block', type, fields: { SYMBOL: s.id } }))),
  ]);
  workspace.addChangeListener(event => { if (event.type === Blockly.Events.VAR_RENAME || event.type === Blockly.Events.BLOCK_MOVE) refreshSymbols(workspace); });
  return () => { disposeLambdaEditor(); disposeModuleEditor(); disposeEventEditor(); dialog.remove(); for (const id of ['language-manage', 'language-undo', 'language-redo']) el(id).remove(); };
}
