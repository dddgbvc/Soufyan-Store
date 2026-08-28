import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Component. The suite drives
      // the same server modules directly, so it resolves to a no-op stub.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
      '@': src,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/helpers/setup.ts'],
    // Every suite shares one Postgres instance; keep them from racing.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
  },
});
