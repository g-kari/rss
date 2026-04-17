"use client";

import { useEffect, type RefObject } from "react";

/**
 * 記事本文内の `<pre><code>` ブロックに highlight.js のシンタックスハイライトを適用する。
 * `processedContent` が変わるたびに再実行し、unmount 時に中断する。
 */
export function useSyntaxHighlight(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  useEffect(() => {
    if (!contentRef.current || !processedContent) return;
    const el = contentRef.current;
    let cancelled = false;
    import("highlight.js/lib/common").then(({ default: hljs }) => {
      if (cancelled || !el.isConnected) return;
      el.querySelectorAll<HTMLElement>("pre code:not(.hljs)").forEach((block) => {
        hljs.highlightElement(block);
      });
    });
    return () => {
      cancelled = true;
    };
    // contentRef は安定参照のため deps から除外（元実装と揃える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedContent]);
}
