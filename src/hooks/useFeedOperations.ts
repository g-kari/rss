'use client';

import { useRef, useState } from 'react';
import type { Feed } from '../types';

interface Callbacks {
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
}

export function useFeedOperations({ onFeedAdded, onFeedDeleted, onFeedRenamed, onFeedsImported }: Callbacks) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addFeed(url: string, onSuccess: () => void) {
    if (!url.trim()) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error ?? 'Failed to add feed');
        return;
      }
      const feed = (await res.json()) as Feed;
      onSuccess();
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
    const updated = (await res.json()) as Feed;
    onFeedRenamed(updated);
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
        const data = (await res.json()) as { error: string };
        setError(data.error ?? 'インポートに失敗しました');
        return;
      }
      const data = (await res.json()) as { added: number; skipped: number };
      if (data.added > 0) {
        const feedsRes = await fetch('/api/feeds');
        if (feedsRes.ok) {
          const allFeeds = (await feedsRes.json()) as Feed[];
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

  function clearError() {
    setError('');
  }

  return { adding, error, importing, fileInputRef, addFeed, deleteFeed, renameFeed, handleImportFile, clearError };
}
