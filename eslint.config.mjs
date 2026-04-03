import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // No `any` — enforce strict typing
      '@typescript-eslint/no-explicit-any': 'error',

      // Unused imports — auto-fixable
      'unused-imports/no-unused-imports': 'error',

      // Unused vars — allow underscore prefix for intentional ignores
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Allow empty functions (common in tests/defaults)
      '@typescript-eslint/no-empty-function': 'off',

      // Allow non-null assertions (common in framework code)
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Require consistent type imports (allow inline import() type annotations)
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
    },
  },
  // DevUI generates inline HTML/JS with regex patterns — suppress useless-escape there
  {
    files: ['packages/devui/**/*.ts'],
    rules: {
      'no-useless-escape': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      'examples/**',
      'apps/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
  }
);
