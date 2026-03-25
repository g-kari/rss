'use client';

interface Props {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ['j / ↓', '次の記事'],
  ['k / ↑', '前の記事'],
  ['n', '次の未読記事へ'],
  ['p', '前の未読記事へ'],
  ['o', '元記事を開く'],
  ['b', 'ブックマーク切替'],
  ['t', 'リーディングリスト切替'],
  ['r', '既読 / 未読切替'],
  ['m', '全既読にする'],
  ['u', '未読フィルター切替'],
  ['B', 'ブックマークフィルター切替'],
  ['d', '日付フィルター切替'],
  ['s', 'ソート順切替'],
  ['c', 'リンクをコピー'],
  ['f', 'フォントサイズ切替'],
  ['l', 'レイアウト切替'],
  ['/', '記事を検索'],
  ['] / [', '次 / 前のフィード'],
  ['?', 'このヘルプを表示'],
];

export default function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-surface-base/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-elevated border border-border-default rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.2)] p-6 w-72"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">キーボードショートカット</span>
          <button
            onClick={onClose}
            className="text-text-faint hover:text-text-muted transition-colors"
            aria-label="閉じる"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12"/>
            </svg>
          </button>
        </div>
        <ul className="space-y-2">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between">
              <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-muted">{key}</kbd>
              <span className="text-[12px] text-text-soft">{desc}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
