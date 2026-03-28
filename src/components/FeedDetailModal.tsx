"use client";

import type { Feed } from "../types";
import Modal from "./Modal";

interface Props {
  feed: Feed;
  onClose: () => void;
}

export default function FeedDetailModal({ feed, onClose }: Props) {
  return (
    <Modal title="フィード詳細" onClose={onClose}>
      <div className="overflow-y-auto max-h-[70vh] p-4 space-y-4 text-[12px]">
        <DetailSection title="基本情報">
          <DetailRow label="タイトル" value={feed.title} />
          <DetailRow label="URL" value={feed.url} copyable />
          {feed.siteUrl && <DetailRow label="サイト URL" value={feed.siteUrl} copyable />}
          <DetailRow label="ID" value={feed.id} copyable />
        </DetailSection>

        <DetailSection title="ステータス">
          <DetailRow
            label="最終取得"
            value={
              feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString("ja-JP") : "未取得"
            }
          />
          {feed.pageCount !== undefined && (
            <DetailRow label="ページ数" value={String(feed.pageCount + 1)} />
          )}
          {feed.consecutiveErrors !== undefined && feed.consecutiveErrors > 0 && (
            <DetailRow label="連続エラー" value={`${feed.consecutiveErrors} 回`} error />
          )}
          {feed.fetchError && <DetailRow label="エラー内容" value={feed.fetchError} error />}
          {feed.lastErrorAt && (
            <DetailRow
              label="最終エラー日時"
              value={new Date(feed.lastErrorAt).toLocaleString("ja-JP")}
              error
            />
          )}
          {feed.rateLimitedUntil && (
            <DetailRow
              label="レート制限解除"
              value={new Date(feed.rateLimitedUntil).toLocaleString("ja-JP")}
              error
            />
          )}
          <DetailRow label="NSFW" value={feed.nsfw ? "有効" : "無効"} />
        </DetailSection>

        {feed.isScraping && (
          <DetailSection title="スクレイピング設定">
            <DetailRow label="モード" value="LLM セレクタ推論" />
            {feed.cssSelector && (
              <DetailRow label="現在のセレクタ" value={feed.cssSelector} copyable mono />
            )}
            {feed.failedSelectors && feed.failedSelectors.length > 0 && (
              <DetailRow label="失敗済みセレクタ" value={feed.failedSelectors.join(", ")} mono />
            )}
          </DetailSection>
        )}

        {feed.filter && (feed.filter.include.length > 0 || feed.filter.exclude.length > 0) && (
          <DetailSection title="キーワードフィルター">
            {feed.filter.include.length > 0 && (
              <DetailRow label="含む" value={feed.filter.include.join(", ")} />
            )}
            {feed.filter.exclude.length > 0 && (
              <DetailRow label="除外" value={feed.filter.exclude.join(", ")} />
            )}
            <DetailRow
              label="カテゴリも対象"
              value={feed.filter.matchCategories ? "はい" : "いいえ"}
            />
          </DetailSection>
        )}
      </div>
    </Modal>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyable,
  mono,
  error,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  mono?: boolean;
  error?: boolean;
}) {
  function handleCopy() {
    void navigator.clipboard.writeText(value);
  }
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0 w-[100px] text-text-muted">{label}</span>
      <span
        className={`flex-1 min-w-0 break-all ${mono ? "font-mono text-[11px]" : ""} ${error ? "text-rose-400" : "text-text-default"}`}
      >
        {value}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="flex-shrink-0 text-text-faint hover:text-text-default transition-colors"
          title="コピー"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="6" height="6" rx="1" />
            <path d="M1 7V1h6" />
          </svg>
        </button>
      )}
    </div>
  );
}
