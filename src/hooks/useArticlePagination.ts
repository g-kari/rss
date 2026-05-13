import { useEffect, useState, useCallback, type Dispatch, type SetStateAction } from "react";
import type { Article } from "../types";
import { useSyncedRef } from "./useSyncedRef";

/** デフォルトの 1 ページ件数 (`useFilteredArticles` 経由で UserSettings の値を渡すと上書き) */
const DEFAULT_PAGE_SIZE = 50;

/** sentinel の最寄り scrollable ancestor (`overflow-y: auto/scroll`) を遡って探す */
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let parent: HTMLElement | null = el?.parentElement ?? null;
  while (parent && parent !== document.body) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
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
  // IO を attach していたが、AppShell の初回 render (authentication loading 中)
  // で `useArticlePagination` が呼ばれた時点で ArticleList はまだ JSX を返しておらず
  // sentinel DOM が存在しない → `useEffect([])` は `sentinelRef.current === null` で
  // 早期 return → IO が attach 不能のまま終わる罠。
  // 後の visible.length 変化で secondary effect は再発火するが、IO は再 attach されない。
  // callback ref + useState パターンに変更して、DOM 取得タイミングで state 更新 → effect 再評価 →
  // IO を確実に attach できる構造に直す。
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useCallback((el: HTMLDivElement | null) => {
    setSentinelEl(el);
  }, []);
  const loadMoreRef = useSyncedRef(loadMore);
  const hasMoreRef = useSyncedRef(hasMore);

  // sentinel-based IntersectionObserver でスクロール時に loadMore を発火させる。
  //
  // #772 cascade overshoot 対策: 旧実装は `root: null` (window viewport) + `rootMargin: "600px"`
  // を使っていた。sentinel は scrollContainer 末尾に配置されており、scrollContainer の
  // clientHeight + sentinel.h-32 (128px) がほぼ scrollContainer 全体を覆うため、scroll 位置に
  // 関わらず sentinel が常時 window viewport 内に留まる → IO が連続 intersecting=true で
  // transition 不能 → cascade が secondary effect で永久連鎖 → 全件 burst になる。
  //
  // root を **scrollable ancestor** に変更すると、IO は sentinel が scrollContainer の
  // viewport (clientHeight 領域) を出入りする transition を検出する。
  // sentinel が scrollContainer の viewport 内に入る瞬間 (= 「下端付近までスクロール」) のみ
  // loadMore 1 回発火 → 過剰 cascade を構造的に防止する。
  //
  // rootMargin=0px で「実際に viewport に触れた瞬間」のみ発火 (preload なし)。
  // ユーザー仕様: 「スクロールで pageSize ずつ追加」(#771) と一致する控えめ挙動。
  useEffect(() => {
    if (!sentinelEl) return;
    const scrollRoot = findScrollableAncestor(sentinelEl);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current) {
          loadMoreRef.current();
        }
      },
      // scrollable ancestor が見つからなければ window viewport にフォールバック
      { root: scrollRoot, rootMargin: "0px" },
    );
    observer.observe(sentinelEl);
    return () => {
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef・hasMoreRef は useSyncedRef の安定参照
  }, [sentinelEl]);

  // #772: 初回ロード + filter cycle 時に「scrollContainer のコンテンツが viewport を埋めていない」
  // (= `scrollHeight <= clientHeight`) ケースで auto-cascade して viewport を埋める effect。
  //
  // 旧実装は `rect.top < window.innerHeight + 600` で常に true 判定 (sentinel が window viewport
  // 内に留まるため) → 過剰 cascade で全件 burst していた。
  //
  // 修正: `scrollContainer.scrollHeight <= scrollContainer.clientHeight` の `isContentShort`
  // 条件に限定して、コンテンツが viewport を埋めるまで cascade。scrollable になった時点で停止し、
  // 以降は IO (sentinel viewport 出入り transition) のみが loadMore を発火する設計。
  //
  // filter cycle で visible.length が同値 (10→10) でも `filtered.length` 変動で再評価され、
  // filter 切替後の cascade を担保する。
  useEffect(() => {
    if (!hasMore) return;
    if (!sentinelEl) return;
    const scrollRoot = findScrollableAncestor(sentinelEl);
    if (!scrollRoot) return;
    const id = setTimeout(() => {
      if (!hasMoreRef.current) return;
      const isContentShort = scrollRoot.scrollHeight <= scrollRoot.clientHeight;
      if (isContentShort) {
        loadMoreRef.current();
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMoreRef / hasMoreRef は安定参照
  }, [visible.length, hasMore, filtered.length, sentinelEl]);

  return { visible, hasMore, sentinelRef, notifyArticlesAdded, loadMore } as const;
}
