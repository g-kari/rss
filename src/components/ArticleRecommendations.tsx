"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Article } from "../types";
import {
  rankArticleRecommendations,
  type ArticleRecommendationOptions,
  type ArticleRecommendation,
} from "../lib/article-recommendations";
import { useRecommendationTopics } from "../hooks/useRecommendationTopics";
import RecommendationReasonDialog from "./RecommendationReasonDialog";
import RecommendationTopicControls from "./RecommendationTopicControls";
import { useRecommendationDismissals } from "../hooks/useRecommendationDismissals";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { useOgpCacheContext } from "../contexts/OgpCacheContext";
import { resolveThumbnail } from "../lib/article-utils";
import { safeRecommendationThumbnail } from "../lib/immersive-articles";
import ImmersiveArticleMode, { type ImmersiveSessionSnapshot } from "./ImmersiveArticleMode";
import { ArticleThumbnail } from "./article-items/shared";
import ReadingModeControls from "./ReadingModeControls";

interface Props extends Omit<ArticleRecommendationOptions, "dismissedIds" | "now" | "limit"> {
  userId: string;
  enabled?: boolean;
  status?: "ready" | "loading" | "error" | "searching";
  scopeKey?: string;
  onSelectArticle: (article: Article) => void;
  onReadArticle?: (article: Article) => void;
  onMarkRead?: (id: string) => void;
  summaryAccess?: boolean;
  onToggleReadingList?: (id: string) => void;
}

/** Account key also isolates disclosure/undo state when the signed-in user changes. */
export default function ArticleRecommendations(props: Props) {
  return <RecommendationContent key={props.userId} {...props} />;
}

