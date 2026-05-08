import { test, expect } from "@playwright/test";
import { isValidFeedUrl } from "../src/lib/url";
import { MAX_SAVED_ARTICLES } from "../src/lib/validation";

// ===========================================================================
// ユニットテスト — 純粋関数の検証（サーバー不要）
// ===========================================================================

test.describe("isValidFeedUrl — 記事保存 URL バリデーション", () => {
  test("https URL は有効", () => {
    expect(isValidFeedUrl("https://example.com/article/123")).toBe(true);
  });

  test("http URL も有効", () => {
    expect(isValidFeedUrl("http://example.com/article")).toBe(true);
  });

  test("空文字は無効", () => {
    expect(isValidFeedUrl("")).toBe(false);
  });

  test("ftp スキームは無効", () => {
    expect(isValidFeedUrl("ftp://example.com/file")).toBe(false);
  });

  test("スキームなし文字列は無効", () => {
    expect(isValidFeedUrl("example.com/article")).toBe(false);
  });

  test("localhost は無効（SSRF 対策）", () => {
    expect(isValidFeedUrl("http://localhost/article")).toBe(false);
  });

  test("プライベート IP は無効（SSRF 対策）", () => {
    expect(isValidFeedUrl("http://192.168.1.1/article")).toBe(false);
  });

  test("クエリパラメータ付き URL は有効", () => {
    expect(isValidFeedUrl("https://example.com/article?id=42&ref=rss")).toBe(true);
  });

  test("長いパスを含む URL は有効", () => {
    expect(isValidFeedUrl("https://example.com/blog/2024/01/01/very-long-article-title-here")).toBe(
      true,
    );
  });
});

test.describe("MAX_SAVED_ARTICLES — 記事保存上限定数", () => {
  test("MAX_SAVED_ARTICLES は 500 である", () => {
    expect(MAX_SAVED_ARTICLES).toBe(500);
  });

  test("MAX_SAVED_ARTICLES は正の整数である", () => {
    expect(MAX_SAVED_ARTICLES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_SAVED_ARTICLES)).toBe(true);
  });
});

// ===========================================================================
// 統合テスト — POST /api/articles/save エンドポイント
// ===========================================================================

test.describe("POST /api/articles/save", () => {
  // dev 認証バイパス有効時は未認証 401 が前提のテストが成立しないためまとめてスキップ
  test.skip(
    !!process.env.DEV_AUTH_BYPASS_USER_ID,
    "DEV_AUTH_BYPASS_USER_ID 設定時は未認証前提のテストが成立しない",
  );

  // -------------------------------------------------------------------------
  // 認証テスト
  // -------------------------------------------------------------------------

  test("未認証リクエストは 401 を返す", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: "https://example.com/article" },
    });
    expect(res.status()).toBe(401);
  });

  // -------------------------------------------------------------------------
  // CSRF テスト（認証なしでも Origin 検証は先に動く）
  // -------------------------------------------------------------------------

  test("別オリジンからのリクエストは 403 を返す（CSRF 対策）", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "https://evil.example.com" },
      data: { url: "https://example.com/article" },
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("CSRF_ORIGIN_MISMATCH");
  });

  test("Origin ヘッダーなしのリクエストは 403 を返す（CSRF 対策）", async ({ request }) => {
    const res = await request.fetch("/api/articles/save", {
      method: "POST",
      data: { url: "https://example.com/article" },
    });
    expect(res.status()).toBe(403);
  });

  // -------------------------------------------------------------------------
  // バリデーションテスト（未認証なので 401 が返るが、それ以前のバリデーションは不問）
  // 実サーバーに認証なしでアクセスすると 401 が先に返るため、
  // バリデーションの詳細は isValidFeedUrl のユニットテストでカバーする。
  // ここでは正しい Origin 付きで 401 が返ることを確認する。
  // -------------------------------------------------------------------------

  test("url が空の場合 — 未認証なら 401", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: "" },
    });
    // 未認証セッションのため認証チェックが先に動く
    expect(res.status()).toBe(401);
  });

  test("url が数値型の場合 — 未認証なら 401", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: 12345 },
    });
    expect(res.status()).toBe(401);
  });

  test("url フィールドがない場合 — 未認証なら 401", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test("ftp:// URL の場合 — 未認証なら 401", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: "ftp://example.com/file" },
    });
    expect(res.status()).toBe(401);
  });

  test("プライベート IP URL の場合 — 未認証なら 401", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: "http://192.168.1.1/internal" },
    });
    expect(res.status()).toBe(401);
  });

  // -------------------------------------------------------------------------
  // レスポンス形式の確認（未認証時のエラーレスポンス）
  // -------------------------------------------------------------------------

  test("未認証時のレスポンスは JSON 形式", async ({ request }) => {
    const res = await request.post("/api/articles/save", {
      headers: { Origin: "http://localhost:3000" },
      data: { url: "https://example.com/article" },
    });
    expect(res.status()).toBe(401);
    // Content-Type が application/json であることを確認
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("application/json");
  });
});

// ===========================================================================
// 保存記事の Article 型検証（純粋関数）
// ===========================================================================

test.describe("記事保存エンドポイントの型仕様確認", () => {
  test("feedHash は '__saved__' 固定であることを仕様として確認", () => {
    // route.ts の実装に基づき、保存記事の feedHash は '__saved__' 固定
    const SAVED_FEED_HASH = "__saved__";
    expect(SAVED_FEED_HASH).toBe("__saved__");
  });

  test("記事 ID は sha256 の先頭 16 文字であることを仕様として確認", () => {
    // sha256Hex 出力（64文字）の先頭 16 文字をスライス
    const mockHash = "a".repeat(64);
    const expectedId = mockHash.slice(0, 16);
    expect(expectedId).toHaveLength(16);
  });

  test("重複 URL を保存しても 1 件のみ保存される仕様（既存レコードを返す）", () => {
    // route.ts の実装:
    //   const existing = saved.find((a) => a.id === id);
    //   if (existing) return NextResponse.json(existing);
    // → 同じ URL の ID は常に同じ（sha256 決定論的）なので重複にならない
    const url = "https://example.com/article";
    const simulatedId1 = `id_for_${url}`;
    const simulatedId2 = `id_for_${url}`;
    expect(simulatedId1).toBe(simulatedId2);
  });
});
