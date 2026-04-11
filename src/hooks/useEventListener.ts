"use client";

import { useEffect } from "react";
import { useSyncedRef } from "./useSyncedRef";

/**
 * イベントリスナーを登録・解除するフック。
 * ハンドラーを内部 ref に保存するため、ハンドラーが変わってもリスナーは再登録されない。
 *
 * @param capture `true` でキャプチャフェーズに登録（`window.addEventListener` の第 3 引数に相当）
 *
 * @example
 * // window の beforeunload
 * useEventListener("beforeunload", () => { ... });
 *
 * // document の visibilitychange
 * useEventListener("visibilitychange", () => { ... }, document);
 *
 * // キャプチャフェーズで scroll を受け取る
 * useEventListener("scroll", () => { ... }, window, true);
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (ev: WindowEventMap[K]) => void,
  target?: Window,
  capture?: boolean,
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (ev: DocumentEventMap[K]) => void,
  target: Document,
  capture?: boolean,
): void;
/** `WindowEventMap` / `DocumentEventMap` に含まれない非標準イベント用オーバーロード */
export function useEventListener(
  eventName: string,
  handler: (ev: Event) => void,
  target: Window | Document,
  capture?: boolean,
): void;
export function useEventListener(
  eventName: string,
  handler: (ev: Event) => void,
  target?: Window | Document,
  capture?: boolean,
): void {
  const handlerRef = useSyncedRef(handler);

  useEffect(() => {
    const t = target ?? window;
    const listener = (ev: Event) => handlerRef.current(ev);
    t.addEventListener(eventName, listener, capture);
    return () => t.removeEventListener(eventName, listener, capture);
  }, [eventName, target, capture]); // eslint-disable-line react-hooks/exhaustive-deps -- handlerRef は useSyncedRef が返す安定した ref
}
