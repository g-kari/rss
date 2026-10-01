import { defineConfig, devices } from "@playwright/test";

/** Synthetic production-component UI only: no Next server, login, bindings or live data. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "scoped-recommendations.spec.ts",
    "immersive-articles.spec.ts",
    "immersive-autoplay-narration.spec.ts",
    "immersive-native-video.spec.ts",
    "immersive-quality.spec.ts",
    "reader-motion.spec.ts",
    "feed-retry-status.spec.ts",
  ],
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
