import js from "@eslint/js";

// Globals are listed rather than switched off. This project has no Foundry type package, so
// `no-undef` is the only thing standing between a typo in a global name and a runtime error that
// only shows up on a live sheet. Listing them keeps the check working; add to it when the module
// starts using another one.
const foundryGlobals = {
  CONFIG: "readonly",
  Hooks: "readonly",
  game: "readonly",
  ui: "readonly",
  foundry: "readonly",
  dnd5e: "readonly",
  Actor: "readonly",
  Item: "readonly",
  ChatMessage: "readonly",
  fromUuid: "readonly",
  libWrapper: "readonly"
};

const browserGlobals = {
  document: "readonly",
  window: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  Event: "readonly",
  HTMLElement: "readonly"
};

const nodeGlobals = {
  process: "readonly",
  console: "readonly"
};

export default [
  {
    ignores: ["node_modules/**", "styles/**", "lang/**", "docs/**"]
  },
  js.configs.recommended,
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...foundryGlobals, ...browserGlobals }
    }
  },
  {
    files: ["tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: nodeGlobals
    }
  },
  {
    rules: {
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-unsafe-optional-chaining": "error",
      "no-self-compare": "error",
      "no-unmodified-loop-condition": "warn"
    }
  }
];
