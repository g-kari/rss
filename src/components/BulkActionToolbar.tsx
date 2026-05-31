"use client";

import { useCallback, useRef, useState } from "react";
import SnoozeModal from "./SnoozeModal";

interface Props {
  selectedIds: ReadonlySet<string>;
  onBulkMarkRead: (ids: string[]) => void;
  onBulkToggleBookmark?: (ids: string[]) => void;
  onBulkToggleReadingList?: (ids: string[]) => void;
  onBulkSnooze?: (ids: string[], durationMs: number) => void;
  onBulkAddTag?: (ids: string[], tag: string) => void;
  onClear: () => void;
  /** 選択中の全記事がブックマーク済みかどうか (aria-pressed に使用) */
  isBookmarked?: boolean;
  /** 選択中の全記事が後で読むに登録済みかどうか (aria-pressed に使用) */
  isInReadingList?: boolean;
}

export default function BulkActionToolbar({
  selectedIds,
  onBulkMarkRead,
  onBulkToggleBookmark,
  onBulkToggleReadingList,
  onBulkSnooze,
  onBulkAddTag,
  onClear,
  isBookmarked,
  isInReadingList,
}: Props) {
  const count = selectedIds.size;
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const tagButtonRef = useRef<HTMLButtonElement>(null);

  const handleMarkRead = useCallback(() => {
    if (count === 0) return;
    onBulkMarkRead([...selectedIds]);
    onClear();
  }, [count, selectedIds, onBulkMarkRead, onClear]);

  const handleToggleBookmark = useCallback(() => {
    if (count === 0 || !onBulkToggleBookmark) return;
    onBulkToggleBookmark([...selectedIds]);
    onClear();
  }, [count, selectedIds, onBulkToggleBookmark, onClear]);

  const handleToggleReadingList = useCallback(() => {
    if (count === 0 || !onBulkToggleReadingList) return;
    onBulkToggleReadingList([...selectedIds]);
    onClear();
  }, [count, selectedIds, onBulkToggleReadingList, onClear]);

  const handleOpenSnooze = useCallback(() => {
    setShowTagInput(false);
    setTagInputValue("");
    setShowSnoozeModal(true);
  }, []);

  const handleOpenTagInput = useCallback(() => {
    setShowSnoozeModal(false);
    setShowTagInput(true);
  }, []);

  const handleAddTag = useCallback(() => {
    if (!tagInputValue.trim() || !onBulkAddTag) return;
    onBulkAddTag([...selectedIds], tagInputValue.trim());
    setTagInputValue("");
    setShowTagInput(false);
    tagButtonRef.current?.focus();
    onClear();
  }, [tagInputValue, selectedIds, onBulkAddTag, onClear]);

  if (count === 0) return null;

  return (
    <>
      <div
        role="toolbar"
        aria-label="記事一括操作"
        className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full border border-border-default bg-surface-elevated px-4 py-2 shadow-lg"
      >
        <span className="text-sm font-medium text-text-strong">{count} 件選択中</span>
        <button
          type="button"
          onClick={handleMarkRead}
          className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
          aria-label="選択した記事をまとめて既読にする"
        >
          既読にする
        </button>
        {onBulkToggleBookmark && (
          <button
            type="button"
            onClick={handleToggleBookmark}
            className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
            aria-label={isBookmarked ? "ブックマーク解除" : "ブックマーク追加"}
            aria-pressed={isBookmarked ?? false}
          >
            ブックマーク
          </button>
        )}
        {onBulkToggleReadingList && (
          <button
            type="button"
            onClick={handleToggleReadingList}
            className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
            aria-label={isInReadingList ? "後で読むから解除" : "後で読むに追加"}
            aria-pressed={isInReadingList ?? false}
          >
            後で読む
          </button>
        )}
        {onBulkSnooze && (
          <button
            type="button"
            onClick={handleOpenSnooze}
            className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
            aria-label="選択した記事をまとめてスヌーズする"
          >
            スヌーズ
          </button>
        )}
        {onBulkAddTag && !showTagInput && (
          <button
            ref={tagButtonRef}
            type="button"
            onClick={handleOpenTagInput}
            className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
            aria-label="選択した記事にタグを追加する"
          >
            タグ追加
          </button>
        )}
        {showTagInput && onBulkAddTag && (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={tagInputValue}
              onChange={(e) => setTagInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tagInputValue.trim()) {
                  handleAddTag();
                }
                if (e.key === "Escape") {
                  setShowTagInput(false);
                  setTagInputValue("");
                  tagButtonRef.current?.focus();
                }
              }}
              placeholder="タグ名を入力"
              aria-label="タグ名を入力"
              autoFocus
              className="rounded-full border border-border-default bg-surface-base px-3 py-1 text-sm text-text-default focus:outline-none focus:border-ink"
            />
            <button
              type="button"
              onClick={handleAddTag}
              aria-label="タグを追加する"
              className="rounded-full bg-ink px-3 py-1 text-sm font-medium text-ink-text transition-all duration-200 hover:bg-ink-hover"
            >
              追加
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-border-default px-3 py-1 text-sm font-medium text-text-default hover:bg-surface-hover"
          aria-label="選択を解除する"
        >
          解除
        </button>
      </div>
      {showSnoozeModal && onBulkSnooze && (
        <SnoozeModal
          articleTitle={`${count} 件の記事`}
          onSnooze={(durationMs) => {
            onBulkSnooze([...selectedIds], durationMs);
            setShowSnoozeModal(false);
            onClear();
          }}
          onClose={() => setShowSnoozeModal(false)}
        />
      )}
    </>
  );
}
