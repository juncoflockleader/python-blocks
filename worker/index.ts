/** pythonblocks.org on Cloudflare. The built app (dist/) is served as static files, straight from
 * Cloudflare; this Worker runs only for the pages and the API (run_worker_first in wrangler.jsonc):
 * - /api/* goes to the backend on Linode (server/, API_ONLY) with the secret it asks for, so it can
 *   be reached only through here, and the learner's address for its sign-in throttle;
 * - the editor and admin pages need a session, as when the server served them: signed out goes to
 *   /login, and the editor's page carries the learner's account and synced work (#pb-account), so
 *   the editor starts with them at once (src/account/session.ts);
 * - videos answer ranges: Safari plays nothing without them, and the static files send the whole file;
 * - www.<the site> goes to the site itself, so sign-in cookies belong to one address. */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** The backend, such as https://api.pythonblocks.org. */
  API_ORIGIN: string;
  /** The site's address, pythonblocks.org. */
  SITE_HOST: string;
  /** Sent as X-PB-Proxy; the backend's PROXY_SECRET. */
  PROXY_SECRET: string;
}

// Python runs in a worker that shares memory with the page (for the debugger), which needs cross-origin isolation.
// public/_headers sets the same on every file.
const HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN',
};
type Page = 'editor' | 'admin' | 'login';
const PAGES: Record<string, Page> = { '/': 'editor', '/index.html': 'editor', '/admin': 'admin', '/admin.html': 'admin', '/login': 'login', '/login.html': 'login' };
const FILES: Record<Page, string> = { editor: '/index.html', admin: '/admin.html', login: '/login.html' };
interface Boot { user: { role: string }; coins: number; values: Record<string, string> }

/** A request to the backend, as from this site, for the learner who sent `from`. */
function toBackend(env: Env, from: Request, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-PB-Proxy', env.PROXY_SECRET);
  headers.set('X-Forwarded-For', from.headers.get('CF-Connecting-IP') ?? '');
  headers.set('X-Forwarded-Proto', 'https');
  return fetch(`${env.API_ORIGIN}${path}`, { ...init, headers, redirect: 'manual' });
}

async function api(request: Request, env: Env, url: URL) {
  const headers = new Headers(request.headers);
  for (const name of ['host', 'cf-connecting-ip', 'x-forwarded-for', 'x-forwarded-proto', 'x-pb-proxy']) headers.delete(name);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer();
  try { return await toBackend(env, request, url.pathname + url.search, { method: request.method, headers, body }); }
  catch { return Response.json({ error: 'The server is not answering. Try again in a minute.' }, { status: 502, headers: HEADERS }); }
}

const redirect = (location: string, setCookie: string[]) => {
  const headers = new Headers({ ...HEADERS, Location: location, 'Cache-Control': 'no-store' });
  for (const value of setCookie) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
};

async function page(request: Request, env: Env, url: URL, which: Page) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return Response.json({ error: 'Not allowed.' }, { status: 405, headers: HEADERS });
  // Who is signed in. A session near its end is extended, and the backend sends the new cookie with it.
  let answer: Response;
  try { answer = await toBackend(env, request, '/api/boot', { headers: { Cookie: request.headers.get('Cookie') ?? '' } }); }
  catch { answer = new Response(null, { status: 502 }); }
  if (answer.status !== 200 && answer.status !== 401) return new Response('The server is not answering. Try again in a minute.', { status: 502, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  const boot = answer.status === 200 ? await answer.json() as Boot : null, setCookie = answer.headers.getSetCookie();
  if (!boot && which !== 'login') return redirect(`/login${url.pathname === '/' ? '' : `?next=${encodeURIComponent(url.pathname + url.search)}`}`, setCookie);
  if (boot && which === 'login') return redirect('/', setCookie);
  if (boot && which === 'admin' && boot.user.role !== 'admin') return redirect('/', setCookie);

  const file = await env.ASSETS.fetch(new Request(new URL(FILES[which], url)));
  if (!file.ok) return file;
  let html = await file.text();
  if (which === 'editor') {
    const script = `<script id="pb-account" type="application/json">${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>`;
    // Before the app's own scripts. Insert with a function: a replacement string would read $` $' $& and $$
    // in the learner's work (Blockly's block ids have them) as patterns.
    html = html.includes('</head>') ? html.replace('</head>', () => `${script}</head>`) : html.replace(/^(<!doctype html>)?/i, start => start + script);
  }
  const headers = new Headers({ ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const value of setCookie) headers.append('Set-Cookie', value);
  return new Response(request.method === 'HEAD' ? null : html, { status: 200, headers });
}

/** A video, or the range of it the browser asks for (the lessons', recipes' and gallery's clips are small). */
async function video(request: Request, env: Env) {
  const file = await env.ASSETS.fetch(request);
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') ?? '');
  const headers = new Headers(file.headers);
  headers.set('Accept-Ranges', 'bytes');
  if (!file.ok || !range || (!range[1] && !range[2])) return new Response(file.body, { status: file.status, headers });
  const body = await file.arrayBuffer(), size = body.byteLength;
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2])), end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start > end || start >= size) { headers.set('Content-Range', `bytes */${size}`); headers.delete('Content-Length'); return new Response(null, { status: 416, headers }); }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`); headers.set('Content-Length', String(end - start + 1));
  return new Response(request.method === 'HEAD' ? null : body.slice(start, end + 1), { status: 206, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === `www.${env.SITE_HOST}`) return new Response(null, { status: 301, headers: { Location: `https://${env.SITE_HOST}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    if (/\.(mp4|webm)$/.test(url.pathname)) return video(request, env);
    const which = PAGES[url.pathname];
    return which ? page(request, env, url, which) : env.ASSETS.fetch(request);
  },
};
