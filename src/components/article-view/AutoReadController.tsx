"use client";

import { useEffect, useRef } from "react";
import type { Article } from "@/types";
import { useToast } from "@/contexts/ToastContext";
import { isAutoReadFinished, shouldStartAutoSpeak, shouldTriggerAutoFetch } from "@/lib/auto-read";

interface Props {
  enabled: boolean;
  article: Article | null;
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  fetching: boolean;
  fetchError: string;
  hasContent: boolean;
  canFetch: boolean;
  ttsText: string;
  onSpeak: (text: string) => void;
  onFetch: () => Promise<void>;
  hasNext: boolean;
  onSelectNext?: () => void;
  onAutoMarkRead?: (articleId: string) => void;
  onAutoModeStop: () => void;
}

const ADVANCE_DELAY_MS = 500;

/**
 * オートモード（自動全文取得 → 読み上げ → 次の記事へ）の副作用コントローラ。
 *
 * 状態判定は `src/lib/auto-read.ts` の純粋関数に委譲し、ここでは
 * useEffect 経由で fetch/speak/advance のトリガーだけを行う。
 */
export default function AutoReadController({
  enabled,
  article,
  ttsSupported,
  ttsPlaying,
  ttsPaused,
  fetching,
  fetchError,
  hasContent,
  canFetch,
  ttsText,
  onSpeak,
  onFetch,
  hasNext,
  onSelectNext,
  onAutoMarkRead,
  onAutoModeStop,
}: Props) {
  const prevPlayingRef = useRef(false);
  const fetchTriggeredRef = useRef<string | null>(null);
  const fetchRetriedRef = useRef<string | null>(null);
  const toast = useToast();

  const articleId = article?.id;

  // 記事切替時に fetch トリガーフラグをリセット
  useEffect(() => {
    if (!enabled || !articleId) return;
    fetchTriggeredRef.current = null;
    fetchRetriedRef.current = null;
  }, [articleId, enabled]);

  // (1) 全文取得トリガー（同じ記事で 1 回 + 失敗時 1 リトライ）
  useEffect(() => {
    if (!enabled || !article) return;
    const articleId = article.id;
    const trigger = shouldTriggerAutoFetch({ enabled, canFetch, fetching, hasContent });
    if (!trigger) return;
    if (fetchTriggeredRef.current === articleId) return;
    fetchTriggeredRef.current = articleId;
    void onFetch();
  }, [enabled, article, canFetch, fetching, hasContent, onFetch]);

  // (2) フェッチエラー時のリトライ（1 回まで）
  useEffect(() => {
    if (!enabled || !article || !fetchError || fetching) return;
    const articleId = article.id;
    if (fetchRetriedRef.current === articleId) return;
    fetchRetriedRef.current = articleId;
    void onFetch();
  }, [enabled, article, fetchError, fetching, onFetch]);

  // (3) TTS 開始トリガー
  useEffect(() => {
    if (!enabled || !article) return;
    const start = shouldStartAutoSpeak({
      enabled,
      ttsSupported,
      ttsPlaying,
      ttsPaused,
      fetching,
      hasText: !!ttsText.trim(),
    });
    if (start) onSpeak(ttsText);
  }, [enabled, article, ttsSupported, ttsPlaying, ttsPaused, fetching, ttsText, onSpeak]);

  // (4) TTS 完了 → 次の記事へ進む or 終端で停止
  useEffect(() => {
    const finished = isAutoReadFinished({
      enabled,
      ttsSupported,
      prevPlaying: prevPlayingRef.current,
      currentPlaying: ttsPlaying,
      paused: ttsPaused,
    });
    prevPlayingRef.current = ttsPlaying;
    if (!finished || !article) return;

    const articleId = article.id;
    const id = setTimeout(() => {
      onAutoMarkRead?.(articleId);
      if (hasNext) {
        onSelectNext?.();
      } else {
        toast.info("オートモード終了 — 最後の記事まで来ました");
        onAutoModeStop();
      }
    }, ADVANCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [
    enabled,
    article,
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    hasNext,
    onSelectNext,
    onAutoMarkRead,
    onAutoModeStop,
    toast,
  ]);

  return null;
}
