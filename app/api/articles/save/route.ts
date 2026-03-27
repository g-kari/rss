import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { isValidFeedUrl } from "@/lib/url";
import { r2Get, r2Put, sha256Hex, savedArticlesKey } from "@/lib/r2";
import { fetchFollowSafeRedirects, readBodyBytesPartial } from "@/lib/fetch";
import { unescapeHtml } from "@/lib/html";
import type { Article } from "@/types";

const MAX_SAVED_ARTICLES = 500;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 512 * 1024; // タイトル・OGP は先頭 512KB 以内にある

/** URL のページタイトルと OGP 画像を取得する */
async function fetchPageMeta(url: string): Promise<{ title: string; ogImage: string }> {
  try {
    const res = await fetchFollowSafeRedirects(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok || !res.body) return { title: "", ogImage: "" };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return { title: "", ogImage: "" };

    const bytes = await readBodyBytesPartial(res.body, MAX_BYTES);
    const html = new TextDecoder().decode(bytes);

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

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = unescapeHtml((titleMatch?.[1] ?? "").trim());
    const ogTitle = extractOgMeta("title");
    const rawOgImage = extractOgMeta("image");
    const ogImage = isValidFeedUrl(rawOgImage) ? rawOgImage : "";

    return {
      title: (ogTitle || pageTitle).slice(0, 500),
      ogImage,
    };
  } catch {
    return { title: "", ogImage: "" };
  }
}

/** POST /api/articles/save — URL から記事を保存する */
export async function POST(request: Request) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ url?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
    if (!isValidFeedUrl(url)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    // 決定論的 ID（同じ URL は常に同じ ID）
    const id = (await sha256Hex(`__saved__|${url}`)).slice(0, 16);

    const key = savedArticlesKey(session.userId);
    const saved = await r2Get<Article[]>(env.RSS_DATA, key, []);

    // すでに保存済みなら既存レコードをそのまま返す
    const existing = saved.find((a) => a.id === id);
    if (existing) return NextResponse.json(existing);

    if (saved.length >= MAX_SAVED_ARTICLES) {
      return NextResponse.json(
        { error: `保存記事の上限（${MAX_SAVED_ARTICLES}件）に達しました` },
        { status: 422 },
      );
    }

    const { title, ogImage } = await fetchPageMeta(url);

    const article: Article = {
      id,
      feedHash: "__saved__",
      guid: url,
      title: title || url,
      link: url,
      summary: "",
      ogImage: ogImage || undefined,
      publishedAt: null,
      createdAt: new Date().toISOString(),
    };

    await r2Put(env.RSS_DATA, key, [article, ...saved]);

    return NextResponse.json(article, { status: 201 });
  });
}
