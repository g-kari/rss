'use client';

import { useEffect, type RefObject } from 'react';
import type { Article, Feed, FontSize, Layout, DateRange } from '../types';
import type { SortOrder } from './useFilteredArticles';

interface KeyboardNavOptions {
  articles: Article[];
  feeds: Feed[];
  pinnedFeedIds: Set<string>;
  selectedFeedId: string | null;
  selectedArticle: Article | null;
  bookmarkIds: Set<string>;
  readIds: Set<string>;
  setSelectedArticle: (article: Article) => void;
  onSelectFeed: (id: string | null) => void;
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
  sortOrder: SortOrder;
  toggleSortOrder: () => void;
  dateRange: DateRange;
  cycleDateRange: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

// キーボードナビゲーション: j/↓ 次の記事、k/↑ 前の記事、n/p 次/前の未読記事、o 元記事を開く、b ブックマーク切り替え、c リンクコピー、m 全て既読、l レイアウト切替、u 未読フィルター切替、d 日付フィルター切替、/ 検索フォーカス
export function useKeyboardNav({
  articles,
  feeds,
  pinnedFeedIds,
  selectedFeedId,
  selectedArticle,
  bookmarkIds,
  readIds,
  setSelectedArticle,
  onSelectFeed,
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
  sortOrder,
  toggleSortOrder,
  dateRange,
  cycleDateRange,
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
      } else if (e.key === 's') {
        toggleSortOrder();
        showToast(sortOrder === 'newest' ? 'ソート: 古い順' : 'ソート: 新しい順');
      } else if (e.key === 'd') {
        e.preventDefault();
        cycleDateRange();
        const next: DateRange[] = ['all', 'today', 'week', 'month'];
        const labels: Record<DateRange, string> = { all: '全期間', today: '今日', week: '今週', month: '今月' };
        showToast(`日付フィルター: ${labels[next[(next.indexOf(dateRange) + 1) % next.length]]}`);
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === ']') {
        e.preventDefault();
        const ordered = [
          null,
          ...feeds.filter((f) => pinnedFeedIds.has(f.id)),
          ...feeds.filter((f) => !pinnedFeedIds.has(f.id)),
        ];
        const cur = ordered.findIndex((f) => (f === null ? selectedFeedId === null : f.id === selectedFeedId));
        const next = ordered[(cur + 1) % ordered.length];
        onSelectFeed(next ? next.id : null);
        showToast(next ? (next.title || next.url) : '全記事');
      } else if (e.key === '[') {
        e.preventDefault();
        const ordered = [
          null,
          ...feeds.filter((f) => pinnedFeedIds.has(f.id)),
          ...feeds.filter((f) => !pinnedFeedIds.has(f.id)),
        ];
        const cur = ordered.findIndex((f) => (f === null ? selectedFeedId === null : f.id === selectedFeedId));
        const prev = ordered[(cur - 1 + ordered.length) % ordered.length];
        onSelectFeed(prev ? prev.id : null);
        showToast(prev ? (prev.title || prev.url) : '全記事');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [articles, feeds, pinnedFeedIds, selectedFeedId, selectedArticle, bookmarkIds, readIds, setSelectedArticle, onSelectFeed, markRead, markAllRead, toggleBookmark, toggleRead, showToast, fontSize, onChangeFontSize, layout, onChangeLayout, unreadOnly, toggleUnreadOnly, sortOrder, toggleSortOrder, dateRange, cycleDateRange, searchRef]);
}
