"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  computeMasonryLayout,
  computeScrollAnchorDelta,
  type MasonryLayoutItem,
  type MasonryLayoutResult,
} from "../lib/gallery-masonry-layout";

interface UseMasonryLayoutParams<T> {
  items: ReadonlyArray<T>;
  itemKey?: (data: T, index: number) => string | number;
  columnCount: number;
  /** 1 列 item の width (px) */
  columnWidth: number;
  /** 列内 item 間の隙間 (px) */
  gap: number;
  scrollElement: HTMLElement | null;
  /** scrollElement 内での container の offsetTop (px) */
  containerOffsetTop: number;
}

interface UseMasonryLayoutReturn {
  positions: Map<string, { col: number; top: number }>;
  totalHeight: number;
  /** 各 item の DOM 要素を観察対象に登録する callback ref ファクトリ */
  itemRef: (id: string) => (el: HTMLDivElement | null) => void;
}

/**
 * 初回 height の default。実 measurement 前の暫定値。
 * 列高さ偏りを避けるため適度な値を選ぶ (画像主体ギャラリーの平均的な card height)。
 */
const DEFAULT_ITEM_HEIGHT = 220;

/**
 * #773 Phase 2b: 自前 masonry virtualizer の中核 hook。
 *
 * 各 item の DOM 要素を ResizeObserver で監視し、高さ変化があれば
 * `computeMasonryLayout` で positions を再計算 + `computeScrollAnchorDelta` で
 * scroll position を補正 (viewport 上 item の高さ変化分を scrollTop に加算)。
 *
 * masonic との違い:
 * - masonic は viewport 外 item を render しない (内部最適化) ため、画像 load 完了時の
 *   aspectRatio 変化を捕捉できず scroll が巻き戻る (#773 真因)
 * - 自前実装は全 item を absolute 配置で render + ResizeObserver で全 height 変化を捕捉
 *   → viewport 上 item の高さ変化を delta 算出して scrollTop に加算 → 巻き戻りゼロ
 *
 * ResizeObserver loop limit 警告防止のため、setState は requestAnimationFrame で deferred 化。
 */
export function useMasonryLayout<T>({
  items,
  itemKey,
  columnCount,
  columnWidth,
  gap,
  scrollElement,
  containerOffsetTop,
}: UseMasonryLayoutParams<T>): UseMasonryLayoutReturn {
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [layoutVersion, setLayoutVersion] = useState(0);
  const prevPositionsRef = useRef<Map<string, { col: number; top: number }>>(new Map());
  const pendingFrameRef = useRef<number | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  // items の id 配列 (itemKey が無ければ index ベース)
  const itemIds = useMemo(() => {
    const ids: string[] = [];
    for (let i = 0; i < items.length; i++) {
      ids.push(String(itemKey?.(items[i]!, i) ?? i));
    }
    return ids;
  }, [items, itemKey]);

  // ResizeObserver の lazy initialization (SSR 互換)
  if (typeof window !== "undefined" && observerRef.current === null) {
    observerRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const id = el.dataset.itemId;
        if (!id) continue;
        const h = entry.contentRect.height;
        const prev = heightsRef.current.get(id);
        if (prev !== h && h > 0) {
          heightsRef.current.set(id, h);
          changed = true;
        }
      }
      if (changed && pendingFrameRef.current === null) {
        pendingFrameRef.current = requestAnimationFrame(() => {
          pendingFrameRef.current = null;
          setLayoutVersion((v) => v + 1);
        });
      }
    });
  }

  // cleanup on unmount
  useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current);
        pendingFrameRef.current = null;
      }
      elementsRef.current.clear();
      heightsRef.current.clear();
    },
    [],
  );

  // 各 item の DOM 要素を観察対象として登録する callback ref factory
  const itemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      const observer = observerRef.current;
      const prev = elementsRef.current.get(id);
      if (prev && prev !== el) {
        observer?.unobserve(prev);
      }
      if (el) {
        el.dataset.itemId = id;
        elementsRef.current.set(id, el);
        observer?.observe(el);
        // 初回 height 取得 (ResizeObserver の初回 callback を待たずに layout 反映)
        const h = el.getBoundingClientRect().height;
        if (h > 0 && heightsRef.current.get(id) !== h) {
          heightsRef.current.set(id, h);
          if (pendingFrameRef.current === null) {
            pendingFrameRef.current = requestAnimationFrame(() => {
              pendingFrameRef.current = null;
              setLayoutVersion((v) => v + 1);
            });
          }
        }
      } else {
        elementsRef.current.delete(id);
        heightsRef.current.delete(id);
      }
    },
    [],
  );

  // layout 計算 (layoutVersion 変化で再実行)
  const result: MasonryLayoutResult = useMemo(() => {
    const layoutItems: MasonryLayoutItem[] = itemIds.map((id) => ({
      id,
      width: columnWidth,
      height: heightsRef.current.get(id) ?? DEFAULT_ITEM_HEIGHT,
    }));
    return computeMasonryLayout(layoutItems, columnCount, gap);
    // heightsRef.current は ref で mutate されるため layoutVersion を依存に入れて変化検知
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutVersion で height 変化を検知
  }, [itemIds, columnCount, columnWidth, gap, layoutVersion]);

  const totalHeight = useMemo(
    () => (result.columnHeights.length > 0 ? Math.max(...result.columnHeights) : 0),
    [result.columnHeights],
  );

  // scroll anchor 補正: positions 変化のたびに viewport 上 item の高さ変化分を scrollTop に加算
  useLayoutEffect(() => {
    if (!scrollElement) {
      prevPositionsRef.current = new Map(result.positions);
      return;
    }
    const viewportTop = scrollElement.scrollTop - containerOffsetTop;
    const delta = computeScrollAnchorDelta(prevPositionsRef.current, result.positions, viewportTop);
    if (delta !== 0) {
      scrollElement.scrollTop += delta;
    }
    prevPositionsRef.current = new Map(result.positions);
  }, [result.positions, scrollElement, containerOffsetTop]);

  return { positions: result.positions, totalHeight, itemRef };
}
