"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type LruCache, aiLruCache, aiTranslateLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { translateInBrowser } from "../lib/browser-translator";

interface ArticleAiState {
  aiResult: string | null;
  aiLoading: boolean;
  aiError: string;
  /** AI 要約を実行する（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doRunAi: (url: string, articleId?: string) => Promise<void>;
  resetAi: () => void;
  translateResult: string | null;
  translateLoading: boolean;
  translateError: string;
  /**
   * AI 翻訳を実行する（LRU キャッシュ優先）。
   * `plainText` を渡すと Chrome Translator API が使える環境ではブラウザ側で完結させ、
   * そうでない環境では従来の Workers AI (`/api/ai/translate`) にフォールバックする。
   */
  doTranslate: (url: string, articleId?: string, plainText?: string) => Promise<void>;
  resetTranslate: () => void;
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
  localProcessor?: (plainText: string) => Promise<string | null>,
) {
  const [result, setResult] = useState<string | null>(null);
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
    async (url: string, currentArticleId?: string, plainText?: string) => {
      if (!url.trim()) return;

      // LRU キャッシュヒット時はネットワークコールなし
      if (currentArticleId) {
        const cached = lruCache.get(currentArticleId);
        if (cached) {
          setResult(cached);
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
      if (localProcessor && plainText) {
        try {
          const local = await localProcessor(plainText);
          if (controller.signal.aborted) return;
          if (local !== null && local.length > 0) {
            if (currentArticleId) lruCache.set(currentArticleId, local);
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
          if (currentArticleId) lruCache.set(currentArticleId, data.result);
          setResult(data.result);
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

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const ai = useAiOperation("/api/ai/summarize", aiLruCache, "AI の処理に失敗しました");
  const translate = useAiOperation(
    "/api/ai/translate",
    aiTranslateLruCache,
    "翻訳の処理に失敗しました",
    translateInBrowser,
  );

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    ai.reset();
    translate.reset();
    // ai と translate の reset は useCallback([], []) で安定参照のため deps 不要
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  return {
    aiResult: ai.result,
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
