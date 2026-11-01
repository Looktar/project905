// ESLint flat config. Dev-only: the game itself ships as plain ES modules (D-08).
// Goal (D-09): catch real problems (undefined names, typos, unreachable code),
// not enforce a style. The compact one-line style of the codebase is intentional.
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**', 'data/**', 'maps/**', 'docs/**',
      'test-results/**', 'playwright-report/**',
      '.claude/**', // agent worktrees live inside the main checkout
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      // unused code is worth seeing, but must not block a merge
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // `try { … } catch (e) { /* ignore */ }` is used on purpose (fullscreen, localStorage, audio)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // deliberate debug switches such as `cond || true` / `cond && false` are reported, not fatal
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-constant-binary-expression': 'warn',
      // flags the common `let a = 0; if (…) a = 1; else a = 2;` pattern: noise here
      'no-useless-assignment': 'off',
      // `let a = 1, b = …` style declarations are fine; stylistic rules stay off (no Prettier, D-09)
      'prefer-const': 'off',
    },
  },
  {
    // Node-side code: tests, tools, config files
    files: ['tests/**', 'tools/**', '*.config.js', '*.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
