import { useEffect, useRef, useCallback, type KeyboardEvent, type RefObject } from "react";

/**
 * Portal ベースのドロップダウンメニューに対して
 * - Arrow Up/Down によるメニュー項目間のフォーカス移動
 * - ESC で閉じて元のトリガーボタンへフォーカスを復元
 * - Tab/Shift+Tab のフォーカストラップ
 * - メニュー開時に最初の項目へ自動フォーカス
 * を提供するフック。
 */
export function useMenuKeyboard(
  open: boolean,
  setOpen: (v: boolean) => void,
  /** close 時に focus を戻す要素。context menu では右クリック起点の任意 element も渡す (#1201) */
  btnRef: RefObject<HTMLElement | null>,
) {
  const menuRef = useRef<HTMLDivElement>(null);

  const getItems = useCallback((): HTMLElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
      ),
    );
  }, []);

  // メニュー開時に最初の項目にフォーカス
  useEffect(() => {
    if (!open) return;
    // requestAnimationFrame で DOM が portal に挿入された後にフォーカスする
    const raf = requestAnimationFrame(() => {
      const items = getItems();
      if (items.length > 0) {
        items[0].focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [open, getItems]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const items = getItems();
      if (items.length === 0) return;

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          items[next].focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          items[prev].focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          items[0].focus();
          break;
        }
        case "End": {
          e.preventDefault();
          items[items.length - 1].focus();
          break;
        }
        case "Escape": {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          btnRef.current?.focus();
          break;
        }
        case "Tab": {
          // フォーカストラップ: メニュー外に出さない
          e.preventDefault();
          if (e.shiftKey) {
            const prev = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            items[prev].focus();
          } else {
            const next = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            items[next].focus();
          }
          break;
        }
      }
    },
    [getItems, setOpen, btnRef],
  );

  return { menuRef, handleKeyDown };
}
