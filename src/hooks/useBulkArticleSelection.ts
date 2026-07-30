import { useCallback, useState } from "react";
import { addRangeToSelection } from "../lib/bulk-selection";

/**
 * 記事一括選択の state 管理 hook (#883 Phase A)。
 *
 * - selectedIds: 一括操作対象の記事 ID 集合 (size > 0 で bulk mode active)
 * - addRange: Shift+click で計算済 range を追加 (純粋関数 `addRangeToSelection` 経由)
 * - clear: 通常 click や ESC / 一括操作完了時に bulk state をリセット
 *
 * 範囲計算自体は `src/lib/bulk-selection.ts` の純粋関数に委譲し、本 hook は
 * Set state の merge / reset のみを担う。anchor 管理は ArticleList 側 (filtered
 * 配列にアクセス可能な layer) で `useRef` を使う設計。
 */
export interface BulkArticleSelectionState {
  selectedIds: ReadonlySet<string>;
  addRange: (rangeIds: readonly string[]) => void;
  clear: () => void;
}

export function useBulkArticleSelection(): BulkArticleSelectionState {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const addRange = useCallback((rangeIds: readonly string[]) => {
    if (rangeIds.length === 0) return;
    setSelectedIds((prev) => addRangeToSelection(prev, rangeIds));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  return { selectedIds, addRange, clear };
}
