import type { EngagementEntry } from "../types";
import { scoreFeedEngagement } from "./engagement-score";

/**
 * 全ユーザー集約後のフィードスコア情報。
 *
 * #803 Phase 1 — cron 側で「全ユーザーで人気の feed 上位 N」を確定し、本文・OGP・
 * 画像の prefetch 対象を決めるために使う純粋関数。Phase 2 / Phase 3 で cron に
 * 統合する基盤。
 */
export interface GlobalFeedScore {
  /** フィードの sha256 短縮ハッシュ */
  feedHash: string;
  /** 全ユーザーの engagement score 合計 (重み × 時間減衰) */
  totalScore: number;
  /** この feed に engagement した distinct ユーザー数 */
  userCount: number;
}

/**
 * 複数ユーザーの engagement entries を集約し、グローバル top-N の feed を
 * `totalScore` 降順で返す純粋関数。
 *
 * - 各ユーザーごとに `scoreFeedEngagement` を呼んで feed 別 score Map を作成
 * - 全 Map を merge して `totalScore` (合計) と `userCount` (distinct ユーザー数) を集約
 * - `minScore` 未満の feed は除外 (デフォルト 0.1、`topScoredFeeds` と同基準)
 * - `totalScore` 降順で `limit` 件まで返す
 *
 * Cron の subrequest 50 件上限を考慮して呼び出し側で `limit` を制限する想定
 * (例: limit=50 / minScore=1.0)。
 *
 * @param allUsersEntries - 各ユーザーの engagement entries 配列 (`EngagementEntry[][]`)
 * @param limit - 取得する上位 feed 件数
 * @param now - 現在時刻 (テスト時の引数化用、未指定なら `Date.now()`)
 * @param minScore - この値未満の feed は除外 (デフォルト 0.1)
 * @returns GlobalFeedScore[] - totalScore 降順
 */
export function aggregateGlobalTopFeeds(
  allUsersEntries: EngagementEntry[][],
  limit: number,
  now?: number,
  minScore = 0.1,
): GlobalFeedScore[] {
  const currentTime = now ?? Date.now();
  // feedHash → { totalScore, userCount }
  const agg = new Map<string, { totalScore: number; userCount: number }>();

  for (const userEntries of allUsersEntries) {
    const userScores = scoreFeedEngagement(userEntries, currentTime);
    for (const [feedHash, score] of userScores) {
      const current = agg.get(feedHash);
      if (current) {
        current.totalScore += score;
        current.userCount += 1;
      } else {
        agg.set(feedHash, { totalScore: score, userCount: 1 });
      }
    }
  }

  const eligible: Array<[string, { totalScore: number; userCount: number }]> = [];
  for (const entry of agg) {
    if (entry[1].totalScore >= minScore) eligible.push(entry);
  }

  eligible.sort((a, b) => b[1].totalScore - a[1].totalScore);
  const top = eligible.slice(0, limit);
  const result: GlobalFeedScore[] = [];
  for (const [feedHash, { totalScore, userCount }] of top) {
    result.push({ feedHash, totalScore, userCount });
  }
  return result;
}
