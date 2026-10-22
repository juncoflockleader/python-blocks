import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { transaction, type Database } from './db.ts';
import { SESSION_COOKIE, SESSION_DAYS, Throttle, createSession, dummyHash, endAllSessions, endSession, hashPassword, sessionUser, verifyPassword } from './auth.ts';
import { loadRewards } from './rewards.ts';
import { addUser } from './accounts.ts';
import { LIMITS, isSyncedKey, validDisplayName, validPassword, validUsername, type AccountUser, type CoinEntry, type ProjectSummary } from '../src/account/shared.ts';

/** The Python Blocks server: it serves the built app only to signed-in learners (everyone else gets
 * the sign-in page), and an API for accounts, saved programs, synced browser state, coins and the
 * admin page. Accounts are made by an admin; there is no sign-up. */
export interface AppOptions {
  db: Database;
  /** The built app (vite build). */
  dist: string;
  /** The lessons and Academy units, for the coin rewards. */
  content: string;
  /** Secure cookies: true behind HTTPS, false for plain http on one machine, 'auto' from the request. */
  secureCookies?: boolean | 'auto';
  /** Trust X-Forwarded-For and X-Forwarded-Proto from a reverse proxy. */
  trustProxy?: boolean;
  now?: () => number;
  log?: (line: string) => void;
}
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
interface Context { req: IncomingMessage; res: ServerResponse; url: URL; user: AccountUser | null; token?: string; body?: unknown }
type Access = 'public' | 'user' | 'admin';
type Route = { method: string; pattern: RegExp; access: Access; limit: number; handle(ctx: Context, params: string[]): unknown | Promise<unknown> };

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.py': 'text/plain; charset=utf-8',
  '.zip': 'application/zip', '.whl': 'application/zip', '.tar': 'application/x-tar', '.map': 'application/json',
};
const SMALL = 64 * 1024;
const HEADERS = {
  // Python runs in a worker that shares memory with the page (for the debugger), which needs cross-origin isolation.
  'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
};

