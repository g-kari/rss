import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { isValidFeedUrl, isValidPublicUrl } from "@/lib/url";
import {
  buildCacheKey,
  buildJsonCacheResponse,
  cachePutAsync,
  matchCfCache,
} from "@/lib/cache-helper";
import { unescapeHtml } from "@/lib/html";
import { fetchPageOgpMeta, isTwitterLikeUrl, fetchTwitterFallbackImage } from "@/lib/ogp";
import { computeOgpCacheTtl } from "@/lib/ogp-cache-ttl";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { ogpCooldownKey } from "@/lib/r2";

const FETCH_TIMEOUT_MS = 5_000;
const OGP_RATE_WINDOW_MS = 60_000; // 60秒ウィンドウ
const OGP_RATE_MAX_CALLS = 30; // 60秒あたり最大30リクエスト

export async function GET(request: Request) {
  return withSession(request, ({ session, env, ctx }) =>
    handleGet(request, session.userId, env, ctx),
  );
}

async function handleGet(
  request: Request,
  userId: string,
  env: { RATE_LIMIT: KVNamespace },
  ctx: ExecutionContext,
): Promise<NextResponse> {
  const reqUrl = new URL(request.url);
  const url = reqUrl.searchParams.get("url");
  // #768: cache buster — `?refresh=1` で cache lookup を skip して必ず上流再取得
  // (negative cache に張り付いた x.com / booth.pm 等のデバッグ + 復旧用)
  const skipCache = reqUrl.searchParams.get("refresh") === "1";
  if (!url) return NextResponse.json({ image: "" });
  if (!isValidFeedUrl(url)) return NextResponse.json({ image: "" });

  const cacheKey = await buildCacheKey(reqUrl.origin, "ogp", url);

  // Cloudflare Cache API で確認（HIT 時はレートリミット不要）
  if (!skipCache) {
    const cached = await matchCfCache(cacheKey);
    if (cached) {
      const data = (await cached.json()) as {
        image: string;
        title?: string;
        description?: string;
      };
      // &amp; エンコードされた旧キャッシュエントリに対応するため unescapeHtml でデコードする
      const decoded = unescapeHtml(data.image);
      const image = isValidPublicUrl(decoded) ? decoded : "";
      return NextResponse.json(
        { image, title: data.title ?? "", description: data.description ?? "" },
        { headers: { "X-Cache": "HIT" } },
      );
    }
  }

  // キャッシュ MISS 時のみレートリミット（外部フェッチの連打防止）
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    ogpCooldownKey(userId),
    OGP_RATE_WINDOW_MS,
    OGP_RATE_MAX_CALLS,
  );
  if (limited) return limited;

  const meta = await fetchPageOgpMeta(url, FETCH_TIMEOUT_MS);
  const { title, description, image: rawImage, errorReason, upstreamStatus } = meta;
  let image = isValidPublicUrl(rawImage) ? rawImage : "";
  let isFallback = false;
  let fallbackReason: string | null = null;

  // X/Twitter 投稿で OGP 画像がない場合、投稿内リンク先の OGP 画像をフォールバック取得
  // (#706) この経路は攻撃者が tweet 経由で任意 image を shared cache に注入可能なため、
  // TTL を 1 日に短縮 (computeOgpCacheTtl) して poisoning 影響範囲を限定する
  if (!image && isTwitterLikeUrl(url)) {
    const fallbackImage = await fetchTwitterFallbackImage(url);
    if (fallbackImage) {
      image = fallbackImage;
      isFallback = true;
      fallbackReason = "twitter_link_fallback";
    }
  }

  // Cloudflare Cache API に保存（fire-and-forget）
  // 全フィールドが空でも短い TTL で負キャッシュ — 繰り返しフェッチを防ぐ
  const hasContent = !!(image || title || description);
  const ttl = computeOgpCacheTtl({ hasContent, isFallback });
  cachePutAsync(cacheKey, buildJsonCacheResponse({ image, title, description }, ttl), ctx, "ogp");

  // #768: 観測性ヘッダー — DevTools / wrangler tail で失敗経路を即特定可能に
  const headers: Record<string, string> = { "X-Cache": skipCache ? "BYPASS" : "MISS" };
  if (errorReason) headers["X-Ogp-Error"] = errorReason;
  if (upstreamStatus !== null) headers["X-Ogp-Upstream-Status"] = String(upstreamStatus);
  if (fallbackReason) headers["X-Ogp-Fallback"] = fallbackReason;

  return NextResponse.json({ image, title, description }, { headers });
}
