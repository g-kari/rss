"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Article } from "../types";
import type { ArticleRecommendationOptions } from "../lib/article-recommendations";
import {
  createImmersiveBatch,
  getImmersiveCandidates,
  immersiveExcerpt,
  safeRecommendationThumbnail,
} from "../lib/immersive-articles";
import { resolveThumbnail } from "../lib/article-utils";
import { useOgpCacheContext } from "../contexts/OgpCacheContext";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { usePopupLock } from "../hooks/usePopupLock";
import { useSyncedRef } from "../hooks/useSyncedRef";
import CinematicArticle from "./CinematicArticle";
import { VisualModeSwitch } from "./VisualModeBar";
import { useVisualMode } from "../contexts/VisualModeContext";
import { ArticleThumbnail } from "./article-items/shared";

interface Props extends ArticleRecommendationOptions {
  onClose: () => void;
  onSelectArticle: (article: Article) => void;
  onToggleReadingList?: (id: string) => void;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
}

const secondaryButton =
  "min-h-11 rounded-lg border border-border-default px-3 text-[12px] text-text-default hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

export default function ImmersiveArticleMode(props: Props) {
  const {
    onClose,
    onSelectArticle,
    onToggleReadingList,
    onDismiss,
    onRestore,
    readingListIds,
    dismissedIds,
  } = props;
  const { enabled: visualMode } = useVisualMode();
  const [batch, setBatch] = useState(() => createImmersiveBatch(props, []));
  const [served, setServed] = useState<Article[]>(() => batch.map(({ article }) => article));
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
  const current = batch[index];
  const activeArticle = current ? eligible.get(current.article.id) : undefined;
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
  const moveTo = (next: number) => {
    const value = Math.max(0, Math.min(batch.length, next));
    setIndex(value);
    const element = scrollRef.current;
    // An immediate move avoids queued smooth-scroll races and honors reduced motion.
    if (element) element.scrollTop = element.clientHeight * value;
  };
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
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={helpId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-surface-base text-text-strong outline-none"
      onKeyDown={(event) => {
        event.stopPropagation();
        handleKeyDown(event);
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
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
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border-default px-4 pt-[env(safe-area-inset-top)]">
        <div className="min-w-0 py-2">
          <h2 id={titleId} className="text-[14px] font-medium">
            ドパガキモード
          </h2>
          <p id={helpId} className="text-[11px] text-text-muted">
            縦スワイプ・↑↓で移動 / 最大10件でひと区切り
          </p>
        </div>
        <button type="button" onClick={onClose} className={secondaryButton}>
          一覧に戻る
        </button>
        <VisualModeSwitch />
      </header>
      <div
        ref={scrollRef}
        role="region"
        aria-label="おすすめ記事を縦にスワイプ"
        tabIndex={0}
        className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (element.clientHeight > 0)
            setIndex(
              Math.max(
                0,
                Math.min(batch.length, Math.round(element.scrollTop / element.clientHeight)),
              ),
            );
        }}
      >
        {batch.map((item, itemIndex) => {
          const article = eligible.get(item.article.id);
          const thumb = article && safeRecommendationThumbnail(resolveThumbnail(article, ogpCache));
          return (
            <div
              key={item.article.id}
              aria-hidden={itemIndex !== index}
              inert={itemIndex !== index || undefined}
              className="h-full snap-start snap-always overflow-y-auto"
            >
              <article className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-3 p-4 sm:p-6">
                {article ? (
                  <>
                    {visualMode && Math.abs(itemIndex - index) <= 1 ? (
                      <CinematicArticle
                        key={`${article.id}:${itemIndex === index}`}
                        article={article}
                        thumb={thumb}
                        feedTitle={item.feedTitle}
                        active={itemIndex === index}
                      />
                    ) : (
                      <>
                        {Math.abs(itemIndex - index) <= 1 && (
                          <ArticleThumbnail
                            key={`${article.id}:${thumb ?? "none"}`}
                            thumb={thumb}
                            className="h-[24dvh] min-h-20 max-h-72 w-full shrink-0 rounded-xl bg-surface-subtle object-contain"
                          />
                        )}
                        <p className="break-words text-[11px] text-text-muted">{item.feedTitle}</p>
                        <h3 className="break-words text-xl font-medium leading-relaxed sm:text-2xl">
                          {article.title}
                        </h3>
                        <p className="break-words text-[14px] leading-relaxed text-text-default">
                          {immersiveExcerpt(article) ||
                            "短い説明はありません。「本文を読む」から記事を開けます。"}
                        </p>
                      </>
                    )}
                    <p className="break-words text-[11px] leading-relaxed text-text-muted">
                      {item.reasons.join(" · ")}
                    </p>
                  </>
                ) : (
                  <p className="py-12 text-center text-[14px] text-text-muted">
                    この記事はおすすめの対象から外れました。次の記事へ進めます。
                  </p>
                )}
              </article>
            </div>
          );
        })}
        <section
          aria-hidden={index !== batch.length}
          className="flex h-full snap-start snap-always flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center"
        >
          <h3 className="text-xl font-medium">
            {batch.length ? "ここでひと区切り" : "いま紹介できる記事はありません"}
          </h3>
          <p className="max-w-sm text-[14px] leading-relaxed text-text-muted">
            {nextAvailable
              ? "続けたいときだけ、次の最大10件を表示できます。"
              : "読み込み済みのおすすめはここまでです。一覧から記事を追加で読み込めます。"}
          </p>
          <p className="text-[12px] text-text-muted">スワイプしただけでは既読になりません</p>
        </section>
      </div>
      <footer className="shrink-0 border-t border-border-default bg-surface-elevated px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
            {activeArticle && (
              <>
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-ink px-4 text-[13px] text-ink-text hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2"
                  onClick={() => {
                    onClose();
                    onSelectArticle(activeArticle);
                  }}
                >
                  本文を読む
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
                className="min-h-11 rounded-lg bg-ink px-4 text-[13px] text-ink-text hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2"
                onClick={() => {
                  const next = createImmersiveBatch(props, served);
                  setBatch(next);
                  setServed((previous) => [...previous, ...next.map(({ article }) => article)]);
                  setIndex(0);
                  setMessage("");
                  if (scrollRef.current) scrollRef.current.scrollTop = 0;
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
          <div className="flex items-center justify-between gap-2">
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
              className="text-center text-[12px] text-text-muted"
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
          {message && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-text-muted"
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
    </div>,
    document.body,
  );
}
