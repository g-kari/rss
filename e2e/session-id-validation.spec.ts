import { test, expect } from "@playwright/test";
import { isValidSessionId } from "../src/lib/validation";

test.describe("isValidSessionId — UUID 形式の検証（セキュリティ用途のフォーマット検証）", () => {
  test("正規の UUID（小文字）は true", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  test("正規の UUID（大文字）は true（case-insensitive）", () => {
    expect(isValidSessionId("550E8400-E29B-41D4-A716-446655440000")).toBe(true);
  });

  test("正規の UUID（混在）も true", () => {
    expect(isValidSessionId("550e8400-E29B-41d4-A716-446655440000")).toBe(true);
  });
});

test.describe("isValidSessionId — 不正値（パストラバーサル等の SSRF 対象）", () => {
  test("パストラバーサル文字を含む文字列は false", () => {
    expect(isValidSessionId("../../etc/passwd")).toBe(false);
  });

  test("UUID ライクな文字列にパストラバーサル混入は false", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-../../44065540")).toBe(false);
  });

  test("R2 キー区切り文字 / を含む文字列は false", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716/path")).toBe(false);
  });

  test("バックスラッシュを含む文字列は false", () => {
    expect(isValidSessionId("550e8400\\path")).toBe(false);
  });
});

test.describe("isValidSessionId — フォーマット境界値", () => {
  test("空文字は false", () => {
    expect(isValidSessionId("")).toBe(false);
  });

  test("ハイフン位置がずれた UUID は false", () => {
    expect(isValidSessionId("550e8400e29b-41d4-a716-446655440000")).toBe(false);
  });

  test("36 文字未満は false", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });

  test("36 文字超過は false", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-4466554400000")).toBe(false);
  });

  test("非 hex 文字（g）を含むと false", () => {
    expect(isValidSessionId("550e8400-e29b-41d4-a716-44665544000g")).toBe(false);
  });

  test("先頭・末尾に空白を含む UUID は false", () => {
    expect(isValidSessionId(" 550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(isValidSessionId("550e8400-e29b-41d4-a716-446655440000 ")).toBe(false);
  });

  test("UUID 内に改行を含むと false（HTTP injection 防止）", () => {
    expect(isValidSessionId("550e8400-e29b-41d4\n-a716-446655440000")).toBe(false);
  });
});
