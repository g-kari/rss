'use client';

import { useEffect, type RefObject } from 'react';
import type { Article, FontSize, Layout } from '../types';

interface KeyboardNavOptions {
  articles: Article[];
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  bookmarkIds: Set<string>;
  readIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  markRead: (id: string) => void;
  markAllRead: (feedId: string | null) => void;
  toggleBookmark: (id: string) => void;
  toggleRead: (id: string) => void;
  showToast: (msg: string) => void;
  fontSize: FontSize;
  onChangeFontSize: (size: FontSize) => void;
  layout: Layout;
  onChangeLayout: (layout: Layout) => void;
  unreadOnly: boolean;
  toggleUnreadOnly: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

// キーボードナビゲーション: j/↓ 次の記事、k/↑ 前の記事、n/p 次/前の未読記事、o 元記事を開く、b ブックマーク切り替え、c リンクコピー、m 全て既読、l レイアウト切替、u 未読フィルター切替、/ 検索フォーカス
export function useKeyboardNav({
  articles,
  selectedFeedId,
  selectedArticle,
  bookmarkIds,
  readIds,
  setSelectedArticle,
  markRead,
  markAllRead,
  toggleBookmark,
  toggleRead,
  showToast,
  fontSize,
  onChangeFontSize,
  layout,
  onChangeLayout,
  unreadOnly,
  toggleUnreadOnly,
  searchRef,
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
      } else if (e.key === 'n') {
        e.preventDefault();
        const nextUnread = list.slice(idx + 1).find((a) => !readIds.has(a.id));
        if (nextUnread) { setSelectedArticle(nextUnread); markRead(nextUnread.id); }
      } else if (e.key === 'p') {
        e.preventDefault();
        const prevUnread = list.slice(0, idx < 0 ? undefined : idx).reverse().find((a) => !readIds.has(a.id));
        if (prevUnread) { setSelectedArticle(prevUnread); markRead(prevUnread.id); }
      } else if (e.key === 'r' && selectedArticle) {
        toggleRead(selectedArticle.id);
      } else if (e.key === 'm') {
        markAllRead(selectedFeedId);
      } else if (e.key === 'c' && selectedArticle?.link) {
        navigator.clipboard.writeText(selectedArticle.link).then(() => {
          showToast('リンクをコピーしました');
        }).catch(() => {
          showToast('コピーに失敗しました');
        });
      } else if (e.key === 'f') {
        const cycle: FontSize[] = ['small', 'medium', 'large'];
        const next = cycle[(cycle.indexOf(fontSize) + 1) % cycle.length];
        onChangeFontSize(next);
        const labels: Record<FontSize, string> = { small: '小', medium: '中', large: '大' };
        showToast(`文字サイズ: ${labels[next]}`);
      } else if (e.key === 'l') {
        const cycle: Layout[] = ['compact', 'list', 'card', 'magazine'];
        const next = cycle[(cycle.indexOf(layout) + 1) % cycle.length];
        onChangeLayout(next);
        const labels: Record<Layout, string> = { compact: 'コンパクト', list: 'リスト', card: 'カード', magazine: 'マガジン' };
        showToast(`レイアウト: ${labels[next]}`);
      } else if (e.key === 'u') {
        e.preventDefault();
        toggleUnreadOnly();
        showToast(!unreadOnly ? '未読フィルター: ON' : '未読フィルター: OFF');
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, selectedFeedId, selectedArticle, bookmarkIds, readIds, setSelectedArticle, markRead, markAllRead, toggleBookmark, toggleRead, showToast, fontSize, onChangeFontSize, layout, onChangeLayout, unreadOnly, toggleUnreadOnly, searchRef]);
}
