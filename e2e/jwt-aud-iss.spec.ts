import { test, expect } from "@playwright/test";
import { verifyJwt } from "../src/lib/auth";

/**
 * `verifyJwt` の `aud` / `iss` クレーム検証テスト。
 *
 * 背景 (issue #100):
 *   従来は署名と `exp` のみ検証しており、`aud` (audience) / `iss` (issuer) クレームを
 *   確認していなかった。同じ 0g0 ID の別オーディエンス向けトークンを取得した攻撃者が
 *   rss.0g0.xyz で再利用できてしまう恐れがあったため、両クレームの検証を追加した。
 *
 * これらのチェックは JWKS 取得の前に行われるため、ネットワークモック不要で
 * パース可能な JWT を組み立てて挙動を検証できる。
 */

const AUTH_BASE_URL = "https://auth.example.test";
const CLIENT_ID = "rss-reader-client";

function base64urlEncode(obj: unknown): string {
  const json = JSON.stringify(obj);
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(payload: Record<string, unknown>, alg = "ES256"): string {
  const header = base64urlEncode({ alg, typ: "JWT", kid: "test-kid" });
  const body = base64urlEncode(payload);
  return `${header}.${body}.dummy-signature`;
}

function defaultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: "user-123",
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: AUTH_BASE_URL,
    aud: CLIENT_ID,
    ...overrides,
  };
}

async function withEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const original: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    original[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(original)) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  }
}

test.describe("verifyJwt — iss クレーム検証", () => {
  test("iss が欠落 → null", async () => {
    const token = makeJwt(defaultPayload({ iss: undefined }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("iss が別の発行者 → null", async () => {
    const token = makeJwt(defaultPayload({ iss: "https://evil.example.test" }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});

test.describe("verifyJwt — aud クレーム検証", () => {
  test("aud が欠落 → null", async () => {
    const token = makeJwt(defaultPayload({ aud: undefined }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("aud が別のクライアント（文字列） → null", async () => {
    const token = makeJwt(defaultPayload({ aud: "other-client" }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("aud 配列に CLIENT_ID を含まない → null", async () => {
    const token = makeJwt(defaultPayload({ aud: ["other-a", "other-b"] }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("CLIENT_ID 未設定 → null", async () => {
    const token = makeJwt(defaultPayload());
    const result = await withEnv({ CLIENT_ID: undefined }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  // aud=AUTH_BASE_URL は id.0g0.xyz の暫定実装に合わせてフォールバックとして許容する (TODO #379)
  // dummy-signature ではこのファイルで JWKS 検証まで通せないため、完全な受け入れテストは
  // e2e/auth.spec.ts 側の統合テストでカバーする。
});

test.describe("verifyJwt — 期限切れ・形状", () => {
  test("exp が過去 → null（既存挙動の回帰テスト）", async () => {
    const token = makeJwt(defaultPayload({ exp: Math.floor(Date.now() / 1000) - 10 }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("JWT シェイプ不正（2 パート） → null", async () => {
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt("a.b", AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});
