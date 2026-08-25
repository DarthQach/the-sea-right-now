import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.wrangler/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'public/**',
      'worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/scene/**/*.ts', 'src/audio/**/*.ts', 'src/lib/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/app/**/*.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: ['src/worker/**/*.ts'],
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.ts', 'tests/smoke/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
)
