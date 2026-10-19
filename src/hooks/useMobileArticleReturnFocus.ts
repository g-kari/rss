"use client";

import { useEffect, useRef } from "react";
import type { Article } from "../types";
import type { MobilePane } from "./useMobilePane";
import { useEventListener } from "./useEventListener";

interface Options {
  mobilePane: MobilePane;
  isDesktop: boolean;
  selectedArticleId: string | null;
  /** Current logical page, not the delayed rows retained for exit animation. */
  visibleArticles: readonly Article[];
  /** Existing overlays and popups retain ownership of their own focus restoration. */
  blocked: boolean;
}

function isAvailable(element: HTMLElement, rejectPointerEventsNone = false): boolean {
  if (
    !element.isConnected ||
    element.matches(":disabled") ||
    element.closest(
      '[hidden], [inert], [aria-hidden="true"], [aria-disabled="true"], .animate-fade-out',
    )
  )
    return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0" ||
      (rejectPointerEventsNone && style.pointerEvents === "none")
    )
      return false;
  }
  return true;
}

function isInListViewport(row: HTMLElement, list: HTMLElement): boolean {
  const bounds = row.getBoundingClientRect();
  const pane = list.getBoundingClientRect();
  const scroller = (row.closest<HTMLElement>('[role="feed"]') ?? list).getBoundingClientRect();
  const left = Math.max(pane.left, scroller.left);
  const right = Math.min(pane.right, scroller.right);
  const top = Math.max(pane.top, scroller.top);
  const bottom = Math.min(pane.bottom, scroller.bottom);
  // Overscan can keep a row mounted outside the clipped list. Never scroll it
  // into view for focus. Pane-relative intersection also works during its slide.
  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    right > left &&
    bottom > top &&
    bounds.right > left &&
    bounds.left < right &&
    bounds.bottom > top &&
    bounds.top < bottom
  );
}

/** Restore ordinary mobile reader returns only; never navigate or scroll the list. */
export function useMobileArticleReturnFocus({
  mobilePane,
  isDesktop,
  selectedArticleId,
  visibleArticles,
  blocked,
}: Options): void {
  const ordinary = !isDesktop && !blocked;
  const previous = useRef({ mobilePane, ordinary });
  const opener = useRef<HTMLElement | null>(null);

  // Capture before the list becomes inert. Touch/click need not focus a gallery
  // card, and one article can have several cards with the same article ID.
  const rememberOpener = (event: Event) => {
    if (!ordinary || mobilePane !== "list") return;
    const row =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[role="article"]')
        : null;
    opener.current = row?.closest('main#main-content[data-pane="list"]') ? row : null;
  };
  useEventListener("focusin", rememberOpener, undefined, true);
  useEventListener("pointerdown", rememberOpener, undefined, true);

  useEffect(() => {
    const from = previous.current;
    // Consume the edge even when a popup/desktop transition makes it ineligible.
    // A later filter or modal update must not replay an old return.
    previous.current = { mobilePane, ordinary };
    if (from.mobilePane !== "view" || mobilePane !== "list" || !from.ordinary || !ordinary) return;

    const list = document.querySelector<HTMLElement>('main#main-content[data-pane="list"]');
    if (!list || !isAvailable(list)) return;
    const active = document.activeElement;
    const reader = document.querySelector<HTMLElement>('[data-pane="view"]');
    // Inert may already have blurred the reader to body. A real external/list
    // control that has acquired focus takes precedence over this restoration.
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      !reader?.contains(active) &&
      active instanceof HTMLElement &&
      isAvailable(active)
    )
      return;

    let target: HTMLElement = list;
    if (selectedArticleId && visibleArticles.some((article) => article.id === selectedArticleId)) {
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[role="article"]')).filter(
        (row) =>
          row.id === `article-${selectedArticleId}` &&
          row.getAttribute("aria-current") === "true" &&
          row.tabIndex >= 0 &&
          isAvailable(row, true) &&
          isInListViewport(row, list),
      );
      const exactOpener = opener.current;
      if (exactOpener && rows.includes(exactOpener)) target = exactOpener;
      else if (rows.length === 1) target = rows[0]!;
    }
    target.focus({ preventScroll: true });
  }, [mobilePane, ordinary, selectedArticleId, visibleArticles]);
}
