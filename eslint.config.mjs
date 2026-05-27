// Backend (Node.js / Vercel serverless) ESLint config.
// Web (Next.js) has its own config under web/.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

const sharedRules = {
  'no-unused-vars': 'off', // replaced by @typescript-eslint/no-unused-vars on TS files
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'prefer-const': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-var': 'error',
};

export default [
  {
    ignores: ['node_modules/**', '.vercel/**', 'web/**', 'scripts/**', 'tests/**', 'dist/**'],
  },
  js.configs.recommended,

  // Legacy JS files (during migration; will shrink to zero in Phase 2.5.0).
  {
    files: ['api/**/*.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...sharedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // TypeScript files (strict).
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['api/**/*.ts', 'lib/**/*.ts'],
  })),
  {
    files: ['api/**/*.ts', 'lib/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...sharedRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },

  prettier,
];
