import { sceneState } from '../scene/state';
import { backdrops, keys } from '../scene/model';
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
      <label>Runs for <select id="handler-sprite"></select></label><label id="handler-kind-label" hidden>Sprite kind <input id="handler-kind" maxlength="32" value="projectile" list="handler-kinds"></label><datalist id="handler-kinds"></datalist>
      <label>Input shortcut <select id="handler-input-source"></select></label>
      <label>Event name <input id="handler-event" spellcheck="false"></label>
      <label>Payload name <input id="handler-payload" spellcheck="false"></label>
      <p>A sprite behavior runs independently for that sprite and its clones. Use “this sprite” and its data dictionary. Update payloads contain dt (seconds); overlap/separate payloads contain the other sprite ID. Collision payloads also contain the surface normal and edge name. Kind behaviors include newly created sprites of that kind.</p>
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
      const item = document.createElement('li'); const label = document.createElement('span'); const owner = sceneState(workspace).sprites.find(s => s.id === h.handler!.sprite)?.name;
      label.textContent = `${h.name} — ${h.handler!.event}${h.handler!.sprite ? ` · ${owner ?? 'Unavailable sprite'}` : h.handler!.kind ? ` · kind ${h.handler!.kind}` : ''}`; item.append(label);
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
  const source = el<HTMLSelectElement>('handler-input-source');
  const target = el<HTMLSelectElement>('handler-sprite');
  function sources() {
    el('handler-kind-label').hidden = target.value !== ':kind';
    el<HTMLInputElement>('handler-kind').disabled = target.value !== ':kind';
    source.replaceChildren(new Option('Custom event', ''), new Option('When run starts', 'start'),
      ...(target.value ? [new Option('When sprite enters a tile', 'tile:overlap'), new Option('When sprite hits a solid tile', 'tile:hit'), new Option('When an instance is created', 'created'), new Option('When automatic motion hits a wall or edge', 'collision'), new Option('When a clone is created', 'clone'), new Option('Each update (about 30/second)', 'update'), new Option('When pixel contact begins', 'overlap'), new Option('When pixel contact ends', 'separate'), new Option('When this instance is clicked', 'click')] : []),
      new Option('When countdown ends (event mode)', 'game:countdown'), new Option('When lives reach zero (event mode)', 'game:lives_zero'),
      new Option('When a world is entered', 'world:enter'), ...(sceneState(workspace).worlds ?? []).map(w => new Option(`When world becomes ${w.name}`, `world:${w.id}`)), new Option('When stage clicked', 'stage:click'), new Option('When pointer pressed', 'stage:press'), new Option('When pointer released', 'stage:release'), new Option('When backdrop changes', 'backdrop:change'), ...backdrops(sceneState(workspace)).map(a => new Option(`When backdrop becomes ${a.name}`, `backdrop:${a.id}`)), ...keys.flatMap(([label, key]) => [new Option(`When ${label} pressed`, `key:${key}`), new Option(`When ${label} released`, `release:${key}`)]), ...sceneState(workspace).sprites.map(s => new Option(`When ${s.name} clicked`, `click:${s.id}`)));
    source.value = el<HTMLInputElement>('handler-event').value;
  }
  target.addEventListener('change', sources);
  source.addEventListener('change', () => { if (source.value) el<HTMLInputElement>('handler-event').value = source.value; });
  function load() {
    const signature = handlerSignatures(workspace).find(h => h.id === selected.value);
    target.replaceChildren(new Option('Project (one handler)', ''), new Option('Sprites of a kind', ':kind'), ...sceneState(workspace).sprites.map(s => new Option(`${s.name} and clones`, s.id)));
    if (signature?.handler?.sprite && !sceneState(workspace).sprites.some(s => s.id === signature.handler!.sprite)) target.add(new Option('Unavailable sprite', signature.handler.sprite));
    target.value = signature?.handler?.kind ? ':kind' : signature?.handler?.sprite ?? '';
    el<HTMLInputElement>('handler-kind').value = signature?.handler?.kind ?? 'projectile';
    el('handler-kinds').replaceChildren(...[...new Set(['sprite', 'player', 'enemy', 'projectile', 'wall', ...sceneState(workspace).sprites.map(s => s.kind ?? 'sprite')])].map(k => new Option(k, k)));
    el<HTMLInputElement>('handler-name').value = signature?.name ?? '';
    el<HTMLInputElement>('handler-event').value = signature?.handler?.event ?? 'start';
    sources();
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
      handler: { event: el<HTMLInputElement>('handler-event').value, order: previous?.handler?.order ?? Math.max(-1, ...handlers.map(h => h.handler!.order)) + 1, ...(target.value === ':kind' ? { kind: el<HTMLInputElement>('handler-kind').value.trim() } : target.value ? { sprite: target.value } : {}) },
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
