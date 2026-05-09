"use client";

import { useEffect, useRef } from "react";
import {
  type GalleryAutoScrollSpeed,
  SLIDESHOW_INTERVAL_MS,
  computeContinuousScrollDelta,
  computeSlideshowJump,
  isAutoScrollEnabled,
  isContinuousScrollMode,
  isSlideshowMode,
} from "../lib/gallery-autoscroll";
import { useSyncedRef } from "./useSyncedRef";

/**
 * ギャラリービューの自動スクロール hook (#690 案 D ハイブリッド)。
 *
 * - 連続モード (slow / medium / fast): `requestAnimationFrame` で 1 frame ごとに px 加算
 * - スライドショーモード (slideshow): `setInterval` で N 秒ごとに 1 viewport 分ジャンプ
 * - off: 何もしない (副作用なし)
 *
 * 自動停止トリガー (cleanup 不要、再生成で対応):
 * - `enabled` が false (gallery レイアウト以外 / consumer の意思で stop)
 * - `speed` が "off"
 * - `scrollEl` が null (mount 前 / unmount)
 *
 * 一時停止トリガー (実行中に手動操作):
 * - ユーザーの `wheel` / `touchstart` イベント → 即停止 (consumer 側で onPause を受けて
 *   speed state を "off" に戻す責務)
 */
export function useGalleryAutoScroll(params: {
  scrollEl: HTMLDivElement | null;
  speed: GalleryAutoScrollSpeed;
  enabled: boolean;
  /** ユーザーが手動操作 (wheel / touch) したときに呼ぶ。consumer 側で speed を off に戻す */
  onUserInterrupt?: () => void;
}): void {
  const { scrollEl, speed, enabled, onUserInterrupt } = params;
  const onUserInterruptRef = useSyncedRef(onUserInterrupt);

  // 連続スクロール (rAF) ループ
  useEffect(() => {
    if (!enabled || !scrollEl) return;
    if (!isContinuousScrollMode(speed)) return;

    let rafId = 0;
    let lastTs = 0;
    const tick = (ts: number) => {
      if (lastTs === 0) {
        lastTs = ts;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const delta = computeContinuousScrollDelta(speed, ts - lastTs);
      lastTs = ts;
      if (delta > 0) {
        scrollEl.scrollTop += delta;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [scrollEl, speed, enabled]);

  // スライドショー (setInterval) ループ
  useEffect(() => {
    if (!enabled || !scrollEl) return;
    if (!isSlideshowMode(speed)) return;

    const id = setInterval(() => {
      const jump = computeSlideshowJump(scrollEl.clientHeight);
      if (jump > 0) {
        scrollEl.scrollBy({ top: jump, behavior: "smooth" });
      }
    }, SLIDESHOW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [scrollEl, speed, enabled]);

  // ユーザー手動操作で一時停止
  useEffect(() => {
    if (!enabled || !scrollEl) return;
    if (!isAutoScrollEnabled(speed)) return;

    const handleInterrupt = () => {
      onUserInterruptRef.current?.();
    };
    // wheel / touchstart は手動スクロール意思の最も明確なシグナル
    scrollEl.addEventListener("wheel", handleInterrupt, { passive: true });
    scrollEl.addEventListener("touchstart", handleInterrupt, { passive: true });
    return () => {
      scrollEl.removeEventListener("wheel", handleInterrupt);
      scrollEl.removeEventListener("touchstart", handleInterrupt);
    };
  }, [scrollEl, speed, enabled]);
}
