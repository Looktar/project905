import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // only the repo's own unit tests (agent worktrees live under .claude/)
    include: ['tests/unit/**/*.test.js'],
    exclude: ['.claude/**', 'node_modules/**', 'test-results/**'],
    setupFiles: ['tests/helpers/setup.js'],
    testTimeout: 60000, // long headless simulations on the bigger v0.2 map are slow on CI runners
    hookTimeout: 30000,
  },
});
