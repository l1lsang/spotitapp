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
      // Generated from src/lib/book by scripts/build-book-shared.mjs.
      "backend/functions/bookShared/**",
      // Throwaway experiments with their own dependencies (see each spike's README).
      "spikes/**",
    ],
  }
]);
