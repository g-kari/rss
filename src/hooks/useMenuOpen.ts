import { useState, useEffect, useRef } from "react";

/** ドロップダウンメニューの開閉状態と click-outside 処理をまとめたフック */
export function useMenuOpen() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);
  return { open, setOpen, menuRef };
}
