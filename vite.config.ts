import { defineConfig } from 'vitest/config';
import { webManifestPlugin } from './tools/build/webManifest.ts';
import { onlineServerPlugin } from './tools/dev/onlineServerPlugin.ts';

export default defineConfig(({ isSsrBuild }) => ({
  base: './',
  plugins: [onlineServerPlugin(), webManifestPlugin()],
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
