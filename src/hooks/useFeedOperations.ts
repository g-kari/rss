"use client";

import { useRef, useState } from "react";
import type { Feed } from "../types";
import { apiFetch, apiFetchJson } from "../lib/api-fetch";
import { invalidateSwCache } from "../lib/sw-cache";
import { useAutoReset } from "./useAutoReset";

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

/**
 * フィード CRUD 操作（追加・削除・リネーム・OPML インポート）をまとめた hook。
 *
 * 各操作は `/api/feeds` 系エンドポイントを呼び出し、成功時にコールバックを実行する。
 * - `addFeed` / `deleteFeed` / `renameFeed`: 単体フィードの操作
 * - `handleImportFile`: OPML ファイルを読み込んで `/api/feeds/import` に POST
 *
 * OPML インポートの進捗・エラーは `importMessage` として返される。
 */
export function useFeedOperations({
  onFeedAdded,
  onFeedDeleted,
  onFeedRenamed,
  onFeedsImported,
}: Callbacks) {
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useAutoReset("", 3000);
  const [importMessage, showImportMessage] = useAutoReset<ImportMessage | null>(null, 3000);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addFeed(
    url: string,
    onSuccess: () => void,
    cookie?: string,
    cssSelector?: string,
    useRsshub?: boolean,
  ): Promise<{ canRetryWithSelector?: boolean } | void> {
    if (!url.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          ...(cookie ? { cookie } : {}),
          ...(cssSelector ? { cssSelector } : {}),
          // useRsshub === false のときだけ明示送信（未指定はサーバー側デフォルト ON）
          ...(useRsshub === false ? { useRsshub: false } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error: string; canRetryWithSelector?: boolean };
        setError(data.error ?? "フィードの追加に失敗しました");
        return { canRetryWithSelector: data.canRetryWithSelector };
      }
      const feed = (await res.json()) as Feed;
      invalidateSwCache(["/api/feeds", "/api/articles"]);
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
      invalidateSwCache(["/api/feeds", "/api/articles"]);
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
        showImportMessage({ text: data.error ?? "インポートに失敗しました", isError: true });
        return;
      }
      const data = (await res.json()) as { added: number; skipped: number; feeds: Feed[] };
      if (data.added > 0) {
        invalidateSwCache(["/api/feeds", "/api/articles"]);
        onFeedsImported(data.feeds);
      }
      showImportMessage({
        text: data.added > 0 ? `${data.added}件インポートしました` : "すべて登録済みです",
        isError: false,
      });
    } catch {
      showImportMessage({ text: "インポートに失敗しました", isError: true });
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
