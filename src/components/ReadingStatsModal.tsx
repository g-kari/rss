"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import Spinner from "./Spinner";
import { useReadingStats } from "../hooks/useReadingStats";
import { useInboxProgress } from "../hooks/useInboxProgress";
import { useEngagementEntries } from "../hooks/useEngagementEntries";
import { aggregateStatsForFeed } from "../lib/stats-helpers";
import { storageGet, storageSet, STORAGE_KEYS } from "../lib/storage";
import type { Article, Feed } from "../types";

interface Props {
  feeds: Feed[];
  articles: Article[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
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

/** count を 0〜4 のレベルに変換（0=なし, 1=少, 2=中, 3=多, 4=最多） */
function countToLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-surface-subtle",
  1: "bg-ink opacity-20",
  2: "bg-ink opacity-40",
  3: "bg-ink opacity-70",
  4: "bg-ink",
};

interface HeatmapCalendarProps {
  /** 365 日分の { date: "YYYY-MM-DD", count: number }[] (古い順) */
  data: { date: string; count: number }[];
}

function HeatmapCalendar({ data }: HeatmapCalendarProps) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  const max = Math.max(...data.map((d) => d.count), 1);

  // 日曜始まりで 53 週 × 7 日のグリッドを構築
  // data[0] が最も古い日なので、その曜日（UTC 日曜=0）に合わせてパディング
  const firstDate = new Date(data[0]!.date + "T00:00:00Z");
  const firstDow = firstDate.getUTCDay(); // 0=Sun

  // グリッド配列: [週][曜日] = {date, count} | null
  type Cell = { date: string; count: number } | null;
  const weeks: Cell[][] = [];
  let week: Cell[] = Array(firstDow).fill(null);
  for (const entry of data) {
    week.push(entry);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  // 月ラベル（各週の最初のセルから月が変わる箇所を検出）
  const monthLabels: { weekIdx: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((w, wi) => {
    const first = w.find((c) => c !== null);
    if (!first) return;
    const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({
        weekIdx: wi,
        label: new Date(first.date + "T00:00:00Z").toLocaleDateString("ja-JP", {
          month: "short",
          timeZone: "UTC",
        }),
      });
      lastMonth = m;
    }
  });

  const CELL = 11; // px (cell size + gap)

  return (
    <div className="relative overflow-x-auto">
      {/* 月ラベル行 */}
      <div className="flex mb-1" style={{ paddingLeft: 0 }}>
        {weeks.map((_, wi) => {
          const lbl = monthLabels.find((m) => m.weekIdx === wi);
          return (
            <div key={wi} style={{ width: CELL, flexShrink: 0 }}>
              {lbl && <span className="text-[9px] text-text-faint leading-none">{lbl.label}</span>}
            </div>
          );
        })}
      </div>

      {/* グリッド本体（列 = 週、行 = 曜日） */}
      <div className="flex gap-[1px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[1px]">
            {w.map((cell, di) => {
              if (!cell) {
                return <div key={di} style={{ width: 10, height: 10 }} />;
              }
              const level = countToLevel(cell.count, max);
              const dateLabel = new Date(cell.date + "T00:00:00Z").toLocaleDateString("ja-JP", {
                month: "numeric",
                day: "numeric",
                timeZone: "UTC",
              });
              return (
                <div
                  key={di}
                  className={`rounded-[2px] cursor-default transition-opacity ${LEVEL_CLASSES[level]}`}
                  style={{ width: 10, height: 10 }}
                  onMouseEnter={(e) => {
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setTooltip({
                      text: `${dateLabel}: ${cell.count} 件`,
                      x: rect.left + 5,
                      y: rect.top - 4,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ツールチップ（fixed position） */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-[11px] text-ink-text bg-ink rounded shadow-sm pointer-events-none whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

const DEFAULT_WEEKLY_GOAL = 20;

function WeeklyGoalSection({ weeklyTotal }: { weeklyTotal: number }) {
  const [goal, setGoal] = useState<number>(() => {
    const stored = storageGet(STORAGE_KEYS.WEEKLY_GOAL);
    const parsed = stored ? parseInt(stored, 10) : NaN;
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_WEEKLY_GOAL : parsed;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = Math.min(Math.round((weeklyTotal / goal) * 100), 100);
  const achieved = weeklyTotal >= goal;

  function startEdit() {
    setDraft(String(goal));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commitEdit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n > 0) {
      setGoal(n);
      storageSet(STORAGE_KEYS.WEEKLY_GOAL, String(n));
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted">
          週間目標
        </span>
        <div className="flex items-center gap-1 text-[11px] tabular-nums">
          <span className={achieved ? "text-accent-dot font-medium" : "text-text-default"}>
            {weeklyTotal}
          </span>
          <span className="text-text-faint">/</span>
          {editing ? (
            <input
              ref={inputRef}
              type="number"
              min={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="w-10 bg-surface-subtle text-text-strong rounded px-1 text-center text-[11px] outline-none border border-border-default focus:border-ink"
            />
          ) : (
            <button
              onClick={startEdit}
              className="text-text-muted hover:text-text-strong transition-colors cursor-text"
              title="目標を変更"
            >
              {goal}
            </button>
          )}
          <span className="text-text-faint ml-0.5">件</span>
          {achieved && (
            <span className="ml-1 text-accent-dot" title="達成！">
              ✓
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-surface-subtle rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: achieved ? "var(--color-accent-dot)" : "var(--color-ink)",
          }}
        />
      </div>
      <span className="text-[10px] text-text-faint text-right tabular-nums">{pct}%</span>
    </div>
  );
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
          <p role="alert" className="text-[13px] text-rose-400">
            {error}
          </p>
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
                  <span role="alert" className="text-[11px] text-rose-400">
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
                        <Bar value={score} max={maxScore} />
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
                        <div className="flex-shrink-0 w-20">
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
