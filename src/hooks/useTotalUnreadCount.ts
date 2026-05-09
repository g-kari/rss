"use client";

import { useMemo } from "react";
import type { Article } from "../types";
import { isArticleRead } from "../lib/article-filter";
import { useDebounce } from "./useDebounce";

/**
 * 全記事の未読件数を計算する hook (#650 Step 1m)。
 *
 * `readIds` / `readBeforeTimestamp` を 200ms デバウンスして、連続した既読操作
 * (j キー連打など) で `articles.filter()` が毎フレーム走るのを抑制する。
 *
 * `useDocumentTitleBadge(totalUnread)` と組み合わせて document.title / favicon
 * バッジの更新頻度も間接的に絞る効果あり。
 *
 * 元々 App.tsx 内に 3 行 (useDebounce x2 + useMemo) のインラインクラスタとして
 * 散在していたが、「未読件数を計算する」という単一目的の単位として hook 化する
 * ことで意図が明示される。
 */
export function useTotalUnreadCount(
  articles: Article[],
  readIds: Set<string>,
  readBeforeTimestamp: string | null,
): number {
  const debouncedReadIds = useDebounce(readIds, 200);
  const debouncedReadBeforeTimestamp = useDebounce(readBeforeTimestamp, 200);
  return useMemo(
    () =>
      articles.filter((a) => !isArticleRead(a, debouncedReadIds, debouncedReadBeforeTimestamp))
        .length,
    [articles, debouncedReadIds, debouncedReadBeforeTimestamp],
  );
}
