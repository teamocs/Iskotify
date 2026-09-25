// ESLint flat config for the admin console, run with the ESLint CLI (`pnpm lint`).
// `next lint` is deprecated in Next 15.5 and removed in 16, and prompts for
// setup when it finds no config, so it is not used.
//
// eslint-config-next 15 ships only legacy (.eslintrc) presets, so FlatCompat
// adapts them. `@eslint/eslintrc` is a dependency of `eslint` itself and is
// always resolvable here (the workspace uses node-linker=hoisted).
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts', 'public/**'],
  },
  // Core Web Vitals + React + hooks + import + a subset of jsx-a11y, then the TypeScript rules.
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  // The full jsx-a11y recommended set (eslint-config-next already installs the plugin).
  ...compat.config({ extends: ['plugin:jsx-a11y/recommended'] }),
  {
    rules: {
      // Stylistic: `_`-prefixed names mark deliberately unused parameters and bindings.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Tests build loose mocks (chainable Supabase stubs, partial Responses).
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'vitest.setup.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@next/next/no-img-element': 'off',
    },
  },
]
