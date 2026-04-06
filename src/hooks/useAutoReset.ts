"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 値をセットしてから一定時間後に自動でリセットする hook。
 * タイマー管理とクリーンアップを内部に閉じ込める。
 *
 * @param resetValue - リセット後の値（初期値も兼ねる）
 * @param duration - 自動リセットまでのミリ秒（デフォルト 3000ms）
 * @returns [value, set] — set() を呼ぶと duration 後に resetValue へ戻る
 */
export function useAutoReset<T>(resetValue: T, duration = 3000) {
  const [value, setValue] = useState<T>(resetValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function set(newValue: T) {
    setValue(newValue);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setValue(resetValue), duration);
  }

  return [value, set] as const;
}
