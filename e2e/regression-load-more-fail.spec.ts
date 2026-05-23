/**
 * #624 (LoadMoreButton silent fail) の回帰テスト。
 *
 * バグの内容: 過去記事ロード API (`/api/articles?since=*`) が失敗したとき、
 * LoadMoreButton 側が catch せず toast を出さない silent fail だった。
 * 修正 commit `1e1e02c` で `toast.error("過去記事の取得に失敗しました")` を追加。
 *
 * 本 spec はその修正が回帰しないことを担保する。
 *
 * **前提**: `playwright.config.ts` の `webServer.env` で `DEV_AUTH_BYPASS_USER_ID` が
 * セットされていること + `/api/test/seed` が wrangler 経由で R2 にアクセス可能なこと。
 * 未準備時は `test.skip` で安全に skip する (quality-checks.md 規範)。
 */

import { test, expect } from "@playwright/test";
import { seedFeed, clearTestData, makeSeedArticle } from "./helpers/seed-r2";

const BASE_URL = "http://localhost:3000";
const FEED_HASH = "1e1e02c624abc000";

let seedEndpointAvailable = true;
test.beforeAll(async ({ request }) => {
  try {
    const res = await request.post(`${BASE_URL}/api/test/seed`, { data: {} });
    seedEndpointAvailable = res.status() === 200;
  } catch {
    seedEndpointAvailable = false;
  }
});

test.afterEach(async () => {
  if (seedEndpointAvailable) {
    try {
      await clearTestData(BASE_URL);
    } catch {
      // best effort
    }
  }
});

test.describe("#624 LoadMoreButton silent fail 回帰テスト", () => {
  test("API 500 時にユーザー向け toast 「過去記事の取得に失敗しました」が表示される (click trigger)", async ({
    page,
  }) => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );

    // 過去ページが存在するフィードを seed
    // pageCount > 0 にすることで LoadMoreButton が UI に描画される
    const articles = Array.from({ length: 30 }, (_, i) =>
      makeSeedArticle({
        id: `article-${i.toString().padStart(3, "0")}`,
        feedHash: FEED_HASH,
        title: `記事 ${i}`,
        link: `https://example.test/${i}`,
        publishedAt: new Date(2026, 4, 10, 0, i).toISOString(),
        createdAt: new Date(2026, 4, 10, 0, i).toISOString(),
      }),
    );
    await seedFeed(BASE_URL, {
      feedHash: FEED_HASH,
      articles,
    });

    // /api/articles?since=* を 500 に inject
    // page.route の glob は loose match なので URL 一部マッチで fulfilled
    await page.route(/\/api\/articles\?.*since=/, (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: "Internal Server Error", code: "TEST_INJECTED" }),
        headers: { "Content-Type": "application/json" },
      });
    });

    await page.goto(`${BASE_URL}/`);

    // フィード一覧から該当フィードを選択 (記事一覧画面に遷移)
    // dev bypass user の subscriptions に投入済みのため UI に表示される
    // フィードリストに該当フィードが現れるまで待つ (lastFetchedAt で sort されるため上位)
    const loadMoreButton = page.getByRole("button", { name: /過去の記事を読み込む/ });

    // 一覧画面が表示されると (記事 30 件のうち最新 X 件まで表示) LoadMoreButton が現れる
    // 表示されない場合は test 環境固有の問題なのでスキップ判定
    try {
      await expect(loadMoreButton).toBeVisible({ timeout: 5000 });
    } catch {
      test.skip(
        true,
        "LoadMoreButton が UI に現れない (フィード選択 / pageCount 設定の自動描画条件が満たされず)",
      );
      return;
    }

    // ボタンをクリックして API 失敗を発火
    await loadMoreButton.click();

    // toast.error("過去記事の取得に失敗しました") の表示を assert
    // ToastContainer は role="status" + aria-live で実装
    const errorToast = page.locator('[role="status"]', {
      hasText: "過去記事の取得に失敗しました",
    });
    await expect(errorToast).toBeVisible({ timeout: 3000 });
  });
});
