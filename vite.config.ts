import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        seeds: resolve(import.meta.dirname, 'seeds.html'),
        compare: resolve(import.meta.dirname, 'compare.html'),
      },
    },
  },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60000 },
} as never);
