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
  /**
   * 全文 (`processedContent`) が取得済みか (#663)。
   * オートモードの fetch トリガー / speak gate はこちらで判定する。
   * サマリ fallback による「概要のみ読み上げ」を防ぐ。
   *
   * UI 用「サマリ含む描画可能性」判定 (`useArticleViewContent.hasContent`) は
   * AI/TTS ボタン表示で別途使われるが、AutoReadController では参照しない。
   */
  hasFullContent: boolean;
  canFetch: boolean;
  ttsText: string;
  /**
   * autoTranslate ON 時の翻訳完了待ち (#653)。
   * `true` の場合、speak は翻訳完了 (translateResult or translateError) まで保留される。
   */
  autoTranslatePending?: boolean;
  onSpeak: (text: string) => void;
  /** 現在進行中の TTS を即停止する (#661 オートモード OFF 時に呼ぶ) */
  onTtsStop: () => void;
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
  hasFullContent,
  canFetch,
  ttsText,
  autoTranslatePending,
  onSpeak,
  onTtsStop,
  onFetch,
  hasNext,
  onSelectNext,
  onAutoMarkRead,
  onAutoModeStop,
}: Props) {
  const prevPlayingRef = useRef(false);
  const fetchTriggeredRef = useRef<string | null>(null);
  const fetchRetriedRef = useRef<string | null>(null);
  // #663: 同一記事で speak が二重発火するのを防ぐため、speak 発動済みの articleId を記録する。
  // effect (3) は ttsText / processedContent 変化のたびに再発火するので、
  // ref で「この article は既に speak 済み」を覚えておかないと、TTS 完了 → 再 speak の
  // 無限ループに陥る。articleId 切替時に null にリセットして次記事の speak を許可。
  const speakTriggeredRef = useRef<string | null>(null);
  const onTtsStopRef = useRef(onTtsStop);
  onTtsStopRef.current = onTtsStop;
  const toast = useToast();

  const articleId = article?.id;

  // 記事切替時に fetch トリガーフラグと prevPlayingRef をリセット
  // prevPlayingRef を false に戻さないと、前記事完了直後に新記事に遷移したとき
  // 「prevPlaying=true && currentPlaying=false」で即「完了」と誤判定され、
  // 次々と記事が連鎖遷移するループの原因になる (#660)。
  useEffect(() => {
    if (!articleId) return;
    prevPlayingRef.current = false;
    speakTriggeredRef.current = null; // #663: 新記事で speak を許可
    if (!enabled) return;
    fetchTriggeredRef.current = null;
    fetchRetriedRef.current = null;
  }, [articleId, enabled]);

  // オートモード OFF (停止ボタン押下) 時に現在発話中の TTS も即止める (#661)。
  // enabled の変化を監視し、false に遷移したら ttsStop を呼ぶ。
  useEffect(() => {
    if (enabled) return;
    onTtsStopRef.current();
  }, [enabled]);

  // (1) 全文取得トリガー（同じ記事で 1 回 + 失敗時 1 リトライ）
  // #663: 「サマリ存在 = hasContent=true」だと fetch がスキップされて概要だけ読み上げに
  // なるため、判定は `hasFullContent`（processedContent 厳格判定）を使う。
  useEffect(() => {
    if (!enabled || !article) return;
    const articleId = article.id;
    const trigger = shouldTriggerAutoFetch({
      enabled,
      canFetch,
      fetching,
      hasContent: hasFullContent,
    });
    if (!trigger) return;
    if (fetchTriggeredRef.current === articleId) return;
    fetchTriggeredRef.current = articleId;
    void onFetch();
  }, [enabled, article, canFetch, fetching, hasFullContent, onFetch]);

  // (2) フェッチエラー時のリトライ（1 回まで）
  useEffect(() => {
    if (!enabled || !article || !fetchError || fetching) return;
    const articleId = article.id;
    if (fetchRetriedRef.current === articleId) return;
    fetchRetriedRef.current = articleId;
    void onFetch();
  }, [enabled, article, fetchError, fetching, onFetch]);

  // (3) TTS 開始トリガー
  // #663: speakTriggeredRef で同記事の二重 speak を防ぐ。これがないと TTS 完了
  // → ttsPlaying=false → effect 再発火 → 再 speak の無限ループになる。
  // また `canFetch && !hasFullContent` の場合は fetch 完了待ちで speak を保留。
  useEffect(() => {
    if (!enabled || !article) return;
    const articleId = article.id;
    if (speakTriggeredRef.current === articleId) return;
    const start = shouldStartAutoSpeak({
      enabled,
      ttsSupported,
      ttsPlaying,
      ttsPaused,
      fetching,
      hasText: !!ttsText.trim(),
      canFetch,
      hasFullContent,
      autoTranslatePending,
    });
    if (!start) return;
    speakTriggeredRef.current = articleId;
    onSpeak(ttsText);
  }, [
    enabled,
    article,
    ttsSupported,
    ttsPlaying,
    ttsPaused,
    fetching,
    ttsText,
    canFetch,
    hasFullContent,
    autoTranslatePending,
    onSpeak,
  ]);

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
