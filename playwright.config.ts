import { defineConfig, devices } from "@playwright/test";

// e2e 実行中は dev 認証バイパスを有効化する。
// - webServer.env: dev サーバー側で認証バイパスを動作させる
// - process.env への注入: 各テストファイル側からも `process.env.DEV_AUTH_BYPASS_USER_ID`
//   を参照して `test.skip` 判定できるようにする（Playwright runner と webServer の両方で必要）
const DEV_AUTH_BYPASS_USER_ID = "e2e-test-user";
process.env.DEV_AUTH_BYPASS_USER_ID = DEV_AUTH_BYPASS_USER_ID;

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
    // テスト環境では APP_BASE_URL を localhost:3000 に上書きする。
    // また、e2e テスト中は dev 認証バイパス（DEV_AUTH_BYPASS_USER_ID）を有効化して
    // 認証後画面のカバレッジを取れるようにする（NODE_ENV !== "production" の dev サーバーでのみ有効）。
    env: {
      APP_BASE_URL: "http://localhost:3000",
      DEV_AUTH_BYPASS_USER_ID,
    },
  },
});
