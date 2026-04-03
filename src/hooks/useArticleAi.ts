"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { aiLruCache, aiTranslateLruCache } from "../lib/lru-cache";
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

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const [translateResult, setTranslateResult] = useState<string | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const translateAbortRef = useRef<AbortController | null>(null);

  const resetAi = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAiResult(null);
    setAiError("");
    setAiLoading(false);
  }, []);

  const resetTranslate = useCallback(() => {
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    setTranslateResult(null);
    setTranslateError("");
    setTranslateLoading(false);
  }, []);

  // 記事が変わったら進行中のリクエストをキャンセルして AI 状態を自動リセットする
  useEffect(() => {
    resetAi();
    resetTranslate();
  }, [articleId, resetAi, resetTranslate]);

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

  const doTranslate = useCallback(async (url: string, currentArticleId?: string) => {
    if (!url.trim()) return;

    // LRU キャッシュヒット時は API コールなし
    if (currentArticleId) {
      const cached = aiTranslateLruCache.get(currentArticleId);
      if (cached) {
        setTranslateResult(cached);
        return;
      }
    }

    // 既存のリクエストをキャンセルして新しいコントローラーを作成
    translateAbortRef.current?.abort();
    const controller = new AbortController();
    translateAbortRef.current = controller;

    setTranslateLoading(true);
    setTranslateError("");
    try {
      const res = await apiFetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, articleId: currentArticleId }),
        signal: controller.signal,
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.result) {
        if (currentArticleId) aiTranslateLruCache.set(currentArticleId, data.result);
        setTranslateResult(data.result);
      } else if (data.error) {
        setTranslateError(data.error);
      } else {
        setTranslateError("翻訳の処理に失敗しました");
      }
    } catch (err) {
      if (isAbortError(err)) return;
      setTranslateError("翻訳の処理に失敗しました");
    } finally {
      setTranslateLoading(false);
    }
  }, []);

  return {
    aiResult,
    aiLoading,
    aiError,
    doRunAi,
    resetAi,
    translateResult,
    translateLoading,
    translateError,
    doTranslate,
    resetTranslate,
  };
}
