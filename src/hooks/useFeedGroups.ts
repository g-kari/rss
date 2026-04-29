"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedGroup, UserProfile } from "../types";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import { useToast } from "../contexts/ToastContext";

/** `useFeedGroups` の戻り値型 */
export interface FeedGroupsState {
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

function sortByOrder(groups: FeedGroup[]): FeedGroup[] {
  return [...groups].sort((a, b) => a.order - b.order);
}

/**
 * feed-groups の取得・CRUD を担う hook。
 * ログイン後に `/api/feed-groups` を取得し、サーバー側の応答を元にローカル state を更新する。
 * エラーハンドリングは呼び出し元（FeedSidebar 等）が `{ error }` メッセージを使って UI 表示する想定。
 *
 * @param user - ログイン中のユーザー（`null`/`undefined` のときは fetch しない）
 */
export function useFeedGroups(user: UserProfile | null | undefined): FeedGroupsState {
  const { showToast } = useToast();
  const [groups, setGroups] = useState<FeedGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetchJson<FeedGroup[]>("/api/feed-groups")
      .then((data) => {
        if (!cancelled) setGroups(sortByOrder(data));
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

  const createGroup = useCallback(async (name: string): Promise<FeedGroup | { error: string }> => {
    const trimmed = name.trim();
    if (!trimmed) return { error: "グループ名を入力してください" };
    const res = await apiFetch("/api/feed-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (data.code === "DUPLICATE_NAME") return { error: "同名のグループが既に存在します" };
      if (data.code === "FEED_GROUP_LIMIT_EXCEEDED") return { error: "グループの上限に達しました" };
      return { error: data.error ?? "グループの作成に失敗しました" };
    }
    const created = (await res.json()) as FeedGroup;
    setGroups((prev) => sortByOrder([...prev, created]));
    return created;
  }, []);

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
        const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
        if (data.code === "DUPLICATE_NAME") return { error: "同名のグループが既に存在します" };
        return { error: data.error ?? "グループ名の変更に失敗しました" };
      }
      const updated = (await res.json()) as FeedGroup;
      setGroups((prev) => sortByOrder(prev.map((g) => (g.id === updated.id ? updated : g))));
      return updated;
    },
    [],
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
        console.error(err);
        showToast("グループの折りたたみ変更に失敗しました");
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, collapsed: !collapsed } : g)));
      }
    },
    [showToast],
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
        console.error(err);
        showToast("グループのミュート変更に失敗しました");
        setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, muted: !muted } : g)));
      }
    },
    [showToast],
  );

  const deleteGroup = useCallback(async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/feed-groups/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    return true;
  }, []);

  const reorderGroup = useCallback(
    async (id: string, direction: "up" | "down"): Promise<void> => {
      // スナップショットを state updater 外で決定（楽観的更新はその後に別途 setGroups で適用）
      let self: FeedGroup | undefined;
      let neighbor: FeedGroup | undefined;
      setGroups((prev) => {
        const sorted = sortByOrder(prev);
        const idx = sorted.findIndex((g) => g.id === id);
        if (idx === -1) return prev;
        const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
        if (neighborIdx < 0 || neighborIdx >= sorted.length) return prev;
        self = sorted[idx];
        neighbor = sorted[neighborIdx];
        if (!self || !neighbor) return prev;
        const selfId = self.id;
        const neighborId = neighbor.id;
        const selfOrder = self.order;
        const neighborOrder = neighbor.order;
        return sortByOrder(
          prev.map((g) => {
            if (g.id === selfId) return { ...g, order: neighborOrder };
            if (g.id === neighborId) return { ...g, order: selfOrder };
            return g;
          }),
        );
      });
      if (!self || !neighbor) return;
      const selfSnapshot = self;
      const neighborSnapshot = neighbor;
      try {
        // 2 本 PATCH を順次送信。失敗時にどちらかのみ更新済みの状態になりうるため、
        // 失敗時はサーバーから再 fetch してローカル state を真実源に戻す。
        await apiFetchJson<FeedGroup>(`/api/feed-groups/${selfSnapshot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: neighborSnapshot.order }),
        });
        await apiFetchJson<FeedGroup>(`/api/feed-groups/${neighborSnapshot.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: selfSnapshot.order }),
        });
      } catch (err) {
        console.error(err);
        showToast("グループの並び替えに失敗しました");
        try {
          const data = await apiFetchJson<FeedGroup[]>("/api/feed-groups");
          setGroups(sortByOrder(data));
        } catch (fetchErr) {
          console.error(fetchErr);
          setGroups((prev) =>
            sortByOrder(
              prev.map((g) => {
                if (g.id === selfSnapshot.id) return { ...g, order: selfSnapshot.order };
                if (g.id === neighborSnapshot.id) return { ...g, order: neighborSnapshot.order };
                return g;
              }),
            ),
          );
        }
      }
    },
    [showToast],
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
