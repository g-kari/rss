"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { contentLruCache } from "../lib/lru-cache";
import { apiFetch } from "../lib/api-fetch";
import { isAbortError } from "../lib/fetch";
import { STORAGE_KEYS, loadJson, saveJson } from "../lib/storage";
import type { OgpData } from "../types";

/** OGP キャッシュの最大エントリ数（useOgpCache.ts の MAX_OGP_CACHE_SIZE と合わせる） */
const OGP_CACHE_MAX_ENTRIES = 2000;

/**
 * `useArticleContent` フックの戻り値型。
 * 記事全文コンテンツのフェッチ状態・キャッシュ・OGP画像解決結果を保持する。
 */
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

/**
 * 記事の全文コンテンツ取得とOGP画像解決を管理するフック。
 * LRUキャッシュから先読みし、キャッシュミス時は /api/content にフェッチする。
 * 記事切り替え時には進行中のフェッチを AbortController で中断してリークを防ぐ。
 *
 * @param articleId - 現在表示中の記事ID（キャッシュキー・ステートタグとして使用）
 * @param articleLink - 記事の元URL（全文取得・OGP解決のターゲット）
 * @param articleOgImage - RSSフィードに含まれるOGP画像URL（あれば動的解決をスキップ）
 * @returns コンテンツ取得状態と全文フェッチ関数、OGP画像URL
 */
export function useArticleContent(
  articleId: string | undefined,
  articleLink: string | undefined,
  articleOgImage: string | undefined | null,
): ArticleContentState {
  const cachedContent = useMemo(
    () => (articleId ? (contentLruCache.get(articleId) ?? null) : null),
    [articleId],
  );
  // { id, content } でタグ付けすることで、前の記事の fetchedContent が
  // 記事切り替え直後の render に漏れ込むのを防ぐ（stale content リーク対策）
  const [fetchedState, setFetchedState] = useState<{ id: string; content: string } | null>(null);
  const fetchedContent =
    fetchedState !== null && fetchedState.id === articleId ? fetchedState.content : null;
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [resolvedOgImage, setResolvedOgImage] = useState<string | null>(null);
  // fetchFullContent の進行中フェッチを中断するための ref
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  // 記事が変わったらフェッチ状態をリセット（進行中のフェッチも中断）
  // fetchFullContent の finally ブロックは ref が null になっているため setFetching(false) を
  // 呼ばない設計になっており、ここで明示的にリセットする必要がある。
  // fetchedContent は fetchedState.id との照合で自動的に null 扱いになるため個別リセット不要。
  useEffect(() => {
    fetchAbortControllerRef.current?.abort();
    fetchAbortControllerRef.current = null;
    setFetchError("");
    setFetching(false);
  }, [articleId]);

  // OGP 画像の動的解決
  // AbortController で記事切り替え時に前の記事のフェッチを中断し、
  // 古い OGP 画像が新しい記事に適用されるレースコンディションを防ぐ
  useEffect(() => {
    setResolvedOgImage(null);
    if (!articleLink || articleOgImage) return;
    // useOgpCache が localStorage に保存済みのキャッシュを先に確認する（重複フェッチ防止）
    const ogpCache = loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {});
    if (ogpCache[articleLink]) {
      setResolvedOgImage(ogpCache[articleLink]);
      return;
    }
    const controller = new AbortController();
    apiFetch(`/api/ogp?url=${encodeURIComponent(articleLink)}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<OgpData>;
      })
      .then(({ image }) => {
        if (!image) return;
        setResolvedOgImage(image);
        // useOgpCache と同じ localStorage に保存して、直接開いた記事でも
        // 次回以降 /api/ogp を再フェッチしないようにする。
        // 上限超過時は古いキーから切り詰める（useOgpCache と同じ挙動）。
        const current = loadJson<Record<string, string>>(STORAGE_KEYS.OGP_CACHE, {});
        const next = { ...current, [articleLink]: image };
        const keys = Object.keys(next);
        saveJson(
          STORAGE_KEYS.OGP_CACHE,
          keys.length > OGP_CACHE_MAX_ENTRIES
            ? Object.fromEntries(keys.slice(-OGP_CACHE_MAX_ENTRIES).map((k) => [k, next[k]]))
            : next,
        );
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
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
          setFetchedState({ id: articleId ?? "", content: data.content });
          onFetched?.(data.content);
        } else {
          setFetchError(data.error ?? "取得できませんでした");
        }
      } catch (err) {
        if (isAbortError(err)) return;
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
