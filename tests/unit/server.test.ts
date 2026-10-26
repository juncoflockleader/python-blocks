import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../server/db';
import { createApp } from '../../server/app';
import { addUser } from '../../server/accounts';
import { COINS } from '../../server/rewards';
import { scryptSync } from 'node:crypto';
import { hashPassword, needsRehash, verifyPassword } from '../../server/auth';

/** The server, run on a free port with a fresh database and a small stand-in for the built app:
 * signing in, what is served before and after, saved programs, synced state, coins and the admin API. */
let server: Server, base = '', dir = '';
const db = openDatabase(':memory:');
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'pb-server-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html><head><script type="module" src="/assets/app-1.js"></script></head><body></body></html>');
  writeFileSync(path.join(dir, 'login.html'), '<!doctype html><link rel="icon" href="/assets/logo-1.svg"><script type="module" src="/assets/login-1.js"></script>');
  writeFileSync(path.join(dir, 'admin.html'), '<!doctype html><script type="module" src="/assets/admin-1.js"></script>');
  for (const name of ['app-1.js', 'login-1.js', 'admin-1.js']) writeFileSync(path.join(dir, 'assets', name), `// ${name}`);
  writeFileSync(path.join(dir, 'assets', 'logo-1.svg'), '<svg/>');
  writeFileSync(path.join(dir, 'clip.mp4'), Buffer.alloc(1000, 7));
  await addUser(db, 'ada', 'Ada', 'bananas', 'learner');
  await addUser(db, 'bob', 'Bob', 'cherries', 'learner');
  await addUser(db, 'teacher', 'Ms Lee', 'apples!', 'admin');
  const app = createApp({ db, dist: dir, content: path.resolve('content'), secureCookies: false, canonicalHost: 'blocks.test' });
  server = createServer((req, res) => { void app(req, res); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

const json = { 'Content-Type': 'application/json' };
async function signIn(username: string, password: string) {
  const res = await fetch(`${base}/api/login`, { method: 'POST', headers: json, body: JSON.stringify({ username, password }) });
  return { res, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] };
}
const as = (cookie: string) => ({
  get: (url: string) => fetch(`${base}${url}`, { headers: { cookie }, redirect: 'manual' }),
  send: (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${url}`, { method, headers: { cookie, ...json, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
});

describe('server', () => {
  it('sends www.<the site> to the site itself, keeping the path', async () => {
    const { request } = await import('node:http');
    const res = await new Promise<import('node:http').IncomingMessage>(resolve => request(`${base}/login?next=%2F`, { headers: { host: 'www.blocks.test' } }, resolve).end());
    expect([res.statusCode, res.headers.location]).toEqual([301, 'https://blocks.test/login?next=%2F']);
  });

  it('stores passwords as salted scrypt hashes', async () => {
    const one = await hashPassword('bananas'), two = await hashPassword('bananas');
    expect(one).toMatch(/^scrypt\$32768\$8\$1\$/); expect(one).not.toBe(two);
    expect(await verifyPassword('bananas', one)).toBe(true); expect(await verifyPassword('banana', one)).toBe(false);
  });

  it('keeps passwords hashed at an older cost working, and hashes them again at sign-in', async () => {
    const salt = Buffer.alloc(16, 3), old = `scrypt$16384$8$1$${salt.toString('base64')}$${scryptSync('plums', salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64')}`;
    expect(await verifyPassword('plums', old)).toBe(true); expect(await verifyPassword('plum', old)).toBe(false);
    expect(await verifyPassword('plums', old.replace('$16384$', '$123$'))).toBe(false);
    const id = await addUser(db, 'dee', 'Dee', 'plums', 'learner');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(old, id);
    expect((await signIn('dee', 'plums')).res.status).toBe(200);
    const now = (db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id) as { password_hash: string }).password_hash;
    expect([needsRehash(old), needsRehash(now)]).toEqual([true, false]);
    expect((await signIn('dee', 'plums')).res.status).toBe(200);
  });

  it('shows only the sign-in page and its files before signing in', async () => {
    const page = await fetch(`${base}/`, { redirect: 'manual', headers: { accept: 'text/html' } });
    expect([page.status, page.headers.get('location')]).toEqual([302, '/login']);
    const deep = await fetch(`${base}/admin`, { redirect: 'manual', headers: { accept: 'text/html' } });
    expect(deep.headers.get('location')).toBe('/login?next=%2Fadmin');
    expect((await fetch(`${base}/assets/app-1.js`)).status).toBe(401);
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
    for (const url of ['/login', '/assets/login-1.js', '/assets/logo-1.svg']) expect((await fetch(`${base}${url}`)).status, url).toBe(200);
    // The app is cross-origin isolated, for the Python worker's shared memory.
    const login = await fetch(`${base}/login`);
    expect([login.headers.get('cross-origin-opener-policy'), login.headers.get('cross-origin-embedder-policy'), login.headers.get('content-type')]).toEqual(['same-origin', 'require-corp', 'text/html; charset=utf-8']);
  });

  it('signs in with a username and password, keeps a session in an HttpOnly cookie, and signs out', async () => {
    expect((await signIn('ada', 'wrong')).res.status).toBe(401);
    expect((await signIn('nobody', 'bananas')).res.status).toBe(401);
    const { res, cookie } = await signIn('ADA', 'bananas');
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/^pb_session=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000$/);
    expect(await res.json()).toEqual({ user: { id: 1, username: 'ada', displayName: 'Ada', role: 'learner' }, coins: 0 });
    const me = as(cookie);
    // The editor's page carries the learner's account and saved work, so it starts with them.
    const page = await me.get('/');
    expect(page.status).toBe(200);
    const boot = JSON.parse(/<script id="pb-account" type="application\/json">(.*?)<\/script>/.exec(await page.text())![1]);
    expect(boot).toEqual({ user: { id: 1, username: 'ada', displayName: 'Ada', role: 'learner' }, coins: 0, values: {} });
    expect((await me.get('/assets/app-1.js')).status).toBe(200);
    // Saved work goes in the page exactly as it is: block ids have $ and ` in them, which a replacement
    // string would take for $` (the page before), $' (the page after), $& and $$.
    const work = 'ids a$`b c$\'d e$&f g$$h </script> <!-- end';
    expect((await me.send('PUT', '/api/data', { values: { 'python-blocks.title.v1': work } })).status).toBe(204);
    const html = await (await me.get('/')).text();
    expect(JSON.parse(/<script id="pb-account" type="application\/json">(.*?)<\/script>/.exec(html)![1]).values['python-blocks.title.v1']).toBe(work);
    expect(html.match(/<script/g)).toHaveLength(2);
    expect((await me.send('PUT', '/api/data', { values: { 'python-blocks.title.v1': null } })).status).toBe(204);
    expect((await me.get('/login')).headers.get('location')).toBe('/');
    // Learners do not get the admin page.
    expect((await me.get('/admin')).headers.get('location')).toBe('/');
    expect((await me.send('POST', '/api/logout')).status).toBe(204);
    expect((await me.get('/api/me')).status).toBe(401);
  });

  it('slows down guessing, refuses other sites and non-JSON requests, and serves video ranges', async () => {
    for (let i = 0; i < 10; i++) await signIn('bob', `guess${i}`);
    expect((await signIn('bob', 'cherries')).res.status).toBe(429);
    const { cookie } = await signIn('ada', 'bananas'), me = as(cookie);
    expect((await me.send('PATCH', '/api/me', { displayName: 'X' }, { origin: 'https://elsewhere.example' })).status).toBe(403);
    expect((await me.send('PATCH', '/api/me', { displayName: 'X' }, { origin: 'null' })).status).toBe(403);
    expect((await fetch(`${base}/api/me`, { method: 'PATCH', headers: { cookie, 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    const part = await fetch(`${base}/clip.mp4`, { headers: { cookie, range: 'bytes=0-99' } });
    expect([part.status, part.headers.get('content-range'), (await part.arrayBuffer()).byteLength]).toEqual([206, 'bytes 0-99/1000', 100]);
    expect((await me.get('/../server.test.ts')).status).toBe(404);
  });

  it('lets a learner rename themself and change their password', async () => {
    const { cookie } = await signIn('ada', 'bananas'), me = as(cookie);
    expect((await (await me.send('PATCH', '/api/me', { displayName: '  Ada L.  ' })).json()).user.displayName).toBe('Ada L.');
    expect((await me.send('POST', '/api/me/password', { current: 'nope', next: 'melons' })).status).toBe(403);
    const changed = await me.send('POST', '/api/me/password', { current: 'bananas', next: 'melons' });
    expect(changed.status).toBe(204);
    // This device stays signed in with a new session; the old one ends.
    const fresh = (changed.headers.get('set-cookie') ?? '').split(';')[0];
    expect((await as(cookie).get('/api/me')).status).toBe(401); expect((await as(fresh).get('/api/me')).status).toBe(200);
    expect((await signIn('ada', 'melons')).res.status).toBe(200);
  });

  it('saves, lists, opens, renames and deletes a learner’s own programs, and nobody else’s', async () => {
    const ada = as((await signIn('ada', 'melons')).cookie), bo = as((await signIn('teacher', 'apples!')).cookie);
    const project = { format: 'python-blocks', formatVersion: 1, workspace: { blocks: { blocks: [] } } };
    const made = await (await ada.send('POST', '/api/projects', { title: 'Rocket', data: project })).json() as { id: string };
    expect(made.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await (await ada.get('/api/projects')).json()).projects.map((p: { title: string }) => p.title)).toEqual(['Rocket']);
    expect(await (await ada.get(`/api/projects/${made.id}`)).json()).toMatchObject({ title: 'Rocket', data: project });
    expect((await ada.send('PUT', `/api/projects/${made.id}`, { title: 'Moon rocket' })).status).toBe(200);
    expect((await (await ada.get(`/api/projects/${made.id}`)).json()).title).toBe('Moon rocket');
    expect((await bo.get(`/api/projects/${made.id}`)).status).toBe(404);
    expect((await bo.send('DELETE', `/api/projects/${made.id}`)).status).toBe(404);
    expect((await ada.send('POST', '/api/projects', { title: 'x', data: 'not a project' })).status).toBe(400);
    expect((await ada.send('DELETE', `/api/projects/${made.id}`)).status).toBe(204);
    expect((await (await ada.get('/api/projects')).json()).projects).toEqual([]);
  });

  it('keeps each learner’s synced browser state, only for known keys', async () => {
    const ada = as((await signIn('ada', 'melons')).cookie);
    expect((await ada.send('PUT', '/api/data', { values: { 'python-blocks-level': 'builder', 'python-blocks.title.v1': 'Rocket' } })).status).toBe(204);
    expect((await ada.send('PUT', '/api/data', { values: { 'python-blocks.title.v1': null } })).status).toBe(204);
    expect(await (await ada.get('/api/data')).json()).toEqual({ values: { 'python-blocks-level': 'builder' } });
    expect((await ada.send('PUT', '/api/data', { values: { 'secret.key': 'x' } })).status).toBe(400);
  });

  it('awards coins once for each lesson, unit, mastery and build, from the content', async () => {
    const ada = as((await signIn('ada', 'melons')).cookie);
    const award = async (key: string) => (await ada.send('POST', '/api/awards', { award: key })).json() as Promise<{ awarded: number; balance: number }>;
    expect(await award('lesson:brick-breaker')).toMatchObject({ awarded: COINS.lesson, balance: 100 });
    expect(await award('lesson:brick-breaker')).toMatchObject({ awarded: 0, balance: 100 });
    expect(await award('unit:unit-1-1')).toMatchObject({ awarded: COINS.unit });
    expect(await award('mastery:unit-1-1')).toMatchObject({ awarded: COINS.mastery });
    expect(await award('unit:unit-1-4')).toMatchObject({ awarded: COINS.capstone });   // the chapter's big project
    expect(await award('build:maze-run')).toMatchObject({ awarded: COINS.build, balance: 280 });
    expect((await ada.send('POST', '/api/awards', { award: 'lesson:no-such-lesson' })).status).toBe(400);
    expect((await ada.send('POST', '/api/awards', { award: 'mastery:unit-1-4' })).status).toBe(400);   // a big project has no mastery
    const coins = await (await ada.get('/api/coins')).json();
    expect(coins.balance).toBe(280); expect(coins.history[0]).toMatchObject({ amount: 30, kind: 'award', title: 'Guided build: Maze run' });
    expect(coins.awards).toHaveLength(5);
  });

  it('lets an admin add learners, reset passwords, turn accounts off, see progress and give coins', async () => {
    const ada = as((await signIn('ada', 'melons')).cookie), admin = as((await signIn('teacher', 'apples!')).cookie);
    expect((await ada.get('/api/admin/users')).status).toBe(403);
    const added = await admin.send('POST', '/api/admin/users', { username: 'cyd', displayName: 'Cy', password: 'grapes' });
    expect((await added.json()).user).toMatchObject({ username: 'cyd', role: 'learner' });
    expect((await admin.send('POST', '/api/admin/users', { username: 'CYD', displayName: 'Again', password: 'grapes' })).status).toBe(409);
    expect((await admin.send('POST', '/api/admin/users', { username: 'no spaces', displayName: 'X', password: 'grapes' })).status).toBe(400);
    const list = (await (await admin.get('/api/admin/users')).json()).users as { username: string; coins: number; id: number }[];
    expect(list.map(u => u.username)).toEqual(['teacher', 'ada', 'bob', 'cyd', 'dee']);
    const adaId = list.find(u => u.username === 'ada')!.id;
    expect(list.find(u => u.username === 'ada')!.coins).toBe(280);
    // A new password signs the learner out everywhere; turning the account off stops them signing in.
    const cy = as((await signIn('cyd', 'grapes')).cookie), cyId = list.find(u => u.username === 'cyd')!.id;
    expect((await admin.send('PATCH', `/api/admin/users/${cyId}`, { password: 'kiwis' })).status).toBe(200);
    expect((await cy.get('/api/me')).status).toBe(401);
    expect((await signIn('cyd', 'kiwis')).res.status).toBe(200);
    expect((await admin.send('PATCH', `/api/admin/users/${cyId}`, { disabled: true })).status).toBe(200);
    expect((await signIn('cyd', 'kiwis')).res.status).toBe(403);
    // An admin cannot lock themself out.
    const me = list.find(u => u.username === 'teacher')!.id;
    expect((await admin.send('PATCH', `/api/admin/users/${me}`, { disabled: true })).status).toBe(409);
    expect((await admin.send('PATCH', `/api/admin/users/${me}`, { role: 'learner' })).status).toBe(409);
    const detail = await (await admin.get(`/api/admin/users/${adaId}`)).json();
    expect(detail.coins.balance).toBe(280); expect(detail.awards).toContain('lesson:brick-breaker'); expect(detail.academy).toBeNull();
    expect((await admin.send('POST', `/api/admin/users/${adaId}/coins`, { amount: 20, note: 'Great helping' })).status).toBe(200);
    expect((await admin.send('POST', `/api/admin/users/${adaId}/coins`, { amount: -1000 })).status).toBe(409);
    const coins = await (await ada.get('/api/coins')).json();
    expect(coins.balance).toBe(300); expect(coins.history[0]).toMatchObject({ amount: 20, kind: 'admin', note: 'Great helping', title: 'From your teacher' });
  });
});
