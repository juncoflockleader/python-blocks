import * as Blockly from 'blockly/core';
import { iconSvg } from '../ui/icon-art';
import { scriptTabs } from '../scripts/tabs';
import { acceptValue, magicEntries, stepValue, type MagicEntry, type MagicValue } from './magic-notes';
import './magic.css';

/** Wren the Wizard, who reads a project's notes aloud: drawn here, original art. */
export const WIZARD = `<svg class="magic-wizard" viewBox="0 0 72 72" aria-hidden="true">
  <path d="M14 66c2-12 11-18 22-18s20 6 22 18Z" fill="#5b4a9e"/>
  <path d="M30 48h12l-6 9Z" fill="#f2c94c"/>
  <circle cx="36" cy="38" r="13" fill="#f6c9a5"/>
  <circle cx="31" cy="38" r="1.9" fill="#2b2233"/><circle cx="41" cy="38" r="1.9" fill="#2b2233"/>
  <circle cx="27.5" cy="42" r="2.4" fill="#ef9a87" opacity=".7"/><circle cx="44.5" cy="42" r="2.4" fill="#ef9a87" opacity=".7"/>
  <path d="M32 43.5q4 3.5 8 0" fill="none" stroke="#2b2233" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M18 30c6-2 30-2 36 0-2 3-34 3-36 0Z" fill="#43357f"/>
  <path d="M21 29.5 33 4c2-2 4-2 5 1l2 6 3 2-3 0 9 16.5c-8 2-20 2-28 0Z" fill="#5b4a9e"/>
  <path d="m33 15 1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1Z" fill="#f2c94c"/><circle cx="41" cy="22" r="1.4" fill="#f2c94c"/><circle cx="28" cy="25" r="1.1" fill="#f2c94c"/>
  <path d="m55 47 11-13" stroke="#7a4a2a" stroke-width="3" stroke-linecap="round"/>
  <path d="m66 27 1.3 3.2 3.2 1.3-3.2 1.3-1.3 3.2-1.3-3.2-3.2-1.3 3.2-1.3Z" fill="#f2c94c"/>
</svg>`;

export interface MagicHost {
  workspace: Blockly.WorkspaceSvg;
  /** Show a block: its script tab, the Blocks view, centred and selected. */
  show(blockId: string): void;
  /** Whether the Magic tab is on screen, so the book is kept current only while someone reads it. */
  visible(): boolean;
}

