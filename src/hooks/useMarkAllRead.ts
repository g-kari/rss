"use client";

import { useCallback } from "react";
import type { Article } from "../types";
import type { ToastApi } from "./useToast";
import type { ConfirmOptions } from "./useConfirm";
import { isArticleRead } from "../lib/article-filter";

interface Options {
  articles: Article[];
  filtered: Article[];
  readIds: Set<string>;
  readBeforeTimestamp: string | null;
  selectedFeedId: string | null;
  groupFeedIds: Set<string> | null | undefined;
  selectedCollectionId: string | null;
  selectedTag: string | null;
  activeFeedView: string | null | undefined;
  totalUnread: number;
  markBulkRead: (ids: string[]) => void;
  markAllReadWithUndo: (feedId: string | null, toast: ToastApi) => void;
  skipRemainingPages: (feedId: string | null) => void;
  toast: ToastApi;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

/**
 * 記事一覧ヘッダーの「全て既読」ボタンのロジックを集約した hook。
 *
 * - グループ・コレクション・タグ・フィードビューが選択されている場合は、
 *   filtered リストをそのまま一括既読にする。
 * - それ以外（全フィードまたは単一フィード選択）は markAllReadWithUndo を使用してアンドゥ対応にする。
 * - 50件以上の場合は確認ダイアログを表示する。
 */
export function useMarkAllRead({
  articles,
  filtered,
  readIds,
  readBeforeTimestamp,
  selectedFeedId,
  groupFeedIds,
  selectedCollectionId,
  selectedTag,
  activeFeedView,
  totalUnread,
  markBulkRead,
  markAllReadWithUndo,
  skipRemainingPages,
  toast,
  confirm,
}: Options) {
  const onMarkAllRead = useCallback(async () => {
    // #968: readBeforeTimestamp を 1 回だけ ms 化して isArticleRead に渡す。
    const readBeforeMs = readBeforeTimestamp ? Date.parse(readBeforeTimestamp) : null;
    const hasSubFilter =
      (groupFeedIds && groupFeedIds.size > 0) ||
      selectedCollectionId ||
      selectedTag ||
      activeFeedView;

    if (hasSubFilter) {
      const ids = filtered.filter((a) => !isArticleRead(a, readIds, readBeforeMs)).map((a) => a.id);
      if (ids.length === 0) return;
      if (ids.length >= 50) {
        const ok = await confirm({
          title: "全既読の確認",
          message: `${ids.length}件の未読記事を全て既読にしますか？`,
          confirmLabel: "既読にする",
        });
        if (!ok) return;
      }
      markBulkRead(ids);
      return;
    }

    const unreadCount = selectedFeedId
      ? articles.filter(
          (a) => a.feedHash === selectedFeedId && !isArticleRead(a, readIds, readBeforeMs),
        ).length
      : totalUnread;

    if (unreadCount >= 50) {
      const ok = await confirm({
        title: "全既読の確認",
        message: `${unreadCount}件の未読記事を全て既読にしますか？`,
        confirmLabel: "既読にする",
      });
      if (!ok) return;
    }

    markAllReadWithUndo(selectedFeedId, toast);
    skipRemainingPages(selectedFeedId);
  }, [
    articles,
    filtered,
    readIds,
    readBeforeTimestamp,
    selectedFeedId,
    groupFeedIds,
    selectedCollectionId,
    selectedTag,
    activeFeedView,
    totalUnread,
    markBulkRead,
    markAllReadWithUndo,
    skipRemainingPages,
    toast,
    confirm,
  ]);

  return { onMarkAllRead };
}
