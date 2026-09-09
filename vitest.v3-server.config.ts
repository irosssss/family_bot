import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { include: ['tests/v3-server/**/*.test.ts'], environment: 'node', fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000 },
});
