import { test, expect } from "@playwright/test";
import { serializeError } from "../src/lib/serialize-error";

/**
 * Cloudflare Workers のログが Error を `{}` にシリアライズする問題を回避する
 * `serializeError` のユニットテスト。
 */

test.describe("serializeError", () => {
  test("Error の name / message / stack を enumerable に展開する", () => {
    const err = new Error("boom");
    const out = serializeError(err);
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
    expect(typeof out.stack).toBe("string");
    expect(JSON.stringify(out)).toContain("boom");
  });

  test("カスタム name (TypeError) を保持する", () => {
    const err = new TypeError("bad input");
    const out = serializeError(err);
    expect(out.name).toBe("TypeError");
    expect(out.message).toBe("bad input");
  });

  test("サブクラス Error の name も保持する", () => {
    class RateLimitError extends Error {
      constructor() {
        super("rate limited");
        this.name = "RateLimitError";
      }
    }
    const out = serializeError(new RateLimitError());
    expect(out.name).toBe("RateLimitError");
    expect(out.message).toBe("rate limited");
  });

  test("cause を再帰的に展開する", () => {
    const inner = new Error("inner reason");
    const outer = new Error("outer", { cause: inner });
    const out = serializeError(outer);
    expect(out.message).toBe("outer");
    expect(out.cause).toMatchObject({ name: "Error", message: "inner reason" });
  });

  test("stack が無い Error では stack を含めない", () => {
    const err = new Error("no stack");
    delete (err as { stack?: string }).stack;
    const out = serializeError(err);
    expect("stack" in out).toBe(false);
    expect(out.message).toBe("no stack");
  });

  test("非 Error 値 (文字列) は value として返す", () => {
    expect(serializeError("nope")).toEqual({ value: "nope" });
  });

  test("null は value: null として返す", () => {
    expect(serializeError(null)).toEqual({ value: null });
  });

  test("undefined は value: undefined（文字列化）として返す", () => {
    expect(serializeError(undefined)).toEqual({ value: "undefined" });
  });

  test("プレーンオブジェクトは value としてそのまま返す", () => {
    expect(serializeError({ foo: 1, bar: "x" })).toEqual({ value: { foo: 1, bar: "x" } });
  });

  test("循環参照オブジェクトは value に文字列化してフォールバックする", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const out = serializeError(obj);
    expect(typeof out.value).toBe("string");
  });

  test("Error を JSON.stringify すると空になる問題の回帰テスト", () => {
    const err = new Error("hidden");
    expect(JSON.stringify(err)).toBe("{}"); // これが元凶
    expect(JSON.stringify(serializeError(err))).toContain("hidden"); // 修正後
  });
});
