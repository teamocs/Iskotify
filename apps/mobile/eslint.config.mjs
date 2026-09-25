// ESLint flat config for the mobile app, run with the ESLint CLI (`pnpm lint`).
//
// eslint-config-expo is Expo's official preset (~10.0.0 is the version SDK 54
// pins): core + TypeScript + React + react-hooks + import rules, with the React
// Native globals. Type checking stays in `type-check` (tsc); this is the rule gate.
import expoConfig from 'eslint-config-expo/flat.js'

export default [
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'node_modules/**',
      'coverage/**',
      'android/**',
      'ios/**',
      'public/**',
      'expo-env.d.ts',
    ],
  },
  ...expoConfig,
  {
    // Stale suppressions fail the gate. react-doctor suppressions use its native
    // `// react-doctor-disable-next-line <rule>` form, which ESLint does not parse.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // A conditional or looped hook call corrupts React's hook order; on native
      // that is a red-screen crash, not a warning.
      'react-hooks/rules-of-hooks': 'error',
      // Warn for now: some omissions are deliberate (mount-only effects, stable refs).
      'react-hooks/exhaustive-deps': 'warn',
      // React Native <Text> renders ' and " literally; there is no HTML parser to
      // confuse. Keep the check for the characters that signal a real JSX typo.
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    },
  },
  {
    // The TypeScript plugin is registered for .ts/.tsx only.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Stylistic: `_`-prefixed names mark deliberately unused parameters and bindings.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
  {
    // Jest runs these under Node/CommonJS: mocks, setup files and tests use
    // `require` and `jest.mock` factories freely.
    files: [
      '**/__tests__/**',
      '**/__mocks__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      'jest.setup.ts',
      'jest.services.setup.js',
      'jest.config.js',
      'test-utils/**',
    ],
    languageOptions: {
      globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', beforeAll: 'readonly', beforeEach: 'readonly', afterAll: 'readonly', afterEach: 'readonly', module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}', 'jest.setup.ts', 'test-utils/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // Node build tooling (Metro, Babel, icon generation).
    files: ['*.config.js', 'babel.config.js', 'metro.config.js', 'scripts/**'],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly', process: 'readonly', console: 'readonly' },
    },
  },
]
