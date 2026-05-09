"use client";

interface Props {
  listFocusMode: boolean;
  onExit: () => void;
}

/**
 * 記事一覧フォーカスモードの解除ボタン (PC のみ右上に固定表示)。
 *
 * App.tsx から分割 (#650 段階分割)。
 * モバイルは単一ペイン表示のため不要 (`hidden lg:flex`)。
 */
export default function FocusModeExitButton({ listFocusMode, onExit }: Props) {
  if (!listFocusMode) return null;
  return (
    <button
      onClick={onExit}
      className="fixed top-3 right-3 z-50 hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink-hover text-ink-text text-[11px] tracking-[0.03em] rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-all duration-200"
      aria-label="フォーカスモード解除"
      title="フォーカスモード解除 (Esc)"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4.5 1.5H1.5v3M7.5 1.5h3v3M1.5 7.5v3h3M10.5 7.5v3h-3" />
      </svg>
      フォーカス解除
    </button>
  );
}
