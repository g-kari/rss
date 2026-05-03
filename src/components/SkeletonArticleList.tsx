"use client";

/**
 * 記事一覧のスケルトンスクリーン。
 * 初回ロード時に CLS を防止するため、ArticleList と同じレイアウトのプレースホルダーを表示する。
 */
export default function SkeletonArticleList() {
  return (
    <div className="flex flex-col h-full bg-surface-base border-r border-border-default">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
        <div className="flex items-center gap-2">
          <div className="h-4 w-24 rounded bg-surface-subtle animate-pulse" />
          <div className="h-4 w-8 rounded bg-surface-subtle animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-surface-subtle animate-pulse" />
          <div className="w-5 h-5 rounded bg-surface-subtle animate-pulse" />
        </div>
      </div>

      {/* 記事一覧 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3 border-b border-border-subtle">
            {/* 未読ドットの位置 */}
            <div className="w-1.5 flex-shrink-0 pt-1.5">
              {i < 4 && (
                <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              {/* タイトル */}
              <div
                className="h-3.5 rounded bg-surface-subtle animate-pulse"
                style={{ width: `${75 + ((i * 13) % 20)}%` }}
              />
              {/* 本文プレビュー 2行 */}
              <div className="space-y-1.5">
                <div
                  className="h-3 rounded bg-surface-subtle animate-pulse"
                  style={{ width: "100%" }}
                />
                <div
                  className="h-3 rounded bg-surface-subtle animate-pulse"
                  style={{ width: `${45 + ((i * 19) % 40)}%` }}
                />
              </div>
              {/* メタ情報（フィード名 + 時間） */}
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-20 rounded bg-surface-subtle animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-surface-subtle animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
