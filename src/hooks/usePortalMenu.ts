import { useState, useCallback, useRef } from "react";
import { useEventListener } from "./useEventListener";
import { usePopupLock } from "./usePopupLock";

interface DropdownPos {
  top: number;
  right: number; // viewport 右端からの距離
}

/**
 * ドロップダウンを `document.body` の portal で表示するためのフック。
 *
 * `overflow: auto/hidden` を持つ祖先要素によってクリップされる問題を解消する。
 * 背景バックドロップの `onPointerDown` で外側タップを検知するため、
 * このフックは open/setOpen/toggle/pos/btnRef のみ提供する。
 */
export function usePortalMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  usePopupLock(open);

  // スクロール・リサイズ時にメニューを閉じる（open が false の場合 setOpen(false) は React が最適化して no-op）
  useEventListener("scroll", () => setOpen(false), window, true);
  useEventListener("resize", () => setOpen(false));

  const toggle = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  }, []);

  return { open, setOpen, toggle, pos, btnRef };
}
