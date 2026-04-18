"use client";

import { useEffect, type RefObject } from "react";

/**
 * 記事本文内の `<pre><code>` ブロックに highlight.js のシンタックスハイライトを適用する。
 * `processedContent` が変わるたびに再実行し、unmount 時に中断する。
 *
 * React の dangerouslySetInnerHTML 再代入や、他の副作用 hook（useContentLinkPreviews 等）が
 * コンテナ配下の DOM を書き換えた際に `.hljs` class が吹き飛ぶケース（Issue #83）に備え、
 * MutationObserver で子ツリー変化を検知して未ハイライトの block を再適用する。
 */
export function useSyntaxHighlight(
  contentRef: RefObject<HTMLDivElement | null>,
  processedContent: string | null,
): void {
  useEffect(() => {
    if (!contentRef.current || !processedContent) return;
    const el = contentRef.current;
    let cancelled = false;
    let hljs: typeof import("highlight.js/lib/common").default | null = null;
    let scheduled = false;

    // hljs.highlightElement 自身が block 内を書き換える。その mutation も MutationObserver に
    // 届くため、observer を一時停止して適用し、再 observe する（ネストした pre>code を
    // 含む記事での再入連鎖を防ぐ）。
    function applyMissing() {
      if (!hljs) return;
      observer.disconnect();
      el.querySelectorAll<HTMLElement>("pre code:not(.hljs)").forEach((block) => {
        hljs!.highlightElement(block);
      });
      observer.observe(el, { childList: true, subtree: true });
    }

    // 大量の DOM 変更（画像 lazy-load 等）が入ると毎 mutation で走査が走るため
    // microtask でバッチ化する。
    function scheduleApply() {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        applyMissing();
      });
    }

    import("highlight.js/lib/common").then(({ default: mod }) => {
      if (cancelled || !el.isConnected) return;
      hljs = mod;
      applyMissing();
    });

    // innerHTML 再代入や他 hook の DOM 書き換えで .hljs class が消えた場合に再適用する（Issue #83）。
    const observer = new MutationObserver(scheduleApply);
    observer.observe(el, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // contentRef は安定参照のため deps から除外（元実装と揃える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processedContent]);
}
