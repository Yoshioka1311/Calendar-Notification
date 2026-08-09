const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', 'line-backend/**'],
    rules: {
      'no-console': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
