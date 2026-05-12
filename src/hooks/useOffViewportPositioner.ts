"use client";

import { createContext, useCallback, useEffect, useReducer, useRef } from "react";
import type { Positioner } from "masonic";
import { computeLastVisibleIndex, isOffViewport } from "@/lib/gallery-offviewport";

/**
 * #714 Phase 2: `viewport 外 item のみ高さ変化を反映する」hook。
 *
 * masonic は `useResizeObserver(positioner)` で全 item の高さ変化を即 positioner.update する仕様。
 * これだと viewport 内の見えているカードが画像 load の度にピクピク動いて UX 悪化する。
 *
 * 本 hook は同等の責務を持ちつつ、viewport 内 / 外で挙動を分岐:
 * - viewport 外: 即 `positioner.update + forceUpdate` (ユーザーが scroll で到達するまで列バランス確定)
 * - viewport 内: `pendingHeights` に退避 (ちらつき防止)
 * - cell unmount 時 (overscan 外で remove) や scroll で off-viewport になったとき: pending を flush
 *
 * 設計判断 (Issue #714 ユーザー指示):
 * - 案 A (画面領域外のみ適応) + 案 2 (visible カードは min-height で初期高さ固定)
 * - viewport 内カードは positioner.update せず、内部 image の aspect-ratio 変化で
 *   伸びる場合は下のカードと重なる (許容)。min-height で initial 高さは保つ (shrink 防止)。
 */

interface PositionerLike {
  get: Positioner["get"];
  update: Positioner["update"];
  all: Positioner["all"];
}

export interface OffViewportObserver {
  /** masonic の cell の root element を index と紐付けて observer に登録 */
  register: (el: Element, index: number) => void;
  /** cell unmount 時に呼ぶ (内部で pending を flush する) */
  unregister: (el: Element) => void;
  /** scroll 時に呼ぶ (off-viewport になった pending entry をバッチ flush) */
  flush: () => void;
}

/** Cell の register/unregister を Context 経由で provide */
export const OffViewportObserverCtx = createContext<OffViewportObserver | null>(null);

/**
 * masonic positioner の高さ変化追跡 hook。GalleryMasonry で使い、戻り値の observer を
 * Provider 経由で子 cell (GalleryCardRenderer) に渡す。
 */
export function useOffViewportPositioner(
  positioner: PositionerLike | null,
  scrollTop: number,
  viewportHeight: number,
): OffViewportObserver {
  const elementsRef = useRef<Map<Element, number>>(new Map());
  const pendingRef = useRef<Map<number, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const scrollTopRef = useRef(scrollTop);
  const viewportHeightRef = useRef(viewportHeight);
  const positionerRef = useRef(positioner);
  const [, forceUpdate] = useReducer((c: number) => c + 1, 0);

  // refs を最新値に同期 (resize callback / unregister / flush から参照)
  scrollTopRef.current = scrollTop;
  viewportHeightRef.current = viewportHeight;
  positionerRef.current = positioner;

  // positioner.all() の PositionerItem[] (index 順) から `{index, top}[]` に変換して
  // computeLastVisibleIndex に渡す
  const computeLastVisible = useCallback((): number => {
    const pos = positionerRef.current;
    if (!pos) return -1;
    const positions = pos.all().map((p, i) => ({ index: i, top: p.top }));
    return computeLastVisibleIndex(positions, scrollTopRef.current, viewportHeightRef.current);
  }, []);

  // ResizeObserver 単一インスタンス (lifetime 持続パターン)
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const pos = positionerRef.current;
      if (!pos) return;

      const lastVisible = computeLastVisible();
      const flatUpdates: number[] = [];
      for (const entry of entries) {
        const index = elementsRef.current.get(entry.target);
        if (index === undefined) continue;
        // contentBoxSize より borderBoxSize の方がレイアウト基準と一致する
        const box = entry.borderBoxSize?.[0];
        const newHeight = box ? box.blockSize : entry.contentRect.height;
        const existing = pos.get(index);
        // 高さ変化なし (< 1px) は skip
        if (!existing || Math.abs(existing.height - newHeight) < 1) continue;

        if (isOffViewport(index, lastVisible)) {
          flatUpdates.push(index, newHeight);
        } else {
          // visible: pending 退避 (ちらつき防止)
          pendingRef.current.set(index, newHeight);
        }
      }
      if (flatUpdates.length > 0) {
        pos.update(flatUpdates);
        forceUpdate();
      }
    });
    observerRef.current = ro;
    return () => {
      ro.disconnect();
      observerRef.current = null;
      elementsRef.current.clear();
      pendingRef.current.clear();
    };
  }, [computeLastVisible]);

  const register = useCallback((el: Element, index: number) => {
    elementsRef.current.set(el, index);
    observerRef.current?.observe(el);
  }, []);

  const unregister = useCallback((el: Element) => {
    const index = elementsRef.current.get(el);
    if (index !== undefined) {
      // unmount = overscan 外に出た = off-viewport 確定 → pending あれば flush
      const pendingHeight = pendingRef.current.get(index);
      if (pendingHeight !== undefined && positionerRef.current) {
        positionerRef.current.update([index, pendingHeight]);
        pendingRef.current.delete(index);
        forceUpdate();
      }
    }
    elementsRef.current.delete(el);
    observerRef.current?.unobserve(el);
  }, []);

  const flush = useCallback(() => {
    const pos = positionerRef.current;
    if (!pos || pendingRef.current.size === 0) return;

    const lastVisible = computeLastVisible();
    const flatUpdates: number[] = [];
    const flushedKeys: number[] = [];
    for (const [index, height] of pendingRef.current.entries()) {
      if (isOffViewport(index, lastVisible)) {
        flatUpdates.push(index, height);
        flushedKeys.push(index);
      }
    }
    for (const key of flushedKeys) pendingRef.current.delete(key);
    if (flatUpdates.length > 0) {
      pos.update(flatUpdates);
      forceUpdate();
    }
  }, [computeLastVisible]);

  // observer object 自体は identity 安定 (callback は useCallback 済)
  const observerRef2 = useRef<OffViewportObserver | null>(null);
  if (observerRef2.current === null) {
    observerRef2.current = { register, unregister, flush };
  } else {
    observerRef2.current.register = register;
    observerRef2.current.unregister = unregister;
    observerRef2.current.flush = flush;
  }
  return observerRef2.current;
}
