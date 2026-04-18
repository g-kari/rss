import { test, expect } from "@playwright/test";
import { exchangeCode, isCloudflareBlock, refreshTokens } from "../src/lib/auth";

/**
 * issue #94: 0g0-id 側の改善案1（BFF 個別シークレット対応）に合わせて、
 * rss-reader 側のログイン呼び出しも X-Internal-Secret ヘッダーを送れるようにする。
 * また、Cloudflare WAF ブロック（"Attention Required! | Cloudflare"）の検出と
 * refresh 経路での transient 扱いを検証する。
 *
 * `withMockFetch` が `process.env` / `globalThis.fetch` をテスト実行中に差し替えるため、
 * Playwright の並列実行下でレースしないよう、このファイルは serial で流す。
 */
test.describe.configure({ mode: "serial" });

type FetchFn = typeof globalThis.fetch;

function withMockFetch<T>(
  mock: FetchFn,
  fn: () => Promise<T>,
  env: Record<string, string | undefined>,
): Promise<T> {
  const original = globalThis.fetch;
  const originalEnv: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    originalEnv[k] = process.env[k];
    const v = env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
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

const BASE_ENV = {
  AUTH_BASE_URL: "https://auth.example.test",
  APP_BASE_URL: "https://rss.example.test",
  CLIENT_ID: "client-id",
  CLIENT_SECRET: "client-secret",
};

test.describe("isCloudflareBlock — Cloudflare WAF challenge 判定", () => {
  test("cf-ray + Attention Required HTML → true", () => {
    const body = `<html><head><title>Attention Required! | Cloudflare</title></head></html>`;
    expect(isCloudflareBlock("text/html; charset=UTF-8", body, "abc123-NRT")).toBe(true);
  });

  test("cf-ray + cdn-cgi/challenge パス HTML → true", () => {
    const body = `<script src="/cdn-cgi/challenge-platform/h/b/..."></script>`;
    expect(isCloudflareBlock("text/html", body, "xyz-NRT")).toBe(true);
  });

  test("cf-ray があっても footer の Cloudflare 文字列だけ → false (誤判定防止)", () => {
    const body = `<html><body>Error. <footer>Powered by Cloudflare</footer></body></html>`;
    expect(isCloudflareBlock("text/html", body, "ray-1")).toBe(false);
  });

  test("cf-ray なし（上流が直接返した HTML）→ false", () => {
    const body = `<html><body>Attention Required!</body></html>`;
    expect(isCloudflareBlock("text/html", body, null)).toBe(false);
  });

  test("Content-Type が application/json → false", () => {
    const body = `{"error":"invalid_grant"}`;
    expect(isCloudflareBlock("application/json", body, "abc-NRT")).toBe(false);
  });

  test("Content-Type が null → false", () => {
    expect(isCloudflareBlock(null, "Attention Required!", "abc-NRT")).toBe(false);
  });

  test("cf-ray 空文字 → false (ヘッダー未付与扱い)", () => {
    const body = `<html><head><title>Attention Required!</title></head></html>`;
    expect(isCloudflareBlock("text/html", body, "")).toBe(false);
  });
});

test.describe("exchangeCode — 認証ヘッダー", () => {
  test("INTERNAL_SERVICE_SECRET 未設定 → X-Internal-Secret は送られない", async () => {
    const capturedHeaders: Record<string, string> = {};
    const mock: FetchFn = async (_url, init) => {
      const headers = new Headers(init?.headers);
      headers.forEach((v, k) => {
        capturedHeaders[k.toLowerCase()] = v;
      });
      return new Response(
        JSON.stringify({
          data: {
            access_token: "A",
            refresh_token: "R",
            user: { id: "u", email: "e@e", name: "n", picture: null, role: "user" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await withMockFetch(
      mock,
      () => exchangeCode("code", "https://rss.example.test/api/auth/callback"),
      { ...BASE_ENV, INTERNAL_SERVICE_SECRET: undefined },
    );
    expect(result).not.toBeNull();
    expect(capturedHeaders["x-internal-secret"]).toBeUndefined();
    expect(capturedHeaders["authorization"]).toMatch(/^Basic /);
  });

  test("INTERNAL_SERVICE_SECRET 設定あり → X-Internal-Secret が送られる", async () => {
    const capturedHeaders: Record<string, string> = {};
    const mock: FetchFn = async (_url, init) => {
      const headers = new Headers(init?.headers);
      headers.forEach((v, k) => {
        capturedHeaders[k.toLowerCase()] = v;
      });
      return new Response(
        JSON.stringify({
          data: {
            access_token: "A",
            refresh_token: "R",
            user: { id: "u", email: "e@e", name: "n", picture: null, role: "user" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const result = await withMockFetch(
      mock,
      () => exchangeCode("code", "https://rss.example.test/api/auth/callback"),
      { ...BASE_ENV, INTERNAL_SERVICE_SECRET: "my-shared-secret" },
    );
    expect(result).not.toBeNull();
    expect(capturedHeaders["x-internal-secret"]).toBe("my-shared-secret");
    // Basic Auth は引き続き併送（0g0-id の middleware は OR 条件）
    expect(capturedHeaders["authorization"]).toMatch(/^Basic /);
  });

  test("Cloudflare WAF HTML レスポンス → null 返却（非致命）", async () => {
    const mock: FetchFn = async () =>
      new Response(
        `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head></html>`,
        { status: 403, headers: { "Content-Type": "text/html", "cf-ray": "abc123-NRT" } },
      );
    const result = await withMockFetch(
      mock,
      () => exchangeCode("code", "https://rss.example.test/api/auth/callback"),
      { ...BASE_ENV, INTERNAL_SERVICE_SECRET: undefined },
    );
    expect(result).toBeNull();
  });

  test("INTERNAL_SERVICE_SECRET 設定済みでも Cloudflare でブロックされたら null 返却", async () => {
    const mock: FetchFn = async () =>
      new Response(
        `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head></html>`,
        { status: 403, headers: { "Content-Type": "text/html", "cf-ray": "zzz-NRT" } },
      );
    const result = await withMockFetch(
      mock,
      () => exchangeCode("code", "https://rss.example.test/api/auth/callback"),
      { ...BASE_ENV, INTERNAL_SERVICE_SECRET: "configured-but-still-blocked" },
    );
    expect(result).toBeNull();
  });
});

test.describe("refreshTokens — Cloudflare WAF 403 の扱い", () => {
  test("403 + Cloudflare HTML + cf-ray → kind=transient (Cookie を失効させない)", async () => {
    const mock: FetchFn = async () =>
      new Response(
        `<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head></html>`,
        { status: 403, headers: { "Content-Type": "text/html", "cf-ray": "xyz-NRT" } },
      );
    const result = await withMockFetch(mock, () => refreshTokens("rt"), BASE_ENV);
    expect(result.kind).toBe("transient");
  });

  test("403 + JSON invalid_grant → kind=invalid (通常のトークン失効)", async () => {
    const mock: FetchFn = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), BASE_ENV);
    expect(result.kind).toBe("invalid");
  });

  test("403 + HTML でも cf-ray なし → kind=invalid (上流の素の 403)", async () => {
    const mock: FetchFn = async () =>
      new Response(`<html><body>Attention Required!</body></html>`, {
        status: 403,
        headers: { "Content-Type": "text/html" },
      });
    const result = await withMockFetch(mock, () => refreshTokens("rt"), BASE_ENV);
    expect(result.kind).toBe("invalid");
  });
});
