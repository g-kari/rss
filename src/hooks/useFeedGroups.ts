"use client";

import { useCallback, useEffect } from "react";
import type { FeedGroup, UserProfile } from "../types";
import { apiFetch, apiFetchJson, tryParseErrorBody } from "../lib/api-fetch";
import { devError } from "../lib/dev-log";
import { sortByOrder } from "../lib/sort-utils";
import { useAsyncFetch } from "./useAsyncFetch";
import { useSyncedRef } from "./useSyncedRef";

/** `useFeedGroups` の戻り値型 */
interface FeedGroupsState {
  groups: FeedGroup[];
  loading: boolean;
  /** 作成成功時は新規 FeedGroup、失敗時は `{ error: string }` を返す */
  createGroup: (name: string) => Promise<FeedGroup | { error: string }>;
  renameGroup: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  setCollapsed: (id: string, collapsed: boolean) => Promise<void>;
  /** グループのミュート状態を切り替える。ミュート中はグループ内のフィード記事が一覧から除外される */
  setMuted: (id: string, muted: boolean) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
  /**
   * 表示順を 1 つ上/下へ移動する。隣接グループと order を入れ替える。
   * 先頭での "up" や末尾での "down" は no-op。
   */
  reorderGroup: (id: string, direction: "up" | "down") => Promise<void>;
}

/**
 * feed-groups の取得・CRUD を担う hook。
 * ログイン後に `/api/feed-groups` を取得し、サーバー側の応答を元にローカル state を更新する。
 * エラーハンドリングは呼び出し元（FeedSidebar 等）が `{ error }` メッセージを使って UI 表示する想定。
 *
 * #839: 取得部の loading + AbortController + try/finally ボイラープレートを `useAsyncFetch<T>` に集約。
 * CRUD 部 (create / rename / setCollapsed / setMuted / delete / reorder) は楽観的更新で `setData` を直接使う。
 *
 * @param user - ログイン中のユーザー（`null`/`undefined` のときは fetch しない）
 */
