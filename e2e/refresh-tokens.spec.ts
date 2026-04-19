import { test, expect } from "@playwright/test";
import { refreshTokens, type RefreshResult } from "../src/lib/auth";

/**
 * `refreshTokens` が上流認可サーバーの応答種別に応じて
 * `ok` / `invalid` / `transient` を正しく返すかを検証する。
 *
 * 背景: 従来は `!res.ok` を一律 `null` で返していたため、上流の 5xx 障害や
 * ネットワークエラーで refresh_token Cookie が削除されユーザーが意図せず
 * ログアウトしてしまう不具合があった（issue 対応）。
 */

type FetchFn = typeof globalThis.fetch;

function withMockFetch<T>(
  mock: FetchFn,
  fn: () => Promise<T>,
  env: Record<string, string>,
): Promise<T> {
  const original = globalThis.fetch;
  const originalEnv: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    originalEnv[k] = process.env[k];
    process.env[k] = env[k];
  }
  globalThis.fetch = mock as FetchFn;
  return (async () => {
    try {
      return await fn();
    } finally {
      globalThis.fetch = original;
      for (const k of Object.keys(originalEnv)) {
        if (originalEnv[k] === undefined) delete process.env[k];
        else process.env[k] = originalEnv[k];
      }
    }
  })();
}

const ENV = {
  AUTH_BASE_URL: "https://auth.example.test",
  CLIENT_ID: "client",
  CLIENT_SECRET: "secret",
};

test.describe("refreshTokens — 成功", () => {
  test("200 + トークン含む JSON → kind=ok", async () => {
    const mock: FetchFn = async () =>
      new Response(JSON.stringify({ data: { access_token: "A", refresh_token: "R" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result: RefreshResult = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.tokens.access_token).toBe("A");
      expect(result.tokens.refresh_token).toBe("R");
    }
  });
});

test.describe("refreshTokens — 恒久失敗 (invalid)", () => {
  test("400 invalid_grant → kind=invalid", async () => {
    const mock: FetchFn = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("401 Unauthorized → kind=invalid", async () => {
    const mock: FetchFn = async () => new Response("nope", { status: 401 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("401 TOKEN_REUSE → kind=invalid (本物のリプレイ攻撃)", async () => {
    const mock: FetchFn = async () =>
      new Response(
        JSON.stringify({ error: { code: "TOKEN_REUSE", message: "Token reuse detected" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("401 INVALID_TOKEN → kind=invalid", async () => {
    const mock: FetchFn = async () =>
      new Response(
        JSON.stringify({ error: { code: "INVALID_TOKEN", message: "Token not found" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("401 TOKEN_EXPIRED → kind=invalid", async () => {
    const mock: FetchFn = async () =>
      new Response(
        JSON.stringify({ error: { code: "TOKEN_EXPIRED", message: "Refresh token expired" } }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("403 Forbidden → kind=invalid", async () => {
    const mock: FetchFn = async () => new Response("nope", { status: 403 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });

  test("404 Not Found → kind=invalid", async () => {
    const mock: FetchFn = async () => new Response("nope", { status: 404 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("invalid");
  });
});

test.describe("refreshTokens — 一時失敗 (transient)", () => {
  test("500 Internal Server Error → kind=transient", async () => {
    const mock: FetchFn = async () => new Response("oops", { status: 500 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });

  test("502 Bad Gateway → kind=transient", async () => {
    const mock: FetchFn = async () => new Response("bad gw", { status: 502 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });

  test("503 Service Unavailable → kind=transient", async () => {
    const mock: FetchFn = async () => new Response("maintenance", { status: 503 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });

  test("504 Gateway Timeout → kind=transient", async () => {
    const mock: FetchFn = async () => new Response("timeout", { status: 504 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });

  test("fetch がネットワークエラーで reject → kind=transient", async () => {
    const mock: FetchFn = async () => {
      throw new TypeError("network down");
    };
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });

  test("200 だが不正な JSON → kind=transient (パース失敗は上流バグ)", async () => {
    const mock: FetchFn = async () =>
      new Response("not-json", { status: 200, headers: { "Content-Type": "text/plain" } });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });
});

test.describe("refreshTokens — 回帰テスト", () => {
  test("従来 null になっていた 5xx が transient になって Cookie 削除を回避できる", async () => {
    const mock: FetchFn = async () => new Response("", { status: 503 });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    // 旧実装: null → /api/auth/me が Cookie 削除してログアウト扱い
    // 新実装: transient → Cookie 保持で次回リフレッシュ再試行
    expect(result.kind).not.toBe("invalid");
    expect(result.kind).toBe("transient");
  });
});

/**
 * issue #113: 定期ログアウトの原因。
 * 0g0-id 側の `/auth/refresh` は並列リフレッシュ競合（30 秒以内の rotation 済みトークン再提示）時に
 * HTTP 401 + `{ error: { code: "TOKEN_ROTATED", message: "..." } }` を返す（refresh-token-rotation.ts 参照）。
 *
 * このとき新しい refresh_token が既に発行済みのため、Cookie を削除してしまうと
 * 正しく発行されたセッションまで無効化されてしまう。複数タブ・タブ復帰時の
 * 同時リフレッシュで必ず起きるため「定期ログアウト」として体感される。
 *
 * 修正: TOKEN_ROTATED のみ transient 扱いで Cookie を保持し、次回のリクエストで
 *       既にセットされた新 Cookie を使える状態を維持する。
 */
test.describe("refreshTokens — issue #113 (TOKEN_ROTATED)", () => {
  test("401 TOKEN_ROTATED → kind=transient (並列リフレッシュ競合で Cookie を維持)", async () => {
    const mock: FetchFn = async () =>
      new Response(
        JSON.stringify({
          error: { code: "TOKEN_ROTATED", message: "Token already rotated, retry with new token" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    const result = await withMockFetch(mock, () => refreshTokens("rt"), ENV);
    expect(result.kind).toBe("transient");
  });
});
