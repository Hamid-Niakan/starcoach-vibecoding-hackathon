import { defineConfig } from "@playwright/test";

const isCi = process.env.CI === "true";
const liaraBaseUrl = process.env.E2E_LIARA_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/playwright",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers: isCi ? 1 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: liaraBaseUrl,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    colorScheme: "light",
    reducedMotion: "reduce",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
      },
    },
    {
      name: "chromium-mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer:
    process.env.PLAYWRIGHT_MANAGED_STACK === "0"
      ? undefined
      : {
          command:
            "node --experimental-strip-types tests/e2e/fixtures/test-stack.ts",
          cwd: __dirname,
          url: `${liaraBaseUrl}/chat`,
          timeout: 240_000,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
          stdout: "pipe",
          stderr: "pipe",
        },
});
