import { test, expect } from "@playwright/test";
import { isAbortError } from "../src/lib/fetch";

/**
 * `isAbortError` の単体テスト (#644 Step 2 部分対応)。
 *
 * #625 (ShareMenu silent fail) の修正で `err instanceof DOMException && err.name === "AbortError"`
 * というインラインチェックを書いていたが、`src/lib/fetch.ts` に既存の `isAbortError`
 * ユーティリティがあるので統一する。本テストは「両ソース (fetch AbortController / Web Share API)
 * からの AbortError を正しく識別できる」ことを保証する。
 *
 * Web Share API の cancel は DOMException("AbortError") を投げる。
 * fetch AbortController の signal abort は DOMException("AbortError") を投げる。
 * setTimeout などで `new Error("AbortError")` を手書きするケースもカバー。
 */

test.describe("isAbortError — abort 判定", () => {
  test("DOMException('AbortError') は true", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  test("Error オブジェクトで name='AbortError' は true (手書きケース)", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  test("通常の TypeError は false", () => {
    const err = new TypeError("type error");
    expect(isAbortError(err)).toBe(false);
  });

  test("通常の Error (name='Error') は false", () => {
    const err = new Error("regular error");
    expect(isAbortError(err)).toBe(false);
  });

  test("DOMException で name が AbortError 以外 (e.g. NotAllowedError) は false", () => {
    const err = new DOMException("permission denied", "NotAllowedError");
    expect(isAbortError(err)).toBe(false);
  });

  test("文字列は false (Error/DOMException ではない)", () => {
    expect(isAbortError("AbortError")).toBe(false);
  });

  test("null は false", () => {
    expect(isAbortError(null)).toBe(false);
  });

  test("undefined は false", () => {
    expect(isAbortError(undefined)).toBe(false);
  });

  test("plain object に name='AbortError' があっても false (Error 派生でない)", () => {
    expect(isAbortError({ name: "AbortError", message: "fake" })).toBe(false);
  });
});
