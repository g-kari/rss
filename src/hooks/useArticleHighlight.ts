"use client";

import { useEffect, useRef, type RefObject } from "react";

interface UseArticleHighlightParams {
  contentRef: RefObject<HTMLDivElement | null>;
  query: string;
  processedContent: string | null;
}

/**
 * 記事本文内の検索クエリを <mark> でハイライトする副作用のみの hook。
 * query / processedContent が変わるたびに DOM を更新し、次回実行前に前回の marks を text node に戻す。
 */
export function useArticleHighlight({
  contentRef,
  query,
  processedContent,
}: UseArticleHighlightParams): void {
  const highlightMarksRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    // 前回の marks をクリーンアップ
    for (const mark of highlightMarksRef.current) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
    highlightMarksRef.current = [];

    const q = query.trim();
    if (!contentRef.current || !q || !processedContent) return;

    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    const marks: HTMLElement[] = [];

    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = (node as Text).parentElement;
        if (!parent) return NodeFilter.FILTER_SKIP;
        if (parent.closest("pre, code, script, style")) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      if (!regex.test(text)) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = match[0];
        fragment.appendChild(mark);
        marks.push(mark);
        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    highlightMarksRef.current = marks;

    // 先頭のマッチ箇所へスクロール（query が空のときはスクロールしない — クリーンアップのみ）
    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // contentRef は安定参照のため deps から除外（元実装と揃える）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, processedContent]);
}
