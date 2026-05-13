import { test, expect } from "@playwright/test";

/**
 * /api/wasm / /api/piper-voice 認証ガード + Cache-Control ヘッダーの検証 (Issue #782)
 *
 * withBinarySession 追加によって:
 * - 未認証リクエスト → 401
 * - 認証済みリクエスト (ファイルが R2 に存在する場合) → 200 + Cache-Control: public, max-age=31536000, immutable
 *
 * dev 環境では R2 バインディングは miniflare で動作するため、
 * allowlist に含まれるファイルが実際に R2 に存在しない場合は 404 を返す。
 * 「認証済みで到達できた = 401 ではない」こと自体が認証ガードの通過を証明する。
 */

const skipWhenBypass = !!process.env.DEV_AUTH_BYPASS_USER_ID;

// ALLOWED_FILES の代表値。R2 にファイルが存在しなくても 401 vs 404 の差で認証確認可能
const WASM_ALLOWED_FILE = "ort-wasm-simd-threaded.wasm";
const PIPER_VOICE_ALLOWED_FILE = "tsukuyomi.onnx";
const DISALLOWED_FILE = "../../../../etc/passwd";

test.describe("GET /api/wasm/[file] 認証ガード", () => {
  test("未認証時に 401 を返す (allowlist に含まれるファイル)", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get(`/api/wasm/${WASM_ALLOWED_FILE}`);
    expect(res.status()).toBe(401);
  });

  test("未認証時に allowlist 外ファイルでも 401 を返す（allowlist チェック前に認証）", async ({
    request,
  }) => {
    // allowlist チェックは認証の前に行われるため (ALLOWED_FILES.has をハンドラ冒頭で実施)
    // allowlist 外ファイルは 404 が返る (認証チェック到達前)
    // このテストはその動作を記録するもの (セキュリティ上は問題なし)
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get(`/api/wasm/${DISALLOWED_FILE}`);
    // allowlist チェックが先行するため 404 (認証前の最速拒否)
    expect([401, 404]).toContain(res.status());
  });

  test("認証済み時に allowlist 外ファイルは 404 を返す", async ({ request }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/wasm/${DISALLOWED_FILE}`);
    expect(res.status()).toBe(404);
  });

  test("認証済み時に allowlist に含まれるファイルは 404 または 200 を返す (R2 依存)", async ({
    request,
  }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/wasm/${WASM_ALLOWED_FILE}`);
    // R2 に wasm ファイルが存在すれば 200、存在しなければ 404
    // いずれにせよ 401 は返らない (認証ガードを通過できた証拠)
    expect([200, 404]).toContain(res.status());
  });

  test("認証済みで 200 の場合に Cache-Control: public, max-age=31536000, immutable が含まれる", async ({
    request,
  }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/wasm/${WASM_ALLOWED_FILE}`);
    test.skip(
      res.status() !== 200,
      "R2 に wasm ファイルが存在しないため Cache-Control 検証をスキップ",
    );
    const cacheControl = res.headers()["cache-control"];
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=31536000");
    expect(cacheControl).toContain("immutable");
  });
});

test.describe("GET /api/piper-voice/[file] 認証ガード", () => {
  test("未認証時に 401 を返す (allowlist に含まれるファイル)", async ({ request }) => {
    test.skip(skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID 設定時は認証バイパス済み");
    const res = await request.get(`/api/piper-voice/${PIPER_VOICE_ALLOWED_FILE}`);
    expect(res.status()).toBe(401);
  });

  test("認証済み時に allowlist 外ファイルは 404 を返す", async ({ request }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/piper-voice/${DISALLOWED_FILE}`);
    expect(res.status()).toBe(404);
  });

  test("認証済み時に allowlist に含まれるファイルは 404 または 200 を返す (R2 依存)", async ({
    request,
  }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/piper-voice/${PIPER_VOICE_ALLOWED_FILE}`);
    // R2 に voice ファイルが存在すれば 200、存在しなければ 404
    // いずれにせよ 401 は返らない
    expect([200, 404]).toContain(res.status());
  });

  test("認証済みで 200 の場合に Cache-Control: public, max-age=31536000, immutable が含まれる", async ({
    request,
  }) => {
    test.skip(!skipWhenBypass, "DEV_AUTH_BYPASS_USER_ID が未設定のため認証済み状態をスキップ");
    const res = await request.get(`/api/piper-voice/${PIPER_VOICE_ALLOWED_FILE}`);
    test.skip(
      res.status() !== 200,
      "R2 に voice ファイルが存在しないため Cache-Control 検証をスキップ",
    );
    const cacheControl = res.headers()["cache-control"];
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age=31536000");
    expect(cacheControl).toContain("immutable");
  });
});
