"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { useMasonryLayout } from "../hooks/useMasonryLayout";

interface GalleryMasonrySelfProps<T> {
  items: T[];
  scrollElement: HTMLElement | null;
  render: ComponentType<{ data: T; index: number; width: number }>;
  itemKey?: (data: T, index: number) => string | number;
  columnWidth?: number;
  columnGutter?: number;
  /** masonic 互換のため受け取るが自前実装では未使用 (全 item を absolute render するため) */
  overscanBy?: number;
  columns?: number | null;
}

function useContainerMetrics(
  containerRef: RefObject<HTMLElement | null>,
  scrollElement: HTMLElement | null,
) {
  const [width, setWidth] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !scrollElement) return;

    const measure = () => {
      setWidth(container.clientWidth);
      const containerRect = container.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      setOffsetTop(containerRect.top - scrollRect.top + scrollElement.scrollTop);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    ro.observe(scrollElement);
    return () => ro.disconnect();
  }, [containerRef, scrollElement]);

  return { width, offsetTop };
}

/**
 * #773 Phase 2b: masonic 廃止のための自前 masonry virtualizer。
 *
 * テストモード設定 (`gallerySelfMasonryEnabled`) が ON の時のみ `<GalleryMasonry>` から呼ばれる。
 * 全 item を absolute 配置で render + ResizeObserver で全 height 変化を捕捉し、
 * 画像 load 完了時の aspectRatio 変化を viewport 上で検知して scrollTop 補正する。
 *
 * masonic との差分:
 * - masonic は viewport 外を skip し overscanBy 範囲のみ render → 真因捕捉できず
 * - 自前は全件 absolute render → 計算コスト増だが scroll 巻き戻り完全解消
 *
 * Phase 2c で動作確認 + 必要に応じて virtualization 追加検討。
 */
export default function GalleryMasonrySelf<T>({
  items,
  scrollElement,
  render: Render,
  itemKey,
  columnWidth = 220,
  columnGutter = 12,
  columns = null,
}: GalleryMasonrySelfProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, offsetTop } = useContainerMetrics(containerRef, scrollElement);

  const effectiveColumnWidth =
    columns && width > 0
      ? Math.floor((width - (columns - 1) * columnGutter) / columns)
      : columnWidth;

  const columnCount = useMemo(() => {
    if (width <= 0) return 1;
    return Math.max(1, Math.floor((width + columnGutter) / (effectiveColumnWidth + columnGutter)));
  }, [width, effectiveColumnWidth, columnGutter]);

  const { positions, totalHeight, itemRef } = useMasonryLayout({
    items,
    itemKey,
    columnCount,
    columnWidth: effectiveColumnWidth,
    gap: columnGutter,
    scrollElement,
    containerOffsetTop: offsetTop,
  });

  return (
    <div
      ref={containerRef}
      className="relative [overflow-anchor:none]"
      style={{ height: width > 0 ? `${totalHeight}px` : undefined }}
    >
      {width > 0 &&
        items.map((data, index) => {
          const id = String(itemKey?.(data, index) ?? index);
          const pos = positions.get(id);
          const top = pos?.top ?? 0;
          const col = pos?.col ?? 0;
          return (
            <div
              key={id}
              ref={itemRef(id)}
              className="absolute"
              style={{
                top: `${top}px`,
                left: `${col * (effectiveColumnWidth + columnGutter)}px`,
                width: `${effectiveColumnWidth}px`,
                transition: "top 0.3s ease, left 0.3s ease",
              }}
            >
              <Render data={data} index={index} width={effectiveColumnWidth} />
            </div>
          );
        })}
    </div>
  );
}
