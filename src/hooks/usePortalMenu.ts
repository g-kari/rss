import { useState, useCallback, useRef, useEffect, type RefObject } from "react";

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
 *
 * @param lockRef - true の間はスクロール・リサイズによる自動クローズを抑制する。
 *   メニュー内に input がある場合など、input へのフォーカスが scroll/resize を
 *   引き起こしてメニューが閉じてしまう問題を防ぐために使用する。
 */
export function usePortalMenu(lockRef?: RefObject<boolean>) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<DropdownPos>({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (lockRef?.current) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, lockRef]);

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
