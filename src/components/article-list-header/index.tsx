"use client";

import { useRef, useState } from "react";
import { useNativeControlSpace } from "../../hooks/useNativeControlSpace";
import type { ArticleListHeaderProps } from "./types";
import { useArticleFilter } from "../../contexts/ArticleFilterContext";
import { SPECIAL_FEED_IDS } from "../../lib/storage";
import { DATE_RANGE_LABELS, READING_TIME_RANGE_LABELS } from "../../lib/article-utils";
import { SHORTCUT_MAP } from "../../config/shortcuts";
import LayoutSwitcher from "./LayoutSwitcher";
import FilterPills from "./FilterPills";
import FilterPillButton from "./FilterPillButton";
import SortButton from "./SortButton";
import MarkAllReadButton from "./MarkAllReadButton";
import SearchBar from "./SearchBar";
import Modal from "../Modal";
import dynamic from "next/dynamic";

const FeedFilterModal = dynamic(() => import("../FeedFilterModal"), { ssr: false });
const TOOL_CLASS =
  "min-h-[44px] min-w-[44px] px-3 py-2 rounded-lg border border-border-default text-control text-text-muted hover:bg-surface-hover hover:text-text-strong transition-colors";
const SPECIAL_TITLES: Record<string, string> = {
  [SPECIAL_FEED_IDS.DIGEST]: "ダイジェスト",
  [SPECIAL_FEED_IDS.HISTORY]: "履歴",
  [SPECIAL_FEED_IDS.BOOKMARKS]: "ブックマーク",
  [SPECIAL_FEED_IDS.READING_LIST]: "後で読む",
  [SPECIAL_FEED_IDS.LIKES]: "いいね",
};

export default function ArticleListHeader({
  layout,
  onChangeLayout,
  listFocusMode,
  onToggleListFocusMode,
  onMobileBack,
  onMarkAllRead,
  filteredCount,
  selectedFeedId,
  scopeTitle,
  feeds,
}: ArticleListHeaderProps) {
  const [panel, setPanel] = useState<"filters" | "layout" | "actions" | null>(null);
  const [globalFilterModalOpen, setGlobalFilterModalOpen] = useState(false);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  useNativeControlSpace(headerRef);
  const filter = useArticleFilter();
  const { globalFilter, setGlobalFilter, unreadOnly, toggleUnreadOnly } = filter;
  const globalFilterActive =
    !!globalFilter && (globalFilter.include.length > 0 || globalFilter.exclude.length > 0);
  const conditions = [
    filter.bookmarkOnly && "ブックマーク",
    filter.readingListOnly && "後で読む",
    filter.likeOnly && "いいね",
    filter.noteOnly && "メモあり",
    filter.digestMode && "ダイジェスト",
    filter.dateRange !== "all" && DATE_RANGE_LABELS[filter.dateRange],
    filter.readingTimeRange !== "all" && READING_TIME_RANGE_LABELS[filter.readingTimeRange],
    filter.authorFilter && `著者: ${filter.authorFilter}`,
    filter.categoryFilter && `カテゴリ: ${filter.categoryFilter}`,
    globalFilterActive && "キーワード設定あり",
  ].filter(Boolean);
  const title =
    scopeTitle ||
    (selectedFeedId
      ? SPECIAL_TITLES[selectedFeedId] ||
        feeds.find((feed) => feed.id === selectedFeedId)?.title ||
        "記事"
      : "すべての記事");
  return (
    <>
      <header
        ref={headerRef}
        className="flex flex-col border-b border-border-default bg-surface-elevated"
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-1 min-w-0">
          {onMobileBack && (
            <button
              onClick={onMobileBack}
              className="lg:hidden shrink-0 min-w-[44px] min-h-[44px] rounded-lg text-text-muted hover:bg-surface-hover"
              aria-label="フィード一覧に戻る"
            >
              ←
            </button>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-meta text-text-muted">読む記事を選ぶ</p>
            <h2 className="text-[15px] font-medium text-text-strong break-words">{title}</h2>
            <p className="text-meta text-text-muted tabular-nums">{filteredCount} 件</p>
          </div>
          <button
            onClick={() => setPanel("actions")}
            className={`${TOOL_CLASS} shrink-0`}
            aria-haspopup="dialog"
            aria-expanded={panel === "actions"}
          >
            操作
          </button>
        </div>
        <SearchBar />
        <div className="grid grid-cols-3 gap-2 px-3 pb-3" aria-label="記事一覧の表示と絞り込み">
          <FilterPillButton
            active={unreadOnly}
            onClick={toggleUnreadOnly}
            title={`${SHORTCUT_MAP["u"]} (u)`}
          >
            未読
          </FilterPillButton>
          <button
            ref={filterTrigger}
            onClick={() => setPanel("filters")}
            className={TOOL_CLASS}
            aria-haspopup="dialog"
            aria-expanded={panel === "filters"}
          >
            絞り込み
            {conditions.length > 0 && (
              <span className="ml-1 tabular-nums">{conditions.length}</span>
            )}
          </button>
          <button
            onClick={() => setPanel("layout")}
            className={TOOL_CLASS}
            aria-haspopup="dialog"
            aria-expanded={panel === "layout"}
          >
            表示
          </button>
        </div>
        {conditions.length > 0 && (
          <p
            className="px-3 pb-3 text-meta text-text-muted break-words"
            aria-label="有効な絞り込み条件"
          >
            {conditions.join("・")}
          </p>
        )}
      </header>
      {panel === "filters" && (
        <Modal
          title="記事の絞り込み"
          subtitle="変更はすぐ一覧に反映されます"
          onClose={() => setPanel(null)}
        >
          <FilterPills
            selectedFeedId={selectedFeedId}
            feeds={feeds}
            onOpenGlobalFilter={() => setGlobalFilterModalOpen(true)}
            globalFilterActive={globalFilterActive}
          />
          <div className="p-4 border-t border-border-subtle">
            <button className={`${TOOL_CLASS} w-full`} onClick={() => setPanel(null)}>
              一覧に戻る
            </button>
          </div>
        </Modal>
      )}
      {panel === "layout" && (
        <Modal title="記事一覧の表示" onClose={() => setPanel(null)}>
          <LayoutSwitcher
            layout={layout}
            onChangeLayout={onChangeLayout}
            listFocusMode={listFocusMode}
            onToggleListFocusMode={onToggleListFocusMode}
          />
          <div className="p-4 border-t border-border-subtle">
            <button className={`${TOOL_CLASS} w-full`} onClick={() => setPanel(null)}>
              一覧に戻る
            </button>
          </div>
        </Modal>
      )}
      {panel === "actions" && (
        <Modal title="記事一覧の操作" onClose={() => setPanel(null)}>
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-control text-text-default">並び順</span>
              <SortButton sortOrder={filter.sortOrder} onToggle={filter.toggleSortOrder} />
            </div>
            {onMarkAllRead && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-control text-text-default">この一覧を全て既読にする</span>
                <MarkAllReadButton onMarkAllRead={onMarkAllRead} />
              </div>
            )}
            <button className={TOOL_CLASS} onClick={() => setPanel(null)}>
              一覧に戻る
            </button>
          </div>
        </Modal>
      )}
      {globalFilterModalOpen && (
        <FeedFilterModal
          initialFilter={globalFilter}
          onClose={() => {
            setGlobalFilterModalOpen(false);
            if (panel !== "filters") filterTrigger.current?.focus();
          }}
          onSave={setGlobalFilter}
        />
      )}
    </>
  );
}
