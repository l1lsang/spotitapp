// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "android/**",
      "ios/**",
      "artifacts/**",
      ".expo/**",
      ".verification.local/**",
      "backend/functions/node_modules/**",
      // Throwaway experiments with their own dependencies (see each spike's README).
      "spikes/**",
    ],
  }
]);
