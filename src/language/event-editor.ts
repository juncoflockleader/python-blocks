import * as Blockly from 'blockly/core';
import { defineFunction } from '../blocks/core/functions';
import { numberInput } from '../blocks/core';
import { editSignature, handlerSignatures, refreshSymbols, reorderHandlers, type FunctionBlock, type Signature } from './functions';

export function installEventEditor(workspace: Blockly.WorkspaceSvg) {
  document.querySelector('.blocks-panel .panel-heading')!.insertAdjacentHTML('beforeend', '<button class="button secondary" id="events-manage">Events</button>');
  document.body.insertAdjacentHTML('beforeend', `<dialog id="events-dialog" aria-labelledby="events-title">
    <h2 id="events-title">Event handlers</h2>
    <p>Handlers are independent async activities. They run in the saved order below until they wait. Each receives its own payload.</p>
    <fieldset><legend>Handler</legend>
      <label>Choose handler <select id="handler-select"></select></label>
      <label>Handler name <input id="handler-name" spellcheck="false"></label>
      <label>Event name <input id="handler-event" spellcheck="false"></label>
      <label>Payload name <input id="handler-payload" spellcheck="false"></label>
      <p>Use <code>start</code> for the automatic startup event. Other event names match exactly.</p>
      <button id="handler-apply" class="button primary">Apply handler</button>
      <button id="handler-find" class="button secondary">Go to handler</button>
      <button id="handler-copy" class="button secondary">Duplicate handler</button>
      <button id="handler-delete" class="button secondary">Delete handler</button>
    </fieldset>
    <h3>Delivery order</h3><p>Moving a handler here updates its order immediately. Moving blocks on the workspace does not change the order.</p>
    <ol id="handler-order"></ol>
    <p id="events-error" role="alert"></p>
    <button id="events-close" class="button secondary">Close</button>
  </dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>('events-dialog');
  const selected = el<HTMLSelectElement>('handler-select');
  const error = (action: () => void) => { try { el('events-error').textContent = ''; action(); } catch (e) { el('events-error').textContent = e instanceof Error ? e.message : String(e); } };
  const find = () => workspace.getAllBlocks(false).find(b => b.type === 'py_handler' && (b as unknown as FunctionBlock).functionId === selected.value);
  function renderOrder() {
    const handlers = handlerSignatures(workspace); el('handler-order').replaceChildren();
    handlers.forEach((h, index) => {
      const item = document.createElement('li'); const label = document.createElement('span'); label.textContent = `${h.name} — ${h.handler!.event}`; item.append(label);
      for (const [delta, name] of [[-1, 'Move handler up'], [1, 'Move handler down']] as const) {
        const button = document.createElement('button'); button.textContent = delta < 0 ? '↑' : '↓'; button.setAttribute('aria-label', name); button.className = 'button secondary';
        button.disabled = index + delta < 0 || index + delta >= handlers.length;
        button.addEventListener('click', () => error(() => { const ids = handlers.map(h => h.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; reorderHandlers(workspace, ids); renderOrder(); }));
        item.append(button);
      }
      el('handler-order').append(item);
    });
  }
  function refresh() {
    const current = selected.value; selected.replaceChildren(new Option('New handler', ''));
    handlerSignatures(workspace).forEach(h => selected.add(new Option(h.name, h.id)));
    selected.value = handlerSignatures(workspace).some(h => h.id === current) ? current : '';
    renderOrder();
  }
  function load() {
    const signature = handlerSignatures(workspace).find(h => h.id === selected.value);
    el<HTMLInputElement>('handler-name').value = signature?.name ?? '';
    el<HTMLInputElement>('handler-event').value = signature?.handler?.event ?? 'start';
    el<HTMLInputElement>('handler-payload').value = signature?.parameters[0]?.name ?? 'payload';
    for (const id of ['handler-find', 'handler-copy', 'handler-delete']) el<HTMLButtonElement>(id).disabled = !signature;
  }
  function open() {
    refresh(); const block = Blockly.common.getSelected();
    if (block instanceof Blockly.Block && block.type === 'py_handler') selected.value = (block as unknown as FunctionBlock).functionId;
    load(); el('events-error').textContent = ''; dialog.showModal();
  }
  el('events-manage').addEventListener('click', open);
  el('events-close').addEventListener('click', () => dialog.close()); selected.addEventListener('change', load);
  el('handler-apply').addEventListener('click', () => error(() => {
    const handlers = handlerSignatures(workspace); const previous = handlers.find(h => h.id === selected.value);
    const signature: Signature = {
      id: previous?.id ?? Blockly.utils.idGenerator.genUid(), name: el<HTMLInputElement>('handler-name').value.trim(), async: true,
      parameters: [{ id: previous?.parameters[0]?.id ?? Blockly.utils.idGenerator.genUid(), name: el<HTMLInputElement>('handler-payload').value.trim() }],
      handler: { event: el<HTMLInputElement>('handler-event').value, order: previous?.handler?.order ?? Math.max(-1, ...handlers.map(h => h.handler!.order)) + 1 },
    };
    if (previous) editSignature(workspace, signature);
    else {
      const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
      try {
        const block = defineFunction(workspace, signature) as Blockly.BlockSvg & FunctionBlock;
        block.moveBy(80 - block.getRelativeToSurfaceXY().x, 80 - block.getRelativeToSurfaceXY().y);
        workspace.centerOnBlock(block.id); block.select();
      } finally { Blockly.Events.setGroup(group); }
    }
    selected.value = ''; refresh(); selected.value = signature.id; refreshSymbols(workspace); dialog.close();
  }));
  el('handler-find').addEventListener('click', () => { const block = find(); if (block) { dialog.close(); workspace.centerOnBlock(block.id); block.select(); } });
  el('handler-copy').addEventListener('click', () => error(() => {
    const data = find()?.toCopyData(); if (!data) throw new Error('The handler definition is missing.');
    const copied = Blockly.clipboard.paste(data, workspace) as Blockly.BlockSvg & FunctionBlock | null;
    if (copied) { dialog.close(); workspace.centerOnBlock(copied.id); }
  }));
  el('handler-delete').addEventListener('click', () => error(() => {
    const block = find(); if (block) {
      const group = Blockly.Events.getGroup(); Blockly.Events.setGroup(group || true);
      try { block.dispose(false); } finally { Blockly.Events.setGroup(group); }
    }
    refresh(); load(); dialog.close();
  }));
  workspace.registerButtonCallback('PY_MANAGE_EVENTS', open);
  workspace.registerToolboxCategoryCallback('PY_EVENTS', (): Blockly.utils.toolbox.FlyoutItemInfo[] => [
    { kind: 'button', text: 'Manage handlers', callbackkey: 'PY_MANAGE_EVENTS' },
    { kind: 'block', type: 'py_emit', inputs: { EVENT: { shadow: { type: 'text', fields: { TEXT: 'message' } } }, PAYLOAD: { shadow: { type: 'py_none' } } } },
    { kind: 'block', type: 'py_wait', inputs: { SECONDS: numberInput(0.1) } },
  ]);
  return () => { dialog.remove(); el('events-manage').remove(); };
}
