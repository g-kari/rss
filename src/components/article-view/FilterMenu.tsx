import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import type { Article, Feed, KeywordFilter } from "../../types";
import { useToast } from "@/contexts/ToastContext";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";

const FeedFilterModal = dynamic(() => import("../FeedFilterModal"), { ssr: false });
import { MENU_ITEM_CLS } from "./constants";
import { ExcludeOptionsSection, useFilterMenuState } from "./filter-shared";

interface Props {
  article: Article;
  feed: Feed;
  onSaveFilter: (feedId: string, filter: KeywordFilter | null) => Promise<void>;
}

export default function FilterMenu({ article, feed, onSaveFilter }: Props) {
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef, modalOpen, setModalOpen, hasFilter, excludeOptions } =
    useFilterMenuState(article, feed.filter);
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);

  async function handleExclude(value: string) {
    setOpen(false);
    btnRef.current?.focus();
    const existingExclude = feed.filter?.exclude ?? [];
    if (existingExclude.includes(value)) {
      toast.info("既に除外キーワードに登録されています");
      return;
    }
    const newFilter: KeywordFilter = {
      include: feed.filter?.include ?? [],
      exclude: [...existingExclude, value],
      matchCategories: feed.filter?.matchCategories,
    };
    try {
      await onSaveFilter(feed.id, newFilter);
      toast.success(`「${value}」を除外キーワードに追加しました`);
    } catch {
      toast.error("フィルターの保存に失敗しました");
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="フィルター設定"
        aria-label="フィルター設定"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open || hasFilter ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          aria-hidden="true"
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 4h18M7 8h10M11 12h2M9 16h6" />
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
              aria-label="フィルター設定"
              onKeyDown={handleKeyDown}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[200px] max-h-[320px] overflow-y-auto"
              style={{ top: pos.top, right: pos.right }}
            >
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
                  <path d="M3 4h18M7 8h10M11 12h2M9 16h6" />
                </svg>
                キーワードフィルター設定
              </button>
              <ExcludeOptionsSection
                label="除外する"
                options={excludeOptions}
                onExclude={(v) => void handleExclude(v)}
              />
            </div>
          </>,
          document.body,
        )}
      {modalOpen && (
        <FeedFilterModal
          feed={feed}
          onClose={() => setModalOpen(false)}
          onSave={(filter) => onSaveFilter(feed.id, filter)}
        />
      )}
    </>
  );
}
