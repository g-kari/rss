import { NextRequest, NextResponse } from "next/server";
import { withSession, parseJsonBody } from "@/lib/server-auth";
import { validateClipRequest } from "@/lib/clip";
import { extractMainContent } from "@/lib/content";
import { buildContentCacheKey, saveContentToCache } from "@/lib/fetch-article-content";

/**
 * POST /api/clip
 *
 * SingleFile ブラウザ拡張から送信されたページ全体の HTML を受け取り、
 * 本文を抽出して Cloudflare Cache API に保存する。
 *
 * 設定例 (SingleFile 拡張):
 *   - Upload to REST Form API: https://rss.0g0.xyz/api/clip
 *   - archive data field: html
 *   - URL field: url
 */
export async function POST(req: NextRequest) {
  return withSession(async ({ ctx }) => {
    const parsed = await parseJsonBody<{ html?: unknown; url?: unknown }>(req);
    if (!parsed.ok) return parsed.error;

    const validation = validateClipRequest(parsed.data);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { html, url } = validation;

    // 本文抽出
    const { content } = extractMainContent(html, url);

    // Cloudflare Cache API に保存（/api/content と同じキー形式）
    const reqUrl = new URL(req.url);
    const cacheKey = await buildContentCacheKey(reqUrl.origin, url);
    saveContentToCache(cacheKey, content, ctx);

    return NextResponse.json({ ok: true, url });
  });
}
