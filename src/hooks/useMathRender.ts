"use client";

import { useEffect, type RefObject } from "react";

/**
 * 記事本文内の数式を KaTeX でレンダリングする。
 * `processedContent` が変わるたびに再実行し、unmount 時に中断する。
 */
export function useMathRender(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  useEffect(() => {
    if (!contentRef.current || !processedContent) return;
    const el = contentRef.current;
    let cancelled = false;
    import("katex/contrib/auto-render").then(({ default: renderMathInElement }) => {
      if (cancelled || !el.isConnected) return;
      renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\[", right: "\\]", display: true },
          { left: "\\(", right: "\\)", display: false },
        ],
        throwOnError: false,
      });
    });
    return () => {
      cancelled = true;
    };
    // contentRef は安定参照のため deps から除外（元実装と揃える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedContent]);
}
