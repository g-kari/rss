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

// @cf/meta/llama-3.1-8b-instruct は workers-types 未掲載のため既知モデル型にキャスト
const MODEL = "@cf/meta/llama-3.1-8b-instruct" as "@cf/meta/llama-3.1-8b-instruct-fp8";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 時間
const MAX_RECOMMENDATIONS = 20;
const DISCOVER_TIMEOUT_MS = 10_000;

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

// ── トピック抽出 ────────────────────────────────────────────────

/**
 * ユーザーのエンゲージメントデータからトピックキーワードを抽出する。
 * エンゲージメントスコア上位のフィードの記事タイトルを AI に渡す。
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

  // 上位フィードのメタデータと記事タイトルを収集
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

  const prompt = `あなたはRSSリーダーのユーザーの興味を分析するアシスタントです。
以下のRSSフィード名と記事タイトルから、ユーザーの興味トピックを5-10個のキーワードで抽出してください。
JSON配列のみを返してください。例: ["TypeScript", "Rust", "クラウド"]

フィード名:
${feedTitles.join("\n")}

記事タイトル:
${articleTitles.slice(0, 30).join("\n")}`;

  try {
    const response = (await ai.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
    })) as { response?: string };
    const text = response.response ?? "";
    // JSON 配列を抽出（前後にテキストが含まれる場合に対応）
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string").slice(0, 10);
      }
    }
  } catch {
    // AI 失敗はフォールバックで対処
  }

  return [];
}

// ── AI フィード提案 ─────────────────────────────────────────────

/**
 * AI にトピックに関連する RSS フィード URL を提案させ、
 * discoverFeedUrl() で実在確認する。
 */
export async function generateAiSuggestions(
  topics: string[],
  subscribedUrls: Set<string>,
  ai: Ai,
): Promise<RecommendedFeed[]> {
  if (topics.length === 0) return [];

  const prompt = `あなたはRSSフィード推薦の専門家です。
以下のトピックに関連する、RSSフィードを提供している技術ブログやニュースサイトのURLを10個提案してください。
各URLはサイトのトップページURLを返してください（RSSフィードURLではなく）。
JSON配列のみを返してください。

フォーマット:
[{"url": "https://example.com", "title": "サイト名", "reason": "提案理由"}]

トピック: ${topics.join(", ")}

以下のサイトは既に購読中なので除外してください:
${[...subscribedUrls].slice(0, 20).join("\n")}`;

  let candidates: Array<{ url: string; title: string; reason: string }> = [];
  try {
    const response = (await ai.run(MODEL, {
      messages: [{ role: "user", content: prompt }],
    })) as { response?: string };
    const text = response.response ?? "";
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        candidates = parsed.filter(
          (x): x is { url: string; title: string; reason: string } =>
            typeof x === "object" &&
            x !== null &&
            typeof (x as Record<string, unknown>).url === "string" &&
            typeof (x as Record<string, unknown>).title === "string",
        );
      }
    }
  } catch {
    return [];
  }

  // 並行で discoverFeedUrl を実行（タイムアウト付き）
  const results: RecommendedFeed[] = [];
  const checks = candidates.slice(0, 10).map(async (candidate) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DISCOVER_TIMEOUT_MS);
      const feedUrl = await discoverFeedUrl(candidate.url);
      clearTimeout(timer);
      if (!feedUrl) return null;
      if (subscribedUrls.has(feedUrl)) return null;

      const id = await sha256Hex(`ai_${feedUrl}`);
      return {
        id: id.slice(0, 12),
        feedUrl,
        title: candidate.title || new URL(candidate.url).hostname,
        siteUrl: candidate.url,
        reason: candidate.reason || topics.slice(0, 3).join("・") + " に関連",
        source: "ai_suggestion" as const,
        score: 0.8,
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

  // トピック抽出
  const topics = await extractUserTopics(bucket, subscriptions, engagement, ai);

  // AI フィード提案（Phase 1 ではこれのみ）
  const aiResults = await generateAiSuggestions(topics, subscribedUrls, ai);

  // 既存の dismiss 済みを除外してキャッシュ
  const existingCache = await readCache(bucket, userId);
  const dismissedIds = new Set(existingCache?.dismissedIds ?? []);
  const recommendations = aiResults
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
