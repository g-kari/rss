"use client";

import { useEffect, useRef } from "react";

const SWIPE_THRESHOLD_PX = 60;
const TOUCH_X_Y_RATIO = 1.5;

export function useGallerySwipeNav(scrollElement: HTMLElement | null, enabled: boolean) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!scrollElement || !enabled) return;

    const isMobile = () => window.innerWidth < 1024;

    function findCardElements(): HTMLElement[] {
      if (!scrollElement) return [];
      return Array.from(scrollElement.querySelectorAll<HTMLElement>('[id^="article-"]'));
    }

    function findCurrentCardIndex(cards: HTMLElement[]): number {
      const containerRect = scrollElement!.getBoundingClientRect();
      const viewportTarget = containerRect.top + containerRect.height / 3;

      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const cardRect = cards[i].getBoundingClientRect();
        const dist = Math.abs(cardRect.top - viewportTarget);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      return closest;
    }

    function scrollToCard(cards: HTMLElement[], index: number) {
      const card = cards[index];
      if (!card || !scrollElement) return;
      const containerRect = scrollElement.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetScrollTop = scrollElement.scrollTop + (cardRect.top - containerRect.top) - 8;
      scrollElement.scrollTo({ top: targetScrollTop, behavior: "smooth" });
    }

    function handleTouchStart(e: TouchEvent) {
      if (!isMobile()) return;
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!touchStartRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      touchStartRef.current = null;

      if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * TOUCH_X_Y_RATIO)
        return;

      const cards = findCardElements();
      if (cards.length === 0) return;
      const currentIndex = findCurrentCardIndex(cards);

      if (dx < 0) {
        scrollToCard(cards, Math.min(currentIndex + 1, cards.length - 1));
      } else {
        scrollToCard(cards, Math.max(currentIndex - 1, 0));
      }
    }

    scrollElement.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollElement.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      scrollElement.removeEventListener("touchstart", handleTouchStart);
      scrollElement.removeEventListener("touchend", handleTouchEnd);
    };
  }, [scrollElement, enabled]);
}
