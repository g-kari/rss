"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Article } from "../types";
import type { WorkersAiModelId } from "../lib/ai-models";
import { AI_MODELS } from "../lib/ai-models";
import { APPROVED_SCHEDULED_SUMMARY_MODEL } from "../lib/ai-summary-contract";
import type { CacheEntry } from "../hooks/useImmersiveSummaryCache";
import { renderSummaryHtml } from "../lib/ai-summary-markdown";
import { stripAiThinking } from "../lib/ai-output";
import { summaryProvenanceLabel } from "../lib/immersive-summary";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { useOptionalReaderSettings } from "../contexts/ReaderSettingsContext";
import { FONT_FAMILY_CLASSES, FONT_SIZE_CLASSES } from "../lib/article-utils";
import { getContentWidthStyle, getLineHeightStyle } from "../lib/reader-settings";

interface Props {
  article: Article;
  model?: WorkersAiModelId;
  entry: CacheEntry;
  usingSummary: boolean;
  onClose: () => void;
  onReadBody: () => void;
  onUseSummary: () => void;
  onUseExcerpt: () => void;
  onRetry: () => void;
}

/** Cache display only. This dialog cannot extract a body, prepare a model, or generate AI text. */
export default function ImmersiveSummaryReader({
  article,
  model,
  entry,
  usingSummary,
  onClose,
  onReadBody,
  onUseSummary,
  onUseExcerpt,
  onRetry,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const explanationId = useId();
  const [showExplanation, setShowExplanation] = useState(false);
  const settings = useOptionalReaderSettings();
  const { handleKeyDown } = useModalFocusTrap(dialogRef, { onClose, initialFocusRef: titleRef });
  const summary = entry.kind === "hit" ? entry.summary : null;
  const html = useMemo(
    () => (summary ? renderSummaryHtml(stripAiThinking(summary.result)) : ""),
    [summary],
  );
  const modelLabel = AI_MODELS.find((item) => item.id === model)?.label ?? "モデル設定なし";
  const scheduledModelLabel = AI_MODELS.find(
    (item) => item.id === APPROVED_SCHEDULED_SUMMARY_MODEL,
  )!.label;
  const availability = summary
    ? "保存済みのAI要約"
    : entry.kind === "loading" || entry.kind === "idle"
      ? "保存済み要約を確認中…"
      : entry.kind === "error"
        ? "保存済み要約を確認できませんでした。読み込み済みの説明・抜粋を使えます。"
        : entry.kind === "evicted"
          ? "前に確認した要約は表示用メモリーから外れました。もう一度確認できます。"
          : entry.kind === "disabled"
            ? entry.reason
            : "選択中のモデルの保存済み要約はありません。読み込み済みの説明・抜粋を使えます。";
  const canRetry = ["miss", "error", "evicted"].includes(entry.kind);
  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="保存済みのAI要約"
      className="immersive-inline-reader absolute inset-0 z-10 flex flex-col bg-surface-base text-text-strong"
      onKeyDown={(event) => {
        event.stopPropagation();
        handleKeyDown(event);
      }}
    >
      <header className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-default p-4">
        <p className="text-[13px]">要約を開いている間は自動再生・読み上げを一時停止します</p>
        <button
          type="button"
          className="min-h-11 rounded border border-border-default px-3"
          onClick={onClose}
        >
          ショート表示に戻る
        </button>
      </header>
      <div role="document" className="min-h-0 flex-1 overflow-y-auto p-5">
        <div
          className="mx-auto w-full"
          style={getContentWidthStyle(settings?.contentWidth ?? "medium")}
        >
          <h3 ref={titleRef} tabIndex={-1} className="mb-4 text-xl font-medium">
            {article.title}
          </h3>
          <p data-testid="summary-availability" aria-live="polite" className="mb-2 text-[14px]">
            {availability}
          </p>
          <p data-testid="summary-source" className="mb-2 break-words text-[13px] text-text-muted">
            選択中のモデル: {modelLabel}
          </p>
          {summary && (
            <>
              <p className="mb-4 text-[13px] text-text-muted">
                {summaryProvenanceLabel(summary.metadata)}
              </p>
              <div
                className={`article-content ${FONT_SIZE_CLASSES[settings?.fontSize ?? "medium"]} ${FONT_FAMILY_CLASSES[settings?.fontFamily ?? "sans"]}`}
                style={getLineHeightStyle(settings?.lineHeight ?? "normal")}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            {summary && (
              <button
                type="button"
                className="min-h-11 rounded border border-border-default px-3"
                onClick={onUseSummary}
                disabled={usingSummary}
              >
                ショートをAI要約にする
              </button>
            )}
            <button
              type="button"
              className="min-h-11 rounded border border-border-default px-3"
              onClick={onUseExcerpt}
            >
              ショートを説明にする
            </button>
            <button
              type="button"
              className="min-h-11 rounded border border-border-default px-3"
              onClick={onReadBody}
            >
              本文を読む
            </button>
            {canRetry && (
              <button
                type="button"
                className="min-h-11 rounded border border-border-default px-3"
                onClick={() => {
                  // Loading removes this retry button. Keep keyboard focus in the pane
                  // before the state change so Escape/Tab still reach the live trap.
                  titleRef.current?.focus({ preventScroll: true });
                  onRetry();
                }}
              >
                保存済み要約を再確認
              </button>
            )}
          </div>
          <button
            type="button"
            aria-expanded={showExplanation}
            aria-controls={explanationId}
            className="mt-4 min-h-11 rounded border border-border-default px-3 text-left text-[13px]"
            onClick={() => setShowExplanation((shown) => !shown)}
          >
            保存済み要約と自動事前要約について
          </button>
          {showExplanation && (
            <div
              id={explanationId}
              data-testid="summary-cache-explanation"
              className="mt-3 space-y-3 rounded border border-border-default p-3 text-[13px] leading-relaxed text-text-muted"
            >
              <p>
                この記事・選択中モデルの保存済み要約だけを確認しています。別モデルの保存状態は調べていません。
                再確認してもAI生成や全文取得は行いません。
              </p>
              <p>
                このリリースで自動事前要約の対象にしているモデル: {scheduledModelLabel}
                {model && (
                  <span className="mt-1 block">
                    {model === APPROVED_SCHEDULED_SUMMARY_MODEL
                      ? "選択中モデルは自動事前要約の対象モデルです。対象でも、すべての記事に要約が用意されるわけではありません。"
                      : "選択中モデルは自動事前要約の対象モデルと異なります。モデルごとに保存済み要約は別々です。"}
                  </span>
                )}
              </p>
              <p>
                要約がない理由は、未生成・対象外・本文未取得・生成失敗などの場合があります。
                自動事前要約の稼働状態・停止理由・残り予約枠・実際の請求額は、この画面では確認できません。
              </p>
              <p>
                予約枠は保守的な見積りで、生成成功件数やCloudflareの請求額とは異なります。
                手動AIなどの利用は、自動事前要約の予約枠とは別扱いです。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
