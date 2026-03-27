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

// gemma-3-12b-it: 日本語・英語混在タイトルのトピック抽出に使用
const MODEL = "@cf/google/gemma-3-12b-it" as Parameters<Ai["run"]>[0];

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

// ── トピック抽出（Gemma AI）──────────────────────────────────────

/**
 * ユーザーのエンゲージメントデータからトピックキーワードを抽出する。
 * Gemma 3 12B でフィード名・記事タイトルを解析し、日本語・英語混在に対応。
 */
export async function extractUserTopics(
  bucket: R2Bucket,
  subscriptions: UserSubscription[],
  engagement: EngagementLog,
  ai: Ai,
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

  const prompt = `You are an assistant that analyzes RSS reader interests.
Extract 5-10 topic keywords from the feed names and article titles below.
Return a JSON array only. Example: ["TypeScript", "Rust", "クラウド"]

Feed names:
${feedTitles.join("\n")}

Article titles:
${articleTitles.slice(0, 30).join("\n")}`;

  try {
    const response = (await ai.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
    })) as { response?: string };
    const text = response.response ?? "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string").slice(0, 10);
      }
    }
  } catch {
    // AI 失敗時は空配列（Brave Search は topics なしでも動作しない）
  }

  return [];
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
  ai: Ai;
  subscriptions: UserSubscription[];
}): Promise<RecommendationCache> {
  const { userId, bucket, ai, subscriptions } = params;

  // エンゲージメントログを取得
  const engagement = await r2Get<EngagementLog>(bucket, `users/${userId}/engagement.json`, {
    entries: [],
  });

  // 購読済み URL の Set を構築
  const subscribedUrls = new Set(subscriptions.map((s) => s.url));

  // トピック抽出（Gemma AI）
  const topics = await extractUserTopics(bucket, subscriptions, engagement, ai);

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
