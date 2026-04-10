"use client";

import { useRef } from "react";

/** target から currentTarget まで祖先を遡り、横スクロール可能な要素があれば true を返す */
function hasScrollableAncestor(
  target: EventTarget | null,
  currentTarget: EventTarget | null,
): boolean {
  let node = target as Element | null;
  while (node && node !== currentTarget) {
    const ox = getComputedStyle(node).overflowX;
    if ((ox === "auto" || ox === "scroll") && node.scrollWidth > node.clientWidth) return true;
    node = node.parentElement;
  }
  return false;
}

/**
 * スワイプ・ホイール・マウスドラッグによる前後記事ナビゲーションのジェスチャー処理フック。
 * 横スクロール可能な子要素へのイベントは無視して親要素へのナビゲーションのみ処理する。
 */
export function useGestureNav({
  onSelectPrev,
  onSelectNext,
}: {
  onSelectPrev?: () => void;
  onSelectNext?: () => void;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const mouseStartXRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef<{ x: number; timer: ReturnType<typeof setTimeout> | null }>({
    x: 0,
    timer: null,
  });

  function handleWheel(e: React.WheelEvent) {
    if (hasScrollableAncestor(e.target, e.currentTarget)) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 0.5) return;
    const state = wheelDeltaRef.current;
    state.x += e.deltaX;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.x = 0;
    }, 400);
    if (state.x > 150 && onSelectNext) {
      state.x = 0;
      onSelectNext();
    } else if (state.x < -150 && onSelectPrev) {
      state.x = 0;
      onSelectPrev();
    }
  }

  function handleNavMouseDown(e: React.MouseEvent) {
    mouseStartXRef.current = e.clientX;
  }

  function handleNavMouseUp(e: React.MouseEvent) {
    if (mouseStartXRef.current === null) return;
    const dx = e.clientX - mouseStartXRef.current;
    mouseStartXRef.current = null;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && onSelectNext) onSelectNext();
    else if (dx > 0 && onSelectPrev) onSelectPrev();
  }

  function handleNavMouseLeave() {
    mouseStartXRef.current = null;
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (hasScrollableAncestor(e.target, e.currentTarget)) return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    // 水平方向が縦スクロールより優位で、かつ閾値を超えた場合のみ遷移
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && onSelectNext) onSelectNext();
    else if (dx > 0 && onSelectPrev) onSelectPrev();
  }

  return {
    handleWheel,
    handleNavMouseDown,
    handleNavMouseUp,
    handleNavMouseLeave,
    handleTouchStart,
    handleTouchEnd,
  };
}
