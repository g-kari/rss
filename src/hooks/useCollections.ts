"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, apiFetchJson } from "@/lib/api-fetch";
import type { Collection, UserProfile } from "@/types";

export interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  renameCollection: (id: string, name: string) => Promise<Collection | { error: string }>;
  deleteCollection: (id: string) => Promise<boolean>;
  addArticleToCollection: (collectionId: string, articleId: string) => Promise<void>;
  removeArticleFromCollection: (collectionId: string, articleId: string) => Promise<void>;
}

function sortByOrder(list: Collection[]): Collection[] {
  return [...list].sort((a, b) => a.order - b.order);
}

export function useCollections(user: UserProfile | null | undefined): CollectionsState {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setCollections([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetchJson<Collection[]>("/api/collections")
      .then((data) => {
        if (!cancelled) setCollections(sortByOrder(data));
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  const deleteCollection = useCallback(async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/collections/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    setCollections((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

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
        console.error(err);
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId
              ? { ...c, articleIds: c.articleIds.filter((id) => id !== articleId) }
              : c,
          ),
        );
      }
    },
    [],
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
        console.error(err);
        setCollections((prev) =>
          prev.map((c) =>
            c.id === collectionId ? { ...c, articleIds: [...c.articleIds, articleId] } : c,
          ),
        );
      }
    },
    [],
  );

  return {
    collections,
    loading,
    createCollection,
    renameCollection,
    deleteCollection,
    addArticleToCollection,
    removeArticleFromCollection,
  };
}
