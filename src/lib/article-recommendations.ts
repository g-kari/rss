import type { Article, Feed } from "../types";
import { isArticleRead } from "./article-filter";
import { getArticleTimestamp } from "./article-utils";
import {
  normalizeRecommendationTopic,
  parseTopicPreferences,
  TOPIC_PREFERENCE_POINTS,
  type TopicPreference,
} from "./recommendation-topics";

export interface ArticleRecommendation {
  article: Article;
  feedTitle: string;
  reasons: string[];
  /** Exact score contributions at selection time, not an AI explanation or probability. */
  explanation?: ArticleRecommendationExplanation;
}

export interface ArticleRecommendationExplanation {
  topics: { topic: string; label: string }[];
  freshness: { points: number; ageHours: number | null; source: "published" | "received" };
  interest: { points: number; topic: string; saved: boolean };
  feed: { points: number; views: number };
  priorityPoints: number;
  preferences: { topic: string; label: string; value: "more" | "less" }[];
  preferencePoints: number;
  diversityPenalty: number;
  total: number;
}

export interface ArticleRecommendationOptions {
  /** Already filtered by the reader: never retrieve or expand this candidate pool. */
  candidates: Article[];
  /** Strict state/content scope before unread exclusion; only retains already painted cards. */
  displayCandidates?: Article[];
  /** Evidence after the same content/view filters, before the unread-only filter. */
  articles: Article[];
  feeds: Feed[];
  readIds: Set<string>;
  readBeforeTimestamp?: string | null;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  likeIds: Set<string>;
  historyIds: Set<string>;
  dismissedIds: Set<string>;
  now: number;
  limit?: number;
  topicPreferences?: TopicPreference[];
}

const DAY_MS = 86400000;

function articleTopics(article: Article, feed: Feed): Map<string, string> {
  const topics = new Map<string, string>();
  for (const label of [...(article.categories ?? []), feed.category ?? ""]) {
    const trimmed = label.trim().slice(0, 60);
    if (trimmed) topics.set(normalizeRecommendationTopic(trimmed), trimmed);
  }
  return topics;
}

/**
 * Explainable, entirely local ranking. Saved/liked articles are stronger signals than
 * views. Read flags (including bulk mark-read) only exclude candidates, never train it.
 * Both pools must already respect content/view filters. The evidence pool retains
 * read articles so an exhausted feed can still inform topics in other visible feeds.
 */
