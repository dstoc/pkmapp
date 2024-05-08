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
      // Used in lit event bindings.
      '@typescript-eslint/unbound-method': 'off',
    } 
  }
);
