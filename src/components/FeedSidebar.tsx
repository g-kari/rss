import { useState, useEffect, useCallback } from 'react';
import type { Feed } from '../types';

interface Props {
  selectedFeedId: string | null;
  onSelectFeed: (id: string | null) => void;
}

export default function FeedSidebar({ selectedFeedId, onSelectFeed }: Props) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const loadFeeds = useCallback(async () => {
    const res = await fetch('/api/feeds');
    setFeeds(await res.json());
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

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
      setNewUrl('');
      await loadFeeds();
    } catch {
      setError('Network error');
    } finally {
      setAdding(false);
    }
  }

  async function deleteFeed(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/feeds/${id}`, { method: 'DELETE' });
    if (selectedFeedId === id) onSelectFeed(null);
    await loadFeeds();
  }

  async function refreshFeed(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/feeds/${id}/refresh`, { method: 'POST' });
    await loadFeeds();
  }

  const totalUnread = feeds.reduce((sum, f) => sum + (f.unread_count ?? 0), 0);

  return (
    <div className="w-64 flex-shrink-0 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold mb-3 text-white">RSS Reader</h1>
        <form onSubmit={addFeed} className="space-y-2">
          <input
            type="url"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://example.com/feed"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={adding}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded px-3 py-1.5 text-sm font-medium transition-colors"
          >
            {adding ? '追加中...' : '+ フィード追加'}
          </button>
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </form>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <button
          onClick={() => onSelectFeed(null)}
          className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center rounded mx-1 ${
            selectedFeedId === null
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-800 text-gray-300'
          }`}
        >
          <span>すべて</span>
          {totalUnread > 0 && (
            <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
              {totalUnread}
            </span>
          )}
        </button>

        {feeds.map((feed) => (
          <div
            key={feed.id}
            onClick={() => onSelectFeed(feed.id)}
            className={`group flex items-center px-3 py-2 text-sm rounded mx-1 mt-0.5 cursor-pointer ${
              selectedFeedId === feed.id
                ? 'bg-blue-600 text-white'
                : 'hover:bg-gray-800 text-gray-300'
            }`}
          >
            <span className="flex-1 truncate">{feed.title || feed.url}</span>
            {(feed.unread_count ?? 0) > 0 && selectedFeedId !== feed.id && (
              <span className="bg-gray-600 text-gray-200 text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center mr-1">
                {feed.unread_count}
              </span>
            )}
            <span className="opacity-0 group-hover:opacity-100 flex gap-1 ml-1 flex-shrink-0">
              <button
                onClick={(e) => refreshFeed(feed.id, e)}
                className="text-gray-400 hover:text-blue-400 px-0.5"
                title="更新"
              >
                ↻
              </button>
              <button
                onClick={(e) => deleteFeed(feed.id, e)}
                className="text-gray-400 hover:text-red-400 px-0.5"
                title="削除"
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </nav>
    </div>
  );
}
