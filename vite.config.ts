import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 60000 },
} as never);
