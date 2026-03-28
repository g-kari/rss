"use client";

import { useState } from "react";
import type { RecommendedFeed } from "../types";

interface Props {
  recommendations: RecommendedFeed[];
  loading: boolean;
  refreshing: boolean;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  onAddFeed: (url: string) => Promise<void>;
}

export default function RecommendationSection({
  recommendations,
  loading,
  refreshing,
  onDismiss,
  onRefresh,
  onAddFeed,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const visible = expanded ? recommendations : recommendations.slice(0, 5);

  return (
    <div className="py-1">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-1">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          おすすめ
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="おすすめを更新"
            className="text-text-faint hover:text-text-muted transition-colors duration-200 disabled:opacity-50"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={refreshing ? "animate-spin" : ""}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* ローディング */}
      {loading && recommendations.length === 0 && (
        <div className="px-4 py-2 text-[11px] text-text-faint">読み込み中...</div>
      )}

      {/* 空状態 */}
      {!loading && recommendations.length === 0 && (
        <div className="px-4 py-2 text-[11px] text-text-faint leading-relaxed">
          フィードを追加・購読すると、読んでいる内容に基づいたおすすめが表示されます。
        </div>
      )}

      {/* 提案リスト */}
      {visible.map((rec) => (
        <div
          key={rec.id}
          className="group relative flex items-start gap-2 px-4 py-1.5 hover:bg-surface-hover transition-colors duration-200"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-text-default truncate tracking-[0.02em]">
              {rec.title}
            </div>
            <div className="text-[11px] text-text-faint truncate">{rec.reason}</div>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0">
            <button
              onClick={async () => {
                setAddingId(rec.id);
                try {
                  await onAddFeed(rec.feedUrl);
                  onDismiss(rec.id);
                } catch {
                  // 静かに失敗
                } finally {
                  setAddingId(null);
                }
              }}
              disabled={addingId === rec.id}
              title="購読する"
              className="text-text-faint hover:text-text-strong transition-colors duration-200 disabled:opacity-50"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <line x1="6" y1="2" x2="6" y2="10" />
                <line x1="2" y1="6" x2="10" y2="6" />
              </svg>
            </button>
            <button
              onClick={() => onDismiss(rec.id)}
              title="非表示"
              className="text-text-faint hover:text-text-muted transition-colors duration-200"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <line x1="3" y1="3" x2="9" y2="9" />
                <line x1="9" y1="3" x2="3" y2="9" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* もっと見る */}
      {recommendations.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-1 text-[11px] text-text-faint hover:text-text-muted transition-colors duration-200 text-left"
        >
          {expanded ? "折りたたむ" : `他 ${recommendations.length - 5} 件を表示`}
        </button>
      )}
    </div>
  );
}
