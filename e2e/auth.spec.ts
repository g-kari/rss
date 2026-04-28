import { test, expect } from "@playwright/test";
import { base64urlToBytes, verifyJwt, isCloudflareBlock } from "../src/lib/auth";

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

test.describe("base64urlToBytes", () => {
  test("標準的な Base64URL 文字列をデコードする", () => {
    const input = Buffer.from("hello world", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const bytes = base64urlToBytes(input);
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe("hello world");
  });

  test("パディングなしの Base64URL をデコードする", () => {
    const bytes = base64urlToBytes("YQ");
    expect(new TextDecoder().decode(bytes)).toBe("a");
  });

  test("空文字列 → 空の Uint8Array", () => {
    const bytes = base64urlToBytes("");
    expect(bytes.length).toBe(0);
  });

  test("+/ を含む標準 Base64 の代わりに -_ を使った Base64URL をデコードする", () => {
    const original = Buffer.from([0xfb, 0xff, 0xfe]);
    const b64url = original
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = base64urlToBytes(b64url);
    expect(Array.from(result)).toEqual([0xfb, 0xff, 0xfe]);
  });

  test("JSON オブジェクトを Base64URL エンコード→デコードのラウンドトリップ", () => {
    const obj = { sub: "user-1", exp: 9999999999 };
    const encoded = base64urlEncode(obj);
    const decoded = JSON.parse(new TextDecoder().decode(base64urlToBytes(encoded))) as Record<
      string,
      unknown
    >;
    expect(decoded).toEqual(obj);
  });
});

test.describe("verifyJwt — alg 検証", () => {
  test("alg が RS256 → null", async () => {
    const token = makeJwt(defaultPayload(), "RS256");
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("alg が HS256 → null", async () => {
    const token = makeJwt(defaultPayload(), "HS256");
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("alg が none → null", async () => {
    const token = makeJwt(defaultPayload(), "none");
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});

test.describe("verifyJwt — ヘッダー不正", () => {
  test("ヘッダーが不正な Base64URL → null", async () => {
    const token = `!!!invalid!!!.${base64urlEncode(defaultPayload())}.dummy`;
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("ヘッダーが有効な Base64URL だが不正な JSON → null", async () => {
    const invalidHeader = Buffer.from("not-json", "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const token = `${invalidHeader}.${base64urlEncode(defaultPayload())}.dummy`;
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});

test.describe("verifyJwt — JWT シェイプ不正", () => {
  test("1 パート → null", async () => {
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt("single-part", AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("4 パート → null", async () => {
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt("a.b.c.d", AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("空文字列 → null", async () => {
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt("", AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});

test.describe("verifyJwt — exp 検証の追加ケース", () => {
  test("exp が 0 → null", async () => {
    const token = makeJwt(defaultPayload({ exp: 0 }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });

  test("exp が欠落 → null", async () => {
    const token = makeJwt(defaultPayload({ exp: undefined }));
    const result = await withEnv({ CLIENT_ID }, () => verifyJwt(token, AUTH_BASE_URL));
    expect(result).toBeNull();
  });
});

test.describe("isCloudflareBlock", () => {
  test("cf-ray あり + text/html + attention required → true", () => {
    expect(
      isCloudflareBlock(
        "text/html; charset=UTF-8",
        "<html><title>Attention Required! | Cloudflare</title></html>",
        "abc123-NRT",
      ),
    ).toBe(true);
  });

  test("cf-ray あり + text/html + /cdn-cgi/challenge → true", () => {
    expect(
      isCloudflareBlock(
        "text/html",
        '<html><script src="/cdn-cgi/challenge-platform/generate/"></script></html>',
        "def456-NRT",
      ),
    ).toBe(true);
  });

  test("cf-ray なし → false（正規の HTML エラーページ）", () => {
    expect(
      isCloudflareBlock("text/html", "<html><title>Attention Required!</title></html>", null),
    ).toBe(false);
  });

  test("cf-ray あり + application/json → false（正規 API エラー）", () => {
    expect(
      isCloudflareBlock("application/json", '{"error":{"code":"invalid_grant"}}', "ghi789-NRT"),
    ).toBe(false);
  });

  test("cf-ray あり + text/html だが WAF シグナルなし → false", () => {
    expect(
      isCloudflareBlock(
        "text/html",
        "<html><body>Internal Server Error</body></html>",
        "jkl012-NRT",
      ),
    ).toBe(false);
  });

  test("contentType が null → false", () => {
    expect(isCloudflareBlock(null, "Attention Required!", "abc-NRT")).toBe(false);
  });

  test("body の先頭 2000 文字以内に WAF シグナルがある場合のみ検出", () => {
    const longPrefix = "x".repeat(1980);
    expect(isCloudflareBlock("text/html", `${longPrefix}attention required`, "ray-1")).toBe(true);
  });

  test("body の 2000 文字以降にのみ WAF シグナルがある場合 → false", () => {
    const longPrefix = "x".repeat(2001);
    expect(isCloudflareBlock("text/html", `${longPrefix}attention required`, "ray-2")).toBe(false);
  });

  test("大文字小文字を区別しない（Attention Required → true）", () => {
    expect(isCloudflareBlock("text/html", "ATTENTION REQUIRED", "ray-3")).toBe(true);
  });

  test("空の body → false", () => {
    expect(isCloudflareBlock("text/html", "", "ray-4")).toBe(false);
  });
});
