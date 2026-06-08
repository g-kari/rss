"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type LruCache, aiLruCache, aiTranslateLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { devError } from "../lib/dev-log";
import { translateHtmlInBrowser } from "../lib/translate-html";
import { summarizeInBrowser } from "../lib/browser-summarizer";
import { toPlainText } from "../lib/html";
import { DEFAULT_AI_MODEL } from "../lib/ai-models";
import { STORAGE_KEYS, storageGet } from "../lib/storage";
import {
  buildFetchErrorMessage,
  formatHttpErrorMessage,
  type HttpErrorType,
} from "../lib/classify-http-error";

/** AI プロバイダー識別子（要約・翻訳共通） */
export type TranslationProvider = "browser" | "workers-ai";

/**
 * AI 操作のエラー種別。`classify-http-error.ts` の canonical `HttpErrorType` を再利用。
 * 旧 `"model_error"` は `"server_error"` に統合済 (ユーザー向けメッセージは同一)。
 */
export type AiErrorType = HttpErrorType;

/** AI 操作のエラー情報 */
export interface AiError {
  type: AiErrorType;
  message: string;
}

/** 翻訳・要約結果は plain text または HTML のどちらも取り得るため区別する */
export interface AiOperationResult {
  text: string;
  isHtml: boolean;
  /** 翻訳・要約のプロバイダー（ブラウザネイティブ AI / Workers AI フォールバック） */
  provider?: TranslationProvider;
}

interface ArticleAiState {
  aiResult: string | null;
  /** AI 要約のプロバイダー (#697) — UI で「Chrome 要約 / Workers AI」バッジ表示に使用 */
  aiResultProvider: TranslationProvider | undefined;
  aiLoading: boolean;
  aiError: AiError | null;
  /** AI 要約を実行する（LRU キャッシュ優先）。html を渡すとブラウザ Summarizer API を試行する。 */
  doRunAi: (url: string, articleId?: string, html?: string) => Promise<void>;
  resetAi: () => void;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;
  translateError: AiError | null;
  /**
   * AI 翻訳を実行する（LRU キャッシュ優先）。
   * `html` を渡すと Chrome Translator API が使える環境で HTML 構造を保持したまま翻訳し、
   * そうでない環境では従来の Workers AI (`/api/ai/translate`) の plain text 翻訳にフォールバックする。
   */
  doTranslate: (url: string, articleId?: string, html?: string) => Promise<void>;
  resetTranslate: () => void;
}

/**
 * LruCache は string 値固定のため、HTML フラグ付き翻訳結果を保存するには JSON シリアライズする。
 * 既存キャッシュとの互換性のため、JSON パースに失敗したら「旧来の plain text」として扱う。
 */
function decodeCached(cached: string): AiOperationResult {
  try {
    const parsed = JSON.parse(cached) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "text" in parsed &&
      typeof (parsed as { text: unknown }).text === "string"
    ) {
      const obj = parsed as { text: string; isHtml?: unknown; provider?: unknown };
      const provider =
        obj.provider === "browser" || obj.provider === "workers-ai" ? obj.provider : undefined;
      return { text: obj.text, isHtml: Boolean(obj.isHtml), provider };
    }
  } catch {
    /* 旧形式 (plain text) としてそのまま返す */
  }
  return { text: cached, isHtml: false };
}

function encodeForCache(result: AiOperationResult): string {
  return JSON.stringify(result);
}

/**
 * AI 操作（要約・翻訳など）の状態とロジックを管理するプライベートフック。
 *
 * `localProcessor` を渡すと、サーバー API を叩く前にクライアント側処理を試みる。
 * 戻り値が `null` の場合は Workers AI にフォールバックする。
 * 翻訳では Chrome Translator API をここに差し込む。
 */
