/**
 * ESLint 平面配置 —— 用 no-restricted-imports / no-restricted-globals /
 * no-restricted-properties 强制依赖单向与内核纯净，违反即构建失败。
 * core：无 DOM、无时间、无 Math.random；只依赖 data 与 params（及 core 内部）。
 * town：只用 core 的 rng/hash/params；禁 DOM 与世界/界面/存档。
 */
import js from "@eslint/js";

const browserGlobals = {
  window: "readonly", document: "readonly", localStorage: "readonly",
  performance: "readonly", requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly", crypto: "readonly", navigator: "readonly",
  location: "readonly", history: "readonly", CustomEvent: "readonly",
  getComputedStyle: "readonly", matchMedia: "readonly", alert: "readonly",
  confirm: "readonly", prompt: "readonly", URL: "readonly", URLSearchParams: "readonly",
  Blob: "readonly", Response: "readonly", CompressionStream: "readonly",
  DecompressionStream: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
  atob: "readonly", btoa: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", AudioContext: "readonly",
  webkitAudioContext: "readonly", Image: "readonly",
};

const coreRestrictedGlobals = ["window", "document", "localStorage", "performance", "requestAnimationFrame", "cancelAnimationFrame", "navigator", "location", "alert", "confirm", "prompt", "Blob", "Response", "CompressionStream", "DecompressionStream", "setTimeout", "clearTimeout", "setInterval", "clearInterval"];

export default [
  js.configs.recommended,
  {
    ignores: ["dist/**", "node_modules/**", "book/**", "tools/reports/**"],
  },
  {
    files: ["src/core/**/*.js"],
    languageOptions: {
      globals: {},
    },
    rules: {
      "no-restricted-globals": ["error", ...coreRestrictedGlobals],
      "no-restricted-properties": ["error",
        { object: "Math", property: "random", message: "内核禁用 Math.random：用 core/rng.js 的种子流" },
        { object: "Date", property: "now", message: "内核禁用时间" },
        { object: "globalThis", property: "document", message: "内核禁 DOM" },
      ],
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["../town/**", "../world/**", "../ui/**", "../save/**", "./town/**", "./world/**", "./ui/**", "./save/**"],
          message: "core 不得依赖 town/world/ui/save",
        }],
      }],
    },
  },
  {
    files: ["src/town/**/*.js"],
    languageOptions: {
      globals: {},
    },
    rules: {
      "no-restricted-globals": ["error", ...coreRestrictedGlobals],
      "no-restricted-properties": ["error",
        { object: "Math", property: "random", message: "town 禁用 Math.random：用 core/rng.js" },
        { object: "Date", property: "now", message: "town 禁用时间" },
      ],
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["../world/**", "../ui/**", "../save/**", "../core/game.js", "../core/state.js", "../core/script.js", "../core/habits.js", "../core/draw.js", "../core/fight.js", "../core/quiz.js", "../core/tempt.js", "../core/chapter.js", "./world/**", "./ui/**", "./save/**"],
          message: "town 只可用 core/rng、core/hash、core/params",
        }],
      }],
    },
  },
  {
    files: ["src/world/**/*.js", "src/ui/**/*.js", "src/save/**/*.js", "src/main.js"],
    languageOptions: {
      globals: browserGlobals,
    },
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/core/apply-only", "../core/game.js/apply"],
          message: "占位",
        }],
      }],
    },
  },
  {
    files: ["src/ui/**/*.js", "src/main.js", "src/world/**/*.js", "src/save/**/*.js"],
    languageOptions: {
      globals: { ...browserGlobals },
    },
  },
  {
    files: ["tools/**/*.{js,mjs}", "tests/**/*.{js,mjs}"],
    languageOptions: {
      globals: { ...browserGlobals, console: "readonly", process: "readonly", performance: "readonly", URL: "readonly", URLSearchParams: "readonly", fetch: "readonly" },
    },
    rules: {},
  },
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { console: "readonly" },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  },
];
