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

const PAGE_SIZE = 50;
/** Maximum consecutive eager loads to prevent runaway loops */
const MAX_EAGER_LOADS = 20;

export function useArticlePagination(
  filtered: Article[],
  page: number,
  setPage: Dispatch<SetStateAction<number>>,
) {
  const loadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, [setPage]);

  const [serverLoadCount, setServerLoadCount] = useState(0);
  const notifyArticlesAdded = useCallback(() => {
    setServerLoadCount((c) => c + 1);
  }, []);

  const filteredRef = useSyncedRef(filtered);
  useEffect(() => {
    if (serverLoadCount === 0) return;
    setPage((prev) => Math.max(prev, Math.ceil(filteredRef.current.length / PAGE_SIZE) || 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filteredRef は useSyncedRef の安定参照のため deps 不要
  }, [serverLoadCount, setPage]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
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
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef・hasMoreRef は useSyncedRef の安定参照、マウント時に一度だけ設定
  }, []);

  // After visible items change, if sentinel is still intersecting and there's more to load,
  // eagerly load the next page (e.g. viewport not yet filled)
  useEffect(() => {
    if (!isIntersectingRef.current || !hasMoreRef.current) {
      eagerLoadCountRef.current = 0;
      return;
    }
    if (eagerLoadCountRef.current >= MAX_EAGER_LOADS) return;
    const id = requestAnimationFrame(() => {
      if (isIntersectingRef.current && hasMoreRef.current) {
        eagerLoadCountRef.current += 1;
        loadMoreRef.current();
      }
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visible.length drives re-check; refs are stable
  }, [visible.length]);

  return { visible, hasMore, sentinelRef, notifyArticlesAdded } as const;
}
