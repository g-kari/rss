"use client";

import { useRef } from "react";
import type { MutableRefObject } from "react";

/**
 * 最新値への参照を保持する ref。レンダーごとに `current` を自動更新する。
 * stale closure を回避するために使う。
 *
 * @example
 * // Before
 * const callbackRef = useRef(onError);
 * callbackRef.current = onError;
 *
 * // After
 * const callbackRef = useSyncedRef(onError);
 */
export function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
