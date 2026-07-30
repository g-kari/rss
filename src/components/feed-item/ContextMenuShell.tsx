import { createPortal } from "react-dom";
import { type CSSProperties, type ReactNode, type RefObject } from "react";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import Backdrop from "../Backdrop";
import { BASE_MENU_CLASS } from "../../lib/menu-class";

interface Props {
  /** トリガーボタンの ref (useMenuKeyboard の focus 管理用) */
  btnRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  /** menuAnchor から算出した viewport 絶対位置 style */
  menuPortalStyle: CSSProperties;
  ariaLabel: string;
  /** min-w 等のメニュー個別 class (BASE_MENU_CLASS に追記される) */
  className?: string;
  children: ReactNode;
}

/**
 * FeedContextMenu 内の context menu portal 共通シェル。タップ貫通防止 Backdrop
 * (stopPropagation + onClose) + `role="menu"` コンテナ + Escape/Tab/Arrow 統合
 * (useMenuKeyboard) を 1 箇所に集約する。ContextMenuPortal / MuteMenuPortal /
 * ViewMenuPortal / DigestMenuPortal / GroupMenuPortal の重複ボイラープレートを統合。
 *
 * focus 復元は Escape (useMenuKeyboard) / backdrop dismiss の両経路で行う。
 * article-view の PortalMenuShell とは contract が異なる (pos でなく menuPortalStyle /
 * Backdrop stopPropagation / menu onClick stopPropagation) ため別シェルとして分離している。
 */
export default function ContextMenuShell({
  btnRef,
  onClose,
  menuPortalStyle,
  ariaLabel,
  className = "",
  children,
}: Props) {
  const { menuRef, handleKeyDown } = useMenuKeyboard(true, (_v: boolean) => onClose(), btnRef);

  return createPortal(
    <>
      {/* backdrop: タップ貫通防止 */}
      <Backdrop
        transparent
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
          // WCAG 2.4.3: backdrop dismiss でもトリガーボタンへ focus を戻す
          // (canonical: article-view/PortalMenuShell.tsx)
          btnRef.current?.focus();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className={`${BASE_MENU_CLASS} ${className}`}
        style={menuPortalStyle}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
