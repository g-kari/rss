interface Props {
  onMobileBack?: () => void;
}

export default function EmptyArticleView({ onMobileBack }: Props) {
  return (
    <main className="h-full relative overflow-y-auto flex items-center justify-center bg-surface-base">
      {onMobileBack && (
        <button
          onClick={onMobileBack}
          className="lg:hidden absolute top-3 left-3 p-1.5 text-text-muted hover:text-text-strong transition-colors"
          aria-label="記事一覧に戻る"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
      )}
      <div className="text-center animate-fade-in">
        <svg
          className="w-8 h-8 mx-auto mb-3 text-text-faint"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
        <p className="text-[11px] tracking-[0.1em] text-text-faint">
          {onMobileBack ? "一覧から記事を選択してください" : "記事を選択"}
        </p>
        {onMobileBack && (
          <button
            onClick={onMobileBack}
            className="mt-2 text-[11px] text-text-muted hover:text-text-strong transition-colors"
          >
            ← 一覧に戻る
          </button>
        )}
      </div>
    </main>
  );
}