export function useFeedGroups(
  user: UserProfile | null | undefined,
  onError?: (msg: string) => void,
): FeedGroupsState {
  const {
    data: groupsData,
    loading,
    setData: setGroupsRaw,
  } = useAsyncFetch<FeedGroup[]>(user ? "/api/feed-groups" : null, {
    auto: true,
    deps: [user],
    initialData: [],
    transform: (raw) => sortByOrder(raw as FeedGroup[]),
    formatError: (err) => {
      devError(err);
      return "フィードグループの読み込みに失敗しました";
    },
    onError,
  });

  // user が null になったら明示的に [] にリセット (既存挙動互換)
  useEffect(() => {
    if (!user) setGroupsRaw([]);
  }, [user, setGroupsRaw]);

  const groups = groupsData ?? [];
  // reorderGroup が swap 対象を updater 外で同期計算するための最新 groups 参照
  const groupsRef = useSyncedRef(groups);

  /** 戻り値が常に非 null になる型安全な setter */
  const setGroups = useCallback(
    (updater: FeedGroup[] | ((prev: FeedGroup[]) => FeedGroup[])): void => {
      setGroupsRaw((prev) => {
        const base = prev ?? [];
        return typeof updater === "function" ? updater(base) : updater;
      });
    },
    [setGroupsRaw],
  );

  const createGroup = useCallback(
    async (name: string): Promise<FeedGroup | { error: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "グループ名を入力してください" };
      const res = await apiFetch("/api/feed-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await tryParseErrorBody(res);
        if (data.code === "DUPLICATE_NAME") return { error: "同名のグループが既に存在します" };
        if (data.code === "FEED_GROUP_LIMIT_EXCEEDED")
          return { error: "グループの上限に達しました" };
        return { error: data.error ?? "グループの作成に失敗しました" };
      }
      const created = (await res.json()) as FeedGroup;
      setGroups((prev) => sortByOrder([...prev, created]));
      return created;
    },
    [setGroups],
  );

  const renameGroup = useCallback(
    async (id: string, name: string): Promise<FeedGroup | { error: string }> => {
      const trimmed = name.trim();
      if (!trimmed) return { error: "グループ名を入力してください" };
      const res = await apiFetch(`/api/feed-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await tryParseErrorBody(res);
        if (data.code === "DUPLICATE_NAME") return { error: "同名のグループが既に存在します" };
        return { error: data.error ?? "グループ名の変更に失敗しました" };
      }
      const updated = (await res.json()) as FeedGroup;
      setGroups((prev) => sortByOrder(prev.map((g) => (g.id === updated.id ? updated : g))));
      return updated;
    },
    [setGroups],
  );

  const setCollapsed = useCallback(
    async (id: string, collapsed: boolean): Promise<void> => {
      // 楽観的更新
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, collapsed } : g)));
      try {
        await apiFetchJson<FeedGroup>(`/api/feed-groups/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collapsed }),
        });
      } catch (err) {
        devError(err);
        onError?.("グループの折りたたみ変更に失敗しました");
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, collapsed: !collapsed } : g)));
      }
    },
    [onError, setGroups],
  );

  const setMuted = useCallback(
    async (id: string, muted: boolean): Promise<void> => {
      // 楽観的更新
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, muted } : g)));
      try {
        await apiFetchJson<FeedGroup>(`/api/feed-groups/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ muted }),
        });
      } catch (err) {
        devError(err);
        onError?.("グループのミュート変更に失敗しました");
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, muted: !muted } : g)));
      }
    },
    [onError, setGroups],
  );

  const deleteGroup = useCallback(
    async (id: string): Promise<boolean> => {
      const res = await apiFetch(`/api/feed-groups/${id}`, { method: "DELETE" });
      if (!res.ok) {
        onError?.("グループの削除に失敗しました");
        return false;
      }
      setGroups((prev) => prev.filter((g) => g.id !== id));
      return true;
    },
    [onError, setGroups],
  );

  const reorderGroup = useCallback(
    async (id: string, direction: "up" | "down"): Promise<void> => {
      // swap 対象は groupsRef から updater 外で同期計算する (React 18 の遅延 updater で
      // outer 変数代入がチェック時点で未確定になる罠を回避、Strict Mode の二重実行にも安全)。
      const sorted = sortByOrder(groupsRef.current);
      const idx = sorted.findIndex((g) => g.id === id);
      if (idx === -1) return;
      const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
      if (neighborIdx < 0 || neighborIdx >= sorted.length) return;
      const self = sorted[idx];
      const neighbor = sorted[neighborIdx];
      if (!self || !neighbor) return;
      const selfId = self.id;
      const neighborId = neighbor.id;
      const selfOrder = self.order;
      const neighborOrder = neighbor.order;

      const swap = (g: FeedGroup): FeedGroup => {
        if (g.id === selfId) return { ...g, order: neighborOrder };
        if (g.id === neighborId) return { ...g, order: selfOrder };
        return g;
      };
      // 楽観的更新 (最新 state に対して swap を適用)
      setGroups((prev) => sortByOrder(prev.map(swap)));
      const orderedIds = sortByOrder(groupsRef.current.map(swap)).map((g) => g.id);

      try {
        await apiFetchJson<FeedGroup[]>("/api/feed-groups/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        });
      } catch (err) {
        devError(err);
        onError?.("グループの並び替えに失敗しました");
        // #1087: rollback は swap した 2 group の order のみを元値に戻す差分復元。
        // 旧実装は `setGroups(sortByOrder(snapshot))` で全 groups を丸ごと復元していたため、
        // reorder の PATCH in-flight 中に確定した別 group の rename/collapse/mute が巻き戻されて
        // 消失していた。差分復元で window 中の他フィールド変更 (他 group / 他フィールド) は保持する。
        setGroups((cur) =>
          sortByOrder(
            cur.map((g) => {
              if (g.id === selfId) return { ...g, order: selfOrder };
              if (g.id === neighborId) return { ...g, order: neighborOrder };
              return g;
            }),
          ),
        );
      }
    },
    [onError, setGroups, groupsRef],
  );

  return {
    groups,
    loading,
    createGroup,
    renameGroup,
    setCollapsed,
    setMuted,
    deleteGroup,
    reorderGroup,
  };
}
