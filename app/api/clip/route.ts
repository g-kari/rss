import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withSession, applyCooldown } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";
import { parseClipRequest } from "@/lib/clip";
import { authenticateClipToken } from "@/lib/clip-token";
import { persistClip, EmptyClipContentError } from "@/lib/clip-storage";
import { InvalidClipImageError } from "@/lib/clip-images";
import { SavedArticleLimitError, SavedArticleConflictError } from "@/lib/saved-articles";
import { clipCooldownKey } from "@/lib/r2";
import { buildCacheKey, deleteCfCache } from "@/lib/cache-helper";
import { isBetaAllowed } from "@/lib/beta-allowed";

const CLIP_COOLDOWN_MS = 60 * 1000;

/** CORS is confined to explicit bearer uploads; cookies are never granted cross-origin access. */
function finish(response: NextResponse, bearer: boolean): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  if (bearer) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  return response;
}
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
      "Cache-Control": "no-store",
    },
  });
}

/** SingleFile: multipart html(File)/url + a clip:write token. Legacy same-origin JSON remains valid. */
export async function POST(req: Request) {
  const authorization = req.headers.get("authorization");
  if (authorization === null) {
    return finish(
      await withSession(req, ({ session, env, origin }) => save(req, env, session.userId, origin)),
      false,
    );
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    const identity = await authenticateClipToken(env.RSS_DATA, authorization);
    if (!identity || !isBetaAllowed(identity.userId))
      return finish(
        apiError("保存用トークンが無効・期限切れ・失効済みです", 401, {
          code: "INVALID_CLIP_TOKEN",
        }),
        true,
      );
    return finish(await save(req, env, identity.userId, new URL(req.url).origin), true);
  } catch (error) {
    // Never log request headers, uploaded HTML or storage errors that could contain credentials.
    console.error("[clip] upload failed", error instanceof Error ? error.name : "UnknownError");
    return finish(
      apiError("保存できませんでした。時間をおいて再試行してください", 503, {
        code: "CLIP_UNAVAILABLE",
        retryable: true,
      }),
      true,
    );
  }
}

async function save(req: Request, env: CloudflareEnv, userId: string, origin: string) {
  const limited = await applyCooldown(env.RATE_LIMIT, clipCooldownKey(userId), CLIP_COOLDOWN_MS);
  if (limited) return limited;
  const parsed = await parseClipRequest(req);
  if (!parsed.ok) return apiError(parsed.error, parsed.status, { code: parsed.code });
  try {
    const result = await persistClip(env.RSS_DATA, userId, parsed.html, parsed.url);
    // Show a newly saved article on the next list request, while leaving shared feeds untouched.
    const key = await buildCacheKey(origin, "articles", `user:${userId}:feed:all:page:1`);
    await deleteCfCache(key);
    return NextResponse.json(
      { ok: true, url: parsed.url, article: result.article },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    if (error instanceof InvalidClipImageError)
      return apiError(error.message, 415, { code: "UNSUPPORTED_CLIP_IMAGE" });
    if (error instanceof EmptyClipContentError)
      return apiError(
        "本文を抽出できないか、抽出結果が5MiBを超えています。通常のHTML形式で保存してください",
        422,
        { code: "INVALID_CLIP_CONTENT" },
      );
    if (error instanceof SavedArticleLimitError)
      return apiError("保存記事の上限に達しました", 422, { code: "SAVED_LIMIT_REACHED" });
    if (error instanceof SavedArticleConflictError)
      return apiError("ほかの保存と競合しました。再試行してください", 409, {
        code: "SAVED_ARTICLE_CONFLICT",
        retryable: true,
      });
    throw error;
  }
}
