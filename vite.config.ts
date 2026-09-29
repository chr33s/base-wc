import { defineConfig } from "vite-plus";

export default defineConfig({
  // Preserve the source-module boundary so downstream bundlers can retain only
  // the component classes a consumer imports. `elements.ts` remains the eager
  // register-all entry, while every production module is also emitted as a
  // stable per-component subpath.
  pack: {
    clean: true,
    dts: true,
    entry: [
      "src/index.ts",
      "src/components.ts",
      "src/advanced.ts",
      "src/elements.ts",
      "src/styles.css",
    ],
    platform: "browser",
    root: "src",
    sourcemap: true,
    unbundle: true,
  },
  test: {
    // `*.e2e.test.ts` is a Playwright suite (real Chromium, run by
    // `npm run test:e2e`); Vitest owns the happy-dom `*.dom.test.ts` files.
    exclude: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/*.e2e.test.ts"],
  },
  fmt: {
    ignorePatterns: [".agents/**"],
  },
  lint: {
    ignorePatterns: [".agents/**"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [{ name: "anti-slop", specifier: "./.agents/tools/anti-slop/index.ts" }],
    rules: {
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "off",
      "anti-slop/require-safety-comment-for-type-assertion": "off",
    },
  },
});
