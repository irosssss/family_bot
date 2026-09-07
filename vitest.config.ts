import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/target/**'],
    environment: 'node',
    // Модули приложения импортируют window в местах — но тестируемые
    // (telegramAuth, assigneeService, streakService) — чистые node-модули.
    testTimeout: 10_000,
  },
});
