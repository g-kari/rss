"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { isAbortError } from "../lib/fetch";
import { sortByOrder } from "../lib/sort-utils";
import type { Collection, UserProfile } from "../types";
import { useSyncedRef } from "./useSyncedRef";

export interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  /** コレクション取得失敗時のエラー（null = エラーなし） */
  loadError: Error | null;
  /** コレクション再取得を試みる */
  retryCollections: () => void;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  renameCollection: (id: string, name: string) => Promise<Collection | { error: string }>;
  deleteCollection: (id: string) => Promise<boolean>;
  addArticleToCollection: (collectionId: string, articleId: string) => Promise<void>;
  removeArticleFromCollection: (collectionId: string, articleId: string) => Promise<void>;
}

export function useCollections(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): CollectionsState {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const onErrorRef = useSyncedRef(onError);

  useEffect(() => {
    if (!user) {
      setCollections([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    apiFetchJson<Collection[]>("/api/collections", { signal: controller.signal })
      .then((data) => {
        setCollections(sortByOrder(data));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        devError(err);
        setLoadError(err instanceof Error ? err : new Error(String(err)));
        onErrorRef.current?.("コレクションの読み込みに失敗しました");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onErrorRef は ref 経由・retryCount は再フェッチトリガー
  }, [user, retryCount]);

  const retryCollections = useCallback(() => {
    setLoadError(null);
    setRetryCount((n) => n + 1);
  }, []);

  const createCollection = useCallback(
    async (name: string): Promise<Collection | { error: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "コレクション名を入力してください" };
      const res = await apiFetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (data.code === "DUPLICATE_NAME") return { error: "同名のコレクションが既に存在します" };
        if (data.code === "COLLECTION_LIMIT_EXCEEDED")
          return { error: "コレクションの上限に達しました" };
        return { error: data.error ?? "コレクションの作成に失敗しました" };
      }
      const created = (await res.json()) as Collection;
      setCollections((prev) => sortByOrder([...prev, created]));
      return created;
    },
    [],
  );

  const renameCollection = useCallback(
    async (id: string, name: string): Promise<Collection | { error: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "コレクション名を入力してください" };
      const res = await apiFetch(`/api/collections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (data.code === "DUPLICATE_NAME") return { error: "同名のコレクションが既に存在します" };
        return { error: data.error ?? "コレクション名の変更に失敗しました" };
      }
      const updated = (await res.json()) as Collection;
      setCollections((prev) => sortByOrder(prev.map((c) => (c.id === updated.id ? updated : c))));
      return updated;
    },
    [],
  );

  const deleteCollection = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await apiFetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) {
        onError?.("コレクションの削除に失敗しました");
        return false;
      }
      setCollections((prev) => prev.filter((c) => c.id !== id));
      return true;
    },
    [onError],
  );

  const addArticleToCollection = useCallback(
    async (collectionId: string, articleId: string): Promise<void> => {
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId && !c.articleIds.includes(articleId)
            ? { ...c, articleIds: [...c.articleIds, articleId] }
            : c,
        ),
      );
      try {
        await apiFetchJson<Collection>(`/api/collections/${collectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addArticleIds: [articleId] }),
        });
      } catch (err) {
        devError(err);
        onError?.("コレクションへの追加に失敗しました");
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId
              ? { ...c, articleIds: c.articleIds.filter((id) => id !== articleId) }
              : c,
          ),
        );
      }
    },
    [onError],
  );

  const removeArticleFromCollection = useCallback(
    async (collectionId: string, articleId: string): Promise<void> => {
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, articleIds: c.articleIds.filter((id) => id !== articleId) }
            : c,
        ),
      );
      try {
        await apiFetchJson<Collection>(`/api/collections/${collectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ removeArticleIds: [articleId] }),
        });
      } catch (err) {
        devError(err);
        onError?.("コレクションからの削除に失敗しました");
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId ? { ...c, articleIds: [...c.articleIds, articleId] } : c,
          ),
        );
      }
    },
    [onError],
  );

  return {
    collections,
    loading,
    loadError,
    retryCollections,
    createCollection,
    renameCollection,
    deleteCollection,
    addArticleToCollection,
    removeArticleFromCollection,
  };
}
