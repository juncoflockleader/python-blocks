import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';

function revision() {
  try { return execFileSync('git', ['describe', '--always', '--dirty'], { encoding: 'utf8' }).trim(); }
  catch { return 'unavailable'; }
}

export default defineConfig({
  define: { __APP_REVISION__: JSON.stringify(revision()) },
  test: { include: ['tests/unit/**/*.test.ts'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
