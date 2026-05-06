"use client";

import { useMemo } from "react";
import type { Feed } from "@/types";
import Modal from "./Modal";

interface Props {
  feeds: Feed[];
  onClose: () => void;
}

function timeAgoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

function untilLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "解除済み";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `あと${minutes}分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `あと${hours}時間`;
  const days = Math.floor(hours / 24);
  return `あと${days}日`;
}

export default function FeedHealthModal({ feeds, onClose }: Props) {
  const now = useMemo(() => new Date(), []);

  const errorFeeds = useMemo(
    () => feeds.filter((f) => f.fetchError && (f.consecutiveErrors ?? 0) >= 1),
    [feeds],
  );

  const rateLimitedFeeds = useMemo(
    () => feeds.filter((f) => f.rateLimitedUntil && new Date(f.rateLimitedUntil) > now),
    [feeds, now],
  );

  const oversizeFeeds = useMemo(() => feeds.filter((f) => f.oversizeAlert), [feeds]);

  const healthyCount =
    feeds.length - errorFeeds.length - rateLimitedFeeds.length - oversizeFeeds.length;

  const hasIssues =
    errorFeeds.length > 0 || rateLimitedFeeds.length > 0 || oversizeFeeds.length > 0;

  return (
    <Modal
      title="フィードヘルス"
      subtitle={`${feeds.length}件のフィード`}
      onClose={onClose}
      width="sm:w-[560px]"
    >
      {/* サマリーバー */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
          <span className="text-[12px] text-text-muted">エラー {errorFeeds.length}件</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-[12px] text-text-muted">
            レートリミット {rateLimitedFeeds.length}件
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
          <span className="text-[12px] text-text-muted">
            オーバーサイズ {oversizeFeeds.length}件
          </span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="w-2 h-2 rounded-full bg-surface-subtle flex-shrink-0 border border-border-default" />
          <span className="text-[12px] text-text-muted">正常 {healthyCount}件</span>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {!hasIssues && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg
              className="w-8 h-8 text-text-faint"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-[13px] text-text-muted">すべてのフィードは正常です</p>
          </div>
        )}

        {/* エラーフィード */}
        {errorFeeds.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h3 className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted mb-2">
              エラー
            </h3>
            <ul className="flex flex-col gap-2">
              {errorFeeds.map((feed) => (
                <li
                  key={feed.id}
                  className="rounded-lg bg-surface-elevated border border-border-subtle p-3 flex flex-col gap-1"
                >
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text-strong truncate">
                          {feed.title}
                        </span>
                        {(feed.consecutiveErrors ?? 0) > 1 && (
                          <span className="text-[10px] text-rose-400 flex-shrink-0">
                            {feed.consecutiveErrors}回連続
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-rose-400 mt-0.5 break-words">
                        {feed.fetchError}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 ml-5.5">
                    <span className="text-[11px] text-text-faint truncate">{feed.url}</span>
                    {feed.lastErrorAt && (
                      <span className="text-[11px] text-text-faint flex-shrink-0">
                        {timeAgoLabel(feed.lastErrorAt)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* レートリミットフィード */}
        {rateLimitedFeeds.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h3 className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted mb-2">
              レートリミット中
            </h3>
            <ul className="flex flex-col gap-2">
              {rateLimitedFeeds.map((feed) => (
                <li
                  key={feed.id}
                  className="rounded-lg bg-surface-elevated border border-border-subtle p-3 flex flex-col gap-1"
                >
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text-strong truncate">
                          {feed.title}
                        </span>
                        <span className="text-[10px] text-amber-400 flex-shrink-0">
                          {feed.rateLimitedUntil ? untilLabel(feed.rateLimitedUntil) : ""}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-faint truncate block mt-0.5">
                        {feed.url}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* オーバーサイズフィード */}
        {oversizeFeeds.length > 0 && (
          <section className="px-4 pt-4 pb-2">
            <h3 className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted mb-2">
              オーバーサイズ
            </h3>
            <ul className="flex flex-col gap-2">
              {oversizeFeeds.map((feed) => (
                <li
                  key={feed.id}
                  className="rounded-lg bg-surface-elevated border border-border-subtle p-3 flex flex-col gap-1"
                >
                  <div className="flex items-start gap-2">
                    <svg
                      className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-text-strong truncate">
                          {feed.title}
                        </span>
                        {feed.pageCount !== undefined && feed.pageCount > 0 && (
                          <span className="text-[10px] text-text-muted flex-shrink-0">
                            {feed.pageCount + 1}ページ
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-soft mt-0.5">
                        記事数が上限を超えています。古い記事が削除される場合があります。
                      </p>
                      <span className="text-[11px] text-text-faint truncate block mt-0.5">
                        {feed.url}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="h-4" />
      </div>
    </Modal>
  );
}
