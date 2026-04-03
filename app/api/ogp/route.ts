import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { isValidFeedUrl, isValidPublicUrl } from "@/lib/url";
import { buildCacheKey, cachePutAsync } from "@/lib/r2";
import { unescapeHtml } from "@/lib/html";
import { fetchPageOgpMeta } from "@/lib/ogp";

const FETCH_TIMEOUT_MS = 5_000;
const OGP_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const OGP_NEGATIVE_CACHE_TTL_SEC = 24 * 60 * 60; // 1日（og:image なし・フェッチ失敗）

export async function GET(request: Request) {
  return withSession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<NextResponse> {
  const reqUrl = new URL(request.url);
  const url = reqUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ image: "" });
  if (!isValidFeedUrl(url)) return NextResponse.json({ image: "" });

  const cacheKey = await buildCacheKey(reqUrl.origin, "ogp", url);

  // Cloudflare Cache API で確認
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { image: string; title?: string; description?: string };
    // &amp; エンコードされた旧キャッシュエントリに対応するため unescapeHtml でデコードする
    const decoded = unescapeHtml(data.image);
    const image = isValidPublicUrl(decoded) ? decoded : "";
    return NextResponse.json(
      { image, title: data.title ?? "", description: data.description ?? "" },
      { headers: { "X-Cache": "HIT" } },
    );
  }

  const { title, description, image: rawImage } = await fetchPageOgpMeta(url, FETCH_TIMEOUT_MS);
  const image = isValidPublicUrl(rawImage) ? rawImage : "";

  // Cloudflare Cache API に保存（fire-and-forget）
  // 全フィールドが空でも短い TTL で負キャッシュ — 繰り返しフェッチを防ぐ
  const hasContent = !!(image || title || description);
  const ttl = hasContent ? OGP_CACHE_TTL_SEC : OGP_NEGATIVE_CACHE_TTL_SEC;
  cachePutAsync(
    cacheKey,
    new Response(JSON.stringify({ image, title, description }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    }),
    ctx,
    "ogp",
  );

  return NextResponse.json({ image, title, description }, { headers: { "X-Cache": "MISS" } });
}
