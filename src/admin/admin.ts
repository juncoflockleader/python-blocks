import logo from '../ui/logo.svg?raw';
import { api, ApiError } from '../account/api';
import { LIMITS, type AccountUser, type CoinEntry, type ProjectSummary } from '../account/shared';
import './admin.css';

/** The admin page: make accounts (there is no sign-up), reset passwords, turn accounts off and on,
 * give coins, and see each learner's coins, finished lessons and saved programs. */
interface Row extends AccountUser { disabled: boolean; createdAt: number; lastLoginAt: number | null; coins: number; projects: number; awards: number }
interface Detail { user: AccountUser & { disabled: boolean; createdAt: number; lastLoginAt: number | null }; coins: { balance: number; history: CoinEntry[] }; awards: string[]; projects: ProjectSummary[] }
const root = document.getElementById('admin')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
const when = (time: number | null) => time ? new Date(time).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
/** A password a child can type: two words and a number. */
const WORDS = ['apple', 'tiger', 'rocket', 'maple', 'comet', 'panda', 'river', 'mango', 'otter', 'pixel', 'cloud', 'lemon', 'robin', 'zebra', 'cactus', 'falcon', 'koala', 'meadow', 'nebula', 'pepper'];
const pick = () => WORDS[crypto.getRandomValues(new Uint32Array(1))[0] % WORDS.length];
const makePassword = () => `${pick()}-${pick()}-${10 + crypto.getRandomValues(new Uint32Array(1))[0] % 90}`;

