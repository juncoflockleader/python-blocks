import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  build: { outDir: 'public/player', emptyOutDir: true, rolldownOptions: { input: 'player.html' } },
});
