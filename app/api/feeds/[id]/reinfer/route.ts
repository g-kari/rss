import { NextRequest, NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import {
  readUserSubscriptions,
  readFeedMeta,
  writeFeedMeta,
  assembleClientFeed,
} from "@/lib/shared-feed";
import { inferFeedFromUrl } from "@/lib/llm-feed-generator";
import { fetchSingleFeed } from "@/cron/fetch";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";
import { reinferCooldownKey } from "@/lib/r2";
import { MAX_FAILED_SELECTORS } from "@/lib/validation";

const REINFER_COOLDOWN_MS = 60 * 1000; // 60秒

/**
 * POST /api/feeds/:id/reinfer
 * LLM CSS セレクタを再推論する。
 * 既存のセレクタを消去し、inferFeedFromUrl で新たに推論してから記事を再取得する。
 * LLM 生成フィード（isScraping === true）のみ対象。
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: feedHash } = await params;
  return withSession(req, async ({ session, env }) => {
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    const sub = subs.find((s) => s.feedHash === feedHash);
    if (!sub) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });

    const meta = await readFeedMeta(env.RSS_DATA, feedHash);
    if (!meta) return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });

    if (!meta.cssSelectors) {
      return apiError("このフィードは LLM スクレイピングではありません", 400, {
        code: "NOT_LLM_FEED",
      });
    }

    // レートリミット: AI + 外部フェッチを伴う重い操作のため 60 秒クールダウン
    const limited = await checkAndUpdateCooldown(
      env.RATE_LIMIT,
      reinferCooldownKey(session.userId, feedHash),
      REINFER_COOLDOWN_MS,
    );
    if (limited) return limited;

    // 既存のセレクタを失敗履歴に積み上げ、先に R2 に保存する
    // 失敗時も failedSelectors が記録されるため、次回再推論で同じセレクタを除外できる
    // failedSelectors は最大 MAX_FAILED_SELECTORS 件に制限し R2 肥大化を防ぐ
    const previousSelector = meta.cssSelectors?.articleLink;
    const failedSelectors = [
      ...(meta.failedSelectors ?? []),
      ...(previousSelector ? [previousSelector] : []),
    ].slice(-MAX_FAILED_SELECTORS);
    meta.failedSelectors = failedSelectors;
    // cssSelectors はまだ消去しない状態で failedSelectors を先に R2 へ保存
    // 推論失敗時も cssSelectors（旧値）は R2 に残るため既存フィードは引き続き動作する
    await writeFeedMeta(env.RSS_DATA, meta);
    // 推論呼び出し時はメモリ上でのみ cssSelectors を消去して LLM に再推論させる
    delete meta.cssSelectors;
    const cookie = sub.requestCookie;
    const inferred = await inferFeedFromUrl(meta.url, env.AI, cookie, failedSelectors);
    if (!inferred) {
      return apiError("セレクタの再推論に失敗しました", 422, { code: "REINFER_FAILED" });
    }

    meta.cssSelectors = inferred.selectors;
    await writeFeedMeta(env.RSS_DATA, meta);

    // 新しいセレクタで記事を再取得
    const feed = await fetchSingleFeed(env, session.userId, feedHash);
    return NextResponse.json(feed ?? assembleClientFeed(meta, sub));
  });
}
