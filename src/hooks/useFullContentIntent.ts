"use client";
import { useEffect, useRef } from "react";
import type { Article } from "../types";
import type { FullContentIntent } from "../lib/full-content-intent";
export function useFullContentIntent(
  article: Article | null,
  intent: FullContentIntent | null | undefined,
  presentation: "pane" | "overlay",
  hasFullContent: boolean,
  canFetch: boolean,
  fetching: boolean,
  fetchFullContent: () => Promise<void>,
  consume?: (requestId: number) => boolean,
) {
  const attempted = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (
      !intent ||
      !article ||
      intent.articleId !== article.id ||
      intent.link !== article.link ||
      intent.target !== presentation ||
      attempted.current === intent.requestId
    )
      return;
    if (fetching) return;
    attempted.current = intent.requestId;
    if (consume && !consume(intent.requestId)) return;
    if (!hasFullContent && canFetch) void fetchFullContent();
  }, [
    article,
    intent,
    presentation,
    hasFullContent,
    canFetch,
    fetching,
    fetchFullContent,
    consume,
  ]);
}
