import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
