"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { aiLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";

interface ArticleAiState {
  aiResult: string | null;
  aiLoading: boolean;
  aiError: string;
  /** AI 要約を実行する（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doRunAi: (url: string, articleId?: string) => Promise<void>;
  resetAi: () => void;
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const resetAi = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiResult(null);
    setAiError("");
    setAiLoading(false);
  }, []);

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    resetAi();
  }, [articleId, resetAi]);

  const doRunAi = useCallback(async (url: string, currentArticleId?: string) => {
    if (!url.trim()) return;

    // LRU キャッシュヒット時は API コールなし
    if (currentArticleId) {
      const cached = aiLruCache.get(currentArticleId);
      if (cached) {
        setAiResult(cached);
        return;
      }
    }

    // 既存のリクエストをキャンセルして新しいコントローラーを作成
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(true);
    setAiError("");
    try {
      const res = await apiFetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, articleId: currentArticleId }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.result) {
        if (currentArticleId) aiLruCache.set(currentArticleId, data.result);
        setAiResult(data.result);
      } else if (data.error) {
        setAiError(data.error);
      } else {
        setAiError("AI の処理に失敗しました");
      }
    } catch (err) {
      if (isAbortError(err)) return;
      setAiError("AI の処理に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }, []);

  return { aiResult, aiLoading, aiError, doRunAi, resetAi };
}
