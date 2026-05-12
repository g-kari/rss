"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type RefObject,
} from "react";
import { useMasonry, usePositioner } from "masonic";
import { OffViewportObserverCtx, useOffViewportPositioner } from "@/hooks/useOffViewportPositioner";

// 各セル wrapper に当てる CSS transition — 参照安定化のため module scope に定義
const ITEM_TRANSITION_STYLE: CSSProperties = {
  transition: "top 0.3s ease, left 0.3s ease",
};

interface GalleryMasonryProps<T> {
  items: T[];
  scrollElement: HTMLElement | null;
  render: ComponentType<{ data: T; index: number; width: number }>;
  itemKey?: (data: T, index: number) => string | number;
  columnWidth?: number;
  columnGutter?: number;
  overscanBy?: number;
  columns?: number | null;
}

function useParentScroller(el: HTMLElement | null, fps = 12) {
  const [scrollTop, setScrollTop] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    if (!el) return;
    setScrollTop(el.scrollTop);

    let rafId: number | null = null;
    let stopTimer: number | null = null;
    const stopDelay = Math.max(40, Math.round(1000 / fps));

    const handler = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);
        setIsScrolling(true);
        rafId = null;
        if (stopTimer !== null) window.clearTimeout(stopTimer);
        stopTimer = window.setTimeout(() => setIsScrolling(false), stopDelay);
      });
    };

    el.addEventListener("scroll", handler, { passive: true });
    return () => {
      el.removeEventListener("scroll", handler);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stopTimer !== null) window.clearTimeout(stopTimer);
    };
  }, [el, fps]);

  return { scrollTop, isScrolling };
}

function useContainerMetrics(
  containerRef: RefObject<HTMLElement | null>,
  scrollElement: HTMLElement | null,
) {
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [offsetTop, setOffsetTop] = useState(0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || !scrollElement) return;

    const measure = () => {
      setWidth(container.clientWidth);
      setHeight(scrollElement.clientHeight);
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

  return { width, height, offsetTop };
}

export default function GalleryMasonry<T>({
  items,
  scrollElement,
  render,
  itemKey,
  columnWidth = 220,
  columnGutter = 12,
  overscanBy = 6,
  columns = null,
}: GalleryMasonryProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height, offsetTop } = useContainerMetrics(containerRef, scrollElement);
  const { scrollTop, isScrolling } = useParentScroller(scrollElement);

  const effectiveColumnWidth =
    columns && width > 0
      ? Math.floor((width - (columns - 1) * columnGutter) / columns)
      : columnWidth;

  const itemsIdentity = useMemo(() => {
    if (!itemKey) return items.length;
    return items.map((item, i) => itemKey(item, i)).join("\t");
  }, [items, itemKey]);

  const positioner = usePositioner({ width, columnWidth: effectiveColumnWidth, columnGutter }, [
    itemsIdentity,
  ]);

  // #714 Phase 2: masonic 標準の useResizeObserver(positioner) は viewport 内 / 外を区別
  // せず全 item を即 update してちらつかせるため、自前 hook で viewport 外のみ update +
  // viewport 内は pending 退避する設計に差し替え。
  const offViewport = useOffViewportPositioner(
    positioner,
    Math.max(0, scrollTop - offsetTop),
    height,
  );

  // scroll で位置関係が変わるたびに pending を flush (off-viewport 化した entry を反映)
  useEffect(() => {
    offViewport.flush();
  }, [scrollTop, offViewport]);

  const content = useMasonry({
    positioner,
    // resizeObserver は意図的に渡さない (offViewport 経由で自前管理)
    items,
    height,
    scrollTop: Math.max(0, scrollTop - offsetTop),
    isScrolling,
    overscanBy,
    render,
    itemKey,
    // positioner 再生成で top/left が動いた際に CSS transition でスルスル遷移させる（値が同じなら発動しない）
    itemStyle: ITEM_TRANSITION_STYLE,
  });

  return (
    <OffViewportObserverCtx value={offViewport}>
      <div ref={containerRef} className="relative">
        {width > 0 ? content : null}
      </div>
    </OffViewportObserverCtx>
  );
}
