import type { EngagementAction, EngagementEntry } from "../types";

/**
 * エンゲージメントアクション別のスコア重み。
 * ユーザーの意図の強さに基づいて設定されており、like が最も高く、reading_list が最も低い。
 */
const ACTION_WEIGHTS: Record<EngagementAction, number> = {
  like: 5.0,
  bookmark: 4.0,
  fetch_full: 3.0,
  open_original: 2.5,
  reading_list: 2.0,
  ai_feedback: 0, // レーティングイベントはスコア算出対象外
};

/**
 * 時間減衰: 半減期 7 日の指数減衰。
 * 7日前: 0.5、14日前: 0.25、30日前: 約 0.095
 */
function timeDecay(timestamp: string, now: number): number {
  const ageMs = now - new Date(timestamp).getTime();
  const halfLifeMs = 7 * 24 * 60 * 60 * 1000;
  return Math.pow(0.5, ageMs / halfLifeMs);
}

/**
 * feedHash ごとのエンゲージメントスコアを算出する。
 * 重み × 時間減衰の積算。同じフィードで複数アクションがあれば加算される。
 */
export function scoreFeedEngagement(entries: EngagementEntry[], now?: number): Map<string, number> {
  const scores = new Map<string, number>();
  const currentTime = now ?? Date.now();
  for (const entry of entries) {
    const weight = ACTION_WEIGHTS[entry.action];
    const decay = timeDecay(entry.timestamp, currentTime);
    const current = scores.get(entry.feedHash) ?? 0;
    scores.set(entry.feedHash, current + weight * decay);
  }
  return scores;
}

/**
 * スコア上位のフィードハッシュをスコア降順で返す。
 * minScore 未満のフィードは除外する（デフォルト 0.1）。
 */
export function topScoredFeeds(
  scores: Map<string, number>,
  limit: number,
  minScore = 0.1,
): string[] {
  return [...scores.entries()]
    .filter(([, score]) => score >= minScore)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([feedHash]) => feedHash);
}
