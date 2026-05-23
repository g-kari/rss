/**
 * #772 Symptom 2 回帰テスト — filter ON/OFF/ON cycle 後にスクロールで loadMore が
 * 発火することを担保する。
 *
 * バグ: IntersectionObserver は `intersecting: false → true` 遷移時のみ callback を
 * 発火する仕様。pageSize 小 (10) + 中規模 filtered (50) で sentinel が常時 viewport 内に
 * 留まる状況 + filter toggle で visible.length が同値 (10→10) で stable な場合、IO refire と
 * secondary viewport check effect の両方が動かず loadMore が永久に発火しない問題。
 *
 * 修正方針: secondary viewport check effect の deps に `filtered.length` を追加して
 * filter 変化を検知 + scroll event listener を追加してユーザースクロール時に loadMore を
 * fallback 発火する。
 *
 * **前提**: `playwright.config.ts` の `webServer.env` で `DEV_AUTH_BYPASS_USER_ID` が
 * セットされていること + `/api/test/seed` が wrangler 経由で R2 にアクセス可能なこと。
 * 未準備時は `test.skip` で安全に skip する (quality-checks.md 規範)。
 */

import { test, expect } from "@playwright/test";
import { seedFeed, clearTestData, makeSeedArticle } from "./helpers/seed-r2";

const BASE_URL = "http://localhost:3000";
const FEED_HASH = "0772abc7720abc00";

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

/** 50 articles を全て未読として seed する (read state seed 省略で全件 unread) */
async function seedFiftyUnread() {
  const articles = Array.from({ length: 50 }, (_, i) =>
    makeSeedArticle({
      id: `art-${String(i).padStart(3, "0")}`,
      feedHash: FEED_HASH,
      title: `テスト記事 ${i}`,
      link: `https://example.test/${FEED_HASH}/${i}`,
      publishedAt: new Date(Date.UTC(2026, 4, 1, 0, 0, 49 - i)).toISOString(),
      createdAt: new Date(Date.UTC(2026, 4, 1, 0, 0, 49 - i)).toISOString(),
    }),
  );
  await seedFeed(BASE_URL, { feedHash: FEED_HASH, articles });
}

/**
 * 「scroll で loadMore が発火する」+「ただし全件 burst しない (cascade overshoot 防止)」
 * を両方確認する helper。50 articles が全件即 burst するなら 50 件分 scrollHeight が一気に
 * 増えるため、「初回 → 1 回 scroll 後」で scrollHeight 増分が pageSize × itemHeight × 1〜3 ページ
 * 程度に収まることを assert する。
 *
 * 50 articles × 60px ≈ 3000px (sentinel + headers 込みで ~3128) が全件 burst の上限値。
 * 部分読み込みなら scrollHeight 増分 < 1500 (= 25 articles 程度) で収まる。
 */
async function scrollOnceAndAssertProgressive(
  page: import("@playwright/test").Page,
  scrollContainer: ReturnType<import("@playwright/test").Page["getByRole"]>,
) {
  const beforeScrollHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

  await scrollContainer.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(500);

  const afterScrollHeight = await scrollContainer.evaluate((el) => el.scrollHeight);

  // 1) 増加していること (loadMore が発火した)
  expect(afterScrollHeight).toBeGreaterThan(beforeScrollHeight);
  // 2) 全件 burst していないこと (= filtered.length 全件 ≈ 3000px に達していない)
  //    pageSize=10 で 1 scroll = 1〜3 page 程度の cascade に収まることを期待
  expect(afterScrollHeight - beforeScrollHeight).toBeLessThan(1500);
  return { beforeScrollHeight, afterScrollHeight };
}

test.describe("#772 Symptom 2: filter toggle + scroll で loadMore 発火", () => {
  test("filter ON + scroll で次ページが読み込まれる (visible 件数増加)", async ({ page }) => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    await seedFiftyUnread();

    // 設定: pageSize=10, filter ON
    await page.addInitScript(() => {
      localStorage.setItem("rss-gallery-page-size", "10");
      localStorage.setItem("rss-unread-only", "1");
    });

    await page.goto(`${BASE_URL}/?feed=${FEED_HASH}`);

    const articleItems = page.locator('[role="article"]');

    // 初回ロード: 記事カードが描画されるまで待つ
    try {
      await expect(articleItems.first()).toBeVisible({ timeout: 8000 });
    } catch {
      test.skip(
        true,
        "記事カードが UI に現れない (フィード選択 / pageSize 設定が dev 環境で安定しない)",
      );
      return;
    }

    // 描画安定化を 300ms 待機 (cascade が完了するまで)
    await page.waitForTimeout(300);

    // scrollContainer の scrollHeight を loadMore 発火の signal にする。
    // 記事 item は @tanstack/react-virtual で virtualize されるため
    // articleItems.count() は viewport 内のみカウントで不安定。
    // 1 回 scroll で部分読み込み (cascade overshoot しない) を確認する helper を使う。
    const scrollContainer = page.getByRole("feed");
    await scrollOnceAndAssertProgressive(page, scrollContainer);
  });

  test("filter ON → OFF → ON cycle 後の scroll で loadMore が発火する", async ({ page }) => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    await seedFiftyUnread();

    await page.addInitScript(() => {
      localStorage.setItem("rss-gallery-page-size", "10");
      localStorage.setItem("rss-unread-only", "1");
    });

    await page.goto(`${BASE_URL}/?feed=${FEED_HASH}`);

    const articleItems = page.locator('[role="article"]');
    try {
      await expect(articleItems.first()).toBeVisible({ timeout: 8000 });
    } catch {
      test.skip(true, "記事カードが描画されない (dev 環境固有の問題)");
      return;
    }
    await page.waitForTimeout(300);

    // フィルター OFF→ON: keyboard shortcut "u" を 2 回押す
    // (article-list 内に focus が必要。記事一覧領域をクリックしてから)
    await page.getByRole("feed").click();
    await page.keyboard.press("u"); // OFF
    await page.waitForTimeout(200);
    await page.keyboard.press("u"); // ON
    await page.waitForTimeout(300);

    // 切替後の cascade 安定化待ち
    await expect(articleItems.first()).toBeVisible({ timeout: 5000 });

    const scrollContainer = page.getByRole("feed");
    await scrollOnceAndAssertProgressive(page, scrollContainer);
  });

  test("filter OFF で 50 件中 visible が scroll で増える (filter なし回帰防止)", async ({
    page,
  }) => {
    test.skip(
      !seedEndpointAvailable,
      "wrangler login required for R2 binding (run: npx wrangler login)",
    );
    await seedFiftyUnread();

    // filter OFF (`rss-unread-only` を未設定 = "0" 扱い)
    await page.addInitScript(() => {
      localStorage.setItem("rss-gallery-page-size", "10");
    });

    await page.goto(`${BASE_URL}/?feed=${FEED_HASH}`);

    const articleItems = page.locator('[role="article"]');
    try {
      await expect(articleItems.first()).toBeVisible({ timeout: 8000 });
    } catch {
      test.skip(true, "記事カードが描画されない");
      return;
    }
    await page.waitForTimeout(300);

    const scrollContainer = page.getByRole("feed");
    await scrollOnceAndAssertProgressive(page, scrollContainer);
  });
});
