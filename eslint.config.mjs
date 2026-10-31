// ESLint flat config for the web workspaces (packages/*). The iPhone app has its own (expo lint).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-*/**', '**/node_modules/**', 'apps/**', 'e2e/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  {
    // `any` and loose callback types are tolerated (admin, AI reviewer, socket acks) but flagged.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
    },
  },
  {
    // Offline benchmark scripts, never shipped: keep their experiment helpers around.
    files: ['packages/server/src/{simulate,simulate-play,versus-sim,bias-test}.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['packages/client/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // These executors await ensureConnected() inside try/catch and resolve on every path.
    files: ['packages/client/src/stores/roomStore.ts'],
    rules: { 'no-async-promise-executor': 'off' },
  },
);
