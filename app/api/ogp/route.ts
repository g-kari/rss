import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { isValidFeedUrl, MAX_URL_LENGTH, normalizeUrlForCache } from "@/lib/url";
import { sha256Hex } from "@/lib/r2";
import { fetchFollowSafeRedirects, readBodyBytesPartial } from "@/lib/fetch";
import { unescapeHtml } from "@/lib/html";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BYTES = 512 * 1024; // og:image は先頭 512KB 以内にある
const OGP_CACHE_TTL_SEC = 30 * 24 * 60 * 60; // 30日
const OGP_NEGATIVE_CACHE_TTL_SEC = 24 * 60 * 60; // 1日（og:image なし・フェッチ失敗）

export async function GET(request: Request) {
  return withSession(({ ctx }) => handleGet(request, ctx));
}

async function handleGet(request: Request, ctx: ExecutionContext): Promise<NextResponse> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ image: "" });
  if (!isValidFeedUrl(url)) return NextResponse.json({ image: "" });

  const reqUrl = new URL(request.url);
  const cacheKey = new Request(
    `${reqUrl.origin}/__cache/ogp/${await sha256Hex(normalizeUrlForCache(url))}`,
  );
  const cfCache = caches.default;

  // Cloudflare Cache API で確認
  const cached = await cfCache.match(cacheKey);
  if (cached) {
    const data = (await cached.json()) as { image: string; title?: string; description?: string };
    // 旧キャッシュに &amp; エンコードの URL が残っている場合に備えてデコードし直す
    const decoded = unescapeHtml(data.image);
    const image = /^https?:\/\//i.test(decoded) ? decoded : data.image;
    return NextResponse.json(
      { image, title: data.title ?? "", description: data.description ?? "" },
      { headers: { "X-Cache": "HIT" } },
    );
  }

  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; rss-reader/1.0)",
          Accept: "text/html",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return NextResponse.json({ image: "" });

    // 先頭 MAX_BYTES だけ読んで og:image を探す
    if (!res.body) return NextResponse.json({ image: "" });
    const merged = await readBodyBytesPartial(res.body, MAX_BYTES);
    const html = new TextDecoder().decode(merged);

    const extractOgMeta = (property: string): string => {
      const m =
        html.match(
          new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, "i"),
        ) ??
        html.match(
          new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`, "i"),
        );
      return unescapeHtml(m?.[1] ?? "");
    };

    // og:image — data:/javascript: などの危険スキームと URL 長超過をブロック
    const rawImage = extractOgMeta("image");
    const image =
      /^https?:\/\//i.test(rawImage) && rawImage.length <= MAX_URL_LENGTH ? rawImage : "";
    const title = extractOgMeta("title").slice(0, 200);
    const description = extractOgMeta("description").slice(0, 500);

    // Cloudflare Cache API に保存（fire-and-forget）
    // 全フィールドが空でも短い TTL で負キャッシュ — 繰り返しフェッチを防ぐ
    const hasContent = !!(image || title || description);
    const ttl = hasContent ? OGP_CACHE_TTL_SEC : OGP_NEGATIVE_CACHE_TTL_SEC;
    const cacheRes = new Response(JSON.stringify({ image, title, description }), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${ttl}` },
    });
    ctx.waitUntil(
      cfCache.put(cacheKey, cacheRes).catch((err) => console.error("[ogp] cache put error:", err)),
    );

    return NextResponse.json({ image, title, description }, { headers: { "X-Cache": "MISS" } });
  } catch {
    return NextResponse.json({ image: "" });
  }
}
