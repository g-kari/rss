"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type LruCache, aiLruCache, aiTranslateLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { translateHtmlInBrowser } from "../lib/translate-html";

/** 翻訳プロバイダー識別子 */
export type TranslationProvider = "browser" | "workers-ai";

/** 翻訳・要約結果は plain text または HTML のどちらも取り得るため区別する */
export interface AiOperationResult {
  text: string;
  isHtml: boolean;
  /** 翻訳時のプロバイダー（要約では未設定） */
  provider?: TranslationProvider;
}

interface ArticleAiState {
  aiResult: string | null;
  aiLoading: boolean;
  aiError: string;
  /** AI 要約を実行する（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doRunAi: (url: string, articleId?: string) => Promise<void>;
  resetAi: () => void;
  translateResult: AiOperationResult | null;
  translateLoading: boolean;
  translateError: string;
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
function useAiOperation(
  endpoint: string,
  lruCache: LruCache,
  errorMessage: string,
  localProcessor?: (input: string) => Promise<AiOperationResult | null>,
) {
  const [result, setResult] = useState<AiOperationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setResult(null);
    setError("");
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
      setError("");

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
        } catch {
          /* サーバー AI にフォールバック */
        }
      }

      try {
        const res = await apiFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, articleId: currentArticleId }),
          signal: controller.signal,
        });
        const data = (await res.json()) as { result?: string; error?: string };
        if (data.result) {
          const entry: AiOperationResult = {
            text: data.result,
            isHtml: false,
            provider: "workers-ai",
          };
          if (currentArticleId) lruCache.set(currentArticleId, encodeForCache(entry));
          setResult(entry);
        } else if (data.error) {
          setError(data.error);
        } else {
          setError(errorMessage);
        }
      } catch (err) {
        if (isAbortError(err)) return;
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, lruCache, errorMessage, localProcessor],
  );

  return { result, loading, error, run, reset };
}

/** HTML 翻訳結果を AiOperationResult でラップする */
async function processTranslateHtml(html: string): Promise<AiOperationResult | null> {
  const translated = await translateHtmlInBrowser(html);
  if (translated === null) return null;
  return { text: translated, isHtml: true, provider: "browser" };
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const ai = useAiOperation("/api/ai/summarize", aiLruCache, "AI の処理に失敗しました");
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
