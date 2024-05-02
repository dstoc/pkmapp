module.exports = {
  extends: [
    // 'google',
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'indent': 'off',
    'max-len': 'off',
    'no-multi-spaces': 'off',
    'node/no-unsupported-features/node-builtins': 'off',
    'require-jsdoc': 'off',
    'valid-jsdoc': 'off',
    'no-inner-declarations': 'off',
    'no-constant-condition': 'off',
  },
};
