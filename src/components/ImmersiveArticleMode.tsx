"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import type {
  ArticleRecommendation,
  ArticleRecommendationOptions,
} from "../lib/article-recommendations";
import { createImmersiveBatch, getImmersiveCandidates } from "../lib/immersive-articles";
import { useOgpCacheContext } from "../contexts/OgpCacheContext";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { usePopupLock } from "../hooks/usePopupLock";
import { useSyncedRef } from "../hooks/useSyncedRef";
import ImmersiveInlineReader from "./ImmersiveInlineReader";
import { immersiveThumbnailSources } from "../lib/immersive-articles";
import CinematicArticle from "./CinematicArticle";
import { useImmersiveNarration } from "../hooks/useImmersiveNarration";
import { acquireImmersiveSession } from "../lib/immersive-session";
import { useOptionalTtsAdapter } from "../contexts/TtsAdapterContext";
import { immersiveExcerpt } from "../lib/immersive-articles";
import { useVisualMode } from "../contexts/VisualModeContext";

export interface ImmersiveSessionSnapshot {
  remaining: ArticleRecommendation[];
  served: Article[];
  paused: boolean;
  speed: number;
}

interface Props extends ArticleRecommendationOptions {
  onClose: () => void;
  session?: ImmersiveSessionSnapshot | null;
  onSessionChange?: (session: ImmersiveSessionSnapshot) => void;
  onSelectArticle: (article: Article) => void;
  onToggleReadingList?: (id: string) => void;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
}

const secondaryButton = "immersive-button";

