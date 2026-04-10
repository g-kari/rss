"use client";

import { useEffect, useRef } from "react";

const SWIPE_THRESHOLD_PX = 60; // ドラッグ・スワイプの最小距離
const WHEEL_THRESHOLD_PX = 150; // ホイール累積距離の閾値
const WHEEL_RESET_MS = 400; // ホイール累積のリセット待機時間
const WHEEL_X_Y_RATIO = 0.5; // X/Y delta の水平優位フィルター比率
const TOUCH_X_Y_RATIO = 1.5; // 縦スクロールとの衝突を避けるための X/Y 比率閾値

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

  useEffect(() => {
    const wheelDelta = wheelDeltaRef.current;
    return () => {
      if (wheelDelta.timer) clearTimeout(wheelDelta.timer);
    };
  }, []);

  function handleWheel(e: React.WheelEvent) {
    if (hasScrollableAncestor(e.target, e.currentTarget)) return;
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * WHEEL_X_Y_RATIO) return;
    const state = wheelDeltaRef.current;
    state.x += e.deltaX;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      state.x = 0;
    }, WHEEL_RESET_MS);
    if (state.x > WHEEL_THRESHOLD_PX) {
      state.x = 0;
      onSelectNext?.();
    } else if (state.x < -WHEEL_THRESHOLD_PX) {
      state.x = 0;
      onSelectPrev?.();
    }
  }

  function handleNavMouseDown(e: React.MouseEvent) {
    mouseStartXRef.current = e.clientX;
  }

  function handleNavMouseUp(e: React.MouseEvent) {
    if (mouseStartXRef.current === null) return;
    const dx = e.clientX - mouseStartXRef.current;
    mouseStartXRef.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) onSelectNext?.();
    else if (dx > 0) onSelectPrev?.();
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
    // 縦スクロールとの衝突を避けるため X/Y 比率 TOUCH_X_Y_RATIO 以上の水平優位のみナビゲート
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * TOUCH_X_Y_RATIO) return;
    if (dx < 0) onSelectNext?.();
    else if (dx > 0) onSelectPrev?.();
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
