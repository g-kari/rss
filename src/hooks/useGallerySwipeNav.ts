"use client";

import { useEffect, useRef } from "react";

const SWIPE_THRESHOLD_PX = 60;
const TOUCH_X_Y_RATIO = 1.5;

export function useGallerySwipeNav(scrollElement: HTMLElement | null, enabled: boolean) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!scrollElement || !enabled) return;

    const isMobile = () => window.innerWidth < 1024;

    /**
     * カード要素をビジュアル配置順（top昇順 → left昇順）でソートして返す。
     * masonry レイアウトでは DOM 順序とビジュアル順序が一致しないため、
     * 実際のレンダリング位置でソートする必要がある。
     */
    function findCardElements(): HTMLElement[] {
      if (!scrollElement) return [];
      const cards = Array.from(scrollElement.querySelectorAll<HTMLElement>('[id^="article-"]'));
      // masonry は position: absolute でカードを配置するため、
      // offsetTop / offsetLeft でビジュアル順にソートする
      cards.sort((a, b) => {
        const aTop = a.offsetTop;
        const bTop = b.offsetTop;
        // 同じ行にあるカード（top の差が小さい）は left で比較
        if (Math.abs(aTop - bTop) < 20) {
          return a.offsetLeft - b.offsetLeft;
        }
        return aTop - bTop;
      });
      return cards;
    }

    function findCurrentCardIndex(cards: HTMLElement[]): number {
      const containerRect = scrollElement!.getBoundingClientRect();
      const viewportCenter = containerRect.top + containerRect.height / 2;

      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < cards.length; i++) {
        const cardRect = cards[i].getBoundingClientRect();
        const cardCenter = cardRect.top + cardRect.height / 2;
        const dist = Math.abs(cardCenter - viewportCenter);
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

      // 左スワイプ = 次へ、右スワイプ = 前へ
      // 端に到達しても確実に隣のカードに遷移する
      if (dx < 0) {
        const nextIndex = Math.min(currentIndex + 1, cards.length - 1);
        if (nextIndex !== currentIndex) {
          scrollToCard(cards, nextIndex);
        }
      } else {
        const prevIndex = Math.max(currentIndex - 1, 0);
        if (prevIndex !== currentIndex) {
          scrollToCard(cards, prevIndex);
        }
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
