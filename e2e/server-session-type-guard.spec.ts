/**
 * server-auth.ts の isServerSessionData 型ガードの回帰防止 spec。
 * server-auth.ts が next/headers など Edge 専用モジュールに依存するため、
 * 同一ロジックをインラインで再現して純粋関数として検証する。
 * #922 security: getServerSession の R2 セッション JSON を型ガードで検証する
 */
import { test, expect } from "@playwright/test";
import type { ServerSessionData } from "../src/lib/server-auth";

/**
 * server-auth.ts の isServerSessionData と同一ロジック。
 * コード変更時はここも追従させること。
 */
function isServerSessionData(v: unknown): v is ServerSessionData {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as ServerSessionData).userId === "string" &&
    typeof (v as ServerSessionData).refreshToken === "string" &&
    typeof (v as ServerSessionData).expiresAt === "number"
  );
}

test("isServerSessionData: 有効な ServerSessionData は true を返す", () => {
  const valid = { userId: "user1", refreshToken: "tok1", expiresAt: 9999999999 };
  expect(isServerSessionData(valid)).toBe(true);
});

test("isServerSessionData: null は false を返す", () => {
  expect(isServerSessionData(null)).toBe(false);
});

test("isServerSessionData: 配列は false を返す", () => {
  expect(isServerSessionData([])).toBe(false);
});

test("isServerSessionData: プリミティブ string は false を返す", () => {
  expect(isServerSessionData("string")).toBe(false);
});

test("isServerSessionData: プリミティブ number は false を返す", () => {
  expect(isServerSessionData(42)).toBe(false);
});

test("isServerSessionData: userId が数値の場合は false を返す", () => {
  const invalid = { userId: 123, refreshToken: "tok1", expiresAt: 9999999999 };
  expect(isServerSessionData(invalid)).toBe(false);
});

test("isServerSessionData: refreshToken が null の場合は false を返す", () => {
  const invalid = { userId: "user1", refreshToken: null, expiresAt: 9999999999 };
  expect(isServerSessionData(invalid)).toBe(false);
});

test("isServerSessionData: expiresAt が文字列の場合は false を返す", () => {
  const invalid = { userId: "user1", refreshToken: "tok1", expiresAt: "not-a-number" };
  expect(isServerSessionData(invalid)).toBe(false);
});

test("isServerSessionData: dbscSessionId が省略された場合でも true を返す (optional フィールド)", () => {
  const valid = { userId: "user1", refreshToken: "tok1", expiresAt: 9999999999 };
  expect(isServerSessionData(valid)).toBe(true);
});

test("isServerSessionData: dbscSessionId が文字列の場合は true を返す", () => {
  const valid = {
    userId: "user1",
    refreshToken: "tok1",
    expiresAt: 9999999999,
    dbscSessionId: "session-abc",
  };
  expect(isServerSessionData(valid)).toBe(true);
});
