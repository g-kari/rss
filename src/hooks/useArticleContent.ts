'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { contentLruCache } from '../lib/lru-cache';

interface ArticleContentState {
  /** フェッチ済み or キャッシュ済みのコンテンツ（なければ null） */
  storedContent: string | null;
  fetching: boolean;
  fetchError: string;
  /** 全文取得。成功時は onFetched コールバックを呼ぶ（AI 連携用） */
  fetchFullContent: (onFetched?: (content: string) => void) => Promise<void>;
  /** OGP 画像がない場合に /api/ogp から動的解決した URL */
  resolvedOgImage: string | null;
}

export function useArticleContent(
  articleId: string | undefined,
  articleLink: string | undefined,
  articleOgImage: string | undefined | null,
): ArticleContentState {
  const cachedContent = useMemo(
    () => (articleId ? contentLruCache.get(articleId) ?? null : null),
    [articleId],
  );
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [resolvedOgImage, setResolvedOgImage] = useState<string | null>(null);

  // 記事が変わったらフェッチ状態をリセット
  useEffect(() => {
    setFetchedContent(null);
    setFetchError('');
  }, [articleId]);

  // OGP 画像の動的解決
  useEffect(() => {
    setResolvedOgImage(null);
    if (!articleLink || articleOgImage) return;
    fetch(`/api/ogp?url=${encodeURIComponent(articleLink)}`)
      .then((r) => r.json() as Promise<{ image?: string }>)
      .then(({ image }) => { if (image) setResolvedOgImage(image); })
      .catch(() => {});
  }, [articleId, articleLink, articleOgImage]);

  const fetchFullContent = useCallback(async (onFetched?: (content: string) => void) => {
    if (!articleLink) return;
    setFetching(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/content?url=${encodeURIComponent(articleLink)}`);
      const data = await res.json() as { content?: string; error?: string };
      if (data.content) {
        if (articleId) contentLruCache.set(articleId, data.content);
        setFetchedContent(data.content);
        onFetched?.(data.content);
      } else {
        setFetchError(data.error ?? '取得できませんでした');
      }
    } catch {
      setFetchError('ネットワークエラー');
    } finally {
      setFetching(false);
    }
  }, [articleId, articleLink]);

  const storedContent = fetchedContent ?? cachedContent;

  return { storedContent, fetching, fetchError, fetchFullContent, resolvedOgImage };
}