function RecommendationContent({
  userId,
  enabled = true,
  status = "ready",
  scopeKey,
  candidates,
  displayCandidates,
  articles,
  feeds,
  readIds,
  readBeforeTimestamp,
  bookmarkIds,
  readingListIds,
  likeIds,
  historyIds,
  onSelectArticle,
  onReadArticle,
  onMarkRead,
  summaryAccess,
  onToggleReadingList,
}: Props) {
  const topicControls = useRecommendationTopics(userId);
  const [reasonArticle, setReasonArticle] = useState<ArticleRecommendation | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [immersiveSession, setImmersiveSession] = useState<ImmersiveSessionSnapshot | null>(null);
  const [immersiveOpen, setImmersiveOpen] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const immersiveOpenRef = useSyncedRef(immersiveOpen);
  const undoRef = useRef<HTMLButtonElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A disabled launch button cannot receive focus when an interrupted session closes.
    if (immersiveOpenRef.current && status !== "ready") disclosureRef.current?.focus();
    setReasonArticle(null);
    setImmersiveOpen(false);
    setImmersiveSession(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- immersiveOpenRef is stable; opening alone must not close the session.
  }, [enabled, status, scopeKey]);
  const headingId = useId();
  const contentId = useId();
  const stateId = useId();
  const { dismissedIds, dismiss, restore, reset } = useRecommendationDismissals(userId);
  const { ogpCache } = useOgpCacheContext();
  useEffect(() => {
    if (lastDismissed) undoRef.current?.focus();
  }, [lastDismissed]);
  // Refresh freshness labels and dismissal TTLs after long-lived or background tabs.
  useEffect(() => {
    if (!enabled) return;
    const refreshClock = () => setNow(Date.now());
    refreshClock();
    const timer = setInterval(refreshClock, 60000);
    window.addEventListener("focus", refreshClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
    };
  }, [enabled]);
  const recommendations = useMemo(() => {
    if (!enabled || status !== "ready") return [];
    const eligibleIds = new Set(articles.map((article) => article.id));
    return rankArticleRecommendations({
      candidates: candidates.filter((article) => eligibleIds.has(article.id)),
      articles,
      feeds,
      readIds,
      readBeforeTimestamp,
      bookmarkIds,
      readingListIds,
      likeIds,
      historyIds,
      dismissedIds,
      topicPreferences: topicControls.preferences,
      now,
    });
  }, [
    enabled,
    status,
    candidates,
    articles,
    feeds,
    readIds,
    readBeforeTimestamp,
    bookmarkIds,
    readingListIds,
    likeIds,
    historyIds,
    dismissedIds,
    topicControls.preferences,
    now,
  ]);

  useEffect(() => {
    // Suspended queues were selected with older choices. Open queues keep their current
    // article/text/playback stable and use new choices for the next replenishment.
    if (!immersiveOpenRef.current) setImmersiveSession(null);
  }, [topicControls.preferences]);

  if (!enabled) return null;

  const unavailableMessage =
    status === "loading"
      ? "記事を読み込み中です。現在のフィルター内からおすすめを表示します"
      : status === "error"
        ? "記事を読み込めませんでした。一覧で再試行するとおすすめも表示されます"
        : status === "searching"
          ? "検索条件を反映しています"
          : null;

  return (
    <>
      {reasonArticle && (
        <RecommendationReasonDialog
          recommendation={reasonArticle}
          controls={topicControls}
          onClose={() => setReasonArticle(null)}
          returnFocusEl={disclosureRef.current}
        />
      )}
      {immersiveOpen && (
        <ImmersiveArticleMode
          candidates={candidates}
          displayCandidates={displayCandidates}
          articles={articles}
          feeds={feeds}
          readIds={readIds}
          readBeforeTimestamp={readBeforeTimestamp}
          bookmarkIds={bookmarkIds}
          readingListIds={readingListIds}
          likeIds={likeIds}
          historyIds={historyIds}
          dismissedIds={dismissedIds}
          topicPreferences={topicControls.preferences}
          topicControls={topicControls}
          now={now}
          onClose={() => setImmersiveOpen(false)}
          onSelectArticle={onReadArticle ?? onSelectArticle}
          onMarkRead={onMarkRead}
          summaryAccount={
            summaryAccess === undefined
              ? undefined
              : { userId, authUsable: summaryAccess, scopeKey: scopeKey ?? "" }
          }
          session={immersiveSession}
          onSessionChange={setImmersiveSession}
          onToggleReadingList={onToggleReadingList}
          onDismiss={dismiss}
          onRestore={restore}
        />
      )}
      <section
        aria-labelledby={headingId}
        className="flex-shrink-0 max-h-[40vh] overflow-y-auto border-b border-border-default bg-surface-elevated"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-1">
          <h2 id={headingId} className="text-control font-medium text-text-strong">
            いま読むおすすめ
          </h2>
          <ReadingModeControls
            onEnterImmersive={() => setImmersiveOpen(true)}
            ready={status === "ready"}
            describedBy={recommendations.length === 0 ? stateId : undefined}
          />
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            ref={disclosureRef}
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={expanded ? "おすすめを折りたたむ" : "おすすめを表示"}
            className="min-h-11 px-2 text-control text-text-muted hover:text-text-strong focus-visible:outline-2 focus-visible:outline-offset-2 [@media(pointer:fine)]:min-h-8"
          >
            {expanded ? "折りたたむ" : `${recommendations.length}件を表示`}
          </button>
        </div>
        {recommendations.length === 0 && (
          <p id={stateId} aria-live="polite" className="px-4 py-3 text-[12px] text-text-muted">
            {unavailableMessage ?? "現在のフィルターに合う未読のおすすめ記事はありません"}
          </p>
        )}
        <div id={contentId} hidden={!expanded}>
          <ul className="px-2">
            {recommendations.map((recommendation) => {
              const { article, feedTitle, reasons } = recommendation;
              const thumb = safeRecommendationThumbnail(resolveThumbnail(article, ogpCache));
              return (
                <li key={article.id} className="border-t border-border-subtle px-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSelectArticle(article)}
                    aria-label={`${article.title}を読む`}
                    className="flex items-start gap-2 min-h-11 w-full min-w-0 text-left text-[13px] font-medium leading-relaxed text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <ArticleThumbnail
                      key={thumb ?? "no-image"}
                      thumb={thumb}
                      className="w-16 h-12 flex-shrink-0 rounded object-cover bg-surface-subtle"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 break-words">{article.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-normal text-text-muted">
                        {feedTitle}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <p className="min-w-0 flex-1 truncate text-meta text-text-muted">
                      {reasons.map((reason, index) => (
                        <span key={reason}>
                          {index > 0 && " · "}
                          {reason}
                        </span>
                      ))}
                    </p>
                    <button
                      type="button"
                      aria-label={`${article.title}をおすすめした理由`}
                      aria-haspopup="dialog"
                      title="おすすめした理由・話題を調整"
                      onClick={() => setReasonArticle(recommendation)}
                      className="min-h-11 flex-shrink-0 px-1.5 text-control text-text-default hover:text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 [@media(pointer:fine)]:min-h-8"
                    >
                      理由
                    </button>
                    <button
                      type="button"
                      aria-label={`${article.title}に興味なし`}
                      title="この記事だけをおすすめから30日間非表示"
                      onClick={() => {
                        dismiss(article.id);
                        setLastDismissed(article.id);
                      }}
                      className="min-h-11 flex-shrink-0 px-1.5 text-control text-text-muted hover:text-text-strong hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 [@media(pointer:fine)]:min-h-8"
                    >
                      興味なし
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div role="status" className="px-4 text-[11px] text-text-muted">
            {lastDismissed && dismissedIds.has(lastDismissed) && (
              <div className="flex flex-wrap items-center gap-x-2 py-1">
                <span>おすすめから外しました</span>
                <button
                  type="button"
                  onClick={() => {
                    restore(lastDismissed);
                    setLastDismissed(null);
                    disclosureRef.current?.focus();
                  }}
                  ref={undoRef}
                  className="min-h-11 underline hover:text-text-strong"
                >
                  元に戻す
                </button>
              </div>
            )}
          </div>
          <details className="px-4 pb-2 text-[11px] leading-relaxed text-text-muted">
            <summary className="min-h-11 cursor-pointer py-1">選び方・おすすめの調整</summary>
            <p>
              表示中の未読記事から最大3件。新しさ、閲覧履歴、保存・いいねした記事のテーマを参考に、配信元の偏りを抑えて選びます。履歴が少ないときは新着を優先します。
            </p>
            <p className="mt-1">
              「興味なし」は、このブラウザでこの記事だけを30日間非表示にします。
            </p>
            <p className="mt-2">
              話題の調整はこのアカウント・ブラウザに保存し、一覧とドパガキモードの新しい紹介枠に反映します。通知には同期しません。
            </p>
            {topicControls.preferences.map(({ topic, label }) => (
              <RecommendationTopicControls
                key={topic}
                topic={topic}
                label={label}
                preferences={topicControls.preferences}
                onChange={topicControls.update}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!topicControls.preferences.length}
                onClick={topicControls.reset}
                className="min-h-11 text-left text-[12px] underline disabled:opacity-50"
              >
                話題の調整をすべてリセット
              </button>
              <button
                type="button"
                disabled={!topicControls.canUndo}
                onClick={topicControls.undo}
                className="min-h-11 text-left text-[12px] underline disabled:opacity-50"
              >
                話題の調整を元に戻す
              </button>
            </div>
            {!topicControls.persisted && (
              <p role="alert">話題の調整を保存できませんでした。今回の画面だけに反映しています。</p>
            )}
            {dismissedIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setLastDismissed(null);
                  disclosureRef.current?.focus();
                }}
                className="min-h-11 text-left underline hover:text-text-strong"
              >
                非表示にしたおすすめをリセット
              </button>
            )}
          </details>
        </div>
      </section>
    </>
  );
}
