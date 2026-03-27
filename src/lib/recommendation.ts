import type {
  EngagementLog,
  RecommendedFeed,
  RecommendationCache,
  UserSubscription,
} from "../types";
import { r2Get, r2Put, sha256Hex } from "./r2";
import { scoreFeedEngagement, topScoredFeeds } from "./engagement-score";
import { discoverFeedUrl } from "./feed-discovery";
import { readFeedMeta, readLatestArticles } from "./shared-feed";
import { fetchWithTimeout } from "./fetch";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 時間
const MAX_RECOMMENDATIONS = 20;

function r2Key(userId: string) {
  return `users/${userId}/recommendations.json`;
}

/** キャッシュが有効か判定する */
export function isCacheValid(cache: RecommendationCache): boolean {
  if (!cache.generatedAt) return false;
  const age = Date.now() - new Date(cache.generatedAt).getTime();
  return age < CACHE_TTL_MS;
}

/** キャッシュを読み込む */
export async function readCache(
  bucket: R2Bucket,
  userId: string,
): Promise<RecommendationCache | null> {
  const cache = await r2Get<RecommendationCache | null>(bucket, r2Key(userId), null);
  return cache;
}

/** キャッシュを保存する */
export async function writeCache(
  bucket: R2Bucket,
  userId: string,
  cache: RecommendationCache,
): Promise<void> {
  await r2Put(bucket, r2Key(userId), cache);
}

// ── トピック抽出（ルールベース）───────────────────────────────────

