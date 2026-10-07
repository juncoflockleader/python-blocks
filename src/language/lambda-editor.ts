import * as Blockly from 'blockly/core';
import { enclosingLambda, type LambdaBlock, type Parameter } from './functions';
import { editLambda, lambdaState, validateLambda } from './lambdas';

export function installLambdaEditor(workspace: Blockly.WorkspaceSvg) {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="lambda-dialog" aria-labelledby="lambda-title">
    <h2 id="lambda-title">Lambda parameters</h2>
    <p>A lambda returns one expression. Its body can read its own parameters; pass other values as arguments.</p>
    <label>Choose lambda <select id="lambda-select"></select></label>
    <ol id="lambda-parameters"></ol>
    <button id="lambda-parameter-add" class="button secondary">Add lambda parameter</button>
    <p>Reordering parameters keeps body references attached to their names. Calls through values keep their positional arguments.</p>
    <button id="lambda-apply" class="button primary">Apply lambda</button>
    <button id="lambda-find" class="button secondary">Go to lambda</button>
    <p id="lambda-error" role="alert"></p>
    <button id="lambda-close" class="button secondary">Close</button>
  </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('lambda-dialog'); const select = el<HTMLSelectElement>('lambda-select');
  let parameters: Parameter[] = [];
  const chosen = () => workspace.getBlockById(select.value) as (Blockly.BlockSvg & LambdaBlock) | null;
  function render() {
    el('lambda-parameters').replaceChildren();
    parameters.forEach((parameter, index) => {
      const row = document.createElement('li');
      const input = document.createElement('input'); input.value = parameter.name; input.spellcheck = false; input.setAttribute('aria-label', `Lambda parameter ${index + 1} name`);
      input.addEventListener('input', () => parameter.name = input.value); row.append(input);
      for (const [label, delta] of [['Move lambda parameter up', -1], ['Move lambda parameter down', 1]] as const) {
        const button = document.createElement('button'); button.textContent = delta < 0 ? '↑' : '↓'; button.setAttribute('aria-label', label); button.className = 'button secondary'; button.disabled = index + delta < 0 || index + delta >= parameters.length;
        button.addEventListener('click', () => { [parameters[index], parameters[index + delta]] = [parameters[index + delta], parameters[index]]; render(); }); row.append(button);
      }
      const remove = document.createElement('button'); remove.textContent = 'Remove lambda parameter'; remove.className = 'button secondary';
      remove.addEventListener('click', () => { parameters.splice(index, 1); render(); }); row.append(remove);
      el('lambda-parameters').append(row);
    });
  }
  function load() {
    const block = chosen(); parameters = structuredClone(block?.lambda.parameters ?? lambdaState().parameters);
    el<HTMLButtonElement>('lambda-find').disabled = !block; el('lambda-error').textContent = ''; render();
  }
  function open(blockId?: string) {
    const selected = Blockly.common.getSelected();
    const context = selected instanceof Blockly.Block ? selected.type === 'py_lambda' ? selected : enclosingLambda(selected) : undefined;
    const id = blockId ?? context?.id ?? select.value;
    select.replaceChildren(new Option('New lambda', ''));
    workspace.getAllBlocks(false).filter(b => b.type === 'py_lambda').forEach((b, index) => {
      select.add(new Option(`Lambda ${index + 1} (${(b as unknown as LambdaBlock).lambda.parameters.map(p => p.name).join(', ')})`, b.id));
    });
    select.value = workspace.getBlockById(id)?.type === 'py_lambda' ? id : ''; load(); dialog.showModal();
  }
  const contextMenu = (event: Event) => {
    const { workspaceId, blockId } = (event as CustomEvent<{ workspaceId: string; blockId: string }>).detail;
    if (workspaceId === workspace.id && workspace.getBlockById(blockId)?.type === 'py_lambda') open(blockId);
  };
  document.addEventListener('python-edit-lambda', contextMenu);
  select.addEventListener('change', load);
  el('lambda-close').addEventListener('click', () => dialog.close());
  el('lambda-parameter-add').addEventListener('click', () => {
    parameters.push({ id: Blockly.utils.idGenerator.genUid(), name: '' }); render();
    el('lambda-parameters').querySelectorAll('input').item(parameters.length - 1).focus();
  });
  el('lambda-apply').addEventListener('click', () => {
    try {
      const values = parameters.map(p => ({ ...p, name: p.name.trim() }));
      if (select.value) {
        const block = chosen(); if (!block) throw new Error('The lambda no longer exists.'); editLambda(block, values);
      } else {
        const state = { ...lambdaState([]), parameters: values }; validateLambda(state);
        const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
        try {
          const block = Blockly.serialization.blocks.append({ type: 'py_lambda', extraState: state }, workspace, { recordUndo: true }) as Blockly.BlockSvg & LambdaBlock;
          block.moveBy(80 - block.getRelativeToSurfaceXY().x, 80 - block.getRelativeToSurfaceXY().y);
          workspace.centerOnBlock(block.id); block.select(); select.add(new Option(`Lambda (${values.map(p => p.name).join(', ')})`, block.id)); select.value = block.id;
        } finally { Blockly.Events.setGroup(group); }
      }
      dialog.close();
    } catch (error) { el('lambda-error').textContent = error instanceof Error ? error.message : String(error); }
  });
  el('lambda-find').addEventListener('click', () => { const block = chosen(); if (block) { dialog.close(); workspace.centerOnBlock(block.id); block.select(); } });
  workspace.registerButtonCallback('PY_MANAGE_LAMBDAS', () => open());
  workspace.registerToolboxCategoryCallback('PY_FUNCTION_VALUES', () => [
    { kind: 'button', text: 'Manage lambdas', callbackkey: 'PY_MANAGE_LAMBDAS' },
    ...['py_dynamic_call', 'py_dynamic_call_value', 'py_lambda'].map(type => ({ kind: 'block', type })),
  ]);
  return () => { document.removeEventListener('python-edit-lambda', contextMenu); dialog.remove(); };
}
