import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5199,
    strictPort: true,
  },
  preview: {
    port: 4199,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
