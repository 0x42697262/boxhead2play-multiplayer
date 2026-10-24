import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023',
    outDir: 'dist',
    emptyOutDir: false,
    copyPublicDir: false,
    sourcemap: true,
    lib: {
      entry: 'src/entry/serviceWorker.ts',
      formats: ['iife'],
      name: 'boxheadServiceWorker',
      fileName: () => 'sw.js',
    },
  },
});
