import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // only the repo's own unit tests (agent worktrees live under .claude/)
    include: ['tests/unit/**/*.test.js'],
    exclude: ['.claude/**', 'node_modules/**', 'test-results/**'],
    setupFiles: ['tests/helpers/setup.js'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
