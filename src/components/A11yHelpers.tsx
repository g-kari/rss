"use client";

interface Props {
  /** スクリーンリーダー向け aria-live アナウンス内容（記事切替時のタイトル等） */
  announcement: string;
}

/**
 * アクセシビリティ補助コンポーネント (#650 段階分割で App.tsx から分離)。
 *
 * 提供する 2 要素:
 * - skip-to-content link: Tab キーでフォーカス時のみ表示し、サイドバーを
 *   スキップして `#main-content` (記事一覧) へジャンプ。
 * - aria-live region: キーボードナビで記事切替時にスクリーンリーダーに
 *   タイトルを読み上げさせる sr-only 領域。
 */
export default function A11yHelpers({ announcement }: Props) {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-surface-elevated focus:text-text-strong focus:text-[13px] focus:shadow-lg focus:border focus:border-border-default focus:outline-none"
      >
        記事一覧へスキップ
      </a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
