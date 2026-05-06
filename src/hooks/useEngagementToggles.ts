"use client";

import { useMemo } from "react";
import type { Article, EngagementAction } from "../types";
import { useSyncedRef } from "./useSyncedRef";

/**
 * ブックマーク・後で読む・いいね のトグルハンドラーを生成する。
 * 各ハンドラーはトグル操作と同時にエンゲージメントを記録する。
 */
export function useEngagementToggles(
  articles: Article[],
  toggleBookmark: (id: string) => void,
  toggleReadingList: (id: string) => void,
  toggleLike: (id: string) => void,
  recordEngagement: (id: string, feedHash: string, type: EngagementAction) => void,
): {
  handleToggleBookmark: (id: string) => void;
  handleToggleReadingList: (id: string) => void;
  handleToggleLike: (id: string) => void;
} {
  const articlesRef = useSyncedRef(articles);
  return useMemo(() => {
    function makeHandler(toggle: (id: string) => void, type: EngagementAction) {
      return (id: string) => {
        toggle(id);
        const article = articlesRef.current.find((a) => a.id === id);
        if (article) recordEngagement(id, article.feedHash, type);
      };
    }
    return {
      handleToggleBookmark: makeHandler(toggleBookmark, "bookmark"),
      handleToggleReadingList: makeHandler(toggleReadingList, "reading_list"),
      handleToggleLike: makeHandler(toggleLike, "like"),
    };
  }, [articlesRef, toggleBookmark, toggleReadingList, toggleLike, recordEngagement]);
}
