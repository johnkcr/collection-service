module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
    ecmaVersion: 2020
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:eslint-plugin-eslint-comments/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unsafe-assignment': 0,
    '@typescript-eslint/strict-boolean-expressions': 0,
    '@typescript-eslint/restrict-template-expressions': 0,
    '@typescript-eslint/no-case-declarations': 0,
    '@typescript-eslint/no-unsafe-member-access': 0,
    '@typescript-eslint/no-misused-promises': 0,
    '@typescript-eslint/no-explicit-any': 0
  },
  ignorePatterns: ['**/dist/**', '**/node_modules/**', '.eslintrc.js']
};
