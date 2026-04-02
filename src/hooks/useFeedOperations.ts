"use client";

import { useEffect, useRef, useState } from "react";
import type { Feed } from "../types";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";

interface Callbacks {
  onFeedAdded: (feed: Feed) => void;
  onFeedDeleted: (id: string) => void;
  onFeedRenamed: (feed: Feed) => void;
  onFeedsImported: (feeds: Feed[]) => void;
}

export interface ImportMessage {
  text: string;
  isError: boolean;
}

export function useFeedOperations({
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onFeedsImported,
}: Callbacks) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<ImportMessage | null>(null);
  const importMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (importMessageTimerRef.current) clearTimeout(importMessageTimerRef.current);
    },
    [],
  );

  function showImportMessage(text: string, isError: boolean) {
    setImportMessage({ text, isError });
    if (importMessageTimerRef.current) clearTimeout(importMessageTimerRef.current);
    importMessageTimerRef.current = setTimeout(() => setImportMessage(null), 3000);
  }

  async function addFeed(url: string, onSuccess: () => void, cookie?: string) {
    if (!url.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...(cookie ? { cookie } : {}) }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        setError(data.error ?? "フィードの追加に失敗しました");
        return;
      }
      const feed = (await res.json()) as Feed;
      onSuccess();
      onFeedAdded(feed);
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setAdding(false);
    }
  }

  async function deleteFeed(id: string) {
    try {
      await apiFetchJson(`/api/feeds/${id}`, { method: "DELETE" });
      onFeedDeleted(id);
    } catch {
      setError("フィードの削除に失敗しました");
    }
  }

  async function renameFeed(id: string, title: string) {
    try {
      const updated = await apiFetchJson<Feed>(`/api/feeds/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      onFeedRenamed(updated);
    } catch {
      setError("フィードのタイトル変更に失敗しました");
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const res = await apiFetch("/api/feeds/import", {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: text,
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string };
        showImportMessage(data.error ?? "インポートに失敗しました", true);
        return;
      }
      const data = (await res.json()) as { added: number; skipped: number; feeds: Feed[] };
      if (data.added > 0) {
        onFeedsImported(data.feeds);
      }
      showImportMessage(
        data.added > 0 ? `${data.added}件インポートしました` : "すべて登録済みです",
        false,
      );
    } catch {
      showImportMessage("インポートに失敗しました", true);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearError() {
    setError("");
  }

  return {
    adding,
    error,
    importing,
    importMessage,
    fileInputRef,
    addFeed,
    deleteFeed,
    renameFeed,
    handleImportFile,
    clearError,
  };
}
