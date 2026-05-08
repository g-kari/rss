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
  return (
    <button
      onClick={() => {
        onDismiss();
        document
          .querySelector<HTMLElement>('[role="feed"][aria-label="記事"]')
          ?.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-ink text-ink-text text-[12px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] animate-fade-up cursor-pointer"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />
      新着記事 {newArticleCount} 件
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center -my-2 -mr-2 opacity-60 hover:opacity-100 transition-opacity"
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
        >
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </button>
  );
}
