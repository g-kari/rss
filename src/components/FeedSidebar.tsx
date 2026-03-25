'use client';

import { useRef, useState, useMemo, useCallback } from 'react';
import type { Feed, Article, UserProfile } from '../types';
import ReleaseNotesModal from './ReleaseNotesModal';

interface FeedItemProps {
  feed: Feed;
  count: number;
  isSelected: boolean;
  isPinned: boolean;
  animationIndex: number;
  onSelect: () => void;
  onMarkAllRead: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onRename: (title: string) => Promise<void>;
  onRetry: () => Promise<void>;
}

function FeedItem({ feed, count, isSelected, isPinned, animationIndex, onSelect, onMarkAllRead, onDelete, onTogglePin, onRename, onRetry }: FeedItemProps) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [retrying, setRetrying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(feed.title || feed.url);
    setEditing(true);
    setTimeout(() => { inputRef.current?.select(); }, 0);
  }, [feed.title, feed.url]);

  const commitEdit = useCallback(async () => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (!trimmed || trimmed === (feed.title || feed.url)) return;
    await onRename(trimmed);
  }, [editTitle, feed.title, feed.url, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void commitEdit(); }
    if (e.key === 'Escape') { setEditing(false); }
  }, [commitEdit]);

  const handleRetry = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }, [onRetry, retrying]);

  return (
    <div
      onClick={editing ? undefined : onSelect}
      onDoubleClick={editing ? undefined : startEdit}
      className={`group flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 animate-fade-up ${
        isSelected
          ? 'text-text-strong bg-surface-subtle'
          : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
      }`}
      style={{ animationDelay: `${animationIndex * 40}ms` }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => { void commitEdit(); }}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-[13px] bg-surface-base border border-border-default rounded px-1.5 py-0.5 text-text-strong outline-none focus:border-text-muted min-w-0"
        />
      ) : (
        <div className="flex-1 min-w-0">
          <span className="text-[13px] tracking-[0.02em] truncate block" title="ダブルクリックでタイトルを編集">{feed.title || feed.url}</span>
          {feed.fetchError && (
            <span className="text-[10px] text-rose-400 truncate block leading-tight mt-0.5">
              {(feed.consecutiveErrors ?? 0) >= 5 ? '更新停止 · ' : ''}{feed.fetchError}
            </span>
          )}
        </div>
      )}
      <span className="flex items-center gap-1 ml-1 flex-shrink-0">
        {count > 0 && !feed.fetchError && (
          <span className="text-[11px] text-text-muted tabular-nums group-hover:opacity-0 transition-opacity duration-150">{count > 99 ? '99+' : count}</span>
        )}
        {count > 0 && feed.fetchError && (
          <span className="text-[11px] text-rose-400 tabular-nums group-hover:opacity-0 transition-opacity duration-150">{count > 99 ? '99+' : count}</span>
        )}
        <span className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 flex items-center gap-0.5">
          {/* ピン留めボタン */}
          <button
            onClick={onTogglePin}
            className={`p-0.5 transition-colors duration-150 ${isPinned ? 'text-text-default' : 'text-text-faint hover:text-text-default'}`}
            title={isPinned ? 'ピン解除' : 'ピン留め'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 1L6.5 4H9L7 6l.5 3L5 7.5 2.5 9 3 6 1 4h2.5z" />
            </svg>
          </button>
          {count > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onMarkAllRead(); }}
              className="p-0.5 text-text-faint hover:text-text-default transition-colors duration-150"
              title="全て既読"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 5l2.5 2.5L8.5 2.5" />
              </svg>
            </button>
          )}
          <button
            onClick={handleRetry}
            disabled={retrying}
            className={`p-0.5 transition-colors duration-150 disabled:opacity-40 ${feed.fetchError ? 'text-rose-400 hover:text-rose-300' : 'text-text-faint hover:text-text-default'}`}
            title={feed.fetchError ? '再試行' : '更新'}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              className={retrying ? 'animate-spin' : ''}
            >
              <path d="M8.5 2A4 4 0 1 0 9 5.5" />
              <polyline points="7,0.5 8.5,2 7,3.5" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 text-text-faint hover:text-rose-400 transition-colors duration-150"
            title="削除"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </span>
      </span>
    </div>
  );
}

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  bookmarkCount: number;
  readingListCount: number;
  selectedFeedId: string | null;
  user: UserProfile;
  theme: 'light' | 'dark';
  refreshing: boolean;
  pinnedFeedIds: Set<string>;
  onSelectFeed: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
  onMarkAllRead: (feedId: string | null) => void;
  onToggleTheme: () => void;
  onRefresh: () => void;
  onRetryFeed: (id: string) => Promise<void>;
  onTogglePinFeed: (id: string) => void;
  canInstall?: boolean;
  onInstall?: () => void;
  pushSupported?: boolean;
  pushSubscribed?: boolean;
  pushLoading?: boolean;
  pushError?: string | null;
  onTogglePush?: () => void;
}

