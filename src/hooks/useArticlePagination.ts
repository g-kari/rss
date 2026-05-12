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

/** デフォルトの 1 ページ件数 (`useFilteredArticles` 経由で UserSettings の値を渡すと上書き) */
const DEFAULT_PAGE_SIZE = 50;

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

  // sentinel-based IntersectionObserver でスクロール時に loadMore を発火させる。
  // intersect 状態変化 (false → true) のたびに 1 回だけ loadMore を呼ぶ設計。
  // ユーザー仕様: 「スクロールで pageSize ずつ追加」(#771 関連) のため、
  // eager-load の連続発火 (= 自動的に全件 visible まで先読み) は撤廃済。
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) {
          loadMoreRef.current();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef・hasMoreRef は useSyncedRef の安定参照、マウント時に一度だけ設定
  }, []);

  // #772: pageSize 小 (例: 10) + フィルター済 + 単一フィードで visible.length が少なく、
  // loadMore 後も sentinel が依然 viewport 内 (intersect=true のまま) のケースで、
  // IntersectionObserver の仕様 (false → true 遷移でのみ callback 発火) により次の
  // loadMore が永久に発火しない問題を修正。
  // visible.length 変化後 1 tick 待ち + sentinel が viewport 内 (rootMargin 600px 含む) なら
  // もう 1 回 loadMore を発火させて連鎖的にロード継続を担保する。
  // hasMore が false になった瞬間に停止するため無限ループは発生しない。
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const id = setTimeout(() => {
      if (!hasMoreRef.current) return;
      const rect = el.getBoundingClientRect();
      const rootMargin = 600;
      const inViewport = rect.top < window.innerHeight + rootMargin && rect.bottom > -rootMargin;
      if (inViewport) {
        loadMoreRef.current();
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef / hasMoreRef は安定参照
  }, [visible.length, hasMore]);

  return { visible, hasMore, sentinelRef, notifyArticlesAdded, loadMore } as const;
}
