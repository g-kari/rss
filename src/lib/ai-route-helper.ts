import { NextResponse } from "next/server";
import { parseJsonBody, type AuthSession } from "@/lib/server-auth";
import { getAiCacheById, setAiCacheById } from "@/lib/ai-cache";
import { toPlainText } from "@/lib/html";
import { fetchArticleContent } from "@/lib/fetch-article-content";
import { isValidFeedUrl } from "@/lib/url";
import { aiCooldownKey } from "@/lib/r2";
import { checkAndUpdateCooldown } from "@/lib/rate-limit";

// @cf/meta/llama-3.1-8b-instruct は workers-types 未掲載のため、同じ
// BaseAiTextGeneration 構造を持つ既知モデル型に合わせてキャストする
const MODEL = "@cf/meta/llama-3.1-8b-instruct" as "@cf/meta/llama-3.1-8b-instruct-fp8";

// AI エンドポイントのレートリミット: キャッシュミス時のみ適用
const AI_COOLDOWN_MS = 5 * 1000; // 5秒

type AiMessage = { role: "system" | "user"; content: string };

/**
 * AI ルートハンドラの共通ロジック。
 * URL 検証・コンテンツ取得・キャッシュ確認・AI 実行・キャッシュ保存を担う。
 *
 * @param request - リクエストオブジェクト
 * @param env - Cloudflare バインディング (RSS_DATA, AI)
 * @param ctx - ExecutionContext (waitUntil 用)
 * @param buildMessages - テキストから AI メッセージ配列を構築する関数
 * @param cacheType - R2 キャッシュのサブディレクトリ名（デフォルト "summary"）
 */
export async function runAiJob(
  request: Request,
  session: AuthSession,
  env: { RSS_DATA: R2Bucket; AI: Ai },
  ctx: ExecutionContext,
  buildMessages: (plain: string) => AiMessage[],
  cacheType = "summary",
): Promise<NextResponse> {
  const parsed = await parseJsonBody<{ url?: unknown; articleId?: unknown }>(request);
  if (!parsed.ok) return parsed.error;
  const body = parsed.data;
  if (typeof body?.url !== "string" || !isValidFeedUrl(body.url)) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const url = body.url;
  const articleId = typeof body.articleId === "string" ? body.articleId : null;

  // キャッシュヒット時はレートリミット不要（AI を呼ばないため）
  if (articleId) {
    const cached = await getAiCacheById(env.RSS_DATA, articleId, cacheType);
    if (cached) return NextResponse.json({ result: cached });
  }

  const limited = await checkAndUpdateCooldown(
    env.RSS_DATA,
    aiCooldownKey(session.userId),
    AI_COOLDOWN_MS,
  );
  if (limited) return limited;

  // サーバー側でコンテンツを取得（/api/content と同じキャッシュを共有）
  const reqUrl = new URL(request.url);
  const content = await fetchArticleContent(url, reqUrl.origin, ctx);
  if (!content)
    return NextResponse.json({ error: "コンテンツを取得できませんでした" }, { status: 502 });

  const plain = toPlainText(content).slice(0, 6000);

  let result: string;
  try {
    const response = (await env.AI.run(MODEL, {
      messages: buildMessages(plain),
    })) as { response?: string };
    result = response.response ?? "";
  } catch (err) {
    console.error("[runAiJob] AI.run failed:", err);
    return NextResponse.json({ error: "AI処理中にエラーが発生しました" }, { status: 502 });
  }

  if (result && articleId)
    ctx.waitUntil(setAiCacheById(env.RSS_DATA, articleId, result, cacheType));

  return NextResponse.json({ result });
}
