"use client";

interface Props {
  isOnline: boolean;
  hasPendingChanges: boolean;
}

export default function OfflineBanner({ isOnline, hasPendingChanges }: Props) {
  if (isOnline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 py-1.5 bg-surface-subtle border-b border-border-default text-[11px] tracking-[0.04em] text-text-muted">
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 1l10 10M8.5 3.5A4 4 0 0 0 2.5 7M10 5.5A6 6 0 0 0 5 2M4 8a2 2 0 0 1 4 0" />
      </svg>
      オフライン — キャッシュされたデータを表示中
      {hasPendingChanges && <span className="ml-1 text-text-faint">（同期待ち）</span>}
    </div>
  );
}
