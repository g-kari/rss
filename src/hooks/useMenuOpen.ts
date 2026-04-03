import { useState, useEffect, useRef } from "react";

/**
 * ドロップダウンメニューの開閉状態と click-outside 処理をまとめたフック。
 * メニューが開いている間だけ `mousedown` / `touchstart` イベントをリッスンし、
 * メニュー外クリックで自動的に閉じる。
 *
 * @returns open - メニューが開いているか
 * @returns setOpen - 開閉状態を変更する関数
 * @returns menuRef - メニューのルート要素に付ける ref（click-outside 判定に使用）
 */
export function useMenuOpen() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onOutside(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, [open]);
  return { open, setOpen, menuRef };
}
