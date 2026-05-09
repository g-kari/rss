"use client";

import { useCallback } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { isArticle } from "../lib/type-guards";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

interface UseSaveArticleUrlOptions {
  prependArticle: (article: Article) => void;
  toggleBookmark: (id: string) => void;
  toggleReadingList: (id: string) => void;
  toast: ToastApi;
}

/**
 * 任意 URL を `/api/articles/save` で保存して、ブックマークまたは後で読むに登録する
 * ハンドラを返す hook (#650 Step 1b)。
 *
 * 元 `App.tsx` の `onSaveArticleUrl` を切り出し、依存を明示化して
 * App.tsx を薄いオーケストレーターに近づける。
 */
export function useSaveArticleUrl({
  prependArticle,
  toggleBookmark,
  toggleReadingList,
  toast,
}: UseSaveArticleUrlOptions): (url: string, mode: "bookmark" | "reading_list") => Promise<void> {
  return useCallback(
    async (url: string, mode: "bookmark" | "reading_list") => {
      try {
        const res = await apiFetch("/api/articles/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const raw = (await res.json()) as { error?: string };
        if (!res.ok) {
          toast.error(raw.error ?? "保存に失敗しました");
          return;
        }
        if (!isArticle(raw)) {
          toast.error("保存に失敗しました");
          return;
        }
        prependArticle(raw);
        if (mode === "bookmark") {
          toggleBookmark(raw.id);
          toast.success("ブックマークに追加しました");
        } else {
          toggleReadingList(raw.id);
          toast.success("後で読むに追加しました");
        }
      } catch {
        toast.error("保存に失敗しました");
      }
    },
    [prependArticle, toggleBookmark, toggleReadingList, toast],
  );
}
