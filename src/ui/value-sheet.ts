import * as Blockly from 'blockly/core';
import { isPythonNumber } from '../language/compiler';
import { stepValue } from '../guide/magic-notes';
import { iconSvg } from './icon-art';
import './value-sheet.css';

/** Blockly asks the browser's own prompt, confirm and alert boxes on a tablet: tapping a number on an
 * iPad opened "Change value:" with buttons too small to hit. These sheets take their place everywhere:
 * big, styled and made for fingers. A number gets − and + (stepping by an amount that suits it) and a
 * ± button, since an iPad's number keyboard has no minus sign; words get a wide box. */
type Kind = 'number' | 'text';
let editing: { field: Blockly.Field; kind: Kind; context: string } | null = null;

const plain = (text: string) => text.replace(/[‎‏]/g, '').replace(/\s*\((project|local)\)/g, '').replace(/\s+/g, ' ').trim();
/** What the value belongs to, in the block's words: "set lives to", "say". */
function contextOf(field: Blockly.Field) {
  const block = field.getSourceBlock(), parent = block?.getParent();
  if (!block) return '';
  const input = parent?.inputList.find(i => i.connection?.targetBlock() === block);
  const words = input ? plain(input.fieldRow.filter(f => f.isVisible() && !(f instanceof Blockly.FieldImage)).map(f => f.getText()).join(' ')) : '';
  return (words && /[A-Za-z]/.test(words) ? words : plain((parent ?? block).toString(40))).slice(0, 60);
}

