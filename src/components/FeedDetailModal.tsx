"use client";

import { useState, useEffect, type ReactNode } from "react";
import type { Feed } from "../types";
import Modal from "./Modal";
import { useToast } from "@/contexts/ToastContext";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
  feed: Feed;
  onClose: () => void;
}

export default function FeedDetailModal({ feed, onClose }: Props) {
  const health = getHealthStatus(feed);
  const toast = useToast();

  const [pushDisabled, setPushDisabled] = useState<boolean | null>(null);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    apiFetch("/api/push/config")
      .then((r) =>
        r.ok ? (r.json() as Promise<{ disabledFeeds: Record<string, boolean> }>) : null,
      )
      .then((data) => {
        if (data) setPushDisabled(data.disabledFeeds[feed.id] === true);
      })
      .catch(() => {
        toast.error("Push 通知設定の取得に失敗しました");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast.error は安定した useCallback
  }, [feed.id]);

  const handlePushToggle = async () => {
    if (pushLoading || pushDisabled === null) return;
    setPushLoading(true);
    const next = !pushDisabled;
    try {
      const res = await apiFetch("/api/push/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabledFeeds: { [feed.id]: next } }),
      });
      if (res.ok) {
        setPushDisabled(next);
      } else {
        toast.error("Push 通知設定の変更に失敗しました");
      }
    } catch {
      toast.error("Push 通知設定の変更に失敗しました");
    } finally {
      setPushLoading(false);
    }
  };

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
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${health.color}`} />
            <span
              className={`text-[12px] font-medium ${health.color === "bg-status-ok" ? "text-text-default" : health.color === "bg-status-warning" ? "text-status-warning" : "text-error"}`}
            >
              {health.label}
            </span>
          </div>

          <DetailRow
            label="最終取得"
            value={
              feed.lastFetchedAt
                ? `${formatRelativeTime(feed.lastFetchedAt)}（${new Date(feed.lastFetchedAt).toLocaleString("ja-JP")}）`
                : "未取得"
            }
          />
          {feed.pageCount !== undefined && (
            <DetailRow label="ページ数" value={String(feed.pageCount + 1)} />
          )}
          {feed.consecutiveErrors !== undefined && feed.consecutiveErrors > 0 && (
            <DetailRow
              label="連続エラー"
              value={`${feed.consecutiveErrors} 回${feed.consecutiveErrors >= 5 ? "（更新停止中）" : ""}`}
              error
            />
          )}
          {feed.fetchError && <DetailRow label="エラー内容" value={feed.fetchError} error />}
          {feed.lastErrorAt && (
            <DetailRow
              label="最終エラー"
              value={`${formatRelativeTime(feed.lastErrorAt)}（${new Date(feed.lastErrorAt).toLocaleString("ja-JP")}）`}
              error
            />
          )}
          {feed.rateLimitedUntil && (
            <DetailRow
              label="レート制限"
              value={(() => {
                const until = new Date(feed.rateLimitedUntil);
                if (until > new Date()) {
                  return `制限中 — ${until.toLocaleString("ja-JP")} に解除予定`;
                }
                return `解除済み（${until.toLocaleString("ja-JP")}）`;
              })()}
              error={new Date(feed.rateLimitedUntil) > new Date()}
            />
          )}
          {feed.oversizeAlert && (
            <DetailRow
              label="容量警告"
              value="ページ数上限を超過 — 古い記事が失われる可能性あり"
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

        {pushDisabled !== null && (
          <DetailSection title="Push 通知">
            <div className="flex items-center gap-3">
              <span className="text-text-muted w-[100px]">このフィード</span>
              <button
                type="button"
                role="switch"
                aria-checked={!pushDisabled}
                aria-label={pushDisabled ? "Push 通知を有効にする" : "Push 通知を無効にする"}
                disabled={pushLoading}
                onClick={handlePushToggle}
                className={`relative h-5 w-9 rounded-full transition-colors duration-150 disabled:opacity-50 ${
                  !pushDisabled ? "bg-ink" : "bg-border-default"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface-elevated shadow transition-transform duration-150 ${
                    !pushDisabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-text-muted">{pushDisabled ? "無効" : "有効"}</span>
            </div>
          </DetailSection>
        )}
      </div>
    </Modal>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
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
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    // 非 HTTPS context / 古い Safari / 一部 WebView で navigator.clipboard が undefined の罠を
    // 構造的予防 (canonical: ShareMenu.tsx の `if (!navigator.clipboard)` guard)。
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex gap-2">
      <span className="flex-shrink-0 w-[100px] text-text-muted">{label}</span>
      <span
        className={`flex-1 min-w-0 break-all ${mono ? "font-mono text-[11px]" : ""} ${error ? "text-error" : "text-text-default"}`}
      >
        {value}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          className={`flex-shrink-0 transition-colors ${copied ? "text-text-default" : "text-text-faint hover:text-text-default"}`}
          title={copied ? "コピーしました" : "コピー"}
        >
          {copied ? (
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
              <path d="M1.5 5l2.5 2.5L8.5 2" />
            </svg>
          ) : (
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
          )}
        </button>
      )}
    </div>
  );
}

function getHealthStatus(feed: Feed): { color: string; label: string } {
  if ((feed.consecutiveErrors ?? 0) >= 5) return { color: "bg-status-error", label: "更新停止" };
  if (
    feed.fetchError ||
    (feed.rateLimitedUntil && new Date(feed.rateLimitedUntil) > new Date()) ||
    feed.oversizeAlert
  )
    return { color: "bg-status-warning", label: "注意" };
  return { color: "bg-status-ok", label: "正常" };
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}
