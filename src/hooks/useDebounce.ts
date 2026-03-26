import { useState, useEffect } from "react";

/**
 * 値をデバウンスして返す汎用フック。
 * `delay` ms 間 value が変化しなかった場合のみ更新後の値を返す。
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
