"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { useMasonry, usePositioner, useResizeObserver } from "masonic";

interface GalleryMasonryProps<T> {
  items: T[];
  scrollElement: HTMLElement | null;
  render: ComponentType<{ data: T; index: number; width: number }>;
  itemKey?: (data: T, index: number) => string | number;
  columnWidth?: number;
  columnGutter?: number;
  overscanBy?: number;
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
}: GalleryMasonryProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height, offsetTop } = useContainerMetrics(containerRef, scrollElement);
  const { scrollTop, isScrolling } = useParentScroller(scrollElement);

  // items.length を deps にすることで、append-only の追加で全再配置を避ける
  const positioner = usePositioner({ width, columnWidth, columnGutter }, [items.length]);
  const resizeObserver = useResizeObserver(positioner);

  const content = useMasonry({
    positioner,
    resizeObserver,
    items,
    height,
    scrollTop: Math.max(0, scrollTop - offsetTop),
    isScrolling,
    overscanBy,
    render,
    itemKey,
  });

  return (
    <div ref={containerRef} className="relative">
      {width > 0 ? content : null}
    </div>
  );
}
