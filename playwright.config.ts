import { defineConfig, devices, type LaunchOptions } from "@playwright/test";

const PORT = 5173;

// Fall back to a preinstalled Chromium when the bundled build revision isn't
// available (e.g. sandboxes); otherwise Playwright's own build.
const launchOptions: LaunchOptions = { args: ["--no-sandbox"] };
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
}

export default defineConfig({
  testDir: "src",
  testMatch: ["**/*.e2e.test.ts"],
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  outputDir: "node_modules/.playwright/test",
  reporter: [
    ["html", { open: "never", outputFolder: "node_modules/.playwright/report" }],
    ["list"],
  ],
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `vp dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
