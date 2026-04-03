"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { type LruCache, aiLruCache, aiTranslateLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";

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
  /** AI 翻訳を実行する（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doTranslate: (url: string, articleId?: string) => Promise<void>;
  resetTranslate: () => void;
}

/** AI 操作（要約・翻訳など）の状態とロジックを管理するプライベートフック */
function useAiOperation(endpoint: string, lruCache: LruCache, errorMessage: string) {
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
    async (url: string, currentArticleId?: string) => {
      if (!url.trim()) return;

      // LRU キャッシュヒット時は API コールなし
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
    [endpoint, lruCache, errorMessage],
  );

  return { result, loading, error, run, reset };
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const ai = useAiOperation("/api/ai/summarize", aiLruCache, "AI の処理に失敗しました");
  const translate = useAiOperation(
    "/api/ai/translate",
    aiTranslateLruCache,
    "翻訳の処理に失敗しました",
  );

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    ai.reset();
    translate.reset();
  }, [articleId]); // reset 関数は useCallback([], []) で安定参照のため deps 不要

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
