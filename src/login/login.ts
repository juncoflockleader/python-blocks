import logo from '../ui/logo.svg?raw';
import './login.css';

/** The sign-in page: the only page served before signing in. There is no sign-up: a teacher or
 * grown-up (the admin) gives each learner a username and password. */
const main = document.getElementById('login')!;
main.innerHTML = `<div class="login-card">
    <div class="login-brand">${logo.replace(/role="img" aria-label="Python Blocks"/, 'aria-hidden="true" focusable="false"')}<h1>Python Blocks</h1></div>
    <p class="login-lead">Build with blocks. Discover the Python inside.</p>
    <form id="login-form" class="login-form" novalidate>
      <label>Username <input id="login-username" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></label>
      <label>Password <span class="login-password"><input id="login-password" name="password" type="password" autocomplete="current-password" required><button id="login-show" type="button" class="login-show" aria-pressed="false">Show</button></span></label>
      <p id="login-error" class="login-error" role="alert"></p>
      <button id="login-submit" class="login-submit" type="submit">Sign in</button>
    </form>
    <p class="login-help">Your teacher or grown-up gives you your username and password.</p>
  </div>`;
const form = document.getElementById('login-form') as HTMLFormElement, error = document.getElementById('login-error')!;
const username = document.getElementById('login-username') as HTMLInputElement, password = document.getElementById('login-password') as HTMLInputElement;
const submit = document.getElementById('login-submit') as HTMLButtonElement, show = document.getElementById('login-show') as HTMLButtonElement;
username.focus();
show.addEventListener('click', () => {
  const on = password.type === 'password'; password.type = on ? 'text' : 'password';
  show.textContent = on ? 'Hide' : 'Show'; show.setAttribute('aria-pressed', String(on)); password.focus();
});
/** Back to the page asked for, on this site only. */
function next() {
  const target = new URLSearchParams(location.search).get('next') ?? '/';
  return /^\/(?!\/)[^\\]*$/.test(target) && !target.startsWith('/login') ? target : '/';
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!username.value.trim() || !password.value) { error.textContent = 'Type your username and password.'; return; }
  submit.disabled = true; submit.textContent = 'Signing in…'; error.textContent = '';
  try {
    const res = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.value.trim(), password: password.value }) });
    if (res.ok) { location.replace(next()); return; }
    error.textContent = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Signing in did not work. Try again.';
    password.select();
  } catch { error.textContent = 'The server cannot be reached. Check the connection and try again.'; }
  submit.disabled = false; submit.textContent = 'Sign in';
});
