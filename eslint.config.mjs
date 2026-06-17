// Flat ESLint config (ESLint 9+). web-ext lint validates the manifest and
// packaging; this lints the hand-written JavaScript for unused vars, accidental
// globals, and obvious mistakes. The sources are plain IIFE scripts (not ES
// modules) running in extension/content-script contexts.
import js from "@eslint/js";

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  location: "readonly",
  navigator: "readonly",
  console: "readonly",
  fetch: "readonly",
  URL: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  MutationObserver: "readonly",
  getComputedStyle: "readonly",
  Uint8Array: "readonly",
  btoa: "readonly",
  // WebExtension namespaces.
  browser: "readonly",
  chrome: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "web-ext-artifacts/**", "dist/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
];
