import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../../worker/index';

/** The Cloudflare Worker in front of pythonblocks.org (worker/index.ts), with a stand-in for the built
 * files and for the backend: the API passed on with the secret, the pages behind a session, the
 * learner's work in the editor's page, and www sent to the site. */
const files: Record<string, string> = {
  '/index.html': '<!doctype html><html><head><script type="module" src="/assets/app-1.js"></script></head><body></body></html>',
  '/login.html': '<!doctype html><title>Sign in</title>',
  '/admin.html': '<!doctype html><title>Admin</title>',
  '/assets/app-1.js': '// app',
  '/gallery/clip.mp4': '0123456789'.repeat(100),
};
const assets = { fetch: vi.fn(async (request: Request) => {
  const body = files[new URL(request.url).pathname];
  return body === undefined ? new Response('Not found', { status: 404 }) : new Response(body, { headers: { 'Content-Type': 'text/html' } });
}) };
const env: Env = { ASSETS: assets, API_ORIGIN: 'https://api.blocks.test', SITE_HOST: 'blocks.test', PROXY_SECRET: 'worker-secret' };
const ada = { user: { id: 1, username: 'ada', displayName: 'Ada', role: 'learner' }, coins: 5, values: { 'python-blocks.title.v1': 'ids a$`b c$\'d e$&f g$$h </script> <!-- end' } };
const teacher = { ...ada, user: { ...ada.user, username: 'teacher', role: 'admin' } };

/** The backend: who the session cookie belongs to, and every request it was sent. */
function backend(sessions: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  const sent: Request[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const request = new Request(input, init); sent.push(request);
    if (new URL(request.url).pathname === '/api/boot') {
      const boot = sessions[(request.headers.get('cookie') ?? '').replace('pb_session=', '')];
      return boot ? Response.json(boot, { headers: extra }) : Response.json({ error: 'Sign in first.' }, { status: 401 });
    }
    return Response.json({ echo: request.method, body: request.method === 'GET' ? null : await request.text() }, { status: 201, headers: { 'Set-Cookie': 'pb_session=new; Path=/; HttpOnly' } });
  }));
  return sent;
}
const visit = (path: string, init: RequestInit & { host?: string } = {}) =>
  worker.fetch(new Request(`https://${init.host ?? 'blocks.test'}${path}`, { redirect: 'manual', ...init }), env);
afterEach(() => { vi.unstubAllGlobals(); assets.fetch.mockClear(); });

