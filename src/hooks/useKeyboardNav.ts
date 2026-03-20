'use client';

import { useEffect } from 'react';
import type { Article } from '../types';

interface KeyboardNavOptions {
  articles: Article[];
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  bookmarkIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  markRead: (id: string) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
}

// キーボードナビゲーション: j/↓ 次の記事、k/↑ 前の記事、o 元記事を開く、b ブックマーク切り替え、m 全て既読
export function useKeyboardNav({
  articles,
  selectedFeedId,
  selectedArticle,
  bookmarkIds,
  setSelectedArticle,
  markRead,
  markAllRead,
  toggleBookmark,
}: KeyboardNavOptions): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const list =
        selectedFeedId === '__bookmarks__'
          ? articles.filter((a) => bookmarkIds.has(a.id))
          : selectedFeedId
            ? articles.filter((a) => a.feedId === selectedFeedId)
            : articles;
      const idx = selectedArticle ? list.findIndex((a) => a.id === selectedArticle.id) : -1;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = list[idx + 1];
        if (next) { setSelectedArticle(next); markRead(next.id); }
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) { const prev = list[idx - 1]; setSelectedArticle(prev); markRead(prev.id); }
      } else if (e.key === 'o' && selectedArticle?.link) {
        window.open(selectedArticle.link, '_blank', 'noopener,noreferrer');
      } else if (e.key === 'b' && selectedArticle) {
        toggleBookmark(selectedArticle.id);
      } else if (e.key === 'm') {
        markAllRead(selectedFeedId);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, selectedFeedId, selectedArticle, bookmarkIds, setSelectedArticle, markRead, markAllRead, toggleBookmark]);
}
