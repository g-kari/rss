"use client";

import { useCallback } from "react";

interface Props {
  /** 一括操作対象の記事 ID 集合 (size > 0 のときのみ render される想定) */
  selectedIds: ReadonlySet<string>;
  /** 一括既読化 — 既存 `useReadState#markBulkRead(ids)` をそのまま渡す */
  onBulkMarkRead: (ids: string[]) => void;
  /** 選択解除 — `useBulkArticleSelection#clear` を渡す */
  onClear: () => void;
}

/**
 * 一括操作 floating toolbar (#883 Phase A)。
 *
 * - 画面下中央に fixed positioning で表示
 * - Phase A は「一括既読」+「選択解除」の 2 action のみ
 * - Phase B 以降で 一括ブックマーク / スヌーズ / タグ付け を追加する想定
 *   (本 toolbar に action を append していく)
 */
export default function BulkActionToolbar({ selectedIds, onBulkMarkRead, onClear }: Props) {
  const count = selectedIds.size;

  const handleMarkRead = useCallback(() => {
    if (count === 0) return;
    onBulkMarkRead([...selectedIds]);
    onClear();
  }, [count, selectedIds, onBulkMarkRead, onClear]);

  if (count === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="記事一括操作"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border-default bg-surface-elevated px-4 py-2 shadow-lg"
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
      <button
        type="button"
        onClick={onClear}
        className="rounded-full border border-border-default px-3 py-1 text-sm font-medium text-text-default hover:bg-surface-hover"
        aria-label="選択を解除する"
      >
        解除
      </button>
    </div>
  );
}
