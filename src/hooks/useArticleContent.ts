"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { contentLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";

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
    () => (articleId ? (contentLruCache.get(articleId) ?? null) : null),
    [articleId],
  );
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [resolvedOgImage, setResolvedOgImage] = useState<string | null>(null);
  // fetchFullContent の進行中フェッチを中断するための ref
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  // 記事が変わったらフェッチ状態をリセット（進行中のフェッチも中断）
  useEffect(() => {
    fetchAbortControllerRef.current?.abort();
    fetchAbortControllerRef.current = null;
    setFetchedContent(null);
    setFetchError("");
  }, [articleId]);

  // OGP 画像の動的解決
  // AbortController で記事切り替え時に前の記事のフェッチを中断し、
  // 古い OGP 画像が新しい記事に適用されるレースコンディションを防ぐ
  useEffect(() => {
    setResolvedOgImage(null);
    if (!articleLink || articleOgImage) return;
    const controller = new AbortController();
    apiFetch(`/api/ogp?url=${encodeURIComponent(articleLink)}`, { signal: controller.signal })
      .then((r) => r.json() as Promise<{ image?: string }>)
      .then(({ image }) => {
        if (image) setResolvedOgImage(image);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [articleId, articleLink, articleOgImage]);

  const fetchFullContent = useCallback(
    async (onFetched?: (content: string) => void) => {
      if (!articleLink) return;
      // 前の全文フェッチが進行中なら中断
      fetchAbortControllerRef.current?.abort();
      const controller = new AbortController();
      fetchAbortControllerRef.current = controller;
      setFetching(true);
      setFetchError("");
      try {
        const res = await apiFetch(`/api/content?url=${encodeURIComponent(articleLink)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { content?: string; error?: string };
        if (data.content) {
          if (articleId) contentLruCache.set(articleId, data.content);
          setFetchedContent(data.content);
          onFetched?.(data.content);
        } else {
          setFetchError(data.error ?? "取得できませんでした");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setFetchError("ネットワークエラー");
      } finally {
        if (fetchAbortControllerRef.current === controller) {
          fetchAbortControllerRef.current = null;
          setFetching(false);
        }
      }
    },
    [articleId, articleLink],
  );

  const storedContent = fetchedContent ?? cachedContent;

  return { storedContent, fetching, fetchError, fetchFullContent, resolvedOgImage };
}
