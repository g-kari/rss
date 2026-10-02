"use client";

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ArticleRecommendation } from "../lib/article-recommendations";
import type { useRecommendationTopics } from "../hooks/useRecommendationTopics";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { usePopupLock } from "../hooks/usePopupLock";
import RecommendationTopicControls from "./RecommendationTopicControls";

interface Props {
  recommendation: ArticleRecommendation;
  controls: ReturnType<typeof useRecommendationTopics>;
  onClose: () => void;
  returnFocusEl: HTMLElement | null;
}
const points = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
const buttonClass =
  "min-h-11 rounded-lg border border-border-default px-3 text-[13px] text-text-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:opacity-50";

/** Selection-time facts stay readable while feedback reranks the list behind this panel. */
export default function RecommendationReasonDialog({
  recommendation,
  controls,
  onClose,
  returnFocusEl,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  usePopupLock();
  const { handleKeyDown } = useModalFocusTrap(dialogRef, {
    onClose,
    returnFocusEl,
    preventScrollOnReturn: true,
  });
  const detail = recommendation.explanation;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/30" onPointerDown={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          handleKeyDown(event);
        }}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border-default bg-surface-elevated shadow-xl outline-none"
      >
        <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4 py-2">
          <h2 id={titleId} className="text-[14px] font-medium text-text-strong">
            この記事をおすすめした理由
          </h2>
          <button type="button" className={buttonClass} onClick={onClose}>
            閉じる
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-text-default">
          <p className="break-words font-medium text-text-strong">{recommendation.article.title}</p>
          <p className="mt-1 break-words text-[12px] text-text-muted">{recommendation.feedTitle}</p>
          <p className="mt-3">
            現在のフィルターに合う未読記事の中から選びました。以下は選んだ時点の内訳です。
          </p>
          {detail ? (
            <>
              <ul className="mt-2 space-y-2" aria-label="おすすめの根拠">
                <li>
                  <strong>新しさ</strong>：
                  {detail.freshness.ageHours === null
                    ? "日付が不明・未来のため加点なし"
                    : `${detail.freshness.source === "published" ? "公開" : "取得（公開日時なし）"}から${detail.freshness.ageHours < 24 ? `${Math.floor(detail.freshness.ageHours)}時間` : `${Math.floor(detail.freshness.ageHours / 24)}日`}`}
                  （{points(detail.freshness.points)}）
                </li>
                <li>
                  <strong>興味との一致</strong>：
                  {detail.interest.points > 0
                    ? `${detail.interest.saved ? "保存・いいね" : "閲覧"}した記事と同じカテゴリ「${detail.interest.topic}」`
                    : "一致する閲覧・保存・いいねのカテゴリなし"}
                  （{points(detail.interest.points)}）
                </li>
                <li>
                  <strong>配信元との一致</strong>：
                  {detail.feed.points > 0
                    ? "この配信元の記事の閲覧・保存・いいねを参考にしました"
                    : "この配信元の閲覧・保存・いいねの加点なし"}
                  （{points(detail.feed.points)}）
                </li>
                <li>
                  <strong>スター付きフィード</strong>：
                  {detail.priorityPoints ? "優先する設定" : "加点なし"}（
                  {points(detail.priorityPoints)}）
                </li>
                <li>
                  <strong>話題の調整</strong>：
                  {detail.preferences.length
                    ? detail.preferences
                        .map(
                          (entry) =>
                            `「${entry.label}」を${entry.value === "more" ? "増やす" : "減らす"}`,
                        )
                        .join("、")
                    : "調整なし"}
                  （{points(detail.preferencePoints)}）
                </li>
                <li>
                  <strong>偏りを抑える調整</strong>：
                  {detail.diversityPenalty
                    ? "先に選んだ記事と配信元・テーマが重なるため調整"
                    : "この枠での減点なし"}
                  （{points(-detail.diversityPenalty)}）
                </li>
              </ul>
              <p className="mt-2 text-[12px] text-text-muted">
                選択時スコア：{detail.total.toFixed(2)}
                。関心の確率ではありません。記事とフィードのカテゴリで照合し、本文の意味をAIで推測していません。一括既読は興味として数えません。
              </p>
              <h3 className="mt-4 text-[14px] font-medium text-text-strong">話題ごとに調整</h3>
              <p className="mt-1 text-[12px] text-text-muted">
                一覧はすぐ並び替えます。ドパガキモードでは現在の紹介順を保ち、次の補充分から反映します。減らしても非表示にはしません。
              </p>
              {detail.topics.length ? (
                detail.topics.map(({ topic, label }) => (
                  <RecommendationTopicControls
                    key={topic}
                    topic={topic}
                    label={label}
                    preferences={controls.preferences}
                    onChange={(nextLabel, value) => {
                      controls.update(nextLabel, value);
                      setMessage(
                        `「${nextLabel}」を${value === "more" ? "増やす設定にしました" : value === "less" ? "減らす設定にしました" : "標準に戻しました"}`,
                      );
                    }}
                  />
                ))
              ) : (
                <p className="mt-2 text-[12px] text-text-muted">
                  この記事とフィードにはカテゴリがありません。推測した話題では調整しません。
                </p>
              )}
            </>
          ) : (
            <p className="mt-2">
              {recommendation.reasons.join(" · ")}。この紹介枠には詳細な内訳が保存されていません。
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              aria-disabled={!controls.canUndo}
              onClick={() => {
                if (!controls.canUndo) return;
                const restored = controls.undo();
                setMessage(
                  restored
                    ? "直前の話題調整を元に戻しました"
                    : "新しい話題の調整があるため、その設定を保ちました",
                );
              }}
            >
              話題の調整を元に戻す
            </button>
          </div>
          <p role="status" className="mt-2 text-[12px] text-text-muted">
            {message}
          </p>
          {!controls.persisted && (
            <p role="alert" className="mt-2 text-[12px] text-status-error">
              このブラウザに保存できませんでした。今回の画面では調整を使えます。
            </p>
          )}
          <p className="mt-2 text-[12px] text-text-muted">
            このアカウント・ブラウザに最大64話題を保存し、超えると古い調整から置き換えます。他の端末や毎日のおすすめ通知には同期しません。すべての調整は一覧の「選び方・おすすめの調整」で解除できます。
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
