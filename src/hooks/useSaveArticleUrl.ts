"use client";

import { useCallback } from "react";
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { classifyHttpError, formatHttpErrorMessage } from "../lib/classify-http-error";
import { devError } from "../lib/dev-log";
import { isArticle, isPlainObject } from "../lib/type-guards";

export type SaveArticleUrlMode = "bookmark" | "reading_list";
export type SaveArticleUrlResult = { ok: true } | { ok: false; error: string };
export type SaveArticleUrlHandler = (
  url: string,
  mode: SaveArticleUrlMode,
) => Promise<SaveArticleUrlResult>;

interface UseSaveArticleUrlOptions {
  prependArticle: (article: Article) => void;
  addBookmark: (id: string) => void;
  addReadingList: (id: string) => void;
  toast: { success: (msg: string) => void };
}

/** 保存結果をcallerへ返す。失敗はモーダル内で表示し、成功だけtoastで通知する。 */
export function useSaveArticleUrl({
  prependArticle,
  addBookmark,
  addReadingList,
  toast,
}: UseSaveArticleUrlOptions): SaveArticleUrlHandler {
  return useCallback(
    async (url: string, mode: SaveArticleUrlMode): Promise<SaveArticleUrlResult> => {
      try {
        const res = await apiFetch(
          "/api/articles/save",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          },
          { errorNotification: "caller" },
        );
        // Non-JSON error pages still use their HTTP status. Invalid successful payloads
        // must not clear the form or change article/read state.
        let raw: unknown;
        try {
          raw = await res.json();
        } catch (err) {
          devError("[useSaveArticleUrl] invalid JSON response", err);
        }
        if (!res.ok) {
          const errorType = classifyHttpError(res.status);
          return {
            ok: false,
            error: formatHttpErrorMessage(errorType, {
              retryAfterHeader: res.headers.get("Retry-After"),
              fallback:
                isPlainObject(raw) && typeof raw.error === "string"
                  ? raw.error
                  : "保存に失敗しました",
            }),
          };
        }
        if (!isArticle(raw)) {
          return { ok: false, error: "保存に失敗しました (サーバー応答形式不正)" };
        }
        prependArticle(raw);
        if (mode === "bookmark") {
          addBookmark(raw.id);
          toast.success("ブックマークに追加しました");
        } else {
          addReadingList(raw.id);
          toast.success("後で読むに追加しました");
        }
        return { ok: true };
      } catch (err) {
        devError("[useSaveArticleUrl] apiFetch failed", err);
        return { ok: false, error: formatHttpErrorMessage("network") };
      }
    },
    [prependArticle, addBookmark, addReadingList, toast],
  );
}
