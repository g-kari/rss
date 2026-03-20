import { useState } from 'react';
import type { Feed, Article, UserProfile } from '../types';

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  bookmarkCount: number;
  selectedFeedId: string | null;
  user: UserProfile;
  theme: 'light' | 'dark';
  onSelectFeed: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onToggleTheme: () => void;
}

export default function FeedSidebar({
  feeds,
  articles,
  readIds,
  bookmarkCount,
  selectedFeedId,
  user,
  theme,
  onSelectFeed,
  onFeedAdded,
  onFeedDeleted,
  onToggleTheme,
}: Props) {
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [inputOpen, setInputOpen] = useState(false);

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
        const data = await res.json<{ error: string }>();
        setError(data.error ?? 'Failed to add feed');
        return;
      }
      const feed = await res.json<Feed>();
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

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
  }

  function unreadCount(feedId?: string) {
    const feedArticles = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
    return feedArticles.filter((a) => !readIds.has(a.id)).length;
  }

  const totalUnread = unreadCount();

  return (
    <aside className="flex flex-col min-h-0 overflow-hidden border-r border-border-default bg-surface-elevated">
      {/* ヘッダー */}
      <div className="px-4 py-3.5 border-b border-border-default flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">RSS</span>
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

      {/* フィードリスト */}
      <nav className="flex-1 min-h-0 overflow-y-auto py-2">
        <button
          onClick={() => onSelectFeed(null)}
          className={`w-full flex items-center justify-between px-4 py-1.5 text-left transition-all duration-200 ${
            selectedFeedId === null
              ? 'text-text-strong bg-surface-subtle'
              : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">すべて</span>
          {totalUnread > 0 && (
            <span className="text-[11px] text-text-muted tabular-nums">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>

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

        {feeds.length > 0 && (
          <div className="mx-4 my-2">
            <div className="border-t border-border-subtle" />
          </div>
        )}

        {feeds.map((feed, i) => {
          const count = unreadCount(feed.id);
          const isSelected = selectedFeedId === feed.id;
          return (
            <div
              key={feed.id}
              onClick={() => onSelectFeed(feed.id)}
              className={`group flex items-center justify-between px-4 py-1.5 cursor-pointer transition-all duration-200 animate-fade-up ${
                isSelected
                  ? 'text-text-strong bg-surface-subtle'
                  : 'text-text-muted hover:text-text-strong hover:bg-surface-hover'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-[13px] tracking-[0.02em] truncate flex-1">{feed.title || feed.url}</span>
              <span className="flex items-center gap-1 ml-1 flex-shrink-0">
                {count > 0 && (
                  <span className="text-[11px] text-text-muted tabular-nums">{count > 99 ? '99+' : count}</span>
                )}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={(e) => deleteFeed(feed.id, e)}
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
        })}
      </nav>

      {/* ユーザー情報 */}
      <div className="px-3 py-2.5 border-t border-border-subtle flex items-center gap-2">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-surface-subtle flex-shrink-0" />
        )}
        <span className="text-[11px] text-text-muted truncate flex-1">{user.name}</span>
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
    </aside>
  );
}