export default function FeedSidebar({
  feeds,
  articles,
  readIds,
  bookmarkCount,
  readingListCount,
  selectedFeedId,
  user,
  theme,
  onSelectFeed,
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onFeedsImported,
  onMarkAllRead,
  onToggleTheme,
  onRefresh,
  onRetryFeed,
  refreshing,
  pinnedFeedIds,
  onTogglePinFeed,
  canInstall,
  onInstall,
  pushSupported,
  pushSubscribed,
  pushLoading,
  pushError,
  onTogglePush,
}: Props) {
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [inputOpen, setInputOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [feedSearch, setFeedSearch] = useState('');
  const [feedSearchOpen, setFeedSearchOpen] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedSearchRef = useRef<HTMLInputElement>(null);

  async function addFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        setError(data.error ?? 'Failed to add feed');
        return;
      }
      const feed = await res.json() as Feed;
      setNewUrl('');
      setInputOpen(false);
      onFeedAdded(feed);
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function deleteFeed(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const res = await fetch(`/api/feeds/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError('フィードの削除に失敗しました');
      return;
    }
    onFeedDeleted(id);
  }

  async function renameFeed(id: string, title: string) {
    const res = await fetch(`/api/feeds/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      setError('フィードのタイトル変更に失敗しました');
      return;
    }
    const updated = await res.json() as Feed;
    onFeedRenamed(updated);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  function exportOpml() {
    window.location.href = '/api/feeds/export';
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const res = await fetch('/api/feeds/import', {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: text,
      });
      if (!res.ok) {
        const data = await res.json() as { error: string };
        setError(data.error ?? 'インポートに失敗しました');
        return;
      }
      const data = await res.json() as { added: number; skipped: number };
      if (data.added > 0) {
        const feedsRes = await fetch('/api/feeds');
        if (feedsRes.ok) {
          const allFeeds = await feedsRes.json() as Feed[];
          onFeedsImported(allFeeds);
        }
      }
      setError(data.added > 0 ? `${data.added}件インポートしました` : 'すべて登録済みです');
    } catch {
      setError('インポートに失敗しました');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const { unreadByFeed, totalUnread } = useMemo(() => {
    const byFeed = new Map<string, number>();
    let total = 0;
    for (const a of articles) {
      if (!readIds.has(a.id)) {
        byFeed.set(a.feedHash, (byFeed.get(a.feedHash) ?? 0) + 1);
        total++;
      }
    }
    return { unreadByFeed: byFeed, totalUnread: total };
  }, [articles, readIds]);

  const { pinnedFeeds, unpinnedFeeds } = useMemo(() => {
    const q = feedSearch.trim().toLowerCase();
    const matchFeed = (f: Feed) => !q || (f.title || f.url).toLowerCase().includes(q);
    const pinned = feeds.filter((f) => pinnedFeedIds.has(f.id) && matchFeed(f));
    const unpinned = feeds.filter((f) => !pinnedFeedIds.has(f.id) && matchFeed(f));
    return { pinnedFeeds: pinned, unpinnedFeeds: unpinned };
  }, [feeds, pinnedFeedIds, feedSearch]);

  return (
    <aside className="h-full flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated">
      {/* ヘッダー */}
      <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">RSS</span>
        <button
          onClick={() => {
            const next = !feedSearchOpen;
            setFeedSearchOpen(next);
            if (next) {
              setTimeout(() => feedSearchRef.current?.focus(), 0);
            } else {
              setFeedSearch('');
            }
          }}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
            feedSearchOpen ? 'text-text-default bg-surface-subtle' : 'text-text-faint hover:text-text-default hover:bg-surface-subtle'
          }`}
          title="フィードを検索"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="4.5" cy="4.5" r="3" />
            <line x1="7" y1="7" x2="10" y2="10" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={() => setInputOpen((v) => !v)}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
            inputOpen ? 'text-text-default bg-surface-subtle' : 'text-text-faint hover:text-text-default hover:bg-surface-subtle'
          }`}
          title="フィードを追加"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="5.5" y1="1" x2="5.5" y2="10" />
            <line x1="1" y1="5.5" x2="10" y2="5.5" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-5 h-5 flex items-center justify-center rounded text-text-faint hover:text-text-default hover:bg-surface-subtle transition-all duration-200 disabled:opacity-40"
          title="フィードを更新"
        >
          <svg
            width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5"
            className={refreshing ? 'animate-spin' : ''}
          >
            <path strokeLinecap="round" d="M9.5 2A4.5 4.5 0 1 0 10 6.5" />
            <polyline strokeLinecap="round" strokeLinejoin="round" points="7.5,0.5 9.5,2 8,4" />
          </svg>
        </button>
      </div>

      {/* 追加フォーム */}
      {inputOpen && (
        <div className="px-3 py-2.5 border-b border-border-subtle bg-surface-base animate-fade-up">
          <form onSubmit={addFeed}>
            <input
              type="url"
              placeholder="https://..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={adding}
              autoFocus
              className="w-full text-[12px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
            />
            {error && <p className="text-[11px] text-rose-400 mt-1.5">{error}</p>}
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 text-[11px] tracking-[0.06em] py-1.5 bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200 disabled:opacity-40"
              >
                {adding ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => { setInputOpen(false); setError(''); }}
                className="text-[11px] px-3 py-1.5 text-text-muted hover:text-text-default hover:bg-surface-subtle rounded-lg transition-all duration-200"
              >
                ✕
              </button>
            </div>
          </form>
        </div>
      )}

      {/* フィード検索 */}
      {feedSearchOpen && (
        <div className="px-3 py-2 border-b border-border-subtle animate-fade-up">
          <input
            ref={feedSearchRef}
            type="text"
            placeholder="フィードを検索..."
            value={feedSearch}
            onChange={(e) => setFeedSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFeedSearch('');
                setFeedSearchOpen(false);
              }
            }}
            className="w-full text-[12px] bg-surface-elevated border border-border-default rounded-lg px-2.5 py-1.5 text-text-strong placeholder-text-faint outline-none focus:border-text-muted transition-colors duration-200"
          />
        </div>
      )}

      {/* フィードリスト */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2">
        <div
          onClick={() => onSelectFeed(null)}
          className={`group flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 ${
            selectedFeedId === null
              ? 'text-text-strong bg-surface-subtle'
              : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">すべて</span>
          <span className="flex items-center gap-1 flex-shrink-0">
            {totalUnread > 0 && (
              <span className="text-[11px] text-text-muted tabular-nums">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
            {totalUnread > 0 && (
              <span className="opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150">
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkAllRead(null); }}
                  className="p-0.5 text-text-faint hover:text-text-default transition-colors duration-150"
                  title="全て既読 (m)"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1.5 5l2.5 2.5L8.5 2.5" />
                  </svg>
                </button>
              </span>
            )}
          </span>
        </div>

        <button
          onClick={() => onSelectFeed('__bookmarks__')}
          className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
            selectedFeedId === '__bookmarks__'
              ? 'text-text-strong bg-surface-subtle'
              : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">ブックマーク</span>
          {bookmarkCount > 0 && (
            <span className="text-[11px] text-text-muted tabular-nums">
              {bookmarkCount > 99 ? '99+' : bookmarkCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onSelectFeed('__reading_list__')}
          className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
            selectedFeedId === '__reading_list__'
              ? 'text-text-strong bg-surface-subtle'
              : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">後で読む</span>
          {readingListCount > 0 && (
            <span className="text-[11px] text-text-muted tabular-nums">
              {readingListCount > 99 ? '99+' : readingListCount}
            </span>
          )}
        </button>

        {feeds.length > 0 && (
          <div className="mx-4 my-2">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {pinnedFeeds.map((feed, i) => {
          const count = unreadByFeed.get(feed.id) ?? 0;
          const isSelected = selectedFeedId === feed.id;
          return (
            <FeedItem
              key={feed.id}
              feed={feed}
              count={count}
              isSelected={isSelected}
              isPinned={true}
              animationIndex={i}
              onSelect={() => onSelectFeed(feed.id)}
              onMarkAllRead={() => onMarkAllRead(feed.id)}
              onDelete={(e) => deleteFeed(feed.id, e)}
              onTogglePin={(e) => { e.stopPropagation(); onTogglePinFeed(feed.id); }}
              onRename={(title) => renameFeed(feed.id, title)}
              onRetry={() => onRetryFeed(feed.id)}
            />
          );
        })}

        {pinnedFeeds.length > 0 && unpinnedFeeds.length > 0 && (
          <div className="mx-4 my-1.5">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {unpinnedFeeds.map((feed, i) => {
          const count = unreadByFeed.get(feed.id) ?? 0;
          const isSelected = selectedFeedId === feed.id;
          return (
            <FeedItem
              key={feed.id}
              feed={feed}
              count={count}
              isSelected={isSelected}
              isPinned={false}
              animationIndex={pinnedFeeds.length + i}
              onSelect={() => onSelectFeed(feed.id)}
              onMarkAllRead={() => onMarkAllRead(feed.id)}
              onDelete={(e) => deleteFeed(feed.id, e)}
              onTogglePin={(e) => { e.stopPropagation(); onTogglePinFeed(feed.id); }}
              onRename={(title) => renameFeed(feed.id, title)}
              onRetry={() => onRetryFeed(feed.id)}
            />
          );
        })}
      </nav>

      {/* ユーザー情報 */}
      <div className="px-3 py-2.5 border-t border-border-subtle flex items-center gap-2">
        {user.picture ? (
          <img src={`/api/image-proxy?url=${encodeURIComponent(user.picture)}`} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-surface-subtle flex-shrink-0" />
        )}
        <span className="text-[11px] text-text-muted truncate flex-1">{user.name}</span>
        {/* OPMLインポート */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
          className="hidden"
          onChange={handleImportFile}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0 disabled:opacity-40"
          title="OPMLインポート"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </button>
        {/* リリースノート */}
        <button
          onClick={() => setShowReleaseNotes(true)}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title="リリースノート"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </button>
        {/* OPMLエクスポート */}
        <button
          onClick={exportOpml}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title="OPMLエクスポート"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </button>
        {canInstall && (
          <button
            onClick={onInstall}
            className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
            title="アプリをインストール"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M12 3v13.5m0 0l-4.5-4.5M12 16.5l4.5-4.5" />
            </svg>
          </button>
        )}
        {pushSupported && (
          <button
            onClick={onTogglePush}
            disabled={pushLoading}
            className={`transition-colors duration-200 flex-shrink-0 ${pushError ? 'text-rose-400' : pushSubscribed ? 'text-accent-dot' : 'text-text-faint hover:text-text-muted'} disabled:opacity-50`}
            title={pushError ?? (pushSubscribed ? 'プッシュ通知をオフ' : 'プッシュ通知をオン')}
          >
            {pushSubscribed ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.143 17.082a24.248 24.248 0 003.844.148m-3.844-.148a23.856 23.856 0 01-5.455-1.31 8.964 8.964 0 002.3-5.542m3.155 6.852a3 3 0 005.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 003.536-1.003A8.967 8.967 0 0118 9.75V9A6 6 0 006.53 6.53m10.245 10.245L6.53 6.53M3 3l3.53 3.53" />
              </svg>
            )}
          </button>
        )}
        <button
          onClick={onToggleTheme}
          className="text-text-faint hover:text-text-muted transition-colors duration-200 flex-shrink-0"
          title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
        >
          {theme === 'dark' ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
        </button>
        <button
          onClick={logout}
          className="text-text-faint hover:text-text-soft transition-colors duration-200 flex-shrink-0"
          title="ログアウト"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
    </aside>
  );
}
