import { NextResponse } from "next/server";
import { parseJsonBody, type AuthSession } from "@/lib/server-auth";
import {
  getAiCacheByUrl,
  setAiCacheByUrl,
  setAiSummaryByUrl,
  type AiCacheType,
} from "@/lib/ai-cache";
import { fetchArticleContent } from "@/lib/fetch-article-content";
import { isValidFeedUrl } from "@/lib/url";
import { aiRateLimitKey, sha256Hex } from "@/lib/r2";
import { checkSlidingWindow } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";

import {
  isWorkersAiModelId,
  type WorkersAiModelId,
  DEFAULT_AI_MODEL,
  LARGE_MODEL_IDS,
} from "./ai-models";

import {
  buildAiInputs,
  prepareAiArticle,
  SUMMARY_PROMPT_VERSION,
  type AiMessage,
} from "./ai-generation";
import { getAiResponseText, getAiUsage } from "./ai-output";
import {
  claimSummaryGeneration,
  finishSummaryGeneration,
  failSummaryGeneration,
  summaryGenerationRetryAfter,
  type ClaimedGeneration,
} from "./ai-generation-lease";

const AI_WINDOW_MS = 60 * 1000;
const AI_MAX_CALLS = 20;
// KV eventual consistency により ~1-3 req の burst 許容あり (architecture.md § KV burst 許容仕様)
// 実効上限 = AI_MAX_CALLS_LARGE + burst ≈ 5+3 = 8 (#934 案 A)。
// 旧値 3 は 8B の 20 と非対称に厳しく、burst 込み実効上限 6 + 正常リトライも阻害しうるため 5 に調整。
// 70B / Qwen 3.8 / GLM 5.3 は課金コストが高いため、同じ保守的な制限を適用。
// Cloudflare AI 課金計画に応じて調整可。
const AI_MAX_CALLS_LARGE = 5;

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
 * 2. url + model ベース SHA-256 で R2 キャッシュを確認 (ヒット時は AI 呼び出しをスキップ)
 * 3. スライディングウィンドウ レートリミット（60 秒間に通常 20 回 / 高コスト 5 回、AI 実行分のみ）
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

  if (body.model !== undefined && !isWorkersAiModelId(body.model)) {
    return apiError("Unsupported AI model", 400, { code: "INVALID_MODEL" });
  }
  const model: WorkersAiModelId = body.model ?? DEFAULT_AI_MODEL;

  const isLargeModel = LARGE_MODEL_IDS.has(model);

  // #698: cache key を url ベースに変更 (cross-user poisoning 対策)
  // 攻撃者は自身が制御する url の cache しか書けないため、被害ユーザーの cache を汚染できない
  // 同じ記事でも選択モデルの結果だけを返す。生成モデル不明の旧キャッシュは再利用しない。
  const cached = await getAiCacheByUrl(env.RSS_DATA, url, cacheType, model);
  if (cached) return NextResponse.json({ result: cached });

  // AI エンドポイントは課金が発生するため KV 障害時も fail-closed にする（Issue #463）
  const limited = await checkSlidingWindow(
    env.RATE_LIMIT,
    aiRateLimitKey(session.userId),
    AI_WINDOW_MS,
    isLargeModel ? AI_MAX_CALLS_LARGE : AI_MAX_CALLS,
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
  const article = prepareAiArticle(content);
  if (
    article.body.length < (cacheType === "summary" ? 200 : 1) ||
    article.inputCharacters < (cacheType === "summary" ? 200 : 1)
  )
    return apiError("記事本文が短すぎるため処理できません", 422, { code: "CONTENT_TOO_SHORT" });

  let result: string;
  let usage: ReturnType<typeof getAiUsage> = null;
  let claim: ClaimedGeneration | null = null;
  try {
    if (cacheType === "summary") {
      claim = await claimSummaryGeneration(env.RSS_DATA, url, model, { retryFailed: true });
      if (!claim) {
        const retryAfter = await summaryGenerationRetryAfter(env.RSS_DATA, url, model);
        const response = apiError(
          retryAfter === null
            ? "要約の生成中です。長時間続く場合は管理者による処理状況の確認が必要です"
            : `前回の要約処理に失敗しました。${retryAfter}秒後にもう一度お試しください`,
          409,
          {
            code: "SUMMARY_GENERATION_PENDING",
            retryable: retryAfter !== null,
            ...(retryAfter !== null ? { retryAfter } : { recoveryRequired: true }),
          },
        );
        if (retryAfter !== null) response.headers.set("Retry-After", String(retryAfter));
        return response;
      }
      const filled = await getAiCacheByUrl(env.RSS_DATA, url, cacheType, model);
      if (filled) {
        await finishSummaryGeneration(env.RSS_DATA, claim);
        return NextResponse.json({ result: filled });
      }
    }
    const response: unknown = await env.AI.run(
      model as AiModelId,
      buildAiInputs(model, buildMessages(article.plain)),
    );
    result = getAiResponseText(response);
    usage = getAiUsage(response);
  } catch (err) {
    if (claim)
      await failSummaryGeneration(env.RSS_DATA, claim).catch(() => {
        console.warn("[runAiJob] generation status needs operator recovery");
      });
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

  if (!result.trim()) {
    if (claim)
      await failSummaryGeneration(env.RSS_DATA, claim).catch(() => {
        console.warn("[runAiJob] generation status needs operator recovery");
      });
    console.warn("[runAiJob] AI returned empty response, treating as AI_ERROR", { url, model });
    return apiError("AI処理中にエラーが発生しました", 502, {
      code: "AI_ERROR",
      retryable: true,
    });
  }

  if (cacheType === "summary" && claim) {
    const bodyHash = await sha256Hex(article.body);
    const ownedClaim = claim;
    ctx.waitUntil(
      setAiSummaryByUrl(env.RSS_DATA, url, result, {
        version: 1,
        model,
        promptVersion: SUMMARY_PROMPT_VERSION,
        bodyHash,
        generatedAt: new Date().toISOString(),
        inputCharacters: article.inputCharacters,
        inputTruncated: article.inputTruncated,
        completeness: article.inputTruncated ? "truncated" : "unknown",
        usage,
      }).then(() => finishSummaryGeneration(env.RSS_DATA, ownedClaim)),
    );
  } else {
    ctx.waitUntil(setAiCacheByUrl(env.RSS_DATA, url, result, cacheType, model));
  }

  return NextResponse.json({ result });
}
