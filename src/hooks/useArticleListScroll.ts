"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { Article, Layout } from "../types";
import type { FlatItem } from "../components/article-list-body/types";
import { useSyncedRef } from "./useSyncedRef";

type ListVirtualizer = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

interface Options {
  selectedArticleId: string | null;
  layout: Layout;
  anchorTrigger?: number;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  flatItems: FlatItem[];
  displayItems: Article[];
  listVirtualizer: ListVirtualizer;
  cardVirtualizer: ListVirtualizer;
  magazineVirtualizer: ListVirtualizer;
}

/** Keep visible selections still; reveal offscreen selections only in the list pane. */
export function useArticleListScroll(options: Options): void {
  const { selectedArticleId, layout, anchorTrigger } = options;
  const latest = useSyncedRef(options);
  // The initial counter value is a baseline, not an explicit anchor request.
  const previous = useRef({ id: null as string | null, layout, anchor: anchorTrigger });

  useEffect(() => {
    const isManualAnchor = anchorTrigger !== previous.current.anchor;
    const sameSelection =
      selectedArticleId === previous.current.id && layout === previous.current.layout;
    previous.current = { id: selectedArticleId, layout, anchor: anchorTrigger };
    if (!selectedArticleId || (sameSelection && !isManualAnchor)) return;

    const {
      scrollContainerRef,
      flatItems,
      displayItems,
      listVirtualizer,
      cardVirtualizer,
      magazineVirtualizer,
    } = latest.current;
    const container = scrollContainerRef.current;
    if (!container || container.clientHeight === 0) return;
    const element = document.getElementById(`article-${selectedArticleId}`);

    if (element && container.contains(element)) {
      const rect = element.getBoundingClientRect();
      const viewportTop = container.getBoundingClientRect().top + container.clientTop;
      const viewportBottom = viewportTop + container.clientHeight;
      if (rect.height > 0) {
        const isVisible = rect.bottom > viewportTop && rect.top < viewportBottom;
        if (isVisible && !isManualAnchor) return;
        const delta = isManualAnchor
          ? (rect.top + rect.bottom - viewportTop - viewportBottom) / 2
          : rect.top < viewportTop
            ? rect.top - viewportTop
            : rect.bottom - viewportBottom;
        // scrollIntoView can scroll ancestor panes too. Instant list-only scrolling
        // also avoids queued smooth animations fighting rapid next/previous input.
        container.scrollTo({ top: Math.max(0, container.scrollTop + delta), behavior: "instant" });
        return;
      }
    }

    const align = isManualAnchor ? "center" : "auto";
    if (layout === "compact" || layout === "list") {
      const index = flatItems.findIndex(
        (item) => item.type === "article" && item.key === selectedArticleId,
      );
      if (index >= 0) listVirtualizer.scrollToIndex(index, { align, behavior: "instant" });
    } else if (layout === "card") {
      // Use the same delayed-removal array as CardBody, never filtered/visible indices.
      const index = displayItems.findIndex((article) => article.id === selectedArticleId);
      if (index >= 0)
        cardVirtualizer.scrollToIndex(Math.floor(index / 2), { align, behavior: "instant" });
    } else if (layout === "magazine") {
      const index = displayItems.findIndex((article) => article.id === selectedArticleId);
      if (index > 0) magazineVirtualizer.scrollToIndex(index - 1, { align, behavior: "instant" });
    }
    // Array/measurement changes must not pull the list back after the user scrolls.
    // latest is a stable useSyncedRef; only selection/layout/explicit anchor drives this effect.
  }, [selectedArticleId, layout, anchorTrigger]);
}
