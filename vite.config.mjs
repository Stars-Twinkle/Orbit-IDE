import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: 'src/renderer',
  publicDir: false,
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    target: 'chrome130',
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
  },
  server: {
    port: 5273,
    strictPort: true,
  },
});
