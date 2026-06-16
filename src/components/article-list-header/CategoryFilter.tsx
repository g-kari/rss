"use client";

import type { Dispatch, SetStateAction } from "react";
import { usePortalMenu } from "../../hooks/usePortalMenu";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import PortalMenuShell from "../article-view/PortalMenuShell";

interface CategoryFilterProps {
  feedCategories: string[];
  categoryFilter: string | null;
  setCategoryFilter: Dispatch<SetStateAction<string | null>>;
}

/**
 * カテゴリでフィルターする dropdown。
 *
 * a11y: ShareMenu / SnoozeMenu と同じ usePortalMenu canonical pattern:
 * - usePortalMenu + useMenuKeyboard でキーボードナビ (Arrow up/down / Escape close) +
 *   クリック外し閉じる + 閉じる時の WCAG 2.4.3 focus 復元
 * - aria-haspopup="menu" / aria-expanded / aria-controls (WAI-ARIA disclosure 3-attribute set)
 * - PortalMenuShell で `position: fixed` 配置 + 透明 Backdrop を集約
 */
export default function CategoryFilter({
  feedCategories,
  categoryFilter,
  setCategoryFilter,
}: CategoryFilterProps) {
  const { open, setOpen, toggle, pos, btnRef, menuId } = usePortalMenu();
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);

  if (feedCategories.length === 0) return null;

  if (categoryFilter) {
    return (
      <button
        onClick={() => setCategoryFilter(null)}
        title={`カテゴリ「${categoryFilter}」フィルターを解除`}
        aria-label={`カテゴリ「${categoryFilter}」フィルターを解除`}
        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink text-ink-text transition-colors duration-150 hover:bg-ink-hover max-w-[120px]"
      >
        <span className="truncate">{categoryFilter}</span>
        <svg
          aria-hidden="true"
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <path d="M1 1l6 6M7 1L1 7" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="カテゴリでフィルター"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`flex items-center gap-1 px-2 h-6 max-md:min-h-[44px] max-md:min-w-[44px] rounded-full text-[11px] transition-all duration-200 ${
          open
            ? "text-text-strong bg-surface-subtle"
            : "text-text-faint hover:text-text-muted hover:bg-surface-subtle"
        }`}
      >
        <svg
          aria-hidden="true"
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M1 3h10M3 6h6M5 9h2" />
        </svg>
        <span>フォルダ</span>
      </button>
      {open && (
        <PortalMenuShell
          menuRef={menuRef}
          btnRef={btnRef}
          setOpen={setOpen}
          handleKeyDown={handleKeyDown}
          pos={pos}
          menuId={menuId}
          ariaLabel="カテゴリ選択"
          className="min-w-[120px]"
        >
          {feedCategories.map((cat) => (
            <button
              key={cat}
              role="menuitem"
              onClick={() => {
                setCategoryFilter(cat);
                setOpen(false);
                btnRef.current?.focus();
              }}
              className="w-full text-left px-3 py-1.5 text-[12px] text-text-default hover:bg-surface-hover transition-colors truncate"
            >
              {cat}
            </button>
          ))}
        </PortalMenuShell>
      )}
    </>
  );
}
