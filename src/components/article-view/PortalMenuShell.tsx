import { createPortal } from "react-dom";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import Backdrop from "../Backdrop";

interface Props {
  /** メニュー本体の ref (useMenuKeyboard 由来) */
  menuRef: RefObject<HTMLDivElement | null>;
  /** トリガーボタンの ref (usePortalMenu 由来、閉じる時の focus 復元先) */
  btnRef: RefObject<HTMLButtonElement | null>;
  setOpen: (open: boolean) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** usePortalMenu が算出する viewport 絶対位置 */
  pos: { top: number; right: number };
  ariaLabel: string;
  /** min-w / max-h 等のメニュー個別 class (BASE_MENU_CLASS に追記される) */
  className?: string;
  children: ReactNode;
}

/** 全 portal dropdown 共通の menu 本体 class (背景・枠・角丸・影・overflow) */
const BASE_MENU_CLASS =
  "fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden";

/**
 * portal dropdown メニューの共通シェル。透明 Backdrop (click-catcher) +
 * `role="menu"` コンテナ + 閉じる時の focus 復元を 1 箇所に集約する。
 * SnoozeMenu / FilterMenu / GlobalFilterMenu の重複ボイラープレートを統合。
 * Backdrop の onPointerDown に focus 復元を内包するため、WCAG 2.4.3 (focus 復元)
 * の漏れが構造的に発生しない。
 */
export default function PortalMenuShell({
  menuRef,
  btnRef,
  setOpen,
  handleKeyDown,
  pos,
  ariaLabel,
  className = "",
  children,
}: Props) {
  return createPortal(
    <>
      <Backdrop
        transparent
        onPointerDown={() => {
          setOpen(false);
          btnRef.current?.focus();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className={`${BASE_MENU_CLASS} ${className}`}
        style={{ top: pos.top, right: pos.right }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
