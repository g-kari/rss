import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // E2E テスト実行前に dev サーバーを自動起動
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
    // CSRF (`assertSameOrigin`) が localhost:3000 からのリクエストを許可できるよう、
    // テスト環境では APP_BASE_URL を localhost:3000 に上書きする
    env: { APP_BASE_URL: "http://localhost:3000" },
  },
});
