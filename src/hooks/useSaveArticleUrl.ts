"use client";

import { useCallback } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { classifyHttpError, formatHttpErrorMessage } from "../lib/classify-http-error";
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
          // 429 / 5xx / 4xx を classify-http-error で分類して specific message に。
          // server の `error` body があれば優先、なければ HTTP 種別ベースのメッセージ。
          // `useArticleAi.ts` 同 canonical pattern (helper-drift.md 規範)。
          const errorType = classifyHttpError(res.status);
          const message = formatHttpErrorMessage(errorType, {
            retryAfterHeader: res.headers.get("Retry-After"),
            fallback: raw.error ?? "保存に失敗しました",
          });
          toast.error(message);
          return;
        }
        if (!isArticle(raw)) {
          toast.error("保存に失敗しました (サーバー応答形式不正)");
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
        // network error / abort / DNS 等の fetch 失敗
        toast.error(formatHttpErrorMessage("network"));
      }
    },
    [prependArticle, toggleBookmark, toggleReadingList, toast],
  );
}
