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
    await fetch(`/api/feeds/${id}`, { method: 'DELETE' });
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
    <aside className="flex flex-col min-h-0 overflow-hidden border-r border-zinc-800 bg-zinc-900">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-200">RSS</span>
        <button
          onClick={() => setInputOpen((v) => !v)}
          className="text-zinc-600 hover:text-zinc-300 transition-colors"
          title="フィードを追加"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {inputOpen && (
        <div className="px-3 py-2 border-b border-zinc-800">
          <form onSubmit={addFeed} className="space-y-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/feed"
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-1.5">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded px-2 py-1.5 text-xs text-zinc-200 transition-colors"
              >
                {adding ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => { setInputOpen(false); setError(''); }}
                className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors"
              >
                ×
              </button>
            </div>
          </form>
        </div>
      )}

      <nav className="flex-1 min-h-0 overflow-y-auto py-1">
        <button
          onClick={() => onSelectFeed(null)}
          className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors ${
            selectedFeedId === null
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
          }`}
        >
          <span>すべて</span>
          {totalUnread > 0 && (
            <span className="text-xs text-zinc-500">{totalUnread > 99 ? '99+' : totalUnread}</span>
          )}
        </button>

        {feeds.length > 0 && (
          <div className="mt-3 px-3 mb-1">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">フィード</p>
          </div>
        )}

        {feeds.map((feed) => {
          const count = unreadCount(feed.id);
          return (
            <div
              key={feed.id}
              onClick={() => onSelectFeed(feed.id)}
              className={`group flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors ${
                selectedFeedId === feed.id
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
              }`}
            >
              <span className={`text-[13px] truncate flex-1 ${count > 0 ? 'text-zinc-200' : ''}`}>
                {feed.title || feed.url}
              </span>
              <span className="flex items-center gap-1 ml-1 flex-shrink-0">
                {count > 0 && (
                  <span className="text-xs text-zinc-500">{count}</span>
                )}
                <span className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                  <button
                    onClick={(e) => deleteFeed(feed.id, e)}
                    className="p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
                    title="削除"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </span>
            </div>
          );
        })}
      </nav>

      {/* ユーザー情報 + ログアウト */}
      <div className="px-3 py-2 border-t border-zinc-800 flex items-center gap-2">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-5 h-5 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-zinc-700 flex-shrink-0" />
        )}
        <span className="text-xs text-zinc-500 truncate flex-1">{user.name}</span>
        <button
          onClick={logout}
          className="text-zinc-700 hover:text-zinc-400 transition-colors flex-shrink-0"
          title="ログアウト"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
