import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Article } from "../types";
import { useSyncedRef } from "./useSyncedRef";
import { shouldEagerLoad } from "../lib/pagination-eager-load";

/** デフォルトの 1 ページ件数 (`useFilteredArticles` 経由で UserSettings の値を渡すと上書き) */
const DEFAULT_PAGE_SIZE = 50;
/** Maximum consecutive eager loads to prevent runaway loops */
const MAX_EAGER_LOADS = 20;

/**
 * scrollContainer (`role="feed"` の祖先要素) を sentinel から取得し、
 * その scrollHeight が viewport (clientHeight) を埋めていないかを判定する (#636)。
 * masonic ギャラリーで列が偏ったとき、最長列の底にある sentinel に届かなくても
 * 最短列にはまだ余白があるケースを検出するための補助関数。
 */
function isContentShorterThanViewport(sentinel: HTMLElement | null): boolean {
  if (!sentinel) return false;
  const scrollEl = sentinel.closest('[role="feed"]') as HTMLElement | null;
  if (!scrollEl) return false;
  return scrollEl.scrollHeight <= scrollEl.clientHeight + 1;
}

export function useArticlePagination(
  filtered: Article[],
  page: number,
  setPage: Dispatch<SetStateAction<number>>,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, [setPage]);

  const [serverLoadCount, setServerLoadCount] = useState(0);
  const notifyArticlesAdded = useCallback(() => {
    setServerLoadCount((c) => c + 1);
  }, []);

  const pageSizeRef = useSyncedRef(pageSize);
  const filteredRef = useSyncedRef(filtered);
  useEffect(() => {
    if (serverLoadCount === 0) return;
    setPage((prev) =>
      Math.max(prev, Math.ceil(filteredRef.current.length / pageSizeRef.current) || 1),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs は useSyncedRef の安定参照のため deps 不要
  }, [serverLoadCount, setPage]);

  const visible = filtered.slice(0, page * pageSize);
  const hasMore = visible.length < filtered.length;

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useSyncedRef(loadMore);
  const hasMoreRef = useSyncedRef(hasMore);
  const isIntersectingRef = useRef(false);
  const eagerLoadCountRef = useRef(0);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        isIntersectingRef.current = entries[0].isIntersecting;
        if (entries[0].isIntersecting && hasMoreRef.current) {
          eagerLoadCountRef.current = 0;
          loadMoreRef.current();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);

    // #636: scrollContainer のリサイズ (windowリサイズ・サイドバー幅変更) や
    // masonry レイアウト確定で contentShort 状態が変化したら再評価する。
    // ResizeObserver で scrollContainer 自身のサイズ変化を捕捉し、その瞬間に
    // shouldEagerLoad を判定して必要なら loadMore を発火する。
    const scrollEl = el.closest('[role="feed"]') as HTMLElement | null;
    let resizeObserver: ResizeObserver | null = null;
    if (scrollEl && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        if (!hasMoreRef.current) return;
        const trigger = shouldEagerLoad({
          isIntersecting: isIntersectingRef.current,
          isContentShort: isContentShorterThanViewport(sentinelRef.current),
          hasMore: hasMoreRef.current,
          count: eagerLoadCountRef.current,
          max: MAX_EAGER_LOADS,
        });
        if (trigger) {
          eagerLoadCountRef.current += 1;
          loadMoreRef.current();
        }
      });
      resizeObserver.observe(scrollEl);
    }

    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef・hasMoreRef は useSyncedRef の安定参照、マウント時に一度だけ設定
  }, []);

  // After visible items change, if sentinel is still intersecting OR content is shorter
  // than viewport (#636: masonic ギャラリーで列が偏ったケース), eagerly load the next page.
  // requestAnimationFrame を 2 回連続で待つことで、masonic 等のレイアウト確定後の
  // scrollHeight を正しく取得する（masonry の絶対座標配置は次フレームで反映される）。
  useEffect(() => {
    if (!hasMoreRef.current) {
      eagerLoadCountRef.current = 0;
      return;
    }
    if (eagerLoadCountRef.current >= MAX_EAGER_LOADS) return;
    let cancelled = false;
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return;
      const id2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const trigger = shouldEagerLoad({
          isIntersecting: isIntersectingRef.current,
          isContentShort: isContentShorterThanViewport(sentinelRef.current),
          hasMore: hasMoreRef.current,
          count: eagerLoadCountRef.current,
          max: MAX_EAGER_LOADS,
        });
        if (trigger) {
          eagerLoadCountRef.current += 1;
          loadMoreRef.current();
        } else if (!isIntersectingRef.current) {
          eagerLoadCountRef.current = 0;
        }
      });
      // 内側 rAF のキャンセルは外側 cancel フラグで対応
      void id2;
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visible.length drives re-check; refs are stable
  }, [visible.length]);

  return { visible, hasMore, sentinelRef, notifyArticlesAdded } as const;
}
