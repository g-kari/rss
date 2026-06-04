"use client";

import { useCallback, useEffect } from "react";
import { apiFetch, apiFetchJson, tryParseErrorBody } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { sortByOrder } from "../lib/sort-utils";
import type { Collection, UserProfile } from "../types";
import { useAsyncFetch } from "./useAsyncFetch";
import { useSyncedRef } from "./useSyncedRef";

export interface CollectionsState {
  collections: Collection[];
  loading: boolean;
  /** コレクション取得失敗時のエラー（null = エラーなし） */
  loadError: string | null;
  /** コレクション再取得を試みる */
  retryCollections: () => void;
  createCollection: (name: string) => Promise<Collection | { error: string }>;
  renameCollection: (id: string, name: string) => Promise<Collection | { error: string }>;
  deleteCollection: (id: string) => Promise<boolean>;
  addArticleToCollection: (collectionId: string, articleId: string) => Promise<void>;
  /**
   * 複数の記事 ID を一括で collection に追加する (案 B snapshot)。
   * API 側 (PATCH /api/collections/:id) が `addArticleIds: string[]` を natively 受けるため
   * 1 リクエストで完結 (個別 addArticleToCollection の N 回直列呼出より rate limit / latency が有利)。
   * サーバー側で既存 ID は dedup される。
   */
  addArticlesToCollection: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
  removeArticleFromCollection: (collectionId: string, articleId: string) => Promise<void>;
}

/**
 * 任意 URL コレクション (`/api/collections`) の取得・操作を集約する hook。CRUD + ロード state + エラー復帰用 refetch を提供。
 *
 * #975: 初期フェッチ部の loading + AbortController + try/finally ボイラープレートを `useAsyncFetch<T>` に集約。
 * CRUD 部 (create / rename / delete / addArticle / removeArticle 等) は楽観的更新で `setData` を直接使う。
 *
 * @returns `CollectionsState` (`{ collections, loading, loadError, retryCollections, createCollection, ... }`)
 */
export function useCollections(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): CollectionsState {
  const {
    data: collectionsData,
    loading,
    error: loadError,
    refetch: retryCollections,
    setData: setCollectionsRaw,
  } = useAsyncFetch<Collection[]>(user ? "/api/collections" : null, {
    auto: true,
    deps: [user],
    initialData: [],
    transform: (raw) => sortByOrder(raw as Collection[]),
    formatError: (err) => {
      devError(err);
      return "コレクションの読み込みに失敗しました";
    },
    onError,
  });

  // user が null になったら明示的に [] にリセット (既存挙動互換)
  useEffect(() => {
    if (!user) setCollectionsRaw([]);
  }, [user, setCollectionsRaw]);

  const collections = collectionsData ?? [];
  // addArticlesToCollection が「今回追加した id」を updater 外で同期計算するための最新参照
  const collectionsRef = useSyncedRef(collections);

  /** 戻り値が常に非 null になる型安全な setter */
  const setCollections = useCallback(
    (updater: Collection[] | ((prev: Collection[]) => Collection[])): void => {
      setCollectionsRaw((prev) => {
        const base = prev ?? [];
        return typeof updater === "function" ? updater(base) : updater;
      });
    },
    [setCollectionsRaw],
  );

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
        const data = await tryParseErrorBody(res);
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
        const data = await tryParseErrorBody(res);
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

  const addArticlesToCollection = useCallback(
    async (collectionId: string, articleIds: readonly string[]): Promise<void> => {
      // 空配列は no-op (API 呼出も skip)
      if (articleIds.length === 0) return;
      const idsArr = Array.from(articleIds);
      // #1087: 「今回新規に追加する id」を updater 外で同期計算する (React 18 の遅延 updater で
      // outer 変数代入が rollback 時点に未確定になる罠を回避、Strict Mode 二重実行にも安全)。
      // target が local state に無い場合は addedIds 空 (optimistic は no-op、rollback も不要だが
      // PATCH は送る、既存挙動互換)。
      const target = collectionsRef.current.find((c) => c.id === collectionId);
      const existing = new Set(target?.articleIds ?? []);
      const addedIds = target ? idsArr.filter((aid) => !existing.has(aid)) : [];

      // optimistic update: 既存 articleIds と重複しないものだけ追加 (最新 state に適用)
      setCollections((prev) =>
        prev.map((c) => {
          if (c.id !== collectionId) return c;
          const set = new Set(c.articleIds);
          const merged = [...c.articleIds];
          for (const aid of idsArr) {
            if (!set.has(aid)) {
              merged.push(aid);
              set.add(aid);
            }
          }
          return { ...c, articleIds: merged };
        }),
      );
      try {
        // API は addArticleIds: string[] を natively 受ける + サーバー側で dedup されるため
        // 1 リクエストで完結 (個別 PATCH を直列呼出するより rate limit / latency 有利)
        await apiFetchJson<Collection>(`/api/collections/${collectionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addArticleIds: idsArr }),
        });
      } catch (err) {
        devError(err);
        onError?.("コレクションへの一括追加に失敗しました");
        // 差分 rollback: 今回追加した addedIds だけを最新 state から除去する。
        // 旧実装は articleIds 配列を snapshot で丸ごと復元していたため、一括追加の PATCH
        // in-flight 中に確定した別の追加/削除 (addArticleToCollection / removeArticleFromCollection)
        // が巻き戻されて消失していた。差分復元で window 中の別操作は保持する。
        if (addedIds.length > 0) {
          const addedSet = new Set(addedIds);
          setCollections((cur) =>
            cur.map((c) =>
              c.id === collectionId
                ? { ...c, articleIds: c.articleIds.filter((id) => !addedSet.has(id)) }
                : c,
            ),
          );
        }
        throw err;
      }
    },
    [onError, collectionsRef],
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
    addArticlesToCollection,
    removeArticleFromCollection,
  };
}
