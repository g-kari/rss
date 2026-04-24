import { useEffect, useRef } from "react";
import { useSyncedRef } from "./useSyncedRef";

interface UseGalleryAutoReadOptions {
  scrollElement: HTMLElement | null;
  enabled: boolean;
  readIds: Set<string>;
  onMarkRead: (articleId: string) => void;
}

const ARTICLE_ID_PREFIX = "article-";
const SELECTOR = `[id^="${ARTICLE_ID_PREFIX}"]`;

function observeArticleNodes(observer: IntersectionObserver, root: Node) {
  if (root instanceof HTMLElement) {
    if (root.id?.startsWith(ARTICLE_ID_PREFIX)) observer.observe(root);
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) observer.observe(el);
  }
}

function unobserveArticleNodes(observer: IntersectionObserver, root: Node) {
  if (root instanceof HTMLElement) {
    if (root.id?.startsWith(ARTICLE_ID_PREFIX)) observer.unobserve(root);
    for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) observer.unobserve(el);
  }
}

export function useGalleryAutoRead({
  scrollElement,
  enabled,
  readIds,
  onMarkRead,
}: UseGalleryAutoReadOptions): void {
  const onMarkReadRef = useSyncedRef(onMarkRead);
  const readIdsRef = useSyncedRef(readIds);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !scrollElement) return;
    seenRef.current = new Set();
  }, [enabled, scrollElement]);

  useEffect(() => {
    if (!enabled || !scrollElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const domId = el.id;
          if (!domId.startsWith(ARTICLE_ID_PREFIX)) continue;
          const articleId = domId.slice(ARTICLE_ID_PREFIX.length);

          if (entry.isIntersecting) {
            seenRef.current.add(articleId);
          } else if (seenRef.current.has(articleId)) {
            seenRef.current.delete(articleId);
            if (!readIdsRef.current.has(articleId)) {
              onMarkReadRef.current(articleId);
            }
          }
        }
      },
      { root: scrollElement, threshold: 0 },
    );

    for (const card of scrollElement.querySelectorAll<HTMLElement>(SELECTOR)) {
      observer.observe(card);
    }

    const mo = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) observeArticleNodes(observer, node);
        for (const node of mutation.removedNodes) unobserveArticleNodes(observer, node);
      }
    });
    mo.observe(scrollElement, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mo.disconnect();
    };
  }, [enabled, scrollElement, onMarkReadRef, readIdsRef]);
}
