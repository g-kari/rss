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
  const [inputOpen, setInputOpen] = useState(false);

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
      setInputOpen(false);
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
    <aside className="flex flex-col h-full border-r border-white/[0.06] bg-[#0f1117]/80 backdrop-blur-sm">
      {/* ロゴ */}
      <div className="px-4 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7M6 17a1 1 0 110 2 1 1 0 010-2z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-zinc-200 tracking-tight">RSS</span>
          </div>
          <button
            onClick={() => setInputOpen((v) => !v)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all duration-150 active:scale-95"
            title="フィードを追加"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* フィード追加フォーム */}
        {inputOpen && (
          <form onSubmit={addFeed} className="mt-3 space-y-2">
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://example.com/feed"
              autoFocus
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition-all"
            />
            {error && <p className="text-red-400 text-[11px]">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={adding}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors active:scale-95"
              >
                {adding ? '追加中...' : '追加'}
              </button>
              <button
                type="button"
                onClick={() => { setInputOpen(false); setError(''); }}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/[0.05] transition-colors"
              >
                キャンセル
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        <p className="px-2 pb-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
          すべて
        </p>

        <button
          onClick={() => onSelectFeed(null)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
            selectedFeedId === null
              ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
          }`}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
          </svg>
          <span className="flex-1 text-left truncate text-xs font-medium">すべての記事</span>
          {totalUnread > 0 && (
            <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-400/10 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>

        {feeds.length > 0 && (
          <p className="px-2 pt-3 pb-1.5 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">
            フィード
          </p>
        )}

        {feeds.map((feed) => (
          <div
            key={feed.id}
            onClick={() => onSelectFeed(feed.id)}
            className={`group flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
              selectedFeedId === feed.id
                ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
                : (feed.unread_count ?? 0) > 0
                ? 'text-zinc-300 hover:text-zinc-100 hover:bg-white/[0.05]'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.05] opacity-60'
            }`}
          >
            {/* 未読ドット */}
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${
                (feed.unread_count ?? 0) > 0 ? 'bg-indigo-400' : 'bg-transparent'
              }`}
            />
            <span className="flex-1 text-xs font-medium truncate">
              {feed.title || feed.url}
            </span>
            {(feed.unread_count ?? 0) > 0 && selectedFeedId !== feed.id && (
              <span className="text-[10px] font-semibold text-zinc-500 min-w-[18px] text-right">
                {feed.unread_count}
              </span>
            )}
            {/* アクションボタン（hover時のみ） */}
            <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
              <button
                onClick={(e) => refreshFeed(feed.id, e)}
                className="p-0.5 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
                title="更新"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115 0M20 15a9 9 0 01-15 0" />
                </svg>
              </button>
              <button
                onClick={(e) => deleteFeed(feed.id, e)}
                className="p-0.5 rounded text-zinc-600 hover:text-red-400 transition-colors"
                title="削除"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