root.innerHTML = `<header class="admin-bar">${logo.replace(/role="img" aria-label="Python Blocks"/, 'aria-hidden="true" focusable="false"')}<h1>Python Blocks · Admin</h1><span class="admin-spacer"></span>
    <a class="admin-button" href="/">Back to the editor</a><button id="admin-signout" class="admin-button" type="button">Sign out</button></header>
  <main class="admin-main">
    <section class="admin-card"><h2>Add a learner</h2>
      <form id="add-form" class="admin-form">
        <label>Name <input id="add-name" maxlength="${LIMITS.displayName}" required placeholder="Ada"></label>
        <label>Username <input id="add-username" required pattern="[A-Za-z0-9._\\-]{3,32}" autocapitalize="off" spellcheck="false" placeholder="ada"></label>
        <label>Password <span class="admin-inline"><input id="add-password" required minlength="${LIMITS.password.min}" maxlength="${LIMITS.password.max}" autocomplete="off"><button id="add-make" class="admin-button" type="button">Make one</button></span></label>
        <label>Role <select id="add-role"><option value="learner">Learner</option><option value="admin">Admin</option></select></label>
        <button class="admin-button admin-primary" type="submit">Add</button>
      </form>
      <p id="add-status" class="admin-status" role="status"></p></section>
    <section class="admin-card"><h2>Accounts</h2><p id="list-status" class="admin-status" role="status"></p>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Coins</th><th>Finished</th><th>Programs</th><th>Last sign-in</th><th></th></tr></thead><tbody id="users"></tbody></table></div></section>
  </main>
  <dialog id="detail" class="admin-dialog" aria-labelledby="detail-title"></dialog>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

$('admin-signout').addEventListener('click', async () => { try { await api('POST', '/api/logout'); } finally { location.assign('/login'); } });
$('add-make').addEventListener('click', () => { $<HTMLInputElement>('add-password').value = makePassword(); });
$('add-name').addEventListener('input', () => {
  const username = $<HTMLInputElement>('add-username');
  if (!username.dataset.touched) username.value = $<HTMLInputElement>('add-name').value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);
});
$('add-username').addEventListener('input', () => { $('add-username').dataset.touched = 'yes'; });
$<HTMLFormElement>('add-form').addEventListener('submit', async event => {
  event.preventDefault();
  const body = { displayName: $<HTMLInputElement>('add-name').value, username: $<HTMLInputElement>('add-username').value.trim(), password: $<HTMLInputElement>('add-password').value, role: $<HTMLSelectElement>('add-role').value };
  try {
    await api('POST', '/api/admin/users', body);
    $('add-status').textContent = `Added ${body.displayName}. Give them: username ${body.username}, password ${body.password}`;
    $<HTMLFormElement>('add-form').reset(); delete $('add-username').dataset.touched;
    await load();
  } catch (error) { $('add-status').textContent = message(error); }
});

async function load() {
  try {
    const { users } = await api<{ users: Row[] }>('GET', '/api/admin/users');
    $('list-status').textContent = users.length ? '' : 'No accounts yet.';
    $('users').replaceChildren(...users.map(user => {
      const tr = el('tr'); if (user.disabled) tr.className = 'admin-off';
      const manage = el('button', 'admin-button', 'Manage') as HTMLButtonElement; manage.dataset.user = user.username;
      manage.addEventListener('click', () => void open(user.id));
      for (const text of [user.displayName, user.username, user.role === 'admin' ? 'Admin' : 'Learner', String(user.coins), String(user.awards), String(user.projects), user.disabled ? 'Turned off' : when(user.lastLoginAt)]) tr.append(el('td', '', text));
      const cell = el('td'); cell.append(manage); tr.append(cell);
      return tr;
    }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) { location.assign('/'); return; }
    $('list-status').textContent = message(error);
  }
}

async function open(id: number, said = '') {
  const dialog = $<HTMLDialogElement>('detail');
  let detail: Detail;
  try { detail = await api<Detail>('GET', `/api/admin/users/${id}`); } catch (error) { $('list-status').textContent = message(error); return; }
  const { user } = detail;
  dialog.replaceChildren();
  const header = el('header', 'admin-dialog-head'); const title = el('h2', '', `${user.displayName} (@${user.username})`); title.id = 'detail-title';
  const close = el('button', 'admin-button', 'Close') as HTMLButtonElement; close.addEventListener('click', () => dialog.close());
  header.append(title, close);
  const status = el('p', 'admin-status', said); status.setAttribute('role', 'status');
  /** Do something, then say how it went; `again` redraws this panel to show the change. */
  const act = async (work: () => Promise<unknown>, done: string, again = false) => {
    try { await work(); await load(); if (again) await open(id, done); else status.textContent = done; }
    catch (error) { status.textContent = message(error); }
  };
  const facts = el('p', 'admin-facts', `${user.role === 'admin' ? 'Admin' : 'Learner'} · added ${when(user.createdAt)} · last sign-in ${when(user.lastLoginAt)}${user.disabled ? ' · turned off' : ''}`);

  // Name, password, on/off and role.
  const forms = el('div', 'admin-forms');
  const nameForm = el('form', 'admin-inline'); const name = Object.assign(el('input'), { value: user.displayName, maxLength: LIMITS.displayName, required: true }); nameForm.append(name, el('button', 'admin-button', 'Rename'));
  nameForm.addEventListener('submit', event => { event.preventDefault(); void act(() => api('PATCH', `/api/admin/users/${id}`, { displayName: name.value }), 'Renamed.'); });
  const passwordForm = el('form', 'admin-inline'); const password = Object.assign(el('input'), { value: makePassword(), minLength: LIMITS.password.min, maxLength: LIMITS.password.max, required: true, autocomplete: 'off' });
  passwordForm.append(password, el('button', 'admin-button', 'Set password'));
  passwordForm.addEventListener('submit', event => { event.preventDefault(); void act(() => api('PATCH', `/api/admin/users/${id}`, { password: password.value }), `New password: ${password.value}. They sign in again on every device.`); });
  const toggle = el('button', 'admin-button', user.disabled ? 'Turn the account on' : 'Turn the account off') as HTMLButtonElement;
  toggle.addEventListener('click', () => void act(() => api('PATCH', `/api/admin/users/${id}`, { disabled: !user.disabled }), user.disabled ? 'Turned on.' : 'Turned off: they cannot sign in.', true));
  const role = el('button', 'admin-button', user.role === 'admin' ? 'Make a learner' : 'Make an admin') as HTMLButtonElement;
  role.addEventListener('click', () => void act(() => api('PATCH', `/api/admin/users/${id}`, { role: user.role === 'admin' ? 'learner' : 'admin' }), 'Role changed.', true));
  const coinForm = el('form', 'admin-inline'); const amount = Object.assign(el('input'), { type: 'number', value: '10', step: '1', required: true }); const note = Object.assign(el('input'), { placeholder: 'Why (they see this)', maxLength: 120 });
  coinForm.append(amount, note, el('button', 'admin-button', 'Give coins'));
  coinForm.addEventListener('submit', event => { event.preventDefault(); void act(() => api('POST', `/api/admin/users/${id}/coins`, { amount: Number(amount.value), note: note.value }), 'Coins given.', true); });
  const row = (label: string, ...nodes: Node[]) => { const div = el('div', 'admin-row'); div.append(el('span', 'admin-label', label), ...nodes); return div; };
  forms.append(row('Name', nameForm), row('Password', passwordForm), row('Account', toggle, role), row('Coins', coinForm));

  // Coins and what earned them; saved programs.
  const coins = el('section', 'admin-sub'); coins.append(el('h3', '', `Coins: ${detail.coins.balance}`));
  const history = el('ul', 'admin-list');
  history.append(...(detail.coins.history.length ? detail.coins.history.map(entry => el('li', '', `${entry.amount > 0 ? '+' : ''}${entry.amount} · ${entry.note ? `${entry.title}: ${entry.note}` : entry.title} · ${when(entry.createdAt)}`)) : [el('li', '', 'Nothing yet.')]));
  coins.append(history);
  const programs = el('section', 'admin-sub'); programs.append(el('h3', '', `Programs: ${detail.projects.length}`));
  const list = el('ul', 'admin-list');
  list.append(...(detail.projects.length ? detail.projects.map(project => el('li', '', `${project.title} · changed ${when(project.updatedAt)} · ${Math.max(1, Math.round(project.size / 1024))} KB`)) : [el('li', '', 'Nothing saved yet.')]));
  programs.append(list);
  dialog.append(header, facts, forms, status, coins, programs);
  if (!dialog.open) dialog.showModal();
}

void load();