describe('the Worker', () => {
  it('sends www.<the site> to the site itself, keeping the path', async () => {
    const res = await visit('/login?next=%2F', { host: 'www.blocks.test' });
    expect([res.status, res.headers.get('location')]).toEqual([301, 'https://blocks.test/login?next=%2F']);
  });

  it('passes the API to the backend with its secret and the learner\'s address, and passes the answer back', async () => {
    const sent = backend();
    const res = await visit('/api/projects?x=1', { method: 'POST', body: '{"title":"Rocket"}', headers: { 'Content-Type': 'application/json', Cookie: 'pb_session=abc', 'CF-Connecting-IP': '203.0.113.9', 'X-PB-Proxy': 'forged', 'X-Forwarded-For': '10.0.0.1' } });
    expect(res.status).toBe(201); expect(res.headers.get('set-cookie')).toBe('pb_session=new; Path=/; HttpOnly');
    expect(await res.json()).toEqual({ echo: 'POST', body: '{"title":"Rocket"}' });
    const [request] = sent;
    expect(request.url).toBe('https://api.blocks.test/api/projects?x=1');
    expect([request.headers.get('x-pb-proxy'), request.headers.get('x-forwarded-for'), request.headers.get('x-forwarded-proto'), request.headers.get('cookie'), request.headers.get('content-type')])
      .toEqual(['worker-secret', '203.0.113.9', 'https', 'pb_session=abc', 'application/json']);
  });

  it('sends signed-out visitors from the editor and admin pages to sign in, and shows them the sign-in page', async () => {
    backend();
    for (const [path, to] of [['/', '/login'], ['/index.html', '/login?next=%2Findex.html'], ['/admin', '/login?next=%2Fadmin']]) {
      const res = await visit(path, { headers: { Cookie: 'pb_session=old' } });
      expect([res.status, res.headers.get('location')], path).toEqual([302, to]);
    }
    const login = await visit('/login');
    expect([login.status, await login.text()]).toEqual([200, files['/login.html']]);
    expect([login.headers.get('cross-origin-opener-policy'), login.headers.get('cross-origin-embedder-policy'), login.headers.get('cache-control')]).toEqual(['same-origin', 'require-corp', 'no-store']);
  });

  it('serves the editor with the learner\'s account and work in it, exactly as it is, and passes on an extended session', async () => {
    const sent = backend({ ada }, { 'Set-Cookie': 'pb_session=ada; Path=/; HttpOnly; Max-Age=2592000' });
    const res = await visit('/', { headers: { Cookie: 'pb_session=ada', 'CF-Connecting-IP': '203.0.113.9' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBe('pb_session=ada; Path=/; HttpOnly; Max-Age=2592000');
    expect([res.headers.get('content-type'), res.headers.get('cache-control'), res.headers.get('cross-origin-embedder-policy')]).toEqual(['text/html; charset=utf-8', 'no-store', 'require-corp']);
    const html = await res.text();
    expect(JSON.parse(/<script id="pb-account" type="application\/json">(.*?)<\/script>/.exec(html)![1])).toEqual(ada);
    expect(html.match(/<script/g)).toHaveLength(2);
    // In the head: the app's module script runs once the page is parsed, so the data is there for it.
    expect(html.indexOf('pb-account')).toBeLessThan(html.indexOf('</head>'));
    expect([sent[0].headers.get('x-pb-proxy'), sent[0].headers.get('x-forwarded-for')]).toEqual(['worker-secret', '203.0.113.9']);
  });

  it('keeps the admin page to admins, and sends a signed-in learner from the sign-in page to the editor', async () => {
    backend({ ada, teacher });
    const learner = await visit('/admin', { headers: { Cookie: 'pb_session=ada' } });
    expect([learner.status, learner.headers.get('location')]).toEqual([302, '/']);
    const admin = await visit('/admin', { headers: { Cookie: 'pb_session=teacher' } });
    expect([admin.status, await admin.text()]).toEqual([200, files['/admin.html']]);
    const login = await visit('/login', { headers: { Cookie: 'pb_session=ada' } });
    expect([login.status, login.headers.get('location')]).toEqual([302, '/']);
  });

  it('answers the ranges of videos that Safari asks for', async () => {
    const part = await visit('/gallery/clip.mp4', { headers: { Range: 'bytes=0-99' } });
    expect([part.status, part.headers.get('content-range'), part.headers.get('content-length'), (await part.text()).length]).toEqual([206, 'bytes 0-99/1000', '100', 100]);
    const tail = await visit('/gallery/clip.mp4', { headers: { Range: 'bytes=-10' } });
    expect([tail.status, tail.headers.get('content-range'), await tail.text()]).toEqual([206, 'bytes 990-999/1000', '0123456789']);
    expect((await visit('/gallery/clip.mp4', { headers: { Range: 'bytes=2000-' } })).status).toBe(416);
    const whole = await visit('/gallery/clip.mp4');
    expect([whole.status, whole.headers.get('accept-ranges'), (await whole.text()).length]).toEqual([200, 'bytes', 1000]);
  });

  it('leaves every other file to Cloudflare\'s static files, and says so when the backend is down', async () => {
    backend();
    expect(await (await visit('/assets/app-1.js')).text()).toBe('// app');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    expect((await visit('/api/me')).status).toBe(502);
    expect((await visit('/')).status).toBe(502);
  });
});
