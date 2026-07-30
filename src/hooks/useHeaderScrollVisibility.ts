"use client";

import { type RefObject, type UIEvent, useCallback, useRef, useState } from "react";
import { computeHeaderVisibility, computeScrollDirection } from "../lib/scroll-direction";

interface HeaderScrollVisibilityResult {
  /** 表示可否 (true で表示・false で隠す) */
  headerVisible: boolean;
  /** スクロールイベントから direction 判定して headerVisible を更新するハンドラ */
  handleScrollForHeader: (e: UIEvent<HTMLElement>) => void;
}

/**
 * ArticleHeader を「下スクロールで隠す・上スクロールで表示・上端付近は常に表示」
 * の連動 UI に変えるための hook (#677 案 C)。
 *
 * - 微小揺れ (4px 未満) は無視して状態を維持
 * - viewport 上端 80px 内は方向問わず表示 (記事の最初は読みやすく)
 * - 純粋関数 `computeScrollDirection` / `computeHeaderVisibility` に判定を委譲
 *
 * `scrollEl` は参照のみ (将来 element resize に対応する場合の拡張用、現状未使用)。
 */
export function useHeaderScrollVisibility(
  _scrollEl?: RefObject<HTMLElement | null>,
): HeaderScrollVisibilityResult {
  const [headerVisible, setHeaderVisible] = useState(true);
  const prevTopRef = useRef(0);

  const handleScrollForHeader = useCallback((e: UIEvent<HTMLElement>) => {
    const currentTop = e.currentTarget.scrollTop;
    const direction = computeScrollDirection(prevTopRef.current, currentTop);
    prevTopRef.current = currentTop;
    setHeaderVisible((prev) =>
      computeHeaderVisibility({ prevVisible: prev, direction, scrollTop: currentTop }),
    );
  }, []);

  return { headerVisible, handleScrollForHeader };
}
