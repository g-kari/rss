"use client";

import { useEffect } from "react";
import Modal from "./Modal";
import Spinner from "./Spinner";
import { useReadingStats } from "../hooks/useReadingStats";
import type { Feed } from "../types";

interface Props {
  feeds: Feed[];
  onClose: () => void;
}

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="flex-1 h-1.5 bg-surface-subtle rounded-full overflow-hidden">
      <div
        className="h-full bg-ink rounded-full transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5 bg-surface-subtle rounded-lg px-3 py-2">
      <span className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
        {label}
      </span>
      <span className="text-[20px] font-light text-text-strong tabular-nums">{value}</span>
    </div>
  );
}

export default function ReadingStatsModal({ feeds, onClose }: Props) {
  const { stats, loading, error, fetch: fetchStats } = useReadingStats();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const feedMap = new Map(feeds.map((f) => [f.id, f.title]));

  const maxDaily = stats ? Math.max(...stats.dailyReadCounts.map((d) => d.count), 1) : 1;

  return (
    <Modal title="読書統計" onClose={onClose} width="sm:w-[480px]">
      <div className="px-4 py-4 flex flex-col gap-5">
        {loading && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {error && <p className="text-[13px] text-rose-400">{error}</p>}
        {stats && !loading && (
          <>
            {/* サマリーカード */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="今週" value={stats.weeklyTotal} />
              <StatCard label="累計" value={stats.allTimeTotal} />
              <StatCard label="連続" value={`${stats.currentStreak}日`} />
            </div>

            {/* 直近 7 日バーグラフ */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
                直近 7 日
              </span>
              <div className="flex flex-col gap-1.5">
                {stats.dailyReadCounts.map(({ date, count }) => {
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
                      <Bar value={count} max={maxDaily} />
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
                    return (
                      <div key={feedHash} className="flex items-center gap-2">
                        <span className="text-[11px] text-text-faint w-4 flex-shrink-0 text-right">
                          {i + 1}
                        </span>
                        <span className="text-[12px] text-text-default truncate flex-1 min-w-0">
                          {title}
                        </span>
                        <Bar value={score} max={maxScore} />
                        <span className="text-[11px] text-text-muted w-7 text-right tabular-nums flex-shrink-0">
                          {score}
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
