import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { isValidFeedUrl, isValidPublicUrl } from "@/lib/url";
import {
  buildCacheKey,
  buildJsonCacheResponse,
  cachePutAsync,
  matchCfCache,
} from "@/lib/cache-helper";
import { unescapeHtml } from "@/lib/html";
import {
  fetchPageOgpMeta,
  fetchPageOgpMetaViaBrowserRendering,
  isTwitterLikeUrl,
  fetchTwitterFallbackImage,
} from "@/lib/ogp";
import { computeOgpCacheTtl } from "@/lib/ogp-cache-ttl";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { ogpCooldownKey } from "@/lib/r2";

const FETCH_TIMEOUT_MS = 5_000;
const OGP_RATE_WINDOW_MS = 60_000; // 60秒ウィンドウ
const OGP_RATE_MAX_CALLS = 120; // 60秒あたり最大120リクエスト (#806 案 B: ギャラリー一括展開時の 429 抑止のため緩和)

export async function GET(request: Request) {
  return withSession(request, ({ session, env, ctx }) =>
    handleGet(request, session.userId, env, ctx),
  );
}

async function handleGet(
  request: Request,
  userId: string,
  env: { RATE_LIMIT: KVNamespace; BROWSER: Fetcher },
  ctx: ExecutionContext,
): Promise<NextResponse> {
  // #978: cross-origin cache-filling CSRF ガード (fail-open: null は古いブラウザ/curl として通過)
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite !== null && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return apiError("Forbidden", 403, { code: "CSRF_ORIGIN_MISMATCH" });
  }

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
  // #779: KV 障害時も fail-closed (外部 fetch コスト・DoS を防ぐ)。
  // AI エンドポイント (ai-route-helper) と整合させた defense in depth。
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    ogpCooldownKey(userId),
    OGP_RATE_WINDOW_MS,
    OGP_RATE_MAX_CALLS,
    { failClosed: true },
  );
  if (limited) return limited;

  const meta = await fetchPageOgpMeta(url, FETCH_TIMEOUT_MS);
  let { title, description } = meta;
  const { image: rawImage, errorReason, upstreamStatus } = meta;
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

  // #768: bot 検出で primary fetch が失敗 (403 / challenge page) した場合は
  // Cloudflare Browser Rendering REST API で実ブラウザ fetch を試みる。
  // booth.pm のような Cloudflare Workers IP を block するサイトを救済する fallback。
  // 攻撃面: Browser Rendering 経由で任意 URL の OGP を取得できるため、isFallback=true で
  // 1 日 TTL に短縮して poisoning 影響範囲を限定する (Twitter fallback と同じ扱い)。
  if (
    !image &&
    !title &&
    !description &&
    (errorReason === "non_ok_status" || errorReason === "no_meta_tags")
  ) {
    const brMeta = await fetchPageOgpMetaViaBrowserRendering(url, env.BROWSER, FETCH_TIMEOUT_MS);
    const brImage = isValidPublicUrl(brMeta.image) ? brMeta.image : "";
    if (brImage || brMeta.title || brMeta.description) {
      title = brMeta.title;
      description = brMeta.description;
      image = brImage;
      isFallback = true;
      fallbackReason = "browser_rendering";
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
