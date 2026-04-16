import { NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { isValidFeedUrl } from "@/lib/url";
import { r2Get, r2Put, sha256Hex, savedArticlesKey } from "@/lib/r2";
import { fetchPageOgpMeta } from "@/lib/ogp";
import type { Article } from "@/types";

const MAX_SAVED_ARTICLES = 500;
const FETCH_TIMEOUT_MS = 8_000;

/** POST /api/articles/save — URL から記事を保存する */
export async function POST(request: Request) {
  return withSession(async ({ session, env }) => {
    const parsed = await parseJsonBody<{ url?: unknown }>(request);
    if (!parsed.ok) return parsed.error;
    const body = parsed.data;

    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) return apiError("url is required", 400, { code: "INVALID_URL" });
    if (!isValidFeedUrl(url)) {
      return apiError("Invalid URL", 400, { code: "INVALID_URL" });
    }

    // 決定論的 ID（同じ URL は常に同じ ID）
    const id = (await sha256Hex(`__saved__|${url}`)).slice(0, 16);

    const key = savedArticlesKey(session.userId);
    const saved = await r2Get<Article[]>(env.RSS_DATA, key, []);

    // すでに保存済みなら既存レコードをそのまま返す
    const existing = saved.find((a) => a.id === id);
    if (existing) return NextResponse.json(existing);

    if (saved.length >= MAX_SAVED_ARTICLES) {
      return apiError(`保存記事の上限（${MAX_SAVED_ARTICLES}件）に達しました`, 422, {
        code: "SAVED_LIMIT_REACHED",
      });
    }

    const { title, image: ogImage } = await fetchPageOgpMeta(url, FETCH_TIMEOUT_MS);

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
