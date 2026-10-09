"use client";

import { useId, useState } from "react";
import type { RecommendedFeed } from "../types";
import { useToast } from "@/contexts/ToastContext";
import { devError } from "@/lib/dev-log";
import Spinner from "./Spinner";

interface Props {
  recommendations: RecommendedFeed[];
  topics: string[];
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onDismiss: (id: string) => void;
  onRefresh: () => void;
  onAddFeed: (url: string) => Promise<void>;
}

export default function RecommendationSection({
  recommendations,
  topics,
  loading,
  error,
  refreshing,
  onDismiss,
  onRefresh,
  onAddFeed,
}: Props) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const listId = useId();
  const [addingId, setAddingId] = useState<string | null>(null);

  const visible = expanded ? recommendations : recommendations.slice(0, 5);

  return (
    <div className="py-1">
      {/* ヘッダー: 既定は閉じて、フィード一覧を押し下げない */}
      <div className="flex items-center justify-between pr-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex flex-1 items-center gap-1.5 px-4 py-1 max-md:min-h-[44px] text-left text-meta font-medium tracking-[0.25em] uppercase text-text-muted hover:text-text-strong transition-colors duration-200"
        >
          <span>おすすめ</span>
          {recommendations.length > 0 && (
            <span className="tracking-normal tabular-nums text-text-faint">
              {recommendations.length}
            </span>
          )}
        </button>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          title="おすすめを更新"
          aria-label="おすすめを更新"
          className="flex items-center justify-center max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] text-text-faint hover:text-text-muted transition-colors duration-200 disabled:opacity-50"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={refreshing ? "animate-spin" : ""}
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>

      <div id={panelId} hidden={!open && !error}>
        {topics.length > 0 && (
          <div className="px-4 pb-1 text-meta text-text-faint truncate" title={topics.join("、")}>
            関心トピック: {topics.join("・")}
          </div>
        )}

        {/* ローディング */}
        {loading && recommendations.length === 0 && (
          <div className="px-4 py-3 flex items-center gap-2" aria-live="polite" aria-busy="true">
            <Spinner className="w-3 h-3 text-text-faint" />
            <span className="text-meta text-text-faint">読み込み中...</span>
          </div>
        )}

        {/* エラー */}
        {error && !loading && (
          <div role="alert" className="px-4 py-2 flex items-center gap-2">
            <span className="text-meta text-error">{error}</span>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="text-meta text-text-muted hover:text-text-strong underline transition-colors duration-200 disabled:opacity-50"
            >
              再試行
            </button>
          </div>
        )}

        {/* 空状態 */}
        {!loading && !error && recommendations.length === 0 && (
          <div className="px-4 py-2 text-meta text-text-faint leading-relaxed">
            まだありません。記事をブックマーク・全文取得すると、関連フィードがここに出ます。
          </div>
        )}

        {/* 提案リスト (#1219: disclosure トグルの aria-controls 対象) */}
        <div id={listId}>
          {visible.map((rec) => (
            <div
              key={rec.id}
              className="group relative flex items-start gap-2 px-4 py-1.5 hover:bg-surface-hover transition-colors duration-200"
            >
              <div className="flex-1 min-w-0">
                <div className="text-ui text-text-default truncate tracking-[0.02em]">
                  {rec.title}
                </div>
                <div className="text-meta text-text-faint truncate">{rec.reason}</div>
              </div>
              <div className="flex items-center gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100 transition-opacity duration-150 flex-shrink-0">
                <button
                  onClick={async () => {
                    setAddingId(rec.id);
                    try {
                      await onAddFeed(rec.feedUrl);
                      onDismiss(rec.id);
                    } catch (err) {
                      devError("[RecommendationSection] onAddFeed failed", err);
                      toast.error("フィードの追加に失敗しました");
                    } finally {
                      setAddingId(null);
                    }
                  }}
                  disabled={addingId === rec.id}
                  title="購読する"
                  aria-label={`${rec.title}を購読する`}
                  className="text-text-faint hover:text-text-strong focus-visible:opacity-100 transition-colors duration-200 disabled:opacity-50"
                >
                  <svg
                    aria-hidden="true"
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
                  aria-label={`${rec.title}を非表示`}
                  className="text-text-faint hover:text-text-muted focus-visible:opacity-100 transition-colors duration-200"
                >
                  <svg
                    aria-hidden="true"
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
        </div>

        {/* もっと見る */}
        {recommendations.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls={listId}
            className="w-full px-4 py-1 text-meta text-text-faint hover:text-text-muted transition-colors duration-200 text-left"
          >
            {expanded ? "折りたたむ" : `他 ${recommendations.length - 5} 件を表示`}
          </button>
        )}
      </div>
    </div>
  );
}
