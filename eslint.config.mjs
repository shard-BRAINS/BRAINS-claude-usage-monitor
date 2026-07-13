// Flat config for ESLint 9+. Mirrors the behaviour of the previous
// .eslintrc.cjs: root config, TypeScript parser, ESLint + @typescript-eslint
// recommended rules, one custom no-unused-vars override that ignores names
// prefixed with `_`. Node globals apply to all TS (extension host code +
// tests); browser globals apply to the webview script.

import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  globalThis: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'writable',
};

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.vscode-test/**', '.brains-build/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: nodeGlobals,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // TypeScript already checks for undefined identifiers (and understands
      // type-only names like Thenable that ESLint's no-undef can't see);
      // enabling this rule on .ts files just produces false positives.
      // Per typescript-eslint.io/docs/linting/troubleshooting.
      'no-undef': 'off',
    },
  },
  {
    files: ['src/ui/webview/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: browserGlobals,
    },
  },
];
