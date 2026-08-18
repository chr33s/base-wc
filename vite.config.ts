import { defineConfig } from "vite-plus";

export default defineConfig({
  // Preserve the source-module boundary so downstream bundlers can retain only
  // the component classes a consumer imports. `elements.ts` remains the eager
  // register-all entry, while every production module is also emitted as a
  // stable per-component subpath.
  pack: {
    clean: true,
    dts: true,
    entry: ["src/index.ts", "src/elements.ts", "src/styles.css"],
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
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
