"use client";

import type { Feed } from "../../types";
import { NsfwIcon, StarIcon, FilterIcon } from "../article-view/icons";

interface Props {
  feed: Feed;
  isSelected: boolean;
  isStale: boolean;
  isMuted: boolean;
  hasFilter: boolean | undefined;
}

export default function FeedTitleContent({ feed, isSelected, isStale, isMuted, hasFilter }: Props) {
  return (
    <div className="flex-1 min-w-0">
      <span className="flex items-center gap-1 min-w-0">
        <span
          className="text-[13px] tracking-[0.02em] truncate"
          title="ダブルクリックでタイトルを編集"
        >
          {feed.title || feed.url}
        </span>
        {feed.priority === "high" && (
          <span title="スター付きフィード" className="flex-shrink-0 text-amber-400">
            <StarIcon size={8} filled />
          </span>
        )}
        {feed.nsfw && (
          <span title="NSFWフィード" className="flex-shrink-0 text-error">
            <NsfwIcon size={8} />
          </span>
        )}
        {hasFilter && (
          <span title="キーワードフィルター設定中" className="flex-shrink-0 text-text-muted">
            <FilterIcon size={8} />
          </span>
        )}
        {isMuted && (
          <span title="ミュート中" className="flex-shrink-0 text-amber-500">
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </span>
        )}
        {isStale && (
          <span title="30日以上新着なし" className="flex-shrink-0 text-text-faint">
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="5" cy="5" r="4" />
              <polyline points="5,2.5 5,5 6.5,6.5" />
            </svg>
          </span>
        )}
        {feed.fetchError && (feed.consecutiveErrors ?? 0) >= 3 && (
          <span
            title={`取得エラー (${feed.consecutiveErrors}回連続)`}
            className="flex-shrink-0 text-error"
          >
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 1L9 9H1L5 1z" />
              <line x1="5" y1="4" x2="5" y2="6" />
              <circle cx="5" cy="7.5" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
        )}
        {feed.rateLimitedUntil && new Date(feed.rateLimitedUntil) > new Date() && (
          <span title="レートリミット中" className="flex-shrink-0 text-amber-500">
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="5" cy="5" r="4" />
              <path d="M5 3v2.5l1.5 1" />
              <line x1="2" y1="2" x2="8" y2="8" />
            </svg>
          </span>
        )}
        {feed.oversizeAlert && (
          <span title="レスポンスサイズ超過" className="flex-shrink-0 text-amber-500">
            <svg
              width="8"
              height="8"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="5" cy="5" r="4" />
              <line x1="5" y1="3" x2="5" y2="5.5" />
              <circle cx="5" cy="7" r="0.5" fill="currentColor" stroke="none" />
            </svg>
          </span>
        )}
      </span>
      {isSelected && !feed.fetchError && (
        <span className="text-[10px] text-text-faint truncate block leading-tight mt-0.5">
          {feed.url}
        </span>
      )}
      {isSelected && feed.cssSelector && (
        <span
          className="text-[10px] text-text-faint truncate block leading-tight"
          title={`CSS セレクタ: ${feed.cssSelector}`}
        >
          selector: {feed.cssSelector}
        </span>
      )}
      {isSelected && feed.failedSelectors && feed.failedSelectors.length > 0 && (
        <span
          className="text-[10px] text-text-faint truncate block leading-tight"
          title={`失敗済み: ${feed.failedSelectors.join(", ")}`}
        >
          failed: {feed.failedSelectors.join(", ")}
        </span>
      )}
      {feed.fetchError && (
        <span className="text-[10px] text-error truncate block leading-tight mt-0.5">
          {(feed.consecutiveErrors ?? 0) >= 5 ? "更新停止 · " : ""}
          {feed.fetchError}
        </span>
      )}
    </div>
  );
}
