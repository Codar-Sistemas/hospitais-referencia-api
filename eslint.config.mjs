// Backend (Node.js / Vercel serverless) ESLint config.
// Web (Next.js) has its own config under web/.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['node_modules/**', '.vercel/**', 'web/**', 'scripts/**', 'tests/**'],
  },
  js.configs.recommended,
  {
    files: ['api/**/*.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
    },
  },
  prettier,
];
