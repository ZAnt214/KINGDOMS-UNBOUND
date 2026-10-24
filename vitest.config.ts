import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    env: { AUTH_RATE_PER_MINUTE: '10000' },
  },
});
