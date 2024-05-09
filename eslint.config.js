import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
// TODO: Prettier?

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      }
    },
    rules: {
      'no-constant-binary-expression': 'error',
      'no-constant-condition': [
        'error',
        {
          checkLoops: false,
        }
      ],
      'no-inner-declarations': 'off',
      // Will still be checked before calls/assignment.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Used in lit event bindings.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    } 
  }
);
