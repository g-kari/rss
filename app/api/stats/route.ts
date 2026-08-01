import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, engagementKey } from "@/lib/r2";
import type { EngagementLog } from "@/types";
import {
  toDateStr,
  buildDayList,
  getMondayIso,
  computeCurrentStreak,
  READ_ACTIONS,
} from "@/lib/stats-helpers";
import { checkSlidingWindow } from "@/lib/rate-limit";

const STATS_WINDOW_MS = 60 * 1000; // 60秒
const STATS_MAX_CALLS = 30; // 60秒あたり30回

export interface ReadingStats {
  /** 直近 7 日の日別アクション数（fetch_full / open_original のみ） */
  dailyReadCounts: { date: string; count: number }[];
  /** 過去 365 日のヒートマップ用日別アクション数（fetch_full / open_original のみ） */
  yearlyHeatmap: { date: string; count: number }[];
  /** 最もよく操作したフィード TOP5 */
  topFeeds: { feedHash: string; score: number }[];
  /** 今週（月曜〜）の合計アクション数 */
  weeklyTotal: number;
  /** 全期間の合計アクション数 */
  allTimeTotal: number;
  /** 連続活動日数（直近から遡って途切れた日数） */
  currentStreak: number;
}

export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const limited = await checkSlidingWindow(
      env.RATE_LIMIT,
      `${session.userId}:stats-rate-limit`,
      STATS_WINDOW_MS,
      STATS_MAX_CALLS,
    );
    if (limited) return limited;

    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });

    const entries = log.entries;
    const now = new Date();

    const last7Days = buildDayList(now, 7);
    const last365Days = buildDayList(now, 365);
    const mondayIso = getMondayIso(now);

    // 1 パスで全集計
    const dayCounts = new Map<string, number>(last7Days.map((d) => [d, 0]));
    const heatmapCounts = new Map<string, number>(last365Days.map((d) => [d, 0]));
    const feedCounts = new Map<string, number>();
    const activeDays = new Set<string>();
    let weeklyTotal = 0;
    let allTimeTotal = 0;

    for (const e of entries) {
      const isRead = READ_ACTIONS.has(e.action);
      if (isRead) {
        const d = toDateStr(e.timestamp);
        if (dayCounts.has(d)) dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
        if (heatmapCounts.has(d)) heatmapCounts.set(d, (heatmapCounts.get(d) ?? 0) + 1);
        if (e.timestamp >= mondayIso) weeklyTotal++;
        allTimeTotal++;
        activeDays.add(d);
      }
      if (e.action !== "ai_feedback") {
        feedCounts.set(e.feedHash, (feedCounts.get(e.feedHash) ?? 0) + 1);
      }
    }

    const dailyReadCounts = last7Days.map((date) => ({ date, count: dayCounts.get(date) ?? 0 }));
    const yearlyHeatmap = last365Days.map((date) => ({
      date,
      count: heatmapCounts.get(date) ?? 0,
    }));
    const topFeeds = [...feedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feedHash, score]) => ({ feedHash, score }));

    const stats: ReadingStats = {
      dailyReadCounts,
      yearlyHeatmap,
      topFeeds,
      weeklyTotal,
      allTimeTotal,
      currentStreak: computeCurrentStreak(activeDays, now),
    };

    return NextResponse.json(stats);
  });
}
