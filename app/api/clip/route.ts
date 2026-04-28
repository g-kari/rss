import { NextRequest, NextResponse } from "next/server";
import { withJsonBody } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { validateClipRequest } from "@/lib/clip";
import { extractMainContent } from "@/lib/content";
import { buildClipCacheKey, saveContentToCache } from "@/lib/fetch-article-content";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";
import { clipCooldownKey } from "@/lib/r2";

const CLIP_COOLDOWN_MS = 60 * 1000; // 1分

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
  return withJsonBody<{ html?: unknown; url?: unknown }>(
    req,
    async ({ body, session, env, ctx }) => {
      const limited = await checkAndUpdateCooldown(
        env.RATE_LIMIT,
        clipCooldownKey(session.userId),
        CLIP_COOLDOWN_MS,
      );
      if (limited) return limited;

      const validation = validateClipRequest(body);
      if (!validation.ok) {
        return apiError(validation.error, 400, { code: "INVALID_CLIP_PAYLOAD" });
      }

      const { html, url } = validation;

      const { content } = extractMainContent(html, url);

      // ユーザースコープのキャッシュに保存（共有キャッシュへの書き込みを防ぐ）
      const reqUrl = new URL(req.url);
      const cacheKey = await buildClipCacheKey(reqUrl.origin, session.userId, url);
      saveContentToCache(cacheKey, content, ctx);

      return NextResponse.json({ ok: true, url });
    },
  );
}
