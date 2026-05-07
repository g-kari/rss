import { NextResponse } from "next/server";
import { parseJsonBody, type AuthSession } from "@/lib/server-auth";
import { getAiCacheById, setAiCacheById, type AiCacheType } from "@/lib/ai-cache";
import { toPlainText } from "@/lib/html";
import { fetchArticleContent } from "@/lib/fetch-article-content";
import { isValidFeedUrl } from "@/lib/url";
import { aiRateLimitKey } from "@/lib/r2";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

import { AI_MODELS, type WorkersAiModelId, DEFAULT_AI_MODEL } from "./ai-models";

const VALID_MODEL_IDS = AI_MODELS.map((m) => m.id) as WorkersAiModelId[];

const AI_WINDOW_MS = 60 * 1000;
const AI_MAX_CALLS = 20;
const AI_MAX_CALLS_70B = 3;

type AiMessage = { role: "system" | "user"; content: string };

function isAiError(err: unknown): err is { status: number; headers?: Record<string, string> } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
  );
}

/**
 * AI ルートハンドラの共通ロジック。
 * URL 検証・コンテンツ取得・キャッシュ確認・AI 実行・キャッシュ保存を担う。
 *
 * ## 処理フロー
 * 1. リクエストボディから url / articleId を取得
 * 2. articleId がある場合は R2 キャッシュを確認（ヒット時は AI 呼び出しをスキップ）
 * 3. スライディングウィンドウ レートリミット（60 秒間に最大 10 回、AI 実行分のみカウント）
 * 4. /api/content と共有する Cloudflare Cache から記事コンテンツを取得
 * 5. Workers AI を呼び出して結果を取得
 * 6. 結果を R2 キャッシュに保存（fire-and-forget）
 *
 * @param request - リクエストオブジェクト（ボディに url / articleId を含む）
 * @param session - 認証済みセッション（レートリミットのキーに userId を使用）
 * @param env - Cloudflare バインディング (RSS_DATA, AI)
 * @param ctx - ExecutionContext (waitUntil 用)
 * @param buildMessages - プレーンテキストから AI メッセージ配列を構築するコールバック
 * @param cacheType - R2 キャッシュのサブディレクトリ名（デフォルト "summary"）
 */
export async function runAiJob(
  request: Request,
  session: AuthSession,
  env: { RSS_DATA: R2Bucket; AI: Ai; RATE_LIMIT: KVNamespace },
  ctx: ExecutionContext,
  buildMessages: (plain: string) => AiMessage[],
  cacheType: AiCacheType = "summary",
): Promise<NextResponse> {
  const parsed = await parseJsonBody<{ url?: unknown; articleId?: unknown; model?: unknown }>(
    request,
  );
  if (!parsed.ok) return parsed.error;
  const body = parsed.data;
  if (typeof body?.url !== "string" || !isValidFeedUrl(body.url)) {
    return apiError("url is required", 400, { code: "INVALID_URL" });
  }

  const url = body.url;
  const articleId =
    typeof body.articleId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(body.articleId)
      ? body.articleId
      : null;

  const model: WorkersAiModelId =
    typeof body.model === "string" && VALID_MODEL_IDS.includes(body.model as WorkersAiModelId)
      ? (body.model as WorkersAiModelId)
      : DEFAULT_AI_MODEL;

  const is70b = model === "@cf/meta/llama-3.1-70b-instruct";

  if (articleId) {
    const cached = await getAiCacheById(env.RSS_DATA, articleId, cacheType);
    if (cached) return NextResponse.json({ result: cached });
  }

  // AI エンドポイントは課金が発生するため KV 障害時も fail-closed にする（Issue #463）
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    aiRateLimitKey(session.userId),
    AI_WINDOW_MS,
    is70b ? AI_MAX_CALLS_70B : AI_MAX_CALLS,
    { failClosed: true },
  );
  if (limited) return limited;

  // サーバー側でコンテンツを取得（/api/content と同じキャッシュを共有）
  const reqUrl = new URL(request.url);
  const content = await fetchArticleContent(url, reqUrl.origin, ctx);
  if (!content)
    return apiError("コンテンツを取得できませんでした", 502, {
      code: "CONTENT_FETCH_FAILED",
      retryable: true,
    });

  // プロンプトインジェクション対策:
  // 1. toPlainText で HTML タグを除去
  // 2. < > をエスケープしてデリミタ破壊を防止
  // 3. <article> デリミタで囲んでユーザーコンテンツ境界を明示
  const sanitized = toPlainText(content).slice(0, 8000).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const plain = `<article>\n${sanitized}\n</article>`;

  let result: string;
  try {
    const response = (await env.AI.run(model as AiModelId, {
      messages: buildMessages(plain),
      max_tokens: 2048,
    })) as { response?: string };
    result = response.response ?? "";
  } catch (err) {
    console.error("[runAiJob] AI.run failed:", err);
    if (isAiError(err)) {
      if (err.status === 429) {
        const retryAfter = err.headers?.["retry-after"];
        return apiError("rate_limited", 429, {
          code: "RATE_LIMITED",
          retryable: true,
          ...(retryAfter ? { retryAfter } : {}),
        });
      }
      if (err.status === 401) {
        return apiError("unauthorized", 401, { code: "UNAUTHORIZED" });
      }
      if (err.status === 503) {
        return apiError("service_unavailable", 503, {
          code: "SERVICE_UNAVAILABLE",
          retryable: true,
        });
      }
    }
    return apiError("AI処理中にエラーが発生しました", 502, {
      code: "AI_ERROR",
      retryable: true,
    });
  }

  if (result && articleId)
    ctx.waitUntil(setAiCacheById(env.RSS_DATA, articleId, result, cacheType));

  return NextResponse.json({ result });
}
