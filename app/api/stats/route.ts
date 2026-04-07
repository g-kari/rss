import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { r2Get, engagementKey } from "@/lib/r2";
import type { EngagementEntry, EngagementLog } from "@/types";

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

const READ_ACTIONS: EngagementEntry["action"][] = ["fetch_full", "open_original"];

function toDateStr(ts: string): string {
  return ts.slice(0, 10); // "YYYY-MM-DD"
}

export async function GET() {
  return withSession(async ({ session, env }) => {
    const log = await r2Get<EngagementLog>(env.RSS_DATA, engagementKey(session.userId), {
      entries: [],
    });

    const entries = log.entries;
    const now = new Date();
    const todayStr = toDateStr(now.toISOString());

    // 直近 7 日の日別カウント
    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      last7Days.push(toDateStr(d.toISOString()));
    }
    const dayCounts = new Map<string, number>(last7Days.map((d) => [d, 0]));
    for (const e of entries) {
      if (!READ_ACTIONS.includes(e.action)) continue;
      const d = toDateStr(e.timestamp);
      if (dayCounts.has(d)) {
        dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
      }
    }
    const dailyReadCounts = last7Days.map((date) => ({ date, count: dayCounts.get(date) ?? 0 }));

    // 過去 365 日のヒートマップ用日別カウント
    const last365Days: string[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      last365Days.push(toDateStr(d.toISOString()));
    }
    const heatmapCounts = new Map<string, number>(last365Days.map((d) => [d, 0]));
    for (const e of entries) {
      if (!READ_ACTIONS.includes(e.action)) continue;
      const d = toDateStr(e.timestamp);
      if (heatmapCounts.has(d)) {
        heatmapCounts.set(d, (heatmapCounts.get(d) ?? 0) + 1);
      }
    }
    const yearlyHeatmap = last365Days.map((date) => ({
      date,
      count: heatmapCounts.get(date) ?? 0,
    }));

    // 今週（UTC 月曜）の合計
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const weeklyTotal = entries.filter(
      (e) => READ_ACTIONS.includes(e.action) && new Date(e.timestamp) >= monday,
    ).length;

    // 全期間合計（read アクションのみ）
    const allTimeTotal = entries.filter((e) => READ_ACTIONS.includes(e.action)).length;

    // フィード別スコア（全アクション対象、件数で単純集計）
    const feedCounts = new Map<string, number>();
    for (const e of entries) {
      if (e.action === "ai_feedback") continue;
      feedCounts.set(e.feedHash, (feedCounts.get(e.feedHash) ?? 0) + 1);
    }
    const topFeeds = [...feedCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([feedHash, score]) => ({ feedHash, score }));

    // 連続活動日数（UTC 日単位）
    const activeDays = new Set(
      entries.filter((e) => READ_ACTIONS.includes(e.action)).map((e) => toDateStr(e.timestamp)),
    );
    let streak = 0;
    // 今日がアクティブなら今日から遡る、そうでなければ昨日から
    let checkDate = activeDays.has(todayStr)
      ? new Date(now)
      : (() => {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 1);
          return d;
        })();
    while (activeDays.has(toDateStr(checkDate.toISOString()))) {
      streak++;
      checkDate.setUTCDate(checkDate.getUTCDate() - 1);
    }

    const stats: ReadingStats = {
      dailyReadCounts,
      yearlyHeatmap,
      topFeeds,
      weeklyTotal,
      allTimeTotal,
      currentStreak: streak,
    };

    return NextResponse.json(stats);
  });
}
