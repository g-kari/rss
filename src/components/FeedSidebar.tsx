import { useState } from 'react';
import type { Feed, Article, UserProfile } from '../types';

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  selectedFeedId: string | null;
  user: UserProfile;
  onSelectFeed: (id: string | null) => void;
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
}

export default function FeedSidebar({
  feeds,
  articles,
  readIds,
  selectedFeedId,
  user,
  onSelectFeed,
  onFeedAdded,
  onFeedDeleted,
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
    <aside className="flex flex-col min-h-0 overflow-hidden border-r border-stone-200 bg-white">
      {/* ヘッダー */}
      <div className="px-4 py-3.5 border-b border-stone-200 flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-stone-400">RSS</span>
        <button
          onClick={() => setInputOpen((v) => !v)}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all duration-200 ${
            inputOpen ? 'text-stone-600 bg-stone-100' : 'text-stone-300 hover:text-stone-600 hover:bg-stone-100'
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
        <div className="px-3 py-2.5 border-b border-stone-100 bg-stone-50 animate-fade-up">
          <form onSubmit={addFeed}>
            <input
              type="url"
              placeholder="https://..."
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              disabled={adding}
              autoFocus
              className="w-full text-[12px] bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-700 placeholder-stone-300 outline-none focus:border-stone-400 transition-colors duration-200"
            />
            {error && <p className="text-[11px] text-rose-400 mt-1.5">{error}</p>}
            <div className="flex gap-1.5 mt-1.5">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 text-[11px] tracking-[0.06em] py-1.5 bg-stone-800 hover:bg-stone-700 text-white rounded-lg transition-all duration-200 disabled:opacity-40"
              >
                {adding ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => { setInputOpen(false); setError(''); }}
                className="text-[11px] px-3 py-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-all duration-200"
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
              ? 'text-stone-800 bg-stone-100'
              : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
          }`}
        >
          <span className="text-[13px] tracking-[0.02em]">すべて</span>
          {totalUnread > 0 && (
            <span className="text-[11px] text-stone-400 tabular-nums">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>

        {feeds.length > 0 && (
          <div className="mx-4 my-2">
            <div className="border-t border-stone-100" />
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
                  ? 'text-stone-800 bg-stone-100'
                  : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
              }`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="text-[13px] tracking-[0.02em] truncate flex-1">{feed.title || feed.url}</span>
              <span className="flex items-center gap-1 ml-1 flex-shrink-0">
                {count > 0 && (
                  <span className="text-[11px] text-stone-400 tabular-nums">{count > 99 ? '99+' : count}</span>
                )}
                <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <button
                    onClick={(e) => deleteFeed(feed.id, e)}
                    className="p-0.5 text-stone-300 hover:text-rose-400 transition-colors duration-150"
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
      <div className="px-3 py-2.5 border-t border-stone-100 flex items-center gap-2">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-stone-200 flex-shrink-0" />
        )}
        <span className="text-[11px] text-stone-400 truncate flex-1">{user.name}</span>
        <button
          onClick={logout}
          className="text-stone-300 hover:text-stone-500 transition-colors duration-200 flex-shrink-0"
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

