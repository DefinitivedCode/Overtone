import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const restrict = (groups, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
});

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'public/packs',
      '.scratch',
      'reports',
      'playwright-report',
      'test-results',
      'planning',
      '.cache',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain JS tooling (spike harnesses): Node scripts that also contain page.evaluate() browser code.
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML is banned (ARCHITECTURE §11).',
        },
      ],
    },
  },
  // Module boundaries (ARCHITECTURE §2).
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    ignores: ['src/engine/dict/**', 'src/engine/**/*.test.ts'],
    rules: restrict(
      ['@/features/*', '@/ui/*', '@/db/*', '**/features/*', '**/ui/*', '**/db/*'],
      'engine must not import features, ui or db.',
    ),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: restrict(
      ['@/db/schema', '**/db/schema'],
      'features access storage via db/repositories only.',
    ),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: restrict(
      ['@/features/*', '@/db/*', '@/engine/*', '**/features/*', '**/db/*', '**/engine/*'],
      'ui primitives import nothing from features, db or engine.',
    ),
  },
);
