"use client";

import { useEffect } from "react";
import { useSyncedRef } from "./useSyncedRef";

/**
 * イベントリスナーを登録・解除するフック。
 * ハンドラーを内部 ref に保存するため、ハンドラーが変わってもリスナーは再登録されない。
 *
 * @example
 * // window の beforeunload
 * useEventListener("beforeunload", () => { ... });
 *
 * // document の visibilitychange
 * useEventListener("visibilitychange", () => { ... }, document);
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (ev: WindowEventMap[K]) => void,
  target?: Window,
): void;
export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (ev: DocumentEventMap[K]) => void,
  target: Document,
): void;
/** `WindowEventMap` / `DocumentEventMap` に含まれない非標準イベント用オーバーロード */
export function useEventListener(
  eventName: string,
  handler: (ev: Event) => void,
  target: Window | Document,
): void;
export function useEventListener(
  eventName: string,
  handler: (ev: Event) => void,
  target?: Window | Document,
): void {
  const handlerRef = useSyncedRef(handler);

  useEffect(() => {
    const t = target ?? window;
    const listener = (ev: Event) => handlerRef.current(ev);
    t.addEventListener(eventName, listener);
    return () => t.removeEventListener(eventName, listener);
  }, [eventName, target]); // eslint-disable-line react-hooks/exhaustive-deps -- handlerRef は useSyncedRef が返す安定した ref
}
