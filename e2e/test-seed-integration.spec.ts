/**
 * テスト用 seed エンドポイントの smoke test。
 *
 * - POST /api/test/seed が validation を通って 200 を返す
 * - DELETE /api/test/seed が 200 を返す
 * - 不正なボディは 400 を返す
 *
 * NOTE: /api/feeds 経由の確認は dev 環境で `caches` が未定義のため避ける。
 * 投入後の参照確認は別 e2e テスト（フィード一覧・記事一覧 UI）で行う。
 */

import { test, expect } from "@playwright/test";
import { seedFeed, clearTestData, makeSeedArticle } from "./helpers/seed-r2";

const BASE_URL = "http://localhost:3000";

// `/api/test/seed` は内部で `getCloudflareContext()` 経由で R2 にアクセスする。
// `next dev` 環境では Cloudflare バインディングが wrangler のリモートモードで提供
// されるため、`wrangler login` していないと 500 エラーになる。
// 環境セットアップに依存する事前条件のため、未認証時はスイート全体を skip する。
let seedEndpointAvailable = true;
test.beforeAll(async ({ request }) => {
  try {
    const res = await request.post(`${BASE_URL}/api/test/seed`, { data: {} });
    seedEndpointAvailable = res.status() === 200;
  } catch {
    seedEndpointAvailable = false;
  }
});

test.describe("/api/test/seed", () => {
  test("POST seed: 正しいボディで 200 を返す", async () => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    await expect(
      seedFeed(BASE_URL, {
        feedHash: "abc1234567890def",
        title: "Seeded Test Feed",
        articles: [makeSeedArticle({ id: "art-1", feedHash: "abc1234567890def" })],
      }),
    ).resolves.toBeUndefined();
  });

  test("DELETE seed: 200 を返す（ユーザーデータをクリア）", async () => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    await expect(clearTestData(BASE_URL)).resolves.toBeUndefined();
  });

  test("不正な feedHash 形式は 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/test/seed`, {
      data: { feeds: [{ feedHash: "INVALID", meta: {}, articles: [] }] },
    });
    expect(res.status()).toBe(400);
  });

  test("非オブジェクトボディは 400", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/test/seed`, {
      data: "string body",
    });
    expect(res.status()).toBe(400);
  });

  test("空オブジェクトボディは 200（何も seed しない）", async ({ request }) => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    const res = await request.post(`${BASE_URL}/api/test/seed`, {
      data: {},
    });
    expect(res.status()).toBe(200);
  });
});
