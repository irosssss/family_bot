import { defineConfig } from 'vitest/config';

export default defineConfig({ test: {
  include: ['tests/target/**/*.test.ts'],
  environment: 'node', testTimeout: 20000, hookTimeout: 30000,
  fileParallelism: false,
} });
