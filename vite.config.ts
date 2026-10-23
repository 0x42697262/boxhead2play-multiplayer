import { defineConfig } from 'vitest/config';
import { onlineServerPlugin } from './tools/dev/onlineServerPlugin.ts';

export default defineConfig(({ isSsrBuild }) => ({
  base: './',
  plugins: [onlineServerPlugin()],
  build: {
    target: 'es2023',
    sourcemap: true,
    copyPublicDir: !isSsrBuild,
  },
  test: {
    include: ['test/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
}));
