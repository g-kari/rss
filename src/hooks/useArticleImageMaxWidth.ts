"use client";

import { useEffect, type RefObject } from "react";

/**
 * 記事本文の `<img>` で **HTML 属性 width/height がない場合** に、
 * runtime の `naturalWidth` から `max-width` を補完する hook (#680)。
 *
 * 背景: `fixImageDimensions` (HTML 後処理) は HTML 属性 `width` / `height` が
 * 16px 以上のときだけ inline `style="max-width: Npx"` を付与する。属性が
 * 欠けているフィードでは max-width が無く、CSS `width: 100%` で **小さい画像も
 * コンテナ幅いっぱいに引き伸ばされる** バグが起きる。
 *
 * この hook はクライアント側で `<img>` の `naturalWidth` を読み取り、
 * 既に inline `max-width` がない場合のみ補完する。`fixImageDimensions` の
 * 結果を上書きしない設計。
 *
 * 依存変更: `processedContent` 等の HTML 入れ替え時に再走査する。
 */
export function useArticleImageMaxWidth(
  contentRef: RefObject<HTMLElement | null>,
  contentKey: string | null | undefined,
): void {
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const imgs = root.querySelectorAll<HTMLImageElement>("img");
    const cleanups: Array<() => void> = [];
    imgs.forEach((img) => {
      // HTML 後処理 or 既存 inline スタイルで max-width が指定されていればスキップ
      if (img.style.maxWidth) return;
      const apply = () => {
        if (img.naturalWidth > 0 && !img.style.maxWidth) {
          img.style.maxWidth = `${img.naturalWidth}px`;
        }
      };
      if (img.complete) {
        apply();
      } else {
        img.addEventListener("load", apply, { once: true });
        cleanups.push(() => img.removeEventListener("load", apply));
      }
    });
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [contentRef, contentKey]);
}