export function createApp(options: AppOptions) {
  const { db } = options, now = options.now ?? Date.now, log = options.log ?? (() => {});
  const dist = path.resolve(options.dist), rewards = loadRewards(options.content), throttle = new Throttle();
  const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string | string[]> = {}) => {
    res.writeHead(status, { ...HEADERS, 'Cache-Control': 'no-store', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const address = (req: IncomingMessage) => (options.trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
  const secure = (req: IncomingMessage) => options.secureCookies === 'auto' || options.secureCookies === undefined
    ? !!(req.socket as TLSSocket).encrypted || (!!options.trustProxy && req.headers['x-forwarded-proto'] === 'https')
    : options.secureCookies;
  const cookie = (req: IncomingMessage, value: string, maxAge: number) => `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
  const readCookie = (req: IncomingMessage) => String(req.headers.cookie ?? '').split(';').map(part => part.trim().split('=')).find(([name]) => name === SESSION_COOKIE)?.[1];

  // ── Accounts ──
  interface UserRow { id: number; username: string; display_name: string; password_hash: string; role: 'learner' | 'admin'; disabled: number; created_at: number; last_login_at: number | null }
  const toUser = (row: UserRow): AccountUser => ({ id: row.id, username: row.username, displayName: row.display_name, role: row.role });
  const balance = (userId: number) => (db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM coins WHERE user_id = ?').get(userId) as { total: number }).total;
  const history = (userId: number, limit = 50): CoinEntry[] => (db.prepare('SELECT amount, kind, award, note, created_at FROM coins WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(userId, limit) as { amount: number; kind: 'award' | 'admin'; award: string | null; note: string | null; created_at: number }[])
    .map(row => ({ amount: row.amount, kind: row.kind, award: row.award, note: row.note, createdAt: row.created_at, title: row.kind === 'award' ? rewards.get(row.award ?? '')?.title ?? row.award ?? '' : 'From your teacher' }));
  const userRow = (id: number) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  const me = (user: AccountUser) => ({ user, coins: balance(user.id) });
  const field = <T>(body: unknown, name: string, check: (value: unknown) => value is T, message: string): T => {
    const value = (body as Record<string, unknown> | null)?.[name];
    if (!check(value)) throw new HttpError(400, message);
    return value;
  };
  const projects = (userId: number): ProjectSummary[] => (db.prepare('SELECT id, title, size, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(userId) as { id: string; title: string; size: number; created_at: number; updated_at: number }[])
    .map(row => ({ id: row.id, title: row.title, size: row.size, createdAt: row.created_at, updatedAt: row.updated_at }));
  const title = (value: unknown, fallback?: string) => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string' || !value.trim() || value.trim().length > LIMITS.title) throw new HttpError(400, `A title needs 1–${LIMITS.title} characters.`);
    return value.trim();
  };
  const projectData = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'A program is a Python Blocks project.');
    const text = JSON.stringify(value);
    if (text.length > LIMITS.project) throw new HttpError(413, 'This program is too big to save.');
    return text;
  };

  const routes: Route[] = [];
  const route = (method: string, pattern: string, access: Access, handle: Route['handle'], limit = SMALL) =>
    routes.push({ method, pattern: new RegExp(`^${pattern.replace(/:id/g, '([^/]+)')}$`), access, limit, handle });

  route('GET', '/api/health', 'public', () => ({ ok: true }));
  route('POST', '/api/login', 'public', async ctx => {
    const username = String((ctx.body as { username?: unknown })?.username ?? '').trim(), password = (ctx.body as { password?: unknown })?.password;
    const at = now(), from = address(ctx.req);
    if (throttle.blocked(username, from, at)) throw new HttpError(429, 'Too many tries. Wait a few minutes, then try again.');
    const row = validUsername(username) ? db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined : undefined;
    const right = typeof password === 'string' && password.length <= LIMITS.password.max && (row ? await verifyPassword(password, row.password_hash) : (await verifyPassword(password, await dummyHash()), false));
    if (!row || !right) { throttle.miss(username, from, at); throw new HttpError(401, 'That username and password do not match.'); }
    if (row.disabled) throw new HttpError(403, 'This account is turned off. Ask your teacher.');
    throttle.clear(username);
    const token = createSession(db, row.id, at);
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(at, row.id);
    ctx.res.setHeader('Set-Cookie', cookie(ctx.req, token, SESSION_DAYS * 24 * 3600));
    log(`sign in ${row.username}`);
    return me(toUser(row));
  });
  route('POST', '/api/logout', 'public', ctx => { endSession(db, ctx.token); ctx.res.setHeader('Set-Cookie', cookie(ctx.req, '', 0)); });
  route('GET', '/api/me', 'user', ctx => me(ctx.user!));
  route('PATCH', '/api/me', 'user', ctx => {
    const name = field(ctx.body, 'displayName', validDisplayName, `A name needs 1–${LIMITS.displayName} characters.`).trim();
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, ctx.user!.id);
    return me({ ...ctx.user!, displayName: name });
  });
  route('POST', '/api/me/password', 'user', async ctx => {
    const current = (ctx.body as { current?: unknown })?.current, next = field(ctx.body, 'next', validPassword, `A new password needs ${LIMITS.password.min}–${LIMITS.password.max} characters.`);
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(ctx.user!.id) as { password_hash: string };
    if (typeof current !== 'string' || !await verifyPassword(current, row.password_hash)) throw new HttpError(403, 'Your current password is not right.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), ctx.user!.id);
    // Other devices sign in again; this one stays signed in.
    endAllSessions(db, ctx.user!.id);
    ctx.res.setHeader('Set-Cookie', cookie(ctx.req, createSession(db, ctx.user!.id, now()), SESSION_DAYS * 24 * 3600));
  });

  // ── Synced browser state: each key's latest value ──
  route('GET', '/api/data', 'user', ctx => ({ values: Object.fromEntries((db.prepare('SELECT key, value FROM user_data WHERE user_id = ?').all(ctx.user!.id) as { key: string; value: string }[]).map(row => [row.key, row.value])) }));
  route('PUT', '/api/data', 'user', ctx => {
    const values = (ctx.body as { values?: unknown })?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(400, 'Send values by key.');
    const entries = Object.entries(values as Record<string, unknown>);
    for (const [key, value] of entries) if (!isSyncedKey(key) || (value !== null && typeof value !== 'string')) throw new HttpError(400, `${key} cannot be saved.`);
    transaction(db, () => {
      for (const [key, value] of entries) {
        if (value === null) db.prepare('DELETE FROM user_data WHERE user_id = ? AND key = ?').run(ctx.user!.id, key);
        else db.prepare('INSERT INTO user_data (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').run(ctx.user!.id, key, value as string, now());
      }
      const total = (db.prepare('SELECT COALESCE(SUM(LENGTH(value)), 0) AS total FROM user_data WHERE user_id = ?').get(ctx.user!.id) as { total: number }).total;
      if (total > LIMITS.data) throw new HttpError(413, 'Your saved work is too big. Delete some pictures or sounds.');
    });
  }, LIMITS.data);

  // ── Saved programs ──
  const ownProject = (ctx: Context, id: string) => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, ctx.user!.id) as { id: string; title: string; data: string; updated_at: number } | undefined;
    if (!row) throw new HttpError(404, 'That program is not here.');
    return row;
  };
  route('GET', '/api/projects', 'user', ctx => ({ projects: projects(ctx.user!.id) }));
  route('POST', '/api/projects', 'user', ctx => {
    const count = (db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(ctx.user!.id) as { n: number }).n;
    if (count >= LIMITS.projects) throw new HttpError(409, `You have ${LIMITS.projects} programs. Delete one to save another.`);
    const body = ctx.body as { title?: unknown; data?: unknown }, id = randomUUID(), at = now(), data = projectData(body?.data);
    db.prepare('INSERT INTO projects (id, user_id, title, data, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, ctx.user!.id, title(body?.title, 'My project'), data, data.length, at, at);
    return { id, updatedAt: at };
  }, LIMITS.project + SMALL);
  route('GET', '/api/projects/:id', 'user', (ctx, [id]) => { const row = ownProject(ctx, id); return { id: row.id, title: row.title, data: JSON.parse(row.data), updatedAt: row.updated_at }; });
  route('PUT', '/api/projects/:id', 'user', (ctx, [id]) => {
    const row = ownProject(ctx, id), body = ctx.body as { title?: unknown; data?: unknown }, at = now();
    const data = body?.data === undefined ? row.data : projectData(body.data);
    db.prepare('UPDATE projects SET title = ?, data = ?, size = ?, updated_at = ? WHERE id = ?').run(title(body?.title, row.title), data, data.length, at, id);
    return { updatedAt: at };
  }, LIMITS.project + SMALL);
  route('DELETE', '/api/projects/:id', 'user', (ctx, [id]) => { ownProject(ctx, id); db.prepare('DELETE FROM projects WHERE id = ?').run(id); });

  // ── Coins ──
  const awards = (userId: number) => (db.prepare("SELECT award FROM coins WHERE user_id = ? AND kind = 'award'").all(userId) as { award: string }[]).map(row => row.award);
  route('GET', '/api/coins', 'user', ctx => ({ balance: balance(ctx.user!.id), history: history(ctx.user!.id), awards: awards(ctx.user!.id) }));
  route('POST', '/api/awards', 'user', ctx => {
    const award = String((ctx.body as { award?: unknown })?.award ?? ''), reward = rewards.get(award);
    if (!reward) throw new HttpError(400, 'There is no such award.');
    const added = db.prepare("INSERT OR IGNORE INTO coins (user_id, amount, kind, award, created_at) VALUES (?, ?, 'award', ?, ?)").run(ctx.user!.id, reward.coins, award, now()).changes;
    return { awarded: added ? reward.coins : 0, title: reward.title, balance: balance(ctx.user!.id) };
  });

  // ── Admin ──
  const adminUser = (id: string) => { const row = userRow(Number(id)); if (!row) throw new HttpError(404, 'There is no such account.'); return row; };
  route('GET', '/api/admin/users', 'admin', () => ({
    users: (db.prepare(`SELECT users.*, (SELECT COALESCE(SUM(amount), 0) FROM coins WHERE user_id = users.id) AS coins,
      (SELECT COUNT(*) FROM projects WHERE user_id = users.id) AS project_count, (SELECT COUNT(*) FROM coins WHERE user_id = users.id AND kind = 'award') AS award_count
      FROM users ORDER BY users.role = 'admin' DESC, users.username`).all() as unknown as (UserRow & { coins: number; project_count: number; award_count: number })[])
      .map(row => ({ ...toUser(row), disabled: !!row.disabled, createdAt: row.created_at, lastLoginAt: row.last_login_at, coins: row.coins, projects: row.project_count, awards: row.award_count })),
  }));
  route('POST', '/api/admin/users', 'admin', async ctx => {
    const username = field(ctx.body, 'username', validUsername, 'A username needs 3–32 letters, digits, dots, dashes or underscores.');
    const displayName = field(ctx.body, 'displayName', validDisplayName, `A name needs 1–${LIMITS.displayName} characters.`).trim();
    const password = field(ctx.body, 'password', validPassword, `A password needs ${LIMITS.password.min}–${LIMITS.password.max} characters.`);
    const role = (ctx.body as { role?: unknown })?.role === 'admin' ? 'admin' : 'learner';
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'That username is taken.');
    const id = await addUser(db, username, displayName, password, role, now());
    log(`${ctx.user!.username} added ${username}`);
    return { user: toUser(userRow(id)!) };
  });
  route('GET', '/api/admin/users/:id', 'admin', (ctx, [id]) => {
    const row = adminUser(id), academy = db.prepare("SELECT value FROM user_data WHERE user_id = ? AND key = 'python-blocks.academy.v1'").get(row.id) as { value: string } | undefined;
    let progress: unknown = null; try { progress = academy ? JSON.parse(academy.value) : null; } catch { progress = null; }
    return { user: { ...toUser(row), disabled: !!row.disabled, createdAt: row.created_at, lastLoginAt: row.last_login_at }, coins: { balance: balance(row.id), history: history(row.id, 200) }, awards: awards(row.id), projects: projects(row.id), academy: progress };
  });
  route('PATCH', '/api/admin/users/:id', 'admin', async (ctx, [id]) => {
    const row = adminUser(id), body = ctx.body as { displayName?: unknown; password?: unknown; role?: unknown; disabled?: unknown };
    const self = row.id === ctx.user!.id;
    if (body?.displayName !== undefined) db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(field(body, 'displayName', validDisplayName, `A name needs 1–${LIMITS.displayName} characters.`).trim(), row.id);
    if (body?.role !== undefined) {
      if (body.role !== 'admin' && body.role !== 'learner') throw new HttpError(400, 'Choose learner or admin.');
      if (self && body.role !== 'admin') throw new HttpError(409, 'You cannot take away your own admin role.');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, row.id);
    }
    if (body?.disabled !== undefined) {
      if (typeof body.disabled !== 'boolean') throw new HttpError(400, 'Disabled is true or false.');
      if (self && body.disabled) throw new HttpError(409, 'You cannot turn off your own account.');
      db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(body.disabled ? 1 : 0, row.id);
      if (body.disabled) endAllSessions(db, row.id);
    }
    if (body?.password !== undefined) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(field(body, 'password', validPassword, `A password needs ${LIMITS.password.min}–${LIMITS.password.max} characters.`)), row.id);
      if (!self) endAllSessions(db, row.id);
    }
    log(`${ctx.user!.username} changed ${row.username}`);
    const next = userRow(row.id)!;
    return { user: { ...toUser(next), disabled: !!next.disabled } };
  });
  route('POST', '/api/admin/users/:id/coins', 'admin', (ctx, [id]) => {
    const row = adminUser(id), amount = (ctx.body as { amount?: unknown })?.amount, note = String((ctx.body as { note?: unknown })?.note ?? '').trim().slice(0, 120);
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100_000) throw new HttpError(400, 'Give or take a whole number of coins.');
    if (balance(row.id) + amount < 0) throw new HttpError(409, 'That would leave fewer than 0 coins.');
    db.prepare("INSERT INTO coins (user_id, amount, kind, note, created_at) VALUES (?, ?, 'admin', ?, ?)").run(row.id, amount, note || null, now());
    return { balance: balance(row.id) };
  });

  // ── Files: only the sign-in page and its files before signing in ──
  let publicFiles = new Set<string>(), publicStamp = -1;
  const signInFiles = () => {
    const page = path.join(dist, 'login.html');
    const stamp = existsSync(page) ? statSync(page).mtimeMs : 0;
    if (stamp !== publicStamp) {
      publicStamp = stamp;
      const html = stamp ? readFileSync(page, 'utf8') : '';
      publicFiles = new Set(['/login.html', '/apple-touch-icon.png', ...[...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map(match => match[1])]);
    }
    return publicFiles;
  };
  const pages: Record<string, string> = { '/': '/index.html', '/login': '/login.html', '/admin': '/admin.html' };
  /** The editor's page, with the learner's account and saved work in it, so the editor starts with them at once. */
  async function serveApp(ctx: Context) {
    const html = await readFile(path.join(dist, 'index.html'), 'utf8'), user = ctx.user!;
    const values = Object.fromEntries((db.prepare('SELECT key, value FROM user_data WHERE user_id = ?').all(user.id) as { key: string; value: string }[]).map(row => [row.key, row.value]));
    const data = JSON.stringify({ user, coins: balance(user.id), values }).replace(/</g, '\\u003c');
    const script = `<script id="pb-account" type="application/json">${data}</script>`;
    // Before the app's own scripts: in the head, or straight after the doctype.
    const page = Buffer.from(html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : html.replace(/^(<!doctype html>)?/i, start => start + script));
    ctx.res.writeHead(200, { ...HEADERS, 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store', 'Content-Length': String(page.length) });
    ctx.res.end(ctx.req.method === 'HEAD' ? undefined : page);
  }
  async function serveFile(ctx: Context, file: string) {
    const full = path.resolve(dist, `.${file}`);
    if (!full.startsWith(dist + path.sep)) return send(ctx.res, 404, { error: 'Not found.' });
    let info; try { info = await stat(full); } catch { info = null; }
    if (!info?.isFile()) return send(ctx.res, 404, { error: 'Not found.' });
    const type = MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream';
    const cache = file.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : file.endsWith('.html') ? 'no-store' : 'no-cache';
    const headers: Record<string, string> = { ...HEADERS, 'Content-Type': type, 'Cache-Control': cache, 'Accept-Ranges': 'bytes' };
    // Videos play from ranges (Safari asks for them).
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(ctx.req.headers.range ?? ''));
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2])), end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start > end || start >= info.size) { ctx.res.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` }); ctx.res.end(); return; }
      ctx.res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Content-Length': String(end - start + 1) });
      if (ctx.req.method === 'HEAD') { ctx.res.end(); return; }
      createReadStream(full, { start, end }).pipe(ctx.res); return;
    }
    ctx.res.writeHead(200, { ...headers, 'Content-Length': String(info.size) });
    if (ctx.req.method === 'HEAD') { ctx.res.end(); return; }
    createReadStream(full).pipe(ctx.res);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse) {
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://localhost'); } catch { return send(res, 400, { error: 'Bad address.' }); }
    const token = readCookie(req), at = now();
    const session = sessionUser(db, token, at);
    if (session?.extended) res.setHeader('Set-Cookie', cookie(req, token!, SESSION_DAYS * 24 * 3600));
    const ctx: Context = { req, res, url, user: session?.user ?? null, token };
    try {
      if (url.pathname.startsWith('/api/')) {
        const match = routes.map(r => ({ r, m: req.method === r.method ? r.pattern.exec(url.pathname) : null })).find(x => x.m);
        if (!match) throw new HttpError(routes.some(r => r.pattern.test(url.pathname)) ? 405 : 404, 'Not found.');
        const { r, m } = match;
        if (r.access !== 'public' && !ctx.user) throw new HttpError(401, 'Sign in first.');
        if (r.access === 'admin' && ctx.user!.role !== 'admin') throw new HttpError(403, 'Only an admin can do that.');
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          // Requests that change things come from this site's own pages, as JSON.
          const origin = req.headers.origin;
          const host = (() => { try { return origin ? new URL(origin).host : null; } catch { return ''; } })();
          if (origin && host !== req.headers.host) throw new HttpError(403, 'Not from this site.');
          if (req.method !== 'DELETE' || req.headers['content-length']) {
            if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
            ctx.body = await readJson(req, r.limit);
          }
        }
        const result = await r.handle(ctx, m!.slice(1).map(decodeURIComponent));
        return send(res, result === undefined ? 204 : 200, result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Not allowed.');
      let file = pages[url.pathname] ?? decodeURIComponent(url.pathname);
      if (!ctx.user) {
        if (file === '/login.html' || signInFiles().has(file)) return await serveFile(ctx, file);
        // A page asks to sign in; anything else is refused.
        if (file.endsWith('.html') || String(req.headers.accept ?? '').includes('text/html')) {
          const next = url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`;
          res.writeHead(302, { ...HEADERS, Location: `/login${next}`, 'Cache-Control': 'no-store' }); res.end(); return;
        }
        throw new HttpError(401, 'Sign in first.');
      }
      if (file === '/login.html') { res.writeHead(302, { ...HEADERS, Location: '/', 'Cache-Control': 'no-store' }); res.end(); return; }
      if (file === '/admin.html' && ctx.user.role !== 'admin') { res.writeHead(302, { ...HEADERS, Location: '/', 'Cache-Control': 'no-store' }); res.end(); return; }
      if (file === '/index.html') return await serveApp(ctx);
      return await serveFile(ctx, file);
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      if (error instanceof URIError) return send(res, 400, { error: 'Bad address.' });
      log(`error ${req.method} ${url.pathname}: ${error instanceof Error ? error.stack : error}`);
      return send(res, 500, { error: 'Something went wrong on the server.' });
    }
  };
}

function readJson(req: IncomingMessage, limit: number) {
  return new Promise<unknown>((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) { reject(new HttpError(413, 'That is too big.')); req.resume(); return; }
    const chunks: Buffer[] = []; let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) { reject(new HttpError(413, 'That is too big.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(new HttpError(400, 'That is not JSON.')); } });
    req.on('error', reject);
  });
}
export { HttpError };