export function rankArticleRecommendations(
  options: ArticleRecommendationOptions,
): ArticleRecommendation[] {
  const {
    candidates,
    articles,
    feeds,
    now,
    readIds,
    dismissedIds,
    bookmarkIds,
    likeIds,
    historyIds,
    readingListIds,
  } = options;
  const limit = Math.max(0, Math.min(10, Math.floor(options.limit ?? 3)));
  if (!limit || !candidates.length) return [];
  const feedMap = new Map(feeds.map((feed) => [feed.id, feed]));
  const feedAffinity = new Map<string, number>();
  const topicAffinity = new Map<string, number>();
  const savedTopics = new Set<string>();
  const viewedCount = new Map<string, number>();
  const seenSignals = new Set<string>();
  for (const article of articles) {
    if (seenSignals.has(article.id)) continue;
    seenSignals.add(article.id);
    const feed = feedMap.get(article.feedHash);
    if (!feed || (feed.mutedUntil && Date.parse(feed.mutedUntil) > now)) continue;
    // Cap each article's contribution; repeated interactions are not counted twice.
    const weight =
      likeIds.has(article.id) || bookmarkIds.has(article.id)
        ? 3
        : readingListIds.has(article.id)
          ? 2
          : historyIds.has(article.id)
            ? 0.5
            : 0;
    if (!weight) continue;
    feedAffinity.set(feed.id, (feedAffinity.get(feed.id) ?? 0) + weight);
    if (historyIds.has(article.id)) viewedCount.set(feed.id, (viewedCount.get(feed.id) ?? 0) + 1);
    for (const topic of articleTopics(article, feed).keys()) {
      topicAffinity.set(topic, (topicAffinity.get(topic) ?? 0) + weight);
      if (
        bookmarkIds.has(article.id) ||
        likeIds.has(article.id) ||
        readingListIds.has(article.id)
      ) {
        savedTopics.add(topic);
      }
    }
  }
  const preferenceMap = new Map(
    parseTopicPreferences(options.topicPreferences).map((entry) => [entry.topic, entry]),
  );
  const readBeforeMs = options.readBeforeTimestamp ? Date.parse(options.readBeforeTimestamp) : null;
  const scored = candidates.flatMap((article) => {
    const feed = feedMap.get(article.feedHash);
    if (
      !feed ||
      dismissedIds.has(article.id) ||
      isArticleRead(article, readIds, readBeforeMs) ||
      (feed.mutedUntil && Date.parse(feed.mutedUntil) > now)
    )
      return [];
    const timestamp = Date.parse(getArticleTimestamp(article));
    const age = now - timestamp;
    // Future and malformed source dates must not masquerade as newly published news.
    const knownAge = Number.isFinite(age) && age >= 0;
    const freshness = knownAge ? 8 * Math.exp(-age / (3 * DAY_MS)) : 0;
    let bestTopic = "";
    let bestTopicSaved = false;
    let topicScore = 0;
    const topics = articleTopics(article, feed);
    for (const [topic, label] of topics) {
      const score = topicAffinity.get(topic) ?? 0;
      if (score > topicScore) {
        topicScore = score;
        bestTopic = label;
        bestTopicSaved = savedTopics.has(topic);
      }
    }
    const receivedDate = !article.publishedAt;
    const reasons = [
      knownAge && age <= DAY_MS
        ? receivedDate
          ? "24時間以内に取得"
          : "24時間以内の新着"
        : "未読の記事",
    ];
    const preferences = [...topics].flatMap(([topic, label]) => {
      const preference = preferenceMap.get(topic);
      return preference ? [{ topic, label, value: preference.value }] : [];
    });
    // Multiple tags cannot stack an unbounded boost or erase eligibility. Opposing
    // choices cancel; the total adjustment is bounded to the same +/-6 points.
    const preferencePoints = Math.max(
      -TOPIC_PREFERENCE_POINTS,
      Math.min(
        TOPIC_PREFERENCE_POINTS,
        preferences.reduce(
          (sum, entry) =>
            sum + (entry.value === "more" ? TOPIC_PREFERENCE_POINTS : -TOPIC_PREFERENCE_POINTS),
          0,
        ),
      ),
    );
    if (preferencePoints !== 0)
      reasons.push(
        preferencePoints > 0
          ? "増やしたい話題と一致"
          : "減らしたい話題と一致（優先度を下げています）",
      );
    if (topicScore > 0)
      reasons.push(
        `${bestTopicSaved ? "保存・いいねした記事と同じテーマ" : "読んだ記事と同じテーマ"}: ${bestTopic}`,
      );
    else if (feed.priority === "high") reasons.push("スター付きフィード");
    else if ((viewedCount.get(feed.id) ?? 0) >= 2) reasons.push("読んだことのあるフィード");
    const interestPoints = Math.min(6, topicScore * 1.5);
    const feedPoints = Math.min(3, feedAffinity.get(feed.id) ?? 0);
    const priorityPoints = feed.priority === "high" ? 2 : 0;
    const score = freshness + interestPoints + feedPoints + priorityPoints + preferencePoints;
    const explanation: ArticleRecommendationExplanation = {
      topics: [...topics].map(([topic, label]) => ({ topic, label })),
      freshness: {
        points: freshness,
        ageHours: knownAge ? age / 3600000 : null,
        source: receivedDate ? "received" : "published",
      },
      interest: { points: interestPoints, topic: bestTopic, saved: bestTopicSaved },
      feed: { points: feedPoints, views: viewedCount.get(feed.id) ?? 0 },
      priorityPoints,
      preferences,
      preferencePoints,
      diversityPenalty: 0,
      total: score,
    };
    return [
      {
        article,
        feedTitle: feed.title,
        reasons,
        score,
        explanation,
        timestamp: knownAge ? timestamp : 0,
        topic: normalizeRecommendationTopic(bestTopic),
      },
    ];
  });
  // Stable tie-breaking makes the same evidence produce the same order on refresh.
  scored.sort(
    (a, b) =>
      b.score - a.score || b.timestamp - a.timestamp || a.article.id.localeCompare(b.article.id),
  );
  const selected: ArticleRecommendation[] = [];
  const seenIds = new Set<string>();
  const seenLinks = new Set<string>();
  const feedCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  while (selected.length < limit) {
    let best: (typeof scored)[number] | undefined;
    let bestScore = -Infinity;
    for (const item of scored) {
      if (seenIds.has(item.article.id) || (item.article.link && seenLinks.has(item.article.link)))
        continue;
      const adjusted =
        item.score -
        (feedCounts.get(item.article.feedHash) ?? 0) * 12 -
        (topicCounts.get(item.topic) ?? 0) * 2;
      if (adjusted > bestScore) {
        best = item;
        bestScore = adjusted;
      }
    }
    if (!best) break;
    const diversityPenalty = best.score - bestScore;
    selected.push({
      article: best.article,
      feedTitle: best.feedTitle,
      reasons: best.reasons,
      explanation: { ...best.explanation, diversityPenalty, total: bestScore },
    });
    seenIds.add(best.article.id);
    if (best.article.link) seenLinks.add(best.article.link);
    feedCounts.set(best.article.feedHash, (feedCounts.get(best.article.feedHash) ?? 0) + 1);
    if (best.topic) topicCounts.set(best.topic, (topicCounts.get(best.topic) ?? 0) + 1);
  }
  return selected;
}
