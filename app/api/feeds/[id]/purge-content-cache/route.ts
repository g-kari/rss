import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError, assertValidFeedHash } from "@/lib/api-error";
import { assertFeedSubscribed } from "@/lib/api-feed-guard";
import { deleteCfCache } from "@/lib/cache-helper";
import { buildClipCacheKey, buildContentCacheKey } from "@/lib/fetch-article-content";
import { readLatestArticles, readArticlePage } from "@/lib/shared-feed";

/**
 * フィード（feedHash）に紐づく全記事の Cloudflare Cache (content + clip) を削除する。
 *
 * CLI 経由で `curl -X POST` から呼ぶ想定：
 *
 * @example
 * curl -X POST -H "Cookie: access_token=..." \
 *   "https://rss.0g0.xyz/api/feeds/92bd33f28976b959/purge-content-cache"
 *
 * R2 から記事一覧を読み出し、各記事 link の Cache を削除する。
 * 認証必須 + **購読チェック必須** (#691): リクエストユーザーが対象 feedHash を購読していない場合、
 * 他ユーザーの shared cache を意図的に無効化できてしまう (cache busting DoS) ため 404 を返す。
 * Cache はユーザー横断のため、購読中のフィードのみ自分の判断で一括クリアできる設計。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // hash check は認証前 fast-fail (route.ts / refresh.ts と統一)
  const { id: feedHash } = await params;
  const validationErr = assertValidFeedHash(feedHash);
  if (validationErr) return validationErr;

  return withSession(request, async ({ session, env }) => {
    // #691: 購読チェック — 未購読フィードへの purge は 404 で拒否
    const guard = await assertFeedSubscribed(env.RSS_DATA, session.userId, feedHash);
    if (guard.err) return guard.err;

    const reqUrl = new URL(request.url);

    // 最新ページ + 過去ページの全記事を読み出す（記事数が PAGE_SIZE=500 を超える場合に対応）
    const allArticles = [...(await readLatestArticles(env.RSS_DATA, feedHash))];
    let page = 2;
    while (page <= 10) {
      const pageArticles = await readArticlePage(env.RSS_DATA, feedHash, page);
      if (pageArticles.length === 0) break;
      allArticles.push(...pageArticles);
      page++;
    }

    if (allArticles.length === 0) {
      return apiError("No articles found for this feed", 404, { code: "FEED_NOT_FOUND" });
    }

    let purged = 0;
    let failed = 0;

    // 各記事 link について shared + clip Cache を削除
    await Promise.all(
      allArticles.map(async (article) => {
        if (!article.link) return;
        try {
          const sharedKey = await buildContentCacheKey(reqUrl.origin, article.link);
          const clipKey = await buildClipCacheKey(reqUrl.origin, session.userId, article.link);
          await Promise.all([deleteCfCache(sharedKey), deleteCfCache(clipKey)]);
          purged++;
        } catch {
          failed++;
        }
      }),
    );

    return NextResponse.json({
      ok: true,
      feedHash,
      total: allArticles.length,
      purged,
      failed,
    });
  });
}
