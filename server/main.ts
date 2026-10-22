import { createServer } from 'node:http';
import path from 'node:path';
import { openDatabase } from './db.ts';
import { createApp } from './app.ts';
import { pruneSessions } from './auth.ts';
import { ensureAdmin } from './accounts.ts';

/** Start the Python Blocks server. Settings come from the environment:
 *   PORT (8787) and HOST (127.0.0.1; 0.0.0.0 to listen on every address),
 *   DATA_DIR (./data, where python-blocks.sqlite lives), DIST_DIR (./dist), CONTENT_DIR (./content),
 *   COOKIE_SECURE (auto, true or false) and TRUST_PROXY (1 behind a reverse proxy such as Caddy or nginx),
 *   CANONICAL_HOST (the site's address, such as pythonblocks.org: www.<it> redirects there),
 *   ADMIN_USERNAME and ADMIN_PASSWORD (make the first admin when the server has no admin yet). */
const env = process.env, root = process.cwd();
const db = openDatabase(path.resolve(root, env.DATA_DIR ?? 'data', 'python-blocks.sqlite'));
await ensureAdmin(db, env.ADMIN_USERNAME, env.ADMIN_PASSWORD, line => console.log(line));
const secure = env.COOKIE_SECURE === 'true' ? true : env.COOKIE_SECURE === 'false' ? false : 'auto';
const app = createApp({ db, dist: path.resolve(root, env.DIST_DIR ?? 'dist'), content: path.resolve(root, env.CONTENT_DIR ?? 'content'), secureCookies: secure, trustProxy: env.TRUST_PROXY === '1', canonicalHost: env.CANONICAL_HOST || undefined, log: line => console.log(`${new Date().toISOString()} ${line}`) });
const port = Number(env.PORT ?? 8787), host = env.HOST ?? '127.0.0.1';
createServer((req, res) => { void app(req, res); }).listen(port, host, () => console.log(`Python Blocks is at http://${host}:${port}`));
setInterval(() => pruneSessions(db, Date.now()), 3600_000).unref();
