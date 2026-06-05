"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import Spinner from "./Spinner";
import StatBar from "./reading-stats/StatBar";
import StatCard from "./reading-stats/StatCard";
import HeatmapCalendar from "./reading-stats/HeatmapCalendar";
import WeeklyGoalSection from "./reading-stats/WeeklyGoalSection";
import { useReadingStats } from "../hooks/useReadingStats";
import { useInboxProgress } from "../hooks/useInboxProgress";
import { useEngagementEntries } from "../hooks/useEngagementEntries";
import { aggregateStatsForFeed } from "../lib/stats-helpers";
import type { Article, Feed } from "../types";

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  onClose: () => void;
}

export default function ReadingStatsModal({
  feeds,
  articles,
  readIds,
  readBeforeTimestamp,
  onClose,
}: Props) {
  const { stats, loading, error, fetch: fetchStats } = useReadingStats();
  const {
    entries: engagementEntries,
    loading: entriesLoading,
    error: entriesError,
    fetch: fetchEntries,
  } = useEngagementEntries();
  const inboxStats = useInboxProgress(articles, feeds, readIds, readBeforeTimestamp ?? null);
  const [selectedFeedHash, setSelectedFeedHash] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ドリルダウン選択時に entries を遅延取得（モーダル open 中のみキャッシュされる）
  useEffect(() => {
    if (selectedFeedHash && !engagementEntries) {
      fetchEntries();
    }
  }, [selectedFeedHash, engagementEntries, fetchEntries]);

  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f.title])), [feeds]);

  const drillStats = useMemo(() => {
    if (!selectedFeedHash || !engagementEntries) return null;
    return aggregateStatsForFeed(engagementEntries, selectedFeedHash, new Date());
  }, [selectedFeedHash, engagementEntries]);

  // ドリルダウン中は drillStats を、未選択時は全体 stats を表示
  const displayDailyReadCounts = drillStats?.dailyReadCounts ?? stats?.dailyReadCounts;
  const displayYearlyHeatmap = drillStats?.yearlyHeatmap ?? stats?.yearlyHeatmap;
  const displayWeeklyTotal = drillStats?.weeklyTotal ?? stats?.weeklyTotal ?? 0;

  const maxDaily = displayDailyReadCounts
    ? Math.max(...displayDailyReadCounts.map((d) => d.count), 1)
    : 1;

  return (
    <Modal title="読書統計" onClose={onClose} width="sm:w-[560px]">
      <div className="px-4 py-4 flex flex-col gap-5">
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2">
            <p role="alert" className="text-[13px] text-error">
              {error}
            </p>
            <button
              onClick={fetchStats}
              className="text-[12px] text-text-muted hover:text-text-strong underline underline-offset-2 transition-colors"
            >
              再試行
            </button>
          </div>
        )}
        {stats && !loading && (
          <>
            {/* ドリルダウン表示中のヘッダー */}
            {selectedFeedHash && (
              <div className="flex items-center gap-2 -mb-2">
                <button
                  type="button"
                  onClick={() => setSelectedFeedHash(null)}
                  className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-strong transition-colors"
                  aria-label="全体統計に戻る"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  全体に戻る
                </button>
                <span className="text-[12px] text-text-strong truncate">
                  {feedMap.get(selectedFeedHash) ?? selectedFeedHash.slice(0, 12) + "…"}
                </span>
                {entriesLoading && <Spinner />}
                {entriesError && (
                  <span role="alert" className="text-[11px] text-error">
                    集計データの取得に失敗しました
                  </span>
                )}
              </div>
            )}

            {/* サマリーカード */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="今週" value={displayWeeklyTotal} />
              <StatCard label="累計" value={stats.allTimeTotal} />
              <StatCard label="連続" value={`${stats.currentStreak}日`} />
            </div>

            {/* 週間目標 */}
            <WeeklyGoalSection weeklyTotal={displayWeeklyTotal} />

            {/* 年間ヒートマップ */}
            {displayYearlyHeatmap && displayYearlyHeatmap.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                  過去 1 年
                </span>
                <HeatmapCalendar data={displayYearlyHeatmap} />
              </div>
            )}

            {/* 直近 7 日バーグラフ */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                直近 7 日
              </span>
              <div className="flex flex-col gap-1.5">
                {(displayDailyReadCounts ?? []).map(({ date, count }) => {
                  const label = new Date(date + "T00:00:00Z").toLocaleDateString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    timeZone: "Asia/Tokyo",
                  });
                  return (
                    <div key={date} className="flex items-center gap-2">
                      <span className="text-[11px] text-text-faint w-10 flex-shrink-0 text-right tabular-nums">
                        {label}
                      </span>
                      <StatBar value={count} max={maxDaily} />
                      <span className="text-[11px] text-text-muted w-5 text-right tabular-nums flex-shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TOP フィード */}
            {stats.topFeeds.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                  よく読むフィード
                </span>
                <div className="flex flex-col gap-1.5">
                  {stats.topFeeds.map(({ feedHash, score }, i) => {
                    const title = feedMap.get(feedHash) ?? feedHash.slice(0, 12) + "…";
                    const maxScore = stats.topFeeds[0]?.score ?? 1;
                    const isSelected = selectedFeedHash === feedHash;
                    return (
                      <button
                        key={feedHash}
                        type="button"
                        onClick={() => setSelectedFeedHash(isSelected ? null : feedHash)}
                        aria-pressed={isSelected}
                        className={`flex items-center gap-2 -mx-1 px-1 py-0.5 rounded transition-colors ${
                          isSelected ? "bg-surface-subtle" : "hover:bg-surface-hover"
                        }`}
                      >
                        <span className="text-[11px] text-text-faint w-4 flex-shrink-0 text-right">
                          {i + 1}
                        </span>
                        <span
                          className={`text-[12px] truncate flex-1 min-w-0 text-left ${
                            isSelected ? "text-text-strong font-medium" : "text-text-default"
                          }`}
                        >
                          {title}
                        </span>
                        <StatBar value={score} max={maxScore} />
                        <span className="text-[11px] text-text-muted w-7 text-right tabular-nums flex-shrink-0">
                          {score}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* フィード別未読消化率 */}
            {inboxStats.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                  フィード別 未読消化率
                </span>
                <div className="flex flex-col gap-1.5">
                  {inboxStats.map(({ feedId, title, unread, readRatio }) => {
                    const pct = Math.round(readRatio * 100);
                    return (
                      <div key={feedId} className="flex items-center gap-2">
                        <span className="text-[12px] text-text-default truncate flex-1 min-w-0">
                          {title}
                        </span>
                        <div
                          className="flex-shrink-0 w-20"
                          role="img"
                          aria-label={`未読消化率 ${pct}%`}
                        >
                          <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{
                                width: `${pct}%`,
                                backgroundColor:
                                  unread === 0 ? "var(--color-accent-dot)" : "var(--color-ink)",
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-[11px] text-text-muted w-12 text-right tabular-nums flex-shrink-0">
                          {unread > 0 ? `${unread}未読` : "✓ 0"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stats.allTimeTotal === 0 && (
              <p className="text-[13px] text-text-faint text-center py-2">まだデータがありません</p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
