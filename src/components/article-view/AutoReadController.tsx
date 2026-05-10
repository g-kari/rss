"use client";

import { useEffect, useRef } from "react";
import type { Article } from "@/types";
import { useToast } from "@/contexts/ToastContext";
import { isAutoReadFinished, shouldStartAutoSpeak, shouldTriggerAutoFetch } from "@/lib/auto-read";
import { autoReadDebug } from "@/lib/auto-read-debug";
import { useSyncedRef } from "@/hooks/useSyncedRef";

interface Props {
  enabled: boolean;
  article: Article | null;
  ttsSupported: boolean;
  ttsPlaying: boolean;
  ttsPaused: boolean;
  /**
   * #716: TTS 自然完了 (`utterance.onend`) の累積カウンタ。
   * 手動 stop (`speechSynthesis.cancel()`) では increment しないため、
   * 「TTS 完了 → 次記事へ」の判定はこの値の増加でのみ行う。
   */
  ttsEndedCount: number;
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
  /**
   * #696: autoMode + autoSummarize ON 時の要約完了待ち。
   * `true` の場合、speak は要約完了 (aiResult or aiError) まで保留される。
   */
  autoSummarizePending?: boolean;
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
  ttsEndedCount,
  fetching,
  fetchError,
  hasFullContent,
  canFetch,
  ttsText,
  autoTranslatePending,
  autoSummarizePending,
  onSpeak,
  onTtsStop,
  onFetch,
  hasNext,
  onSelectNext,
  onAutoMarkRead,
  onAutoModeStop,
}: Props) {
  // #716: 旧 prevPlayingRef は cancel() 経由の手動停止と TTS 自然完了を区別できなかった。
  // ttsEndedCount (utterance.onend のみ increment) の前 tick 値を覚えておき、
  // 増加したときだけ「自然完了」として次記事遷移を発火する。
  const prevEndedCountRef = useRef(0);
  const fetchTriggeredRef = useRef<string | null>(null);
  const fetchRetriedRef = useRef<string | null>(null);
  // #663: 同一記事で speak が二重発火するのを防ぐため、speak 発動済みの articleId を記録する。
  // effect (3) は ttsText / processedContent 変化のたびに再発火するので、
  // ref で「この article は既に speak 済み」を覚えておかないと、TTS 完了 → 再 speak の
  // 無限ループに陥る。articleId 切替時に null にリセットして次記事の speak を許可。
  const speakTriggeredRef = useRef<string | null>(null);
  const onTtsStopRef = useSyncedRef(onTtsStop);
  const toast = useToast();

  const articleId = article?.id;

  // 記事切替時に fetch トリガーフラグと prevEndedCountRef をリセット
  // prevEndedCountRef を新記事の現在 ttsEndedCount に同期させないと、
  // 前記事完了直後に新記事に遷移したとき「prev < current」で即「完了」と誤判定され、
  // 次々と記事が連鎖遷移するループの原因になる (#660 / #716)。
  useEffect(() => {
    if (!articleId) return;
    autoReadDebug("articleId-changed", { articleId, enabled, ttsEndedCount });
    prevEndedCountRef.current = ttsEndedCount;
    speakTriggeredRef.current = null; // #663: 新記事で speak を許可
    if (!enabled) return;
    fetchTriggeredRef.current = null;
    fetchRetriedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ttsEndedCount は同期スナップショット用 (この effect の再発火対象ではなく articleId/enabled で再発火する)
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
    autoReadDebug("effect(1)-fetch-trigger", {
      articleId,
      enabled,
      canFetch,
      fetching,
      hasFullContent,
      trigger,
      fetchTriggeredRef: fetchTriggeredRef.current,
      willTrigger: trigger && fetchTriggeredRef.current !== articleId,
    });
    if (!trigger) return;
    if (fetchTriggeredRef.current === articleId) return;
    fetchTriggeredRef.current = articleId;
    autoReadDebug("effect(1)-onFetch-called", { articleId });
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
      autoSummarizePending,
    });
    autoReadDebug("effect(3)-speak-trigger", {
      articleId,
      enabled,
      ttsSupported,
      ttsPlaying,
      ttsPaused,
      fetching,
      hasText: !!ttsText.trim(),
      ttsTextLength: ttsText.length,
      canFetch,
      hasFullContent,
      autoTranslatePending,
      autoSummarizePending,
      start,
    });
    if (!start) return;
    speakTriggeredRef.current = articleId;
    autoReadDebug("effect(3)-onSpeak-called", { articleId, ttsTextLength: ttsText.length });
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
    autoSummarizePending,
    onSpeak,
  ]);

  // (4) TTS 完了 → 次の記事へ進む or 終端で停止
  // #716: 判定軸を「prevPlaying → currentPlaying の遷移」から
  // 「TTS 自然完了カウンタ (utterance.onend) の増加」に変更。
  // ユーザーが Shift+P 等で手動停止 (cancel()) しても endedCount は不変なので、
  // 手動停止と自然完了が確実に区別され、勝手に次記事へ遷移するバグを解消。
  useEffect(() => {
    const finished = isAutoReadFinished({
      enabled,
      ttsSupported,
      prevEndedCount: prevEndedCountRef.current,
      currentEndedCount: ttsEndedCount,
      paused: ttsPaused,
    });
    prevEndedCountRef.current = ttsEndedCount;
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
    ttsEndedCount,
    ttsPaused,
    hasNext,
    onSelectNext,
    onAutoMarkRead,
    onAutoModeStop,
    toast,
  ]);

  return null;
}