export default function ImmersiveArticleMode(props: Props) {
  const {
    onClose,
    onSelectArticle,
    onToggleReadingList,
    onDismiss,
    onRestore,
    session,
    onSessionChange,
    readingListIds,
    dismissedIds,
  } = props;
  const { motionEnabled, motionReason, pageVisible } = useVisualMode();
  const prefersPause =
    !motionEnabled || motionReason === "端末の動きを減らす設定" || motionReason === "静止表示";
  const [paused, setPaused] = useState(session?.paused ?? prefersPause);
  const [inlineOpen, setInlineOpen] = useState(false);
  const playbackPaused = paused || inlineOpen;
  const [speed, setSpeed] = useState(session?.speed ?? 1);
  const canAdvance = pageVisible && !playbackPaused;
  const canAdvanceRef = useSyncedRef(canAdvance);
  useEffect(() => {
    if (prefersPause) setPaused(true);
  }, [prefersPause]);
  // An empty pool has no playback history to preserve when articles become available later.
  // Occupied or consumed queues still retain their finite batch and served exclusions.
  const hasSessionQueue = !!session && (session.remaining.length > 0 || session.served.length > 0);
  const [batch, setBatch] = useState(() => {
    if (!hasSessionQueue || !session) return createImmersiveBatch(props, []);
    const eligibleIds = new Set(getImmersiveCandidates(props).map((article) => article.id));
    return session.remaining.filter((item) => eligibleIds.has(item.article.id));
  });
  const [served, setServed] = useState<Article[]>(() =>
    hasSessionQueue && session ? session.served : batch.map(({ article }) => article),
  );
  const [index, setIndex] = useState(0);
  const indexRef = useSyncedRef(index);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const helpId = useId();
  const { ogpCache } = useOgpCacheContext();
  usePopupLock();
  const { handleKeyDown } = useModalFocusTrap(dialogRef, { onClose });
  const eligible = useMemo(
    () => new Map(getImmersiveCandidates(props).map((article) => [article.id, article])),
    [props],
  );
  const [mediaFinished, setMediaFinished] = useState<string>();
  const readerTts = useOptionalTtsAdapter();
  const readerTtsRef = useSyncedRef(readerTts);
  useEffect(() => {
    const release = acquireImmersiveSession();
    readerTtsRef.current?.stop();
    return release;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readerTtsRef is stable.
  }, []);
  const current = batch[index];
  const activeArticle = current ? eligible.get(current.article.id) : undefined;
  useEffect(() => {
    if (inlineOpen && !activeArticle) setInlineOpen(false);
  }, [inlineOpen, activeArticle]);
  const narration = useImmersiveNarration(
    activeArticle?.id,
    activeArticle ? `${activeArticle.title}。${immersiveExcerpt(activeArticle)}` : "",
    playbackPaused,
    pageVisible,
    speed,
  );
  const servedKeys = useMemo(
    () => ({
      ids: new Set(served.map((article) => article.id)),
      links: new Set(served.map((article) => article.link).filter(Boolean)),
    }),
    [served],
  );
  const nextAvailable = Array.from(eligible.values()).some(
    (article) =>
      !servedKeys.ids.has(article.id) && (!article.link || !servedKeys.links.has(article.link)),
  );
  useEffect(() => {
    onSessionChange?.({ remaining: batch.slice(index), served, paused, speed });
  }, [batch, index, served, paused, speed, onSessionChange]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    // Align after the new slides exist: an empty queue's persistent end section must not
    // remain the browser's snap target when a new batch is inserted before it.
    if (element) element.scrollTop = element.clientHeight * indexRef.current;
  }, [batch, indexRef]);
  const retainNavigationFocus = (next: number) => {
    const focused = document.activeElement;
    if (!focused || !dialogRef.current?.contains(focused)) return;
    // End-of-batch controls disappear or become disabled; Previous also disables at the start.
    // Leave stable controls, including the speed selector and Close, focused during automatic movement.
    const unavailableAtEnd =
      next === batch.length &&
      (focused.closest(".immersive-actions") ||
        focused.matches('.immersive-playback-controls button, button[aria-label="次の記事"]'));
    if (unavailableAtEnd || (next === 0 && focused.getAttribute("aria-label") === "前の記事"))
      scrollRef.current?.focus({ preventScroll: true });
  };
  const moveTo = (next: number) => {
    const value = Math.max(0, Math.min(batch.length, next));
    retainNavigationFocus(value);
    indexRef.current = value;
    setMediaFinished(undefined);
    setIndex(value);
    const element = scrollRef.current;
    // An immediate move avoids queued smooth-scroll races and honors reduced motion.
    if (element) element.scrollTop = element.clientHeight * value;
  };
  useEffect(() => {
    if (activeArticle && mediaFinished === activeArticle.id && !narration.holding && canAdvance)
      moveTo(index + 1);
  });
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let previousHeight = element.clientHeight;
    const observer = new ResizeObserver(() => {
      if (element.clientHeight === previousHeight) return;
      previousHeight = element.clientHeight;
      element.scrollTop = element.clientHeight * indexRef.current;
    });
    observer.observe(element);
    return () => observer.disconnect();
    // useSyncedRef has stable identity; observe size changes, not navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lastDismissed && dismissedIds.has(lastDismissed)) undoRef.current?.focus();
  }, [lastDismissed, dismissedIds]);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={!inlineOpen}
      aria-labelledby={titleId}
      aria-describedby={helpId}
      tabIndex={-1}
      className="immersive-dialog fixed inset-0 z-50 h-dvh overflow-hidden outline-none"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (inlineOpen) return;
        handleKeyDown(event);
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if ((event.target as HTMLElement).closest("select, input, textarea")) return;
        if (event.key === " " && !(event.target as HTMLElement).closest("button")) {
          event.preventDefault();
          setPaused((previous) => !previous);
        }
        if (event.key === "ArrowDown" || event.key === "PageDown") {
          event.preventDefault();
          moveTo(index + 1);
        }
        if (event.key === "ArrowUp" || event.key === "PageUp") {
          event.preventDefault();
          moveTo(index - 1);
        }
      }}
    >
      <header className="immersive-toolbar" inert={inlineOpen || undefined}>
        <button type="button" onClick={onClose} className={secondaryButton}>
          一覧に戻る
        </button>
        <h2 id={titleId} className="sr-only">
          ドパガキモード
        </h2>
        <p id={helpId} className="sr-only">
          自動再生・縦スワイプ・↑↓で移動。スペースで一時停止。最大10件で停止します。
        </p>
        <div className="immersive-playback-controls">
          <button
            type="button"
            className={secondaryButton}
            disabled={!activeArticle}
            aria-label={paused ? "自動再生を再開" : "自動再生を一時停止"}
            aria-pressed={paused}
            onClick={() => setPaused((previous) => !previous)}
          >
            {paused ? "▶ 再開" : "Ⅱ 一時停止"}
          </button>
          <button
            type="button"
            className={secondaryButton}
            aria-pressed={narration.enabled}
            aria-label={narration.enabled ? "ナレーションを停止" : "ナレーションを開始"}
            onClick={narration.toggle}
            disabled={!activeArticle}
          >
            {narration.enabled ? "読み上げ停止" : "読み上げ"}
          </button>
          <label className="immersive-speed">
            <span className="sr-only">再生速度</span>
            <select
              aria-label="再生速度"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              <option value={0.75}>0.75×</option>
              <option value={1}>1×</option>
              <option value={1.5}>1.5×</option>
              <option value={2}>2×</option>
            </select>
          </label>
        </div>
      </header>
      <div
        ref={scrollRef}
        inert={inlineOpen || undefined}
        role="region"
        aria-label="おすすめ記事を縦にスワイプ"
        tabIndex={0}
        className="immersive-scroller h-full snap-y snap-mandatory overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.clientHeight > 0) {
            const next = Math.max(
              0,
              Math.min(batch.length, Math.round(element.scrollTop / element.clientHeight)),
            );
            if (indexRef.current !== next) setMediaFinished(undefined);
            retainNavigationFocus(next);
            indexRef.current = next;
            setIndex(next);
          }
        }}
      >
        {batch.map((item, itemIndex) => {
          const article = eligible.get(item.article.id);
          const thumbnails = article ? immersiveThumbnailSources(article, ogpCache) : [];
          const thumb = thumbnails[0];
          return (
            <div
              key={item.article.id}
              aria-hidden={itemIndex !== index}
              inert={itemIndex !== index || undefined}
              className="immersive-slide h-full snap-start snap-always overflow-hidden"
            >
              <article className="h-full w-full">
                {article ? (
                  <>
                    {Math.abs(itemIndex - index) <= 1 && (
                      <CinematicArticle
                        key={`${article.id}:${itemIndex === index}`}
                        article={article}
                        thumb={thumb}
                        thumbnailFallbacks={thumbnails.slice(1)}
                        feedTitle={item.feedTitle}
                        active={itemIndex === index}
                        paused={playbackPaused}
                        speed={speed}
                        onComplete={() => {
                          // The synchronous index ref rejects duplicate and stale media callbacks.
                          if (itemIndex !== indexRef.current || !canAdvanceRef.current) return;
                          setMediaFinished(article.id);
                        }}
                      />
                    )}
                    <p className="sr-only">{item.reasons.join(" · ")}</p>
                  </>
                ) : (
                  <p className="immersive-empty">
                    この記事はおすすめの対象から外れました。次の記事へ進めます。
                  </p>
                )}
              </article>
            </div>
          );
        })}
        <section
          aria-hidden={index !== batch.length}
          className="immersive-end flex h-full snap-start snap-always flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center"
        >
          <h3 className="text-xl font-medium">
            {batch.length ? "ここでひと区切り" : "いま紹介できる記事はありません"}
          </h3>
          <p className="max-w-sm text-[16px] leading-relaxed">
            {nextAvailable
              ? "続けたいときだけ、次の最大10件を表示できます。"
              : "読み込み済みのおすすめはここまでです。一覧から記事を追加で読み込めます。"}
          </p>
          <p className="text-[14px]">スワイプしただけでは既読になりません</p>
        </section>
      </div>
      <footer className="immersive-footer" inert={inlineOpen || undefined}>
        <div className="flex flex-col gap-2">
          <div className={activeArticle ? "immersive-actions" : "immersive-batch-actions"}>
            {activeArticle && (
              <>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => {
                    onSessionChange?.({ remaining: batch.slice(index + 1), served, paused, speed });
                    onClose();
                    onSelectArticle(activeArticle);
                  }}
                >
                  本文を読む
                </button>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setInlineOpen(true)}
                >
                  ここで読む
                </button>
                {onToggleReadingList && (
                  <button
                    type="button"
                    aria-pressed={readingListIds.has(activeArticle.id)}
                    className={secondaryButton}
                    onClick={() => {
                      onToggleReadingList(activeArticle.id);
                      setMessage(
                        readingListIds.has(activeArticle.id)
                          ? "後で読むから外しました"
                          : "後で読むに保存しました",
                      );
                    }}
                  >
                    {readingListIds.has(activeArticle.id) ? "保存済み" : "後で読む"}
                  </button>
                )}
                <button
                  type="button"
                  className={secondaryButton}
                  title="この記事だけをおすすめから30日間非表示"
                  onClick={() => {
                    setPaused(true);
                    onDismiss(activeArticle.id);
                    setLastDismissed(activeArticle.id);
                    setMessage("おすすめから外しました");
                  }}
                >
                  興味なし
                </button>
              </>
            )}
            {index === batch.length && nextAvailable && (
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  const next = createImmersiveBatch(props, served);
                  setBatch(next);
                  setServed((previous) => [...previous, ...next.map(({ article }) => article)]);
                  indexRef.current = 0;
                  setIndex(0);
                  setPaused(prefersPause);
                  setMediaFinished(undefined);
                  setMessage("");
                  if (scrollRef.current) {
                    // This button is removed by the new batch; keep keyboard events in the mode.
                    scrollRef.current.focus({ preventScroll: true });
                  }
                }}
              >
                次の10件を見る
              </button>
            )}
            {index === batch.length && (
              <button type="button" onClick={onClose} className={secondaryButton}>
                ここで終わる
              </button>
            )}
          </div>
          <div className="immersive-navigation flex items-center justify-between gap-2">
            <button
              type="button"
              className={secondaryButton}
              disabled={index === 0}
              onClick={() => moveTo(index - 1)}
              aria-label="前の記事"
            >
              ↑ 前へ
            </button>
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-center text-[14px]"
            >
              {index < batch.length ? `${index + 1} / ${batch.length}件` : "区切り"}
            </span>
            <button
              type="button"
              className={secondaryButton}
              disabled={index === batch.length}
              onClick={() => moveTo(index + 1)}
              aria-label="次の記事"
            >
              次へ ↓
            </button>
          </div>
          {narration.message && (
            <p className="immersive-narration-message text-center text-[12px]" aria-live="polite">
              {narration.message}
            </p>
          )}
          {message && (
            <div
              role="status"
              className="immersive-message flex flex-wrap items-center justify-center gap-2 text-[14px]"
            >
              <span>{message}</span>
              {lastDismissed && dismissedIds.has(lastDismissed) && (
                <button
                  ref={undoRef}
                  type="button"
                  className="min-h-11 underline"
                  onClick={() => {
                    onRestore(lastDismissed);
                    setLastDismissed(null);
                    setMessage("おすすめに戻しました");
                    scrollRef.current?.focus({ preventScroll: true });
                  }}
                >
                  元に戻す
                </button>
              )}
            </div>
          )}
        </div>
      </footer>
      <ImmersiveInlineReader
        article={inlineOpen ? (activeArticle ?? null) : null}
        onClose={() => setInlineOpen(false)}
      />
    </div>,
    document.body,
  );
}