const html = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function installMagic(host: MagicHost) {
  const panel = document.getElementById('panel-magic')!;
  panel.innerHTML = `
    <div class="magic-intro">${WIZARD}<div class="magic-bubble" role="status"><strong>Wren the Wizard</strong><p id="magic-says"></p></div></div>
    <div id="magic-book" class="magic-book"></div>
    <details class="magic-how" id="magic-how"><summary>Write your own magic note</summary>
      <ol><li>Right-click a block (on a tablet, press and hold it) and choose <strong>Add Comment</strong>.</li>
      <li>Write a title on the first line, such as <em>How high the hero jumps</em>, and what to try on the next lines.</li>
      <li>Your note shows up here with that block’s numbers, ready to change.</li></ol>
      <p class="tab-note">Notes are for people: they never change what the program does.</p></details>`;
  const book = document.getElementById('magic-book')!, says = document.getElementById('magic-says')!;
  let dirty = true, timer = 0, entries: MagicEntry[] = [];

  function valueRow(entry: MagicEntry, value: MagicValue, index: number) {
    const row = document.createElement('div');
    row.className = `magic-value magic-${value.kind}`;
    const id = `magic-${entry.blockId}-${index}`.replace(/[^A-Za-z0-9_-]/g, '_');
    const label = document.createElement('label');
    label.htmlFor = id; label.textContent = value.label || (value.kind === 'number' ? 'number' : 'words');
    const input = document.createElement('input');
    input.id = id; input.value = value.value; input.dataset.block = value.blockId; input.dataset.field = value.field; input.dataset.kind = value.kind;
    input.autocomplete = 'off'; input.spellcheck = false;
    if (value.kind === 'number') { input.inputMode = 'decimal'; input.className = 'magic-number-input'; input.setAttribute('aria-describedby', `${id}-error`); }
    else { input.maxLength = 120; input.className = 'magic-text-input'; }
    const commit = (text: string) => {
      const block = host.workspace.getBlockById(value.blockId), field = block?.getField(value.field);
      const accepted = acceptValue(value.kind, text), error = row.querySelector<HTMLElement>('.magic-error');
      if (!block || !field) return;
      if (accepted === null) { if (error) error.textContent = 'Use a number, such as 5, -3 or 0.5.'; input.value = String(field.getValue()); return; }
      if (error) error.textContent = '';
      if (String(field.getValue()) !== accepted) { field.setValue(accepted); input.value = String(field.getValue()); }
    };
    input.addEventListener('change', () => commit(input.value));
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); commit(input.value); input.select(); } });
    if (value.kind === 'number') {
      const step = (direction: 1 | -1) => {
        const next = stepValue(input.value.trim(), direction);
        if (next !== null) { input.value = next; commit(next); }
      };
      const less = document.createElement('button'), more = document.createElement('button');
      less.type = more.type = 'button'; less.className = more.className = 'magic-step';
      less.innerHTML = iconSvg('minus', 'currentColor'); more.innerHTML = iconSvg('plus', 'currentColor');
      less.setAttribute('aria-label', `Less: ${label.textContent}`); more.setAttribute('aria-label', `More: ${label.textContent}`);
      less.addEventListener('click', () => step(-1)); more.addEventListener('click', () => step(1));
      const stepper = document.createElement('span'); stepper.className = 'magic-stepper';
      stepper.append(less, input, more);
      const error = document.createElement('span'); error.className = 'magic-error'; error.id = `${id}-error`; error.setAttribute('role', 'alert');
      row.append(label, stepper, error);
    } else row.append(label, input);
    return row;
  }

  function page(entry: MagicEntry) {
    const card = document.createElement('article');
    card.className = `magic-entry magic-${entry.source}`; card.dataset.block = entry.blockId;
    const head = document.createElement('header');
    head.innerHTML = `<h3>${html(entry.title)}</h3>`;
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'button secondary magic-show'; show.innerHTML = `${iconSvg('target', 'currentColor')}<span>Show me</span>`;
    show.setAttribute('aria-label', `Show me: ${entry.title}`);
    show.addEventListener('click', () => host.show(entry.blockId));
    head.append(show); card.append(head);
    if (entry.note) { const note = document.createElement('p'); note.className = 'magic-note'; note.textContent = entry.note; card.append(note); }
    if (entry.values.length) {
      const values = document.createElement('div'); values.className = 'magic-values';
      entry.values.forEach((value, index) => values.append(valueRow(entry, value, index)));
      card.append(values);
    }
    const where = document.createElement('p'); where.className = 'magic-where';
    where.textContent = `In “${entry.script}”${entry.more ? ` · ${entry.more} more ${entry.more === 1 ? 'value' : 'values'} in the block` : ''}`;
    card.append(where);
    if (entry.source === 'spotted') {
      const keep = document.createElement('button');
      keep.type = 'button'; keep.className = 'magic-keep'; keep.textContent = 'Make this a note';
      keep.title = 'Adds this title to the block as a comment, so you can change the words';
      keep.addEventListener('click', () => { host.workspace.getBlockById(entry.blockId)?.setCommentText(`${entry.title}\n${entry.note}`); refresh(true); });
      card.append(keep);
    }
    return card;
  }

  function render() {
    entries = magicEntries(host.workspace);
    const notes = entries.filter(e => e.source === 'note'), spotted = entries.filter(e => e.source === 'spotted');
    const tabs = scriptTabs(host.workspace).tabs, grouped = tabs.length > 1;
    says.textContent = notes.some(e => e.values.length)
      ? 'I read the notes in this project and found its magic numbers. Change one, press Run, and see what happens!'
      : notes.length ? 'I read the notes in this project. Tap Show me to find each part.' + (spotted.length ? ' I also spotted some numbers worth trying.' : '')
      : spotted.length ? 'This project has no notes yet, but I spotted some numbers worth changing. Change one, press Run, and see what happens!'
      : 'I can’t find any magic numbers yet. Write a note on a block and it will show up here.';
    book.replaceChildren();
    const section = (title: string, list: MagicEntry[], kind: string) => {
      if (!list.length) return;
      const box = document.createElement('section'); box.className = `magic-section magic-section-${kind}`;
      if (title) { const h = document.createElement('h2'); h.className = 'magic-heading'; h.textContent = title; box.append(h); }
      if (grouped && kind === 'notes') for (const tab of tabs) {
        const inTab = list.filter(e => e.tab === tab.id); if (!inTab.length) continue;
        const h = document.createElement('h3'); h.className = 'magic-tab-heading';
        h.innerHTML = `${tab.icon ? iconSvg(tab.icon, 'currentColor') : ''}<span>${html(tab.name)}</span>`;
        box.append(h, ...inTab.map(page));
      } else box.append(...list.map(page));
      book.append(box);
    };
    section('', notes, 'notes');
    section(notes.length ? 'Wren also spotted' : 'Wren spotted', spotted, 'spotted');
    (document.getElementById('magic-how') as HTMLDetailsElement).open = !entries.length;
    dirty = false;
  }

  /** Keep the open book current; a field being typed in keeps its text until it is left. */
  function refresh(now = false) {
    if (!host.visible()) { dirty = true; return; }
    if (panel.contains(document.activeElement) && document.activeElement?.matches('input')) {
      // Update the other fields in place; the one being typed in keeps the learner's text.
      for (const input of panel.querySelectorAll<HTMLInputElement>('input[data-block]')) {
        if (input === document.activeElement) continue;
        const value = host.workspace.getBlockById(input.dataset.block!)?.getField(input.dataset.field!)?.getValue();
        if (value !== undefined) input.value = String(value);
      }
      dirty = true; return;
    }
    clearTimeout(timer);
    if (now) render(); else timer = window.setTimeout(render, 120);
  }
  const listener = (event: Blockly.Events.Abstract) => { if (!event.isUiEvent || event.type === 'py_script_tabs') refresh(); };
  host.workspace.addChangeListener(listener);
  panel.addEventListener('focusout', () => { if (dirty) setTimeout(() => { if (!panel.contains(document.activeElement)) refresh(); }, 0); });

  return {
    /** The Magic tab was opened. */
    opened() { if (dirty || !entries.length) render(); },
    refresh,
    /** How many pages come from notes (used to point at the tab when a project with notes opens). */
    notes: () => magicEntries(host.workspace).filter(e => e.source === 'note').length,
    dispose() { host.workspace.removeChangeListener(listener); clearTimeout(timer); panel.replaceChildren(); },
  };
}
