"use client";

/**
 * サイドバーのスケルトンスクリーン。
 * 初回ロード時に CLS を防止するため、FeedSidebar と同じレイアウトのプレースホルダーを表示する。
 */
export default function SkeletonSidebar() {
  return (
    <div className="flex flex-col h-full bg-surface-elevated border-r border-border-default">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border-subtle">
        <div className="h-4 w-20 rounded bg-surface-subtle animate-pulse" />
        <div className="h-4 w-4 rounded bg-surface-subtle animate-pulse" />
      </div>

      {/* スペシャルビュー（すべて・未読・ブックマーク等） */}
      <div className="px-2 py-2 space-y-0.5">
        {[72, 56, 64, 48].map((w, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded">
            <div className="w-4 h-4 rounded bg-surface-subtle animate-pulse" />
            <div
              className="h-3 rounded bg-surface-subtle animate-pulse"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>

      {/* セクションヘッダー */}
      <div className="px-4 pt-4 pb-1">
        <div className="h-2.5 w-12 rounded bg-surface-subtle animate-pulse" />
      </div>

      {/* フィード一覧 */}
      <div className="flex-1 min-h-0 overflow-hidden px-2 py-1 space-y-0.5">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded">
            <div className="w-4 h-4 rounded bg-surface-subtle animate-pulse flex-shrink-0" />
            <div
              className="h-3 rounded bg-surface-subtle animate-pulse"
              style={{ width: `${55 + ((i * 17) % 35)}%` }}
            />
          </div>
        ))}
      </div>

      {/* フッター */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-surface-subtle animate-pulse" />
          <div className="h-3 w-16 rounded bg-surface-subtle animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-surface-subtle animate-pulse" />
          <div className="w-4 h-4 rounded bg-surface-subtle animate-pulse" />
        </div>
      </div>
    </div>
  );
}
