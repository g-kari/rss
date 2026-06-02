import { NextResponse } from "next/server";
import { parseJsonBody, type AuthSession } from "@/lib/server-auth";
import { getAiCacheByUrl, setAiCacheByUrl, type AiCacheType } from "@/lib/ai-cache";
import { toPlainText } from "@/lib/html";
import { fetchArticleContent } from "@/lib/fetch-article-content";
import { isValidFeedUrl } from "@/lib/url";
import { aiRateLimitKey } from "@/lib/r2";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

import {
  isWorkersAiModelId,
  type WorkersAiModelId,
  DEFAULT_AI_MODEL,
  LARGE_MODEL_IDS,
} from "./ai-models";

const AI_WINDOW_MS = 60 * 1000;
const AI_MAX_CALLS = 20;
// KV eventual consistency により ~1-3 req の burst 許容あり (architecture.md § KV burst 許容仕様)
// 実効上限 = AI_MAX_CALLS_70B + burst ≈ 5+3 = 8 (#934 案 A)。
// 旧値 3 は 8B の 20 と非対称に厳しく、burst 込み実効上限 6 + 正常リトライも阻害しうるため 5 に調整。
// 70B は課金コストが高いため最小限の引き上げに留める (推奨レンジ 5-7 の最保守値)。
// Cloudflare AI 課金計画に応じて調整可。
const AI_MAX_CALLS_70B = 5;

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
 * 1. リクエストボディから url を取得
 * 2. url ベース SHA-256 で R2 キャッシュを確認 (ヒット時は AI 呼び出しをスキップ、#698 で url ベースに変更)
 * 3. スライディングウィンドウ レートリミット（60 秒間に最大 10 回、AI 実行分のみカウント）
 * 4. /api/content と共有する Cloudflare Cache から記事コンテンツを取得
 * 5. Workers AI を呼び出して結果を取得
 * 6. 結果を R2 キャッシュに保存（fire-and-forget）
 *
 * @param request - リクエストオブジェクト（ボディに url を含む）
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
  const parsed = await parseJsonBody<{ url?: unknown; model?: unknown }>(request);
  if (!parsed.ok) return parsed.error;
  const body = parsed.data;
  if (typeof body?.url !== "string" || !isValidFeedUrl(body.url)) {
    return apiError("url is required", 400, { code: "INVALID_URL" });
  }

  const url = body.url;

  const model: WorkersAiModelId = isWorkersAiModelId(body.model) ? body.model : DEFAULT_AI_MODEL;

  const is70b = LARGE_MODEL_IDS.has(model);

  // #698: cache key を url ベースに変更 (cross-user poisoning 対策)
  // 攻撃者は自身が制御する url の cache しか書けないため、被害ユーザーの cache を汚染できない
  const cached = await getAiCacheByUrl(env.RSS_DATA, url, cacheType);
  if (cached) return NextResponse.json({ result: cached });

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
  // 2. Llama / Mistral 等 instruct format の control token を strip
  //    (`<|...|>` / `[INST]` / `</s>` / `<<SYS>>` 等を空文字に置換、Workers AI model 入力汚染防止)
  // 3. < > をエスケープしてデリミタ破壊を防止 (escape を先に、slice を後に — 末尾境界で
  //    `&lt;` (4 文字) が途中で切られて壊れる不正 entity を避ける)
  // 4. <article> デリミタで囲んでユーザーコンテンツ境界を明示
  const escaped = toPlainText(content)
    .replace(/<\|[^|]*\|>/g, "") // Llama-3 / Qwen 系 instruct control tokens
    .replace(/\[\/?INST\]/g, "") // Mistral / Llama-2 instruct delimiter
    .replace(/<<\/?SYS>>/g, "") // Llama-2 system role delimiter
    .replace(/<\/?s>/g, "") // sentence boundary (Mistral / Llama)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const sanitized = escaped.slice(0, 8000);
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
        const res = apiError("rate_limited", 429, {
          code: "RATE_LIMITED",
          retryable: true,
          ...(retryAfter ? { retryAfter } : {}),
        });
        // rate-limit.ts の checkSlidingWindow と同パターン: HTTP ヘッダー Retry-After も付与して
        // クライアントの retry-after.ts が正しく backoff できるようにする
        if (retryAfter) res.headers.set("Retry-After", String(retryAfter));
        return res;
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

  if (!result) {
    console.warn("[runAiJob] AI returned empty response, treating as AI_ERROR", { url, model });
    return apiError("AI処理中にエラーが発生しました", 502, {
      code: "AI_ERROR",
      retryable: true,
    });
  }

  ctx.waitUntil(setAiCacheByUrl(env.RSS_DATA, url, result, cacheType));

  return NextResponse.json({ result });
}
