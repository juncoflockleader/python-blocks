import chapters from '../../content/academy/chapters.json';
import { buildById, type Build } from '../guide/builds';
import { iconMarkup, type IconName } from '../ui/icon-art';
import { finishUnit, loadProgress, readProgress, record, saveProgress, unitStatus, weekTime, type Progress, type ProgressEvent } from './progress';

/** The Academy: eight chapters of short units (Chapter 1 · Signals, …), each unit
 * played, read, practised and mastered in the lesson panel (builds.ts runs units
 * like lessons). The map shows every chapter and unit with its progress, a
 * Continue card, and a view for grown-ups with time, mastery and hints per unit
 * and the progress file to export or import (docs/learner-experience-plan.md §4). */
export interface AcademyHost {
  /** Start a unit at a step (its start sheet comes first). */
  start(id: string, at: number): void;
  /** The build open in the lesson panel, if any. */
  active(): Build | null;
  /** Bring the open unit's lesson panel forward. */
  reveal(): void;
  download(name: string, text: string): void;
}
interface ChapterUnit { id?: string; title: string; capstone?: boolean }
interface Chapter { number: number; title: string; theme: string; ideas: string; icon: string; units: ChapterUnit[] }
const map = chapters as Chapter[];
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const icon = (name: string, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(name as IconName)}</svg>`;
const minutes = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

export function installAcademy(host: AcademyHost) {
  let progress: Progress = loadProgress(), selected = map[0].units[0].id ?? '';
  document.body.insertAdjacentHTML('beforeend', `<dialog id="academy-dialog" class="examples-dialog academy-dialog" aria-labelledby="academy-title">
    <header><h2 id="academy-title">${icon('sprout', 22)}Academy</h2><label class="academy-learner">Your name <input id="academy-name" maxlength="40" autocomplete="off" placeholder="Type your name"></label><span class="academy-spacer"></span>
      <button id="academy-grownups" class="button secondary" aria-pressed="false">For grown-ups</button><button id="academy-close" class="button secondary">Close</button></header>
    <div id="academy-map" class="academy-map"><div class="academy-main"><div id="academy-continue" class="academy-continue" hidden></div><ol id="academy-chapters" class="academy-chapters"></ol></div><aside id="academy-unit" class="academy-unit" aria-live="polite"></aside></div>
    <section id="academy-parents" class="academy-parents" hidden aria-label="For grown-ups"></section></dialog>`);
  const dialog = document.getElementById('academy-dialog') as HTMLDialogElement;
  const name = document.getElementById('academy-name') as HTMLInputElement;
  name.addEventListener('change', () => { progress.learner.name = name.value.trim().slice(0, 40); saveProgress(progress); renderParents(); });

  const unitOf = (id?: string) => (id ? buildById(id) : undefined);
  const start = (build: Build, at: number) => {
    dialog.close();
    // The unit already open in the lesson panel just comes forward; any other starts with its sheet.
    if (host.active()?.id === build.id) host.reveal(); else host.start(build.id, at);
  };
  function pip(build: Build | undefined) {
    const span = el('span', 'academy-pip');
    if (!build) { span.classList.add('academy-pip-soon'); return span; }
    const status = unitStatus(build, progress.units[build.id]);
    if (status.mastered) { span.classList.add('academy-pip-star'); span.textContent = '★'; }
    else if (status.finished || status.done === status.total) { span.classList.add('academy-pip-done'); span.innerHTML = icon('check', 12); }
    else if (status.started) span.classList.add('academy-pip-going');
    return span;
  }
  function renderMap() {
    name.value = progress.learner.name;
    document.getElementById('academy-chapters')!.replaceChildren(...map.map(chapter => {
      const li = el('li', 'academy-chapter'), ready = chapter.units.some(unit => unit.id);
      li.classList.toggle('academy-chapter-soon', !ready);
      const head = el('div', 'academy-chapter-head');
      const badge = el('span', 'academy-chapter-icon'); badge.innerHTML = icon(chapter.icon, 18);
      head.append(badge, el('h3', '', `Chapter ${chapter.number} · ${chapter.title}`));
      li.append(head, el('p', 'academy-chapter-theme', `${chapter.theme} · ${chapter.ideas}`));
      const units = el('ol', 'academy-units');
      chapter.units.forEach((entry, i) => {
        const build = unitOf(entry.id), row = el('li');
        const button = el('button', 'academy-unit-row'); button.type = 'button';
        button.append(pip(build), el('span', 'academy-unit-number', `${chapter.number}.${i + 1}`), el('span', 'academy-unit-title', `${entry.capstone ? 'Big project: ' : ''}${entry.title}`));
        if (!build) { button.disabled = true; button.append(el('span', 'academy-soon', 'Soon')); }
        else {
          button.id = `academy-unit-${build.id}`;
          button.setAttribute('aria-pressed', String(selected === build.id));
          button.addEventListener('click', () => { selected = build.id; renderMap(); });
        }
        row.append(button); units.append(row);
      });
      li.append(units); return li;
    }));
    renderUnit(); renderContinue();
  }
  /** The selected unit: what it is, its parts with progress, and Start or Continue. */
  function renderUnit() {
    const aside = document.getElementById('academy-unit')!, build = unitOf(selected);
    if (!build) { aside.replaceChildren(el('p', 'academy-note', 'Choose a unit.')); return; }
    const status = unitStatus(build, progress.units[build.id]);
    const parts = el('ul', 'academy-parts');
    for (const part of status.parts) {
      const li = el('li'), mark = el('span', 'academy-pip');
      if (part.done === part.total) { mark.classList.add('academy-pip-done'); mark.innerHTML = icon('check', 12); } else if (part.done) mark.classList.add('academy-pip-going');
      li.append(mark, el('span', '', part.title), el('span', 'academy-part-count', `${part.done} of ${part.total}`));
      parts.append(li);
    }
    const go = el('button', 'button primary', status.started && !status.finished ? 'Continue' : status.finished ? 'Play it again' : 'Start') as HTMLButtonElement;
    go.id = 'academy-start'; go.type = 'button';
    go.addEventListener('click', () => start(build, status.finished ? 0 : status.next));
    aside.replaceChildren(el('p', 'academy-eyebrow', `Unit ${build.unit?.chapter}.${build.unit?.number} · about ${build.minutes} minutes`), el('h3', '', build.title), el('p', '', build.summary), parts,
      ...(status.mastered ? [el('p', 'academy-mastered', '★ Mastered')] : []), go);
  }
  function renderContinue() {
    const box = document.getElementById('academy-continue')!;
    const latest = Object.entries(progress.units).filter(([, unit]) => !unit.finished).sort((a, b) => b[1].updated - a[1].updated)[0];
    const build = latest && unitOf(latest[0]);
    box.hidden = !build; if (!build) return;
    const status = unitStatus(build, latest[1]);
    const button = el('button', 'button primary', 'Continue') as HTMLButtonElement; button.id = 'academy-continue-go';
    button.addEventListener('click', () => start(build, status.next));
    const words = el('div'); words.append(el('strong', '', `Continue · ${build.unit?.chapter}.${build.unit?.number} ${build.title}`), el('span', '', `${status.done} of ${status.total} steps done`));
    box.replaceChildren(words, button);
  }
  /** For grown-ups: time this week, units and mastery, where hints were needed, and the progress file. */
  function renderParents() {
    const section = document.getElementById('academy-parents')!;
    const units = map.flatMap(chapter => chapter.units.flatMap(entry => { const build = unitOf(entry.id); return build && progress.units[build.id] ? [build] : []; }));
    const rows = units.map(build => {
      const status = unitStatus(build, progress.units[build.id]), tr = el('tr');
      tr.append(el('td', '', `${build.unit?.chapter}.${build.unit?.number} ${build.title}`), el('td', '', `${status.done} of ${status.total}`), el('td', '', status.mastered ? '★ Mastered' : status.finished ? 'Finished' : 'Not yet'), el('td', '', String(status.hints)), el('td', '', minutes(status.ms)));
      return tr;
    });
    const mastered = units.filter(build => unitStatus(build, progress.units[build.id]).mastered).length;
    const cards = el('div', 'academy-cards');
    for (const [label, value] of [['This week', minutes(weekTime(progress))], ['Units started', String(units.length)], ['Mastered', String(mastered)]]) { const card = el('div', 'academy-card'); card.append(el('span', '', label), el('strong', '', value)); cards.append(card); }
    const table = el('table', 'academy-table'); table.innerHTML = '<thead><tr><th>Unit</th><th>Steps done</th><th>Mastery</th><th>Hints used</th><th>Time</th></tr></thead>';
    const body = el('tbody'); body.append(...rows); table.append(body);
    const exportButton = el('button', 'button secondary', 'Export progress file') as HTMLButtonElement; exportButton.id = 'academy-export';
    exportButton.addEventListener('click', () => host.download(`academy-progress${progress.learner.name ? `-${progress.learner.name.replace(/[^\w-]+/g, '-')}` : ''}.json`, JSON.stringify(progress, null, 1)));
    const importLabel = el('label', 'button secondary academy-import', 'Import progress file'), input = el('input'); input.type = 'file'; input.accept = '.json,application/json'; input.id = 'academy-import'; importLabel.append(input);
    const message = el('p', 'academy-note'); message.setAttribute('role', 'status');
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; input.value = ''; if (!file) return;
      const read = file.size < 1_000_000 ? readProgress(await file.text()) : null;
      if (!read) { message.textContent = 'That file is not an Academy progress file.'; return; }
      progress = read; saveProgress(progress); renderMap(); renderParents();
      (document.getElementById('academy-parents')!.querySelector('.academy-note[role=status]') as HTMLElement).textContent = `Progress for ${progress.learner.name || 'this learner'} is loaded.`;
    });
    section.replaceChildren(cards, rows.length ? table : el('p', 'academy-note', 'No units started yet.'), el('div', 'academy-file'), message, el('p', 'academy-note', 'Progress is kept in this browser. Export it as a file to move it to another device. No account, nothing uploaded.'));
    section.querySelector('.academy-file')!.append(exportButton, importLabel);
  }
  const grownups = document.getElementById('academy-grownups')!;
  grownups.addEventListener('click', () => {
    const on = grownups.getAttribute('aria-pressed') !== 'true'; grownups.setAttribute('aria-pressed', String(on));
    document.getElementById('academy-parents')!.hidden = !on; document.getElementById('academy-map')!.hidden = on;
    if (on) renderParents();
  });
  const open = () => { progress = loadProgress(); const active = host.active(); if (active?.kind === 'unit') selected = active.id; renderMap(); if (!dialog.open) dialog.showModal(); };
  for (const id of ['academy-open', 'menu-academy']) document.getElementById(id)?.addEventListener('click', open);
  document.getElementById('academy-close')!.addEventListener('click', () => dialog.close());
  return {
    open,
    /** A step was done or tried in a unit. */
    record(event: ProgressEvent) { record(progress, event); saveProgress(progress); },
    finished(build: Build) { if (build.kind === 'unit') { finishUnit(progress, build); saveProgress(progress); } },
    dispose() { dialog.remove(); },
  };
}
