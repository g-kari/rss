"use client";

import { useCallback, useEffect, useState } from "react";
import type { FeedGroup, UserProfile } from "../types";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";

/** `useFeedGroups` の戻り値型 */
export interface FeedGroupsState {
  groups: FeedGroup[];
  loading: boolean;
  /** 作成成功時は新規 FeedGroup、失敗時は `{ error: string }` を返す */
  createGroup: (name: string) => Promise<FeedGroup | { error: string }>;
  renameGroup: (id: string, name: string) => Promise<FeedGroup | { error: string }>;
  setCollapsed: (id: string, collapsed: boolean) => Promise<void>;
  deleteGroup: (id: string) => Promise<boolean>;
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

  const setCollapsed = useCallback(async (id: string, collapsed: boolean): Promise<void> => {
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
      // ロールバック
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, collapsed: !collapsed } : g)));
    }
  }, []);

  const deleteGroup = useCallback(async (id: string): Promise<boolean> => {
    const res = await apiFetch(`/api/feed-groups/${id}`, { method: "DELETE" });
    if (!res.ok) return false;
    setGroups((prev) => prev.filter((g) => g.id !== id));
    return true;
  }, []);

  return { groups, loading, createGroup, renameGroup, setCollapsed, deleteGroup };
}
