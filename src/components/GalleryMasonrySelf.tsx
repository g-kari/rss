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

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !scrollElement) return;

    const measure = () => {
      setWidth(container.clientWidth);
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    // scrollElement の resize でも container 幅が変わりうるため再 measure する
    ro.observe(scrollElement);
    return () => ro.disconnect();
  }, [containerRef, scrollElement]);

  return { width };
}

/**
 * #773 Phase 2b → Phase 3 (#822) で default ON 化された自前 masonry virtualizer。
 *
 * `<GalleryMasonry>` (thin wrapper) 経由で全 caller が使用。
 * 全 item を absolute 配置で render + ResizeObserver で全 height 変化を捕捉し、
 * 画像 load 完了時の aspectRatio 変化を viewport 上で検知して scrollTop 補正する。
 *
 * masonic との差分 (Phase 3 で masonic 完全削除済):
 * - masonic は viewport 外を skip し overscanBy 範囲のみ render → 真因捕捉できず
 * - 自前は全件 absolute render → 計算コスト増だが scroll 巻き戻り完全解消
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
  const { width } = useContainerMetrics(containerRef, scrollElement);

  // columns 明示時 / auto (null) どちらでも「決定した columnCount で width を full 分配」して
  // 右端余白を発生させない。masonic は内部で同様の分配をしていたが、自前実装でも揃える。
  //
  // #773 Phase 2c-fix2: 旧実装は `Math.floor` で小数点を切り捨てていたため、列数 auto 時に
  // (width - (targetCount-1) * gutter) が targetCount で割り切れないと **右端 1〜N px の余白**
  // が発生していた (例: width=601 / gutter=12 / columnWidth=220 → targetCount=2 / floor(589/2)=294
  // → 配置末尾は 2*(294+12)-12=600 で 1px 余白)。float 計算でブラウザの sub-pixel rendering に任せて
  // 余白を解消する。targetCount 算出は floor のまま (列数は整数で確定)。
  const { effectiveColumnWidth, columnCount } = useMemo(() => {
    if (width <= 0) return { effectiveColumnWidth: columnWidth, columnCount: 1 };
    const targetCount =
      columns ?? Math.max(1, Math.floor((width + columnGutter) / (columnWidth + columnGutter)));
    const calcWidth = (width - (targetCount - 1) * columnGutter) / targetCount;
    return { effectiveColumnWidth: calcWidth, columnCount: targetCount };
  }, [width, columns, columnGutter, columnWidth]);

  const { positions, totalHeight, itemRef } = useMasonryLayout({
    items,
    itemKey,
    columnCount,
    columnWidth: effectiveColumnWidth,
    gap: columnGutter,
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