/** 記事タイトル・フィード名から頻出語をトピックとして抽出する */
export async function extractUserTopics(
  bucket: R2Bucket,
  subscriptions: UserSubscription[],
  engagement: EngagementLog,
): Promise<string[]> {
  // エンゲージメントスコアで上位フィードを取得
  const scores = scoreFeedEngagement(engagement.entries);
  const topFeeds = topScoredFeeds(scores, 10);

  const feedTitles: string[] = [];
  const articleTitles: string[] = [];

  for (const feedHash of topFeeds) {
    const meta = await readFeedMeta(bucket, feedHash);
    if (meta?.title) feedTitles.push(meta.title);

    const articles = await readLatestArticles(bucket, feedHash);
    for (const a of articles.slice(0, 5)) {
      articleTitles.push(a.title);
    }
  }

  // フォールバック: エンゲージメントが少ない場合は購読フィード名を使う
  if (feedTitles.length === 0) {
    for (const sub of subscriptions.slice(0, 10)) {
      const meta = await readFeedMeta(bucket, sub.feedHash);
      if (meta?.title) feedTitles.push(meta.title);
    }
  }

  if (feedTitles.length === 0) return [];

  // フィード名をそのままトピックとして使いつつ、記事タイトルから頻出語を抽出
  const freq = new Map<string, number>();

  // フィード名は重みを高くして追加
  for (const title of feedTitles) {
    for (const token of tokenize(title)) {
      freq.set(token, (freq.get(token) ?? 0) + 3);
    }
  }

  // 記事タイトルから頻出語を集計
  for (const title of articleTitles) {
    for (const token of tokenize(title)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
  }

  // 出現頻度降順で上位 10 語を返す
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/**
 * テキストをトークン（単語）に分割する。
 * - 英数字: 2文字以上の連続（大文字小文字統一）
 * - カタカナ: 2文字以上の連続
 * - ストップワードを除去
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "in",
    "on",
    "at",
    "to",
    "for",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "with",
    "from",
    "by",
    "as",
    "that",
    "this",
    "it",
    "its",
    "how",
    "what",
    "why",
    "when",
    "new",
    "via",
  ]);

  const tokens: string[] = [];

  // 英数字・ハイフン連結語（2文字以上）
  const ascii = text.match(/[A-Za-z][A-Za-z0-9\-.]{1,}/g) ?? [];
  for (const w of ascii) {
    const lower = w.toLowerCase().replace(/[-.]$/, "");
    if (lower.length >= 2 && !stopWords.has(lower)) {
      tokens.push(lower);
    }
  }

  // カタカナ（2文字以上）
  const kata = text.match(/[\u30A0-\u30FF]{2,}/g) ?? [];
  tokens.push(...kata);

  return tokens;
}

// ── Web 検索フィード提案 ─────────────────────────────────────────

interface BraveWebResult {
  url: string;
  title: string;
  description: string;
}

interface BraveSearchResponse {
  web?: { results: BraveWebResult[] };
}

/**
 * Brave Search API でトピックを検索し、
 * 検索結果の URL から discoverFeedUrl() で RSS フィードを発見する。
 * BRAVE_SEARCH_API_KEY が未設定の場合は即座に [] を返す。
 */
export async function generateWebSearchFeeds(
  topics: string[],
  subscribedUrls: Set<string>,
): Promise<RecommendedFeed[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return [];
  if (topics.length === 0) return [];

  // トピック最大3つで検索クエリを構築
  const queries = topics.slice(0, 3).map((t) => `${t} RSS blog feed`);

  // Brave Search API を並列呼び出し
  const searchResults = await Promise.allSettled(
    queries.map(async (q) => {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`;
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            "X-Subscription-Token": apiKey,
            Accept: "application/json",
          },
        },
        5_000,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as BraveSearchResponse;
      return data.web?.results ?? [];
    }),
  );

  // 全クエリの結果をフラットに統合し、購読済みと重複ドメインを除外
  const seen = new Set<string>();
  const candidates: Array<{ url: string; title: string; topic: string }> = [];

  for (let i = 0; i < searchResults.length; i++) {
    const r = searchResults[i];
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      try {
        const hostname = new URL(item.url).hostname;
        if (seen.has(hostname)) continue;
        if (subscribedUrls.has(item.url)) continue;
        seen.add(hostname);
        candidates.push({ url: item.url, title: item.title, topic: topics[i] ?? topics[0] });
      } catch {
        // URL パース失敗はスキップ
      }
    }
  }

  // discoverFeedUrl() を並列実行
  const results: RecommendedFeed[] = [];
  const checks = candidates.slice(0, 10).map(async (candidate) => {
    try {
      const feedUrl = await discoverFeedUrl(candidate.url);
      if (!feedUrl) return null;
      if (subscribedUrls.has(feedUrl)) return null;

      const id = (await sha256Hex(`ws_${feedUrl}`)).slice(0, 12);
      return {
        id,
        feedUrl,
        title: candidate.title || new URL(candidate.url).hostname,
        siteUrl: candidate.url,
        reason: `「${candidate.topic}」の検索結果から発見`,
        source: "web_search" as const,
        score: 0.9,
      };
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(checks);
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      results.push(r.value);
    }
  }

  return results;
}

// ── メインのレコメンド生成関数 ──────────────────────────────────

export async function generateRecommendations(params: {
  userId: string;
  bucket: R2Bucket;
  subscriptions: UserSubscription[];
}): Promise<RecommendationCache> {
  const { userId, bucket, subscriptions } = params;

  // エンゲージメントログを取得
  const engagement = await r2Get<EngagementLog>(bucket, `users/${userId}/engagement.json`, {
    entries: [],
  });

  // 購読済み URL の Set を構築
  const subscribedUrls = new Set(subscriptions.map((s) => s.url));

  // トピック抽出（ルールベース）
  const topics = await extractUserTopics(bucket, subscriptions, engagement);

  // Web 検索でフィードを発見
  const webResults = await generateWebSearchFeeds(topics, subscribedUrls);

  // 既存の dismiss 済みを除外してキャッシュ
  const existingCache = await readCache(bucket, userId);
  const dismissedIds = new Set(existingCache?.dismissedIds ?? []);

  const recommendations = webResults
    .filter((r) => !dismissedIds.has(r.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECOMMENDATIONS);

  const cache: RecommendationCache = {
    recommendations,
    generatedAt: new Date().toISOString(),
    dismissedIds: [...dismissedIds],
    topics,
  };

  await writeCache(bucket, userId, cache);
  return cache;
}
