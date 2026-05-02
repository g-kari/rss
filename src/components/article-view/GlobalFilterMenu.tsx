import React from "react";
import { createPortal } from "react-dom";
import type { Article, KeywordFilter } from "../../types";
import { useToast } from "@/contexts/ToastContext";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import FeedFilterModal from "../FeedFilterModal";
import { MENU_ITEM_CLS } from "./constants";
import { ExcludeOptionsSection, useFilterMenuState } from "./filter-shared";

interface Props {
  article: Article;
  globalFilter: KeywordFilter | null;
  onSaveGlobalFilter: (filter: KeywordFilter | null) => void;
}

export default function GlobalFilterMenu({ article, globalFilter, onSaveGlobalFilter }: Props) {
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions } =
    useFilterMenuState(article, globalFilter);
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);

  function handleExclude(value: string) {
    setOpen(false);
    btnRef.current?.focus();
    const existingExclude = globalFilter?.exclude ?? [];
    if (existingExclude.includes(value)) {
      toast.info("既にグローバル除外キーワードに登録されています");
      return;
    }
    const newFilter: KeywordFilter = {
      include: globalFilter?.include ?? [],
      exclude: [...existingExclude, value],
      matchCategories: globalFilter?.matchCategories,
    };
    onSaveGlobalFilter(newFilter);
    toast.success(`「${value}」をグローバル除外キーワードに追加しました`);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="グローバルフィルター設定（全フィード共通）"
        aria-label="グローバルフィルター設定"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open || hasFilter ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4h18M7 8h10M11 12h2" />
          <circle cx="19" cy="19" r="3" />
          <path d="M19 17v2l1 1" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
            />
            <div
              ref={menuRef}
              role="menu"
              aria-label="グローバルフィルター設定"
              onKeyDown={handleKeyDown}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[220px] max-h-[320px] overflow-y-auto"
              style={{ top: pos.top, right: pos.right }}
            >
              <div className="px-3 pt-2 pb-1">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                  グローバルフィルター
                </p>
                <p className="text-[10px] text-text-faint mt-0.5">全フィードに適用</p>
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setModalOpen(true);
                }}
                className={MENU_ITEM_CLS}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  <path d="M3 4h18M7 8h10M11 12h2" />
                </svg>
                フィルター設定を開く
              </button>
              <ExcludeOptionsSection
                label="全フィードから除外する"
                options={excludeOptions}
                onExclude={handleExclude}
              />
            </div>
          </>,
          document.body,
        )}
      {modalOpen && (
        <FeedFilterModal
          title="グローバルフィルター"
          initialFilter={globalFilter}
          onClose={() => setModalOpen(false)}
          onSave={(filter) => {
            onSaveGlobalFilter(filter);
          }}
        />
      )}
    </>
  );
}
