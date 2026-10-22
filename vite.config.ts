import { defineConfig, type Plugin } from 'vitest/config';
import { execFileSync } from 'node:child_process';

function revision() {
  try { return execFileSync('git', ['describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); }
  catch { return 'unavailable'; }
}
/** /login and /admin are the sign-in and admin pages, as the server serves them. */
const pages = (): Plugin => {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query] = (req.url ?? '').split('?');
    if (path === '/login' || path === '/admin') req.url = `${path}.html${query ? `?${query}` : ''}`;
    next();
  };
  return { name: 'python-blocks-pages', configureServer: server => { server.middlewares.use(rewrite); }, configurePreviewServer: server => { server.middlewares.use(rewrite); } };
};
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };

export default defineConfig({
  define: { __APP_REVISION__: JSON.stringify(revision()) },
  plugins: [pages()],
  build: { rolldownOptions: { input: { main: 'index.html', login: 'login.html', admin: 'admin.html' } } },
  test: { include: ['tests/unit/**/*.test.ts'] },
  server: { port: 5173, strictPort: true, headers: isolation },
  preview: { port: 4173, strictPort: true, headers: isolation },
});
