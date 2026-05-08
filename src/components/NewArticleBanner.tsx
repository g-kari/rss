"use client";

interface Props {
  newArticleCount: number;
  focusMode: boolean;
  listFocusMode: boolean;
  onDismiss: () => void;
}

export default function NewArticleBanner({
  newArticleCount,
  focusMode,
  listFocusMode,
  onDismiss,
}: Props) {
  if (newArticleCount <= 0 || focusMode || listFocusMode) return null;
  // role=status + aria-live=polite で SR にバナー出現を通知。
  // 以前は外側 <button> に閉じる <button> を入れ子にしていたが HTML 内容モデル違反だったため、
  // 兄弟関係に並べて Tab 順を整える (#611)。
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`新着記事 ${newArticleCount} 件`}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-ink text-ink-text text-[12px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-fade-up"
    >
      <button
        onClick={() => {
          onDismiss();
          document
            .querySelector<HTMLElement>('[role="feed"][aria-label="記事"]')
            ?.scrollTo({ top: 0, behavior: "smooth" });
        }}
        className="flex items-center gap-3 px-4 py-2 cursor-pointer rounded-l-full"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" aria-hidden />
        新着記事 {newArticleCount} 件
      </button>
      <button
        onClick={onDismiss}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center pr-3 opacity-60 hover:opacity-100 transition-opacity rounded-r-full"
        aria-label="通知を閉じる"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  );
}
