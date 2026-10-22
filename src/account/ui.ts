import { api, ApiError } from './api';
import { account } from './session';
import { startSync, type Sync } from './sync';
import { LIMITS, type CoinEntry, type ProjectSummary } from './shared';
import { iconMarkup, type IconName } from '../ui/icon-art';
import type { Build } from '../guide/builds';
import './account.css';

/** The account in the editor: coins and the learner's menu in the top bar (My projects, Profile,
 * Admin, Sign out), the My projects and Profile dialogs, and a cheer when coins are earned.
 * In local mode (no server) there is no account, and all of this stays out of the way. */
export interface AccountHost {
  /** Open a saved program in the editor; false when the editor cannot change projects now. */
  open(project: unknown, title: string, id: string): boolean;
  /** Start a new, empty program. */
  fresh(): boolean;
  rename(title: string): void;
  title(): string;
  lessonActive(): boolean;
  status(text: string): void;
  stopSaving(): void;
}
export interface AccountControls {
  signedIn: boolean;
  identity(): string | null;
  replaced(id: string | null): void;
  /** A lesson, guided build or Academy unit was finished. */
  finished(build: Build): void;
  /** An Academy unit was mastered (two of its three mastery problems right). */
  mastered(build: Build): void;
}
const icon = (name: IconName, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconMarkup(name)}</svg>`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const ago = (time: number) => {
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now'; if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} h ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};
const size = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function installAccount(host: AccountHost): AccountControls {
  const state = account();
  if (state.mode !== 'signed-in') return { signedIn: false, identity: () => null, replaced() {}, finished() {}, mastered() {} };
  const { user } = state;
  let coins = state.coins;
  const sync: Sync = startSync({ lessonActive: host.lessonActive, status: host.status, stopSaving: host.stopSaving }, state.start);

  // ── The top bar: coins and the learner's menu ──
  const slot = document.getElementById('account-slot')!;
  slot.hidden = false; document.documentElement.dataset.account = 'signed-in';
  slot.innerHTML = `<button id="account-coins" class="coin-chip" type="button" title="Your coins: earn them by finishing lessons and units">${icon('coin', 17)}<span id="account-coin-count"></span><span class="visually-hidden"> coins</span></button>
    <div class="menu-wrap account-wrap"><button id="account-button" class="account-button" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="account-menu"><span class="account-avatar" aria-hidden="true"></span><span class="visually-hidden">Your account</span></button>
      <div id="account-menu" class="app-menu account-menu" hidden>
        <div class="account-who"><strong id="account-name"></strong><span>@${user.username}</span></div>
        <div class="menu-group" role="group" aria-label="Your account">
          <button id="account-projects" class="button secondary">${icon('folder', 16)}My projects</button>
          <button id="account-profile" class="button secondary">${icon('user', 16)}Profile</button>
          ${user.role === 'admin' ? `<a id="account-admin" class="button secondary" href="/admin">${icon('people', 16)}Admin</a>` : ''}
          <button id="account-signout" class="button secondary">${icon('leave', 16)}Sign out</button>
        </div>
      </div></div>
    <div id="coin-toast" class="coin-toast" role="status" aria-live="polite" hidden></div>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const menu = $('account-menu'), button = $('account-button');
  const showName = (name: string) => { $('account-name').textContent = name; slot.querySelector('.account-avatar')!.textContent = name.trim().charAt(0).toUpperCase(); button.title = name; };
  const showCoins = () => { $('account-coin-count').textContent = String(coins); };
  showName(user.displayName); showCoins();
  const closeMenu = () => { menu.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', event => { event.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', event => { if (!menu.hidden && !menu.contains(event.target as Node)) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { closeMenu(); button.focus(); } });
  $('account-signout').addEventListener('click', () => { closeMenu(); void sync.signOut(); });
  $('account-coins').addEventListener('click', () => openProfile());

  // ── Coins ──
  let toastTimer = 0;
  function cheer(amount: number, title: string) {
    const toast = $('coin-toast');
    toast.innerHTML = `${icon('coin', 22)}<span><strong>+${amount} coins!</strong> ${title.replace(/[<>&]/g, '')}</span>`;
    toast.hidden = false; $('account-coins').classList.remove('coin-chip-cheer'); void $('account-coins').offsetWidth; $('account-coins').classList.add('coin-chip-cheer');
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4500);
  }
  async function award(key: string) {
    try {
      const result = await api<{ awarded: number; title: string; balance: number }>('POST', '/api/awards', { award: key });
      coins = result.balance; showCoins();
      if (result.awarded) cheer(result.awarded, result.title);
    } catch { /* an award that cannot be sent now is sent again next time it is earned */ }
  }

  // ── Dialogs ──
  document.body.insertAdjacentHTML('beforeend', `<dialog id="projects-dialog" class="examples-dialog account-dialog" aria-labelledby="projects-title">
      <header><h2 id="projects-title">${icon('folder', 22)}My projects</h2><span class="academy-spacer"></span><button id="projects-new" class="button secondary">${icon('plus', 16)}New project</button><button id="projects-close" class="button secondary">Close</button></header>
      <p>Your programs are saved to your account as you work, so they are here on any computer you sign in on.</p>
      <p id="projects-status" class="account-status" role="status"></p><ul id="projects-list" class="account-projects"></ul></dialog>
    <dialog id="profile-dialog" class="examples-dialog account-dialog" aria-labelledby="profile-title">
      <header><h2 id="profile-title">${icon('user', 22)}Profile</h2><span class="academy-spacer"></span><button id="profile-close" class="button secondary">Close</button></header>
      <div class="profile-grid">
        <section class="profile-card"><h3>You</h3>
          <form id="profile-name-form" class="profile-form"><label>Your name <input id="profile-name" maxlength="${LIMITS.displayName}" autocomplete="off" required></label><button class="button secondary" type="submit">Save name</button></form>
          <p class="account-note">Username: <strong>${user.username}</strong></p><p id="profile-name-status" class="account-status" role="status"></p></section>
        <section class="profile-card profile-coins"><h3>Coins</h3><p class="profile-balance">${icon('coin', 28)}<strong id="profile-balance"></strong></p>
          <p class="account-note">Finish a lesson, a guided build or an Academy unit to earn coins. Soon you can spend them in the shop.</p><ul id="profile-history" class="profile-history"></ul></section>
        <section class="profile-card"><h3>Password</h3>
          <form id="profile-password-form" class="profile-form"><label>Password now <input id="profile-password-now" type="password" autocomplete="current-password" required></label>
            <label>New password <input id="profile-password-next" type="password" autocomplete="new-password" minlength="${LIMITS.password.min}" maxlength="${LIMITS.password.max}" required></label>
            <button class="button secondary" type="submit">Change password</button></form><p id="profile-password-status" class="account-status" role="status"></p></section>
      </div></dialog>`);
  const projectsDialog = $<HTMLDialogElement>('projects-dialog'), profileDialog = $<HTMLDialogElement>('profile-dialog');
  $('projects-close').addEventListener('click', () => projectsDialog.close());
  $('profile-close').addEventListener('click', () => profileDialog.close());
  $('account-projects').addEventListener('click', () => { closeMenu(); void openProjects(); });
  $('account-profile').addEventListener('click', () => { closeMenu(); void openProfile(); });

  async function openProjects() {
    if (!projectsDialog.open) projectsDialog.showModal();
    $('projects-status').textContent = 'Loading…';
    try {
      await sync.flush();
      const { projects } = await api<{ projects: ProjectSummary[] }>('GET', '/api/projects');
      $('projects-status').textContent = projects.length ? '' : 'Nothing saved yet. Make something, and it is saved here as you work.';
      $('projects-list').replaceChildren(...projects.map(row));
    } catch (error) { $('projects-status').textContent = error instanceof Error ? error.message : String(error); }
  }
  function row(project: ProjectSummary) {
    const li = el('li', 'account-project'), current = project.id === sync.identity();
    li.dataset.project = project.id;
    const words = el('div', 'account-project-words'), name = el('strong', '', project.title);
    words.append(name, el('span', '', `${current ? 'Open now · ' : ''}Changed ${ago(project.updatedAt)} · ${size(project.size)}`));
    const actions = el('div', 'account-project-actions');
    const open = el('button', 'button primary', 'Open') as HTMLButtonElement, rename = el('button', 'button secondary', 'Rename') as HTMLButtonElement, remove = el('button', 'button secondary', 'Delete') as HTMLButtonElement;
    open.disabled = current;
    open.addEventListener('click', async () => {
      try {
        const saved = await api<{ title: string; data: unknown }>('GET', `/api/projects/${project.id}`);
        if (host.open(saved.data, saved.title, project.id)) projectsDialog.close();
        else $('projects-status').textContent = 'Save or apply your Python draft first.';
      } catch (error) { $('projects-status').textContent = error instanceof Error ? error.message : String(error); }
    });
    rename.addEventListener('click', () => {
      const input = Object.assign(el('input', 'account-rename'), { value: project.title, maxLength: LIMITS.title });
      const save = el('button', 'button primary', 'Save') as HTMLButtonElement;
      const done = async () => {
        const next = input.value.trim(); if (!next) return;
        try {
          await api('PUT', `/api/projects/${project.id}`, { title: next });
          if (project.id === sync.identity()) host.rename(next);
          await openProjects();
        } catch (error) { $('projects-status').textContent = error instanceof Error ? error.message : String(error); }
      };
      save.addEventListener('click', () => void done());
      input.addEventListener('keydown', event => { if (event.key === 'Enter') void done(); });
      words.replaceChildren(input); actions.replaceChildren(save); input.focus(); input.select();
    });
    remove.addEventListener('click', async () => {
      if (remove.dataset.sure !== 'yes') { remove.dataset.sure = 'yes'; remove.textContent = 'Delete for good?'; remove.classList.add('account-danger'); return; }
      try {
        await api('DELETE', `/api/projects/${project.id}`);
        if (project.id === sync.identity()) sync.replaced(null);
        await openProjects();
      } catch (error) { $('projects-status').textContent = error instanceof Error ? error.message : String(error); }
    });
    actions.append(open, rename, remove); li.append(words, actions);
    return li;
  }
  $('projects-new').addEventListener('click', async () => {
    await sync.flush();
    if (host.fresh()) projectsDialog.close(); else $('projects-status').textContent = 'Save or apply your Python draft first.';
  });

  async function openProfile() {
    $<HTMLInputElement>('profile-name').value = $('account-name').textContent ?? '';
    for (const id of ['profile-name-status', 'profile-password-status']) $(id).textContent = '';
    if (!profileDialog.open) profileDialog.showModal();
    try {
      const result = await api<{ balance: number; history: CoinEntry[] }>('GET', '/api/coins');
      coins = result.balance; showCoins(); $('profile-balance').textContent = String(coins);
      $('profile-history').replaceChildren(...(result.history.length ? result.history.map(entry => {
        const li = el('li'); li.append(el('span', 'profile-amount', `${entry.amount > 0 ? '+' : ''}${entry.amount}`), el('span', '', entry.note ? `${entry.title}: ${entry.note}` : entry.title), el('small', '', ago(entry.createdAt)));
        return li;
      }) : [el('li', 'account-note', 'No coins yet.')]));
    } catch { $('profile-balance').textContent = String(coins); }
  }
  $('profile-name-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const result = await api<{ user: { displayName: string } }>('PATCH', '/api/me', { displayName: $<HTMLInputElement>('profile-name').value });
      showName(result.user.displayName); $('profile-name-status').textContent = 'Saved.';
    } catch (error) { $('profile-name-status').textContent = error instanceof Error ? error.message : String(error); }
  });
  $('profile-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const now = $<HTMLInputElement>('profile-password-now'), next = $<HTMLInputElement>('profile-password-next');
    try {
      await api('POST', '/api/me/password', { current: now.value, next: next.value });
      now.value = ''; next.value = ''; $('profile-password-status').textContent = 'Your password is changed. Other computers will ask you to sign in again.';
    } catch (error) { $('profile-password-status').textContent = error instanceof ApiError && error.status === 403 ? 'Your password now is not right.' : error instanceof Error ? error.message : String(error); }
  });

  return {
    signedIn: true,
    identity: sync.identity,
    replaced: id => sync.replaced(id),
    finished(build) { void award(`${build.kind === 'lesson' ? 'lesson' : build.kind === 'unit' ? 'unit' : 'build'}:${build.id}`); },
    mastered(build) { if (build.kind === 'unit' && !build.unit?.capstone) void award(`mastery:${build.id}`); },
  };
}