export function installValueSheet() {
  document.body.insertAdjacentHTML('beforeend', `<dialog id="value-sheet" class="value-sheet" aria-labelledby="value-sheet-title"><form id="value-sheet-form">
    <p id="value-sheet-context" class="value-sheet-context"></p>
    <h2 id="value-sheet-title"></h2>
    <p id="value-sheet-message" class="value-sheet-message"></p>
    <div class="value-sheet-row" id="value-sheet-row">
      <button type="button" id="value-sheet-less" class="value-sheet-step" aria-label="Less">${iconSvg('minus', 'currentColor')}</button>
      <input id="value-sheet-input" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="value-sheet-error">
      <button type="button" id="value-sheet-more" class="value-sheet-step" aria-label="More">${iconSvg('plus', 'currentColor')}</button>
    </div>
    <button type="button" id="value-sheet-sign" class="value-sheet-sign" aria-label="Make it minus or plus">+/−</button>
    <p id="value-sheet-error" class="value-sheet-error" role="alert"></p>
    <div class="value-sheet-actions"><button type="button" id="value-sheet-cancel" class="button secondary">Cancel</button><button id="value-sheet-done" class="button primary">Done</button></div>
  </form></dialog>`);
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const sheet = el<HTMLDialogElement>('value-sheet'), input = el<HTMLInputElement>('value-sheet-input'), error = el('value-sheet-error');
  let finish: ((ok: boolean) => void) | null = null, mode: 'prompt' | 'confirm' | 'alert' = 'prompt', kind: Kind = 'text';
  // The tap that opened the sheet ends with a click where the finger was, which can land on Done or Cancel
  // as the sheet appears. A pointer click only counts once a press has started inside the sheet.
  let armed = false;
  sheet.addEventListener('pointerdown', () => { armed = true; }, true);
  sheet.addEventListener('click', event => { if (!armed && event.detail > 0) { event.preventDefault(); event.stopPropagation(); } }, true);

  function open(options: { mode: typeof mode; title: string; message?: string; context?: string; value?: string; kind?: Kind; done?: string; cancel?: string }, close: (ok: boolean) => void) {
    finish?.(false);
    mode = options.mode; kind = options.kind ?? 'text'; finish = close;
    sheet.dataset.mode = mode; sheet.dataset.kind = kind;
    el('value-sheet-title').textContent = options.title;
    el('value-sheet-message').textContent = options.message ?? ''; el('value-sheet-message').hidden = !options.message;
    el('value-sheet-context').textContent = options.context ?? ''; el('value-sheet-context').hidden = !options.context;
    el('value-sheet-row').hidden = mode !== 'prompt';
    for (const id of ['value-sheet-less', 'value-sheet-more', 'value-sheet-sign']) el(id).hidden = mode !== 'prompt' || kind !== 'number';
    el('value-sheet-cancel').hidden = mode === 'alert';
    el('value-sheet-done').textContent = options.done ?? (mode === 'prompt' ? 'Done' : 'OK');
    el('value-sheet-cancel').textContent = options.cancel ?? 'Cancel';
    input.value = options.value ?? ''; input.inputMode = kind === 'number' ? 'decimal' : 'text'; input.maxLength = kind === 'number' ? 40 : 500;
    error.textContent = '';
    armed = false;
    if (!sheet.open) sheet.showModal();
    if (mode === 'prompt') { input.focus(); input.select(); } else el('value-sheet-done').focus();
  }
  function close(ok: boolean) {
    if (ok && mode === 'prompt' && kind === 'number') {
      const value = input.value.trim().replace(/^\+/, '').replace(/^−/, '-');
      if (!isPythonNumber(value)) { error.textContent = 'Use a number, such as 5, -3 or 0.5.'; input.focus(); return; }
      input.value = value;
    }
    const done = finish; finish = null; editing = null;
    sheet.close(); done?.(ok);
  }
  const step = (direction: 1 | -1) => { const next = stepValue(input.value.trim().replace(/^−/, '-'), direction); if (next !== null) { input.value = next; error.textContent = ''; } };
  el('value-sheet-less').addEventListener('click', () => step(-1));
  el('value-sheet-more').addEventListener('click', () => step(1));
  el('value-sheet-sign').addEventListener('click', () => {
    const value = input.value.trim();
    input.value = value.startsWith('-') ? value.slice(1) : value === '' || value === '0' ? '-' : `-${value.replace(/^\+/, '')}`;
    error.textContent = ''; input.focus();
  });
  input.addEventListener('input', () => { error.textContent = ''; });
  el('value-sheet-form').addEventListener('submit', event => { event.preventDefault(); close(true); });
  el('value-sheet-cancel').addEventListener('click', () => close(false));
  sheet.addEventListener('cancel', event => { event.preventDefault(); close(mode === 'alert'); });

  // Which field Blockly is about to ask about: its kind and the words around it.
  const proto = Blockly.FieldTextInput.prototype as unknown as { showEditor_(this: Blockly.FieldTextInput, ...rest: unknown[]): void };
  const showEditor = proto.showEditor_;
  proto.showEditor_ = function (this: Blockly.FieldTextInput, ...rest: unknown[]) {
    const block = this.getSourceBlock();
    editing = { field: this, kind: block?.type === 'py_number' || this instanceof Blockly.FieldNumber ? 'number' : 'text', context: contextOf(this) };
    return showEditor.apply(this, rest);
  };

  Blockly.dialog.setPrompt((message, value, callback) => {
    const field = editing;
    const changeValue = message === Blockly.Msg['CHANGE_VALUE_TITLE'] && field;
    open({
      mode: 'prompt', kind: changeValue ? field.kind : 'text', value,
      title: changeValue ? (field.kind === 'number' ? 'Change the number' : 'Change the words') : message.replace(/:\s*$/, ''),
      context: changeValue ? field.context : '',
    }, ok => callback(ok ? input.value : null));
  });
  Blockly.dialog.setConfirm((message, callback) => open({ mode: 'confirm', title: 'Are you sure?', message, done: 'Yes' }, ok => callback(ok)));
  Blockly.dialog.setAlert((message, callback) => open({ mode: 'alert', title: 'Note', message }, () => callback?.()));

  return {
    dispose() {
      proto.showEditor_ = showEditor;
      Blockly.dialog.setPrompt(); Blockly.dialog.setConfirm(); Blockly.dialog.setAlert();
      sheet.remove();
    },
  };
}
