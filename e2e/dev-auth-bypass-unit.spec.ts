import { test, expect } from "@playwright/test";
import { getDevBypassUserId, buildDevBypassProfile } from "../src/lib/dev-auth-bypass";

const ORIGINAL_NODE_ENV = (process.env as Record<string, string | undefined>).NODE_ENV;
const ORIGINAL_BYPASS_ID = process.env.DEV_AUTH_BYPASS_USER_ID;

test.afterEach(() => {
  // playwright.config.ts で webServer 用に DEV_AUTH_BYPASS_USER_ID=e2e-test-user を
  // セットしているため、各テスト後に元に戻す。
  if (ORIGINAL_NODE_ENV === undefined)
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  else (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_BYPASS_ID === undefined) delete process.env.DEV_AUTH_BYPASS_USER_ID;
  else process.env.DEV_AUTH_BYPASS_USER_ID = ORIGINAL_BYPASS_ID;
});

test.describe("getDevBypassUserId", () => {
  test("NODE_ENV=production なら DEV_AUTH_BYPASS_USER_ID がセットされていても null", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.DEV_AUTH_BYPASS_USER_ID = "some-user";
    expect(getDevBypassUserId()).toBeNull();
  });

  test("DEV_AUTH_BYPASS_USER_ID 未セットなら null", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    delete process.env.DEV_AUTH_BYPASS_USER_ID;
    expect(getDevBypassUserId()).toBeNull();
  });

  test("空文字列なら null", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS_USER_ID = "";
    expect(getDevBypassUserId()).toBeNull();
  });

  test("許可外文字（スペース）を含む ID は null", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS_USER_ID = "invalid user!";
    expect(getDevBypassUserId()).toBeNull();
  });

  test("129 文字超の ID は null", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS_USER_ID = "a".repeat(129);
    expect(getDevBypassUserId()).toBeNull();
  });

  test("128 文字ぴったりの ID は許可", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS_USER_ID = "a".repeat(128);
    expect(getDevBypassUserId()).toBe("a".repeat(128));
  });

  test("英数字・ハイフン・アンダースコア・アットマーク・ドットを含む有効な ID を返す", () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS_USER_ID = "test-user_42@example.com";
    expect(getDevBypassUserId()).toBe("test-user_42@example.com");
  });
});

test.describe("buildDevBypassProfile", () => {
  test("userId を id/sub に入れて固定の email/name/picture を返す", () => {
    const profile = buildDevBypassProfile("my-test-user");
    expect(profile).toEqual({
      id: "my-test-user",
      sub: "my-test-user",
      email: "e2e@test.local",
      name: "E2E Test User",
      picture: "",
    });
  });
});
