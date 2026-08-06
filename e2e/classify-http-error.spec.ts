import { test, expect } from "@playwright/test";
import {
  classifyHttpError,
  formatHttpErrorMessage,
  buildFetchErrorMessage,
  isRetryableHttpError,
} from "../src/lib/classify-http-error";

test.describe("classifyHttpError (#688)", () => {
  test("429 → rate_limit", () => {
    expect(classifyHttpError(429)).toBe("rate_limit");
  });

  test("500 → server_error", () => {
    expect(classifyHttpError(500)).toBe("server_error");
  });

  test("502 → server_error", () => {
    expect(classifyHttpError(502)).toBe("server_error");
  });

  test("503 → server_error", () => {
    expect(classifyHttpError(503)).toBe("server_error");
  });

  test("599 → server_error (5xx の上限)", () => {
    expect(classifyHttpError(599)).toBe("server_error");
  });

  test("400 → client_error", () => {
    expect(classifyHttpError(400)).toBe("client_error");
  });

  test("401 → client_error (auth エラーも client_error 扱い)", () => {
    expect(classifyHttpError(401)).toBe("client_error");
  });

  test("403 → client_error", () => {
    expect(classifyHttpError(403)).toBe("client_error");
  });

  test("404 → client_error", () => {
    expect(classifyHttpError(404)).toBe("client_error");
  });

  test("422 → client_error (バリデーションエラーは client_error)", () => {
    expect(classifyHttpError(422)).toBe("client_error");
  });

  test("428 → client_error (429 直前は client_error)", () => {
    expect(classifyHttpError(428)).toBe("client_error");
  });

  test("430 → client_error (429 直後は client_error)", () => {
    expect(classifyHttpError(430)).toBe("client_error");
  });

  test("100 → unknown (4xx/5xx ではない)", () => {
    expect(classifyHttpError(100)).toBe("unknown");
  });

  test("301 → unknown (3xx は分類対象外)", () => {
    expect(classifyHttpError(301)).toBe("unknown");
  });

  test("600 → unknown (5xx の上限を超える)", () => {
    expect(classifyHttpError(600)).toBe("unknown");
  });
});

test.describe("formatHttpErrorMessage (#688)", () => {
  test("network 種別は接続確認メッセージ", () => {
    const msg = formatHttpErrorMessage("network");
    expect(msg).toContain("ネットワークエラー");
    expect(msg).toContain("接続");
  });

  test("rate_limit + Retry-After 30 秒 → '30秒後に再試行' を含む", () => {
    const msg = formatHttpErrorMessage("rate_limit", { retryAfterHeader: "30" });
    expect(msg).toContain("レート制限中");
    expect(msg).toContain("30");
    expect(msg).toContain("秒後に再試行");
  });

  test("rate_limit + Retry-After なし → デフォルト 60 秒", () => {
    const msg = formatHttpErrorMessage("rate_limit", { retryAfterHeader: null });
    expect(msg).toContain("60");
  });

  test("rate_limit + Retry-After 不正値 → デフォルト 60 秒", () => {
    const msg = formatHttpErrorMessage("rate_limit", { retryAfterHeader: "invalid" });
    expect(msg).toContain("60");
  });

  test("rate_limit + Retry-After 0 → 1 秒に丸める (最低 1 秒保証)", () => {
    const msg = formatHttpErrorMessage("rate_limit", { retryAfterHeader: "0" });
    expect(msg).toContain("1");
    expect(msg).not.toContain("0秒");
  });

  test("server_error → '一時的なエラー' を含む", () => {
    const msg = formatHttpErrorMessage("server_error");
    expect(msg).toContain("サーバー");
    expect(msg).toContain("一時的");
  });

  test("client_error → fallback メッセージを返す", () => {
    const msg = formatHttpErrorMessage("client_error", { fallback: "URL が不正です" });
    expect(msg).toBe("URL が不正です");
  });

  test("client_error + fallback 未指定 → デフォルトの汎用メッセージ", () => {
    const msg = formatHttpErrorMessage("client_error");
    expect(msg).toBe("エラーが発生しました");
  });

  test("unknown → fallback 優先 (server response body の error 等)", () => {
    const msg = formatHttpErrorMessage("unknown", { fallback: "サーバー応答が不正です" });
    expect(msg).toBe("サーバー応答が不正です");
  });
});

test.describe("isRetryableHttpError", () => {
  test("ネットワーク・429・5xx は再試行可能", () => {
    expect(isRetryableHttpError("network")).toBe(true);
    expect(isRetryableHttpError("rate_limit")).toBe(true);
    expect(isRetryableHttpError("server_error")).toBe(true);
  });

  test("4xx と未知のエラーは再試行しない", () => {
    expect(isRetryableHttpError("client_error")).toBe(false);
    expect(isRetryableHttpError("unknown")).toBe(false);
  });
});

test.describe("buildFetchErrorMessage retryable", () => {
  test("4xx は再試行不可、5xx は再試行可能を返す", async () => {
    const client = await buildFetchErrorMessage(
      new Response(JSON.stringify({ error: "invalid" }), { status: 400 }),
      "fallback",
    );
    const server = await buildFetchErrorMessage(
      new Response(JSON.stringify({ error: "temporary" }), { status: 503 }),
      "fallback",
    );

    expect(client.retryable).toBe(false);
    expect(server.retryable).toBe(true);
  });
});
