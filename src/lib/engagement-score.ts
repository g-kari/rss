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
 *
 * R2 由来の engagement.json は外部データで legacy / 破損 timestamp が混入しうるため防御する:
 * - 不正 / 欠落 timestamp (NaN) は decay=0 (スコア寄与なし)。NaN が score 合計に伝播すると
 *   正常 entry 混在 feed が NaN 合計で top-N から脱落 + sort 不安定になるのを防ぐ。
 * - 未来 timestamp (時計戻り、ageMs < 0) は Math.max(0, ageMs) で decay 上限 1.0 に clamp。
 *   負の指数で score が増幅 (94917 倍等) して top-N を独占するのを防ぐ
 *   (auto-read-persist の clock-back ガードと同方針)。
 */
function timeDecay(timestamp: string, now: number): number {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageMs = Math.max(0, now - t);
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
 * 指定フィードの記事 ID をエンゲージメントスコア降順で返す。
 * フィード集計と同じアクション重み・時間減衰を使い、AI 興味推定などの記事選択に利用する。
 */
export function rankEngagedArticleIds(
  entries: EngagementEntry[],
  feedHash: string,
  now?: number,
): string[] {
  const scores = new Map<string, number>();
  const currentTime = now ?? Date.now();

  for (const entry of entries) {
    if (entry.feedHash !== feedHash) continue;
    const score = ACTION_WEIGHTS[entry.action] * timeDecay(entry.timestamp, currentTime);
    if (!Number.isFinite(score) || score <= 0) continue;
    scores.set(entry.articleId, (scores.get(entry.articleId) ?? 0) + score);
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([articleId]) => articleId);
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
  const eligible: Array<[string, number]> = [];
  for (const entry of scores) {
    if (entry[1] >= minScore) eligible.push(entry);
  }

  eligible.sort((a, b) => b[1] - a[1]);
  const top = eligible.slice(0, limit);
  const feedHashes: string[] = [];
  for (const [feedHash] of top) feedHashes.push(feedHash);
  return feedHashes;
}
