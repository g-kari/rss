import { useEffect, useState, useCallback, type Dispatch, type SetStateAction } from "react";
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

  // #772: 過去の `notifyArticlesAdded` は `serverLoadCount` state を bump して
  // `setPage(prev => Math.ceil(filtered.length / pageSize))` の自動進行 effect を駆動していたが、
  // フィルター解除/小 pageSize 設定でサーバー読込後に全件一括表示を引き起こすため effect を削除済。
  // サーバー読込後の secondary viewport check は filtered 再 render 経由で
  // visible.length / hasMore の変化を検知して自然に発火するため、本 callback は no-op で API のみ維持。
  // useFeedPagination の呼び出し側互換 + 将来の re-introduction 余地を残すため残置。
  const notifyArticlesAdded = useCallback(() => {
    // intentionally no-op (see comment above)
  }, []);

  const visible = filtered.slice(0, page * pageSize);
  const hasMore = visible.length < filtered.length;

  // #772 Symptom 2 真因: 旧実装は `useRef<HTMLDivElement>(null)` + `useEffect([])` で
  // IO / scroll listener を attach していたが、AppShell の初回 render (authentication loading 中)
  // で `useArticlePagination` が呼ばれた時点で ArticleList はまだ JSX を返しておらず
  // sentinel DOM が存在しない → `useEffect([])` は `sentinelRef.current === null` で
  // 早期 return → IO / scroll listener が attach 不能のまま終わる罠。
  // 後の visible.length 変化で secondary effect は再発火するが、IO / scroll listener は再 attach されない。
  // callback ref + useState パターンに変更して、DOM 取得タイミングで state 更新 → effect 再評価 →
  // IO / scroll listener を確実に attach できる構造に直す。
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    setSentinelEl(el);
  }, []);
  const loadMoreRef = useSyncedRef(loadMore);
  const hasMoreRef = useSyncedRef(hasMore);

  // sentinel-based IntersectionObserver でスクロール時に loadMore を発火させる。
  // intersect 状態変化 (false → true) のたびに 1 回だけ loadMore を呼ぶ設計。
  // ユーザー仕様: 「スクロールで pageSize ずつ追加」(#771 関連) のため、
  // eager-load の連続発火 (= 自動的に全件 visible まで先読み) は撤廃済。
  useEffect(() => {
    if (!sentinelEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) {
          loadMoreRef.current();
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinelEl);
    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef・hasMoreRef は useSyncedRef の安定参照
  }, [sentinelEl]);

  // #772: pageSize 小 (例: 10) + フィルター済 + 単一フィードで visible.length が少なく、
  // loadMore 後も sentinel が依然 viewport 内 (intersect=true のまま) のケースで、
  // IntersectionObserver の仕様 (false → true 遷移でのみ callback 発火) により次の
  // loadMore が永久に発火しない問題を修正。
  // visible.length 変化後 1 tick 待ち + sentinel が viewport 内 (rootMargin 600px 含む) なら
  // もう 1 回 loadMore を発火させて連鎖的にロード継続を担保する。
  // hasMore が false になった瞬間に停止するため無限ループは発生しない。
  //
  // #772 Symptom 2: filter ON→OFF→ON cycle で visible.length が同値 (10→10) を維持し
  // 本 effect の deps が変化しないケースを救うため、`filtered.length` も deps に含める。
  // filter 切替で filtered.length が変動するため effect が再評価され、cascade を再開できる。
  useEffect(() => {
    if (!hasMore) return;
    if (!sentinelEl) return;
    const id = setTimeout(() => {
      if (!hasMoreRef.current) return;
      const rect = sentinelEl.getBoundingClientRect();
      const rootMargin = 600;
      const inViewport = rect.top < window.innerHeight + rootMargin && rect.bottom > -rootMargin;
      if (inViewport) {
        loadMoreRef.current();
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef / hasMoreRef は安定参照
  }, [visible.length, hasMore, filtered.length, sentinelEl]);

  // #772 Symptom 2: scroll event listener を sentinel の最寄り scrollable ancestor に
  // attach して、ユーザースクロール時に viewport check を fallback 発火させる。
  // IntersectionObserver は `intersecting: true → true` の維持時に新規 callback を
  // 発火しないため、cascade 後の visible.length 停滞状態では scroll しても loadMore が
  // 発火しない罠を回避する。rAF throttle で 1 frame に最大 1 回まで loadMore を起動。
  useEffect(() => {
    if (!sentinelEl) return;

    // sentinel の最寄り scrollable ancestor を探索 (`overflow-y: auto` or `scroll`)
    let scrollParent: HTMLElement | null = sentinelEl.parentElement;
    while (scrollParent && scrollParent !== document.body) {
      const overflowY = window.getComputedStyle(scrollParent).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") break;
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent || scrollParent === document.body) return;

    let scheduled = false;
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (!hasMoreRef.current) return;
        const rect = sentinelEl.getBoundingClientRect();
        const rootMargin = 600;
        if (rect.top < window.innerHeight + rootMargin && rect.bottom > -rootMargin) {
          loadMoreRef.current();
        }
      });
    };

    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scrollParent.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef / hasMoreRef は安定参照
  }, [sentinelEl]);

  return { visible, hasMore, sentinelRef, notifyArticlesAdded, loadMore } as const;
}
