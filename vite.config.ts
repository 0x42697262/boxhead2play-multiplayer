import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2023',
    sourcemap: true,
  },
  test: {
    include: ['test/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
