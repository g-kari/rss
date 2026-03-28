"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { AiMode } from "../types";
import { aiLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";

interface ArticleAiState {
  aiResult: { mode: AiMode; text: string } | null;
  aiLoading: AiMode | null;
  aiError: string;
  /** AI 実行（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doRunAi: (mode: AiMode, url: string, articleId?: string) => Promise<void>;
  resetAi: () => void;
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const [aiResult, setAiResult] = useState<{ mode: AiMode; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState<AiMode | null>(null);
  const [aiError, setAiError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const resetAi = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiResult(null);
    setAiError("");
    setAiLoading(null);
  }, []);

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    resetAi();
  }, [articleId, resetAi]);

  const doRunAi = useCallback(async (mode: AiMode, url: string, currentArticleId?: string) => {
    if (!url.trim()) return;

    // LRU キャッシュヒット時は API コールなし
    if (currentArticleId) {
      const cached = aiLruCache.get(`${currentArticleId}:${mode}`);
      if (cached) {
        setAiResult({ mode, text: cached });
        return;
      }
    }

    // 既存のリクエストをキャンセルして新しいコントローラーを作成
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(mode);
    setAiError("");
    try {
      const endpoint = "/api/ai/summarize";
      const res = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, articleId: currentArticleId }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.result) {
        if (currentArticleId) aiLruCache.set(`${currentArticleId}:${mode}`, data.result);
        setAiResult({ mode, text: data.result });
      } else if (data.error) {
        setAiError(data.error);
      } else {
        setAiError("AI の処理に失敗しました");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setAiError("AI の処理に失敗しました");
    } finally {
      setAiLoading(null);
    }
  }, []);

  return { aiResult, aiLoading, aiError, doRunAi, resetAi };
}