export function useAiOperation(
  endpoint: string,
  lruCache: LruCache,
  errorMessage: string,
  localProcessor?: (input: string) => Promise<AiOperationResult | null>,
) {
  const [result, setResult] = useState<AiOperationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  const run = useCallback(
    async (url: string, currentArticleId?: string, localInput?: string) => {
      if (!url.trim()) return;

      // LRU キャッシュヒット時はネットワークコールなし
      if (currentArticleId) {
        const cached = lruCache.get(currentArticleId);
        if (cached) {
          setResult(decodeCached(cached));
          return;
        }
      }

      // 既存のリクエストをキャンセルして新しいコントローラーを作成
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      // クライアント側処理を試行（Chrome Translator API 等）
      if (localProcessor && localInput) {
        try {
          const local = await localProcessor(localInput);
          if (controller.signal.aborted) return;
          if (local !== null && local.text.length > 0) {
            if (currentArticleId) lruCache.set(currentArticleId, encodeForCache(local));
            setResult(local);
            setLoading(false);
            return;
          }
        } catch (err) {
          devError("[useArticleAi] browser localProcessor failed, falling back to server AI", err);
        }
      }

      try {
        const model = storageGet(STORAGE_KEYS.AI_MODEL) ?? DEFAULT_AI_MODEL;
        const res = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, model }),
          signal: controller.signal,
        });
        // 記事切替 (reset → abort) が apiFetch resolve 後に起きると catch の isAbortError では
        // 捕捉できず stale result を setResult してしまうため、各 await 後に abort recheck する
        // (local-processor path の signal.aborted guard と対称)。
        if (controller.signal.aborted) return;
        if (!res.ok) {
          // #869: useArticleContent と同じ pattern に統合。body.error が来れば優先 fallback。
          const { message, type } = await buildFetchErrorMessage(res, errorMessage);
          if (controller.signal.aborted) return;
          setError({ type, message });
          return;
        }
        const data = (await res.json()) as { result?: string; error?: string };
        if (controller.signal.aborted) return;
        if (data.result) {
          const entry: AiOperationResult = {
            text: data.result,
            isHtml: false,
            provider: "workers-ai",
          };
          if (currentArticleId) lruCache.set(currentArticleId, encodeForCache(entry));
          setResult(entry);
        } else if (data.error) {
          setError({ type: "unknown", message: data.error });
        } else {
          setError({ type: "unknown", message: errorMessage });
        }
      } catch (err) {
        if (isAbortError(err)) return;
        setError({
          type: "network",
          message: formatHttpErrorMessage("network", { fallback: errorMessage }),
        });
      } finally {
        // abort 済 (記事切替で新 run が loading を所有) なら旧 run の loading 解除を skip し、
        // 新 run の loading=true を clobber しない。
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [endpoint, lruCache, errorMessage, localProcessor],
  );

  return { result, loading, error, run, reset };
}

async function processSummarizeLocal(html: string): Promise<AiOperationResult | null> {
  const plain = toPlainText(html);
  if (!plain.trim()) return null;
  const result = await summarizeInBrowser(plain);
  if (result === null) return null;
  return { text: result, isHtml: false, provider: "browser" };
}

/** HTML 翻訳結果を AiOperationResult でラップする */
async function processTranslateHtml(html: string): Promise<AiOperationResult | null> {
  const translated = await translateHtmlInBrowser(html);
  if (translated === null) return null;
  return { text: translated, isHtml: true, provider: "browser" };
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const ai = useAiOperation(
    "/api/ai/summarize",
    aiLruCache,
    "AI の処理に失敗しました",
    processSummarizeLocal,
  );
  const translate = useAiOperation(
    "/api/ai/translate",
    aiTranslateLruCache,
    "翻訳の処理に失敗しました",
    processTranslateHtml,
  );

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    ai.reset();
    translate.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ai.reset / translate.reset は deps=[] の useCallback で安定参照のため deps 不要
  }, [articleId]);

  return {
    aiResult: ai.result?.text ?? null,
    aiResultProvider: ai.result?.provider,
    aiLoading: ai.loading,
    aiError: ai.error,
    doRunAi: ai.run,
    resetAi: ai.reset,
    translateResult: translate.result,
    translateLoading: translate.loading,
    translateError: translate.error,
    doTranslate: translate.run,
    resetTranslate: translate.reset,
  };
}
