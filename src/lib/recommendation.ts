import type {
  EngagementLog,
  RecommendedFeed,
  RecommendationCache,
  UserSubscription,
} from "../types";
import { r2Get, r2Put, sha256Hex, engagementKey } from "./r2";
import { scoreFeedEngagement, topScoredFeeds } from "./engagement-score";
import { discoverFeedUrl } from "./feed-discovery";
import { buildFeedUserMap, readFeedMeta, readLatestArticles } from "./shared-feed";
import { fetchWithTimeout } from "./fetch";
import { buildContentCacheKey } from "./fetch-article-content";

// gemma-3-12b-it: 日本語・英語混在タイトルのトピック抽出に使用
const MODEL = "@cf/google/gemma-3-12b-it" as Parameters<Ai["run"]>[0];

/** Promise.allSettled の結果から fulfilled かつ非 null の値だけを収集する */
function fulfilledValues<T>(settled: PromiseSettledResult<T | null>[]): T[] {
  return settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
}

/**
 * 外部入力文字列をプロンプトに埋め込む前にサニタイズする。
 * 改行・制御文字を除去し、最大長に切り詰める。
 * 悪意ある RSS フィードによるプロンプトインジェクションを緩和する。
 */
/**
 * LLM プロンプトに埋め込む前に外部入力（RSS タイトル等）を無害化する。
 *
 * 多層防御アプローチ:
 *   1. 制御文字・ゼロ幅・方向制御文字を除去
 *   2. LLM チャットテンプレートトークン（<|im_start|>, [INST], <s> 等）を中和
 *   3. プロンプト区切りとして悪用されがちな記号の連続（`---`, `###`, ``` など）を除去
 *   4. 空白を正規化し、長さ上限で切り詰める
 *
 * 記事タイトルなど日本語・英数字の正当な文字は保持する。
 */
/**
 * LLM プロンプトに埋め込む前に外部入力（RSS タイトル等）を無害化する。
 *
 * 多層防御アプローチ:
 *   1. NFKC 正規化で全角・互換文字を半角化（`［／ＩＮＳＴ］` 等によるバイパスを防止）
 *   2. 制御文字・ゼロ幅・方向制御文字を除去
 *   3. LLM チャットテンプレートトークン（<|im_start|>, [INST], <s>, <<SYS>> 等）を中和
 *   4. プロンプト区切りとして悪用されがちな記号の連続（`---`, `###`, ``` など）を除去
 *   5. 空白を正規化し、長さ上限で切り詰める
 *
 * 記事タイトルなど日本語・英数字の正当な文字は保持する。
 */
export function sanitizeForPrompt(text: string, maxLength = 120): string {
  return text
    .normalize("NFKC")
    .replace(/[\x00-\x1F\x7F\u200B-\u200D\u2028\u2029\u202A-\u202E\uFEFF]/g, " ")
    .replace(/<\|[^>|]*\|>/g, " ")
    .replace(/<<\/?SYS>>/gi, " ")
    .replace(/\[\/?(?:INST|SYSTEM|USER|ASSISTANT)\]/gi, " ")
    .replace(/<\/?s>/g, " ")
    .replace(/[-=#*`"'~_]{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** フィード URL とプレフィックスから短縮 ID を生成する */
async function makeRecommendationId(prefix: string, feedUrl: string): Promise<string> {
  return (await sha256Hex(`${prefix}_${feedUrl}`)).slice(0, 12);
}

/**
 * サイト URL から RSS フィードを発見してレコメンドフィードを構築する共通ロジック。
 * discoverFeedUrl・makeRecommendationId の重複を排除する。
 */
async function discoverAndBuildFeed(
  siteUrl: string,
  subscribedUrls: Set<string>,
  idPrefix: string,
  buildMeta: () => Omit<RecommendedFeed, "id" | "feedUrl">,
): Promise<RecommendedFeed | null> {
  try {
    const feedUrl = await discoverFeedUrl(siteUrl);
    if (!feedUrl || subscribedUrls.has(feedUrl)) return null;
    const id = await makeRecommendationId(idPrefix, feedUrl);
    return { id, feedUrl, ...buildMeta() };
  } catch {
    return null;
  }
}

/** Fisher-Yates シャッフルで配列から最大 n 件をランダムサンプリングする */
function sampleN<T>(arr: T[], n: number): T[] {
  const result = arr.slice();
  const count = Math.min(n, result.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (result.length - i));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, count);
}

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
  return r2Get<RecommendationCache | null>(bucket, r2Key(userId), null);
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
  // エンゲージメントスコアで上位フィードを取得（上位5件に絞り、偏りを抑える）
  const scores = scoreFeedEngagement(engagement.entries);
  const topFeeds = topScoredFeeds(scores, 5);

  const feedTitles: string[] = [];
  const articleTitles: string[] = [];

  // 上位フィードのメタ・記事を並列取得
  const topFeedData = await Promise.all(
    topFeeds.map(async (feedHash) => {
      const [meta, articles] = await Promise.all([
        readFeedMeta(bucket, feedHash),
        readLatestArticles(bucket, feedHash),
      ]);
      return { meta, articles };
    }),
  );
  for (const { meta, articles } of topFeedData) {
    if (meta?.title) feedTitles.push(meta.title);
    for (const a of articles.slice(0, 5)) {
      articleTitles.push(a.title);
    }
  }

  // 多様性確保: エンゲージメント上位以外の購読フィードからもランダムにサンプリング
  const topFeedSet = new Set(topFeeds);
  const otherSubs = subscriptions.filter((s) => !topFeedSet.has(s.feedHash));
  // Fisher-Yates シャッフルでランダムに最大5件追加
  const sampledSubs = sampleN(otherSubs, 5);
  // サンプリングフィードのメタを並列取得
  const sampledMetas = await Promise.all(
    sampledSubs.map((sub) => readFeedMeta(bucket, sub.feedHash)),
  );
  for (const meta of sampledMetas) {
    if (meta?.title) feedTitles.push(meta.title);
  }

  if (feedTitles.length === 0) return [];

  // プロンプトインジェクション対策: 外部 RSS から取得したタイトルをサニタイズしてから埋め込む
  const sanitizedFeedTitles = feedTitles.map((t) => sanitizeForPrompt(t)).join("\n");
  const sanitizedArticleTitles = articleTitles
    .slice(0, 30)
    .map((t) => sanitizeForPrompt(t))
    .join("\n");

  try {
    const response = (await ai.run(MODEL, {
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that analyzes RSS reader interests. " +
            "Extract 5-10 DIVERSE topic keywords from the feed names and article titles provided by the user. " +
            "Ensure variety across different domains — avoid repeating similar themes. " +
            "If multiple feeds share the same genre (e.g. anime), represent it with one keyword only. " +
            'Return a JSON array only. Example: ["TypeScript", "Rust", "クラウド", "アニメ"]',
        },
        {
          role: "user",
          content: `Feed names:\n${sanitizedFeedTitles}\n\nArticle titles:\n${sanitizedArticleTitles}`,
        },
      ],
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

  for (const [i, r] of searchResults.entries()) {
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
  const checks = candidates.slice(0, 10).map((candidate) =>
    discoverAndBuildFeed(candidate.url, subscribedUrls, "ws", () => ({
      title: candidate.title || new URL(candidate.url).hostname,
      siteUrl: candidate.url,
      reason: `「${sanitizeForPrompt(candidate.topic, 60)}」の検索結果から発見`,
      source: "web_search" as const,
      score: 0.9,
    })),
  );

  return fulfilledValues(await Promise.allSettled(checks));
}

// ── 人気フィードランキング ────────────────────────────────────────

/**
 * 他ユーザーの購読数が多いフィードを推薦する。
 * subscribedFeedHashes に含まれるフィード（既購読）は除外する。
 */
export async function generatePopularFeeds(
  bucket: R2Bucket,
  subscribedFeedHashes: Set<string>,
): Promise<RecommendedFeed[]> {
  const { feedUserMap } = await buildFeedUserMap(bucket);

  // 未購読フィードを購読者数降順でソート
  const ranked = [...feedUserMap.entries()]
    .filter(([feedHash]) => !subscribedFeedHashes.has(feedHash))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);

  if (ranked.length === 0) return [];

  const maxCount = ranked[0][1].length;

  const checks = ranked.map(async ([feedHash, userIds]) => {
    try {
      const meta = await readFeedMeta(bucket, feedHash);
      if (!meta?.url) return null;

      const subscriberCount = userIds.length;
      // 購読者数を 0.5〜0.85 に正規化（Web 検索 0.9 より低く設定）
      const score = maxCount > 1 ? 0.5 + (subscriberCount / maxCount) * 0.35 : 0.5;

      const id = await makeRecommendationId("pop", meta.url);
      return {
        id,
        feedUrl: meta.url,
        title: meta.title ?? meta.url,
        siteUrl: meta.siteUrl ?? meta.url,
        reason: `${subscriberCount}人が購読中`,
        source: "popular" as const,
        score,
      };
    } catch {
      return null;
    }
  });

  return fulfilledValues(await Promise.allSettled(checks));
}

// ── リンク発見（Link Discovery） ─────────────────────────────────

const HIGH_SIGNAL_ACTIONS = new Set(["bookmark", "like", "fetch_full"]);

/**
 * ブックマーク・いいね・全文取得した記事の Cloudflare Cache キャッシュを読み、
 * 記事本文内のリンクから RSS フィードを発見する。
 * キャッシュミスの記事はスキップ（外部 fetch は行わない）。
 */
export async function generateLinkDiscoveryFeeds(
  bucket: R2Bucket,
  engagement: EngagementLog,
  subscribedUrls: Set<string>,
  origin: string,
): Promise<RecommendedFeed[]> {
  // 高シグナルのエントリを最新 20 件取得
  const highSignal = engagement.entries.filter((e) => HIGH_SIGNAL_ACTIONS.has(e.action)).slice(-20);

  if (highSignal.length === 0) return [];

  // feedHash ごとにグループ化
  const byFeed = new Map<string, string[]>();
  for (const entry of highSignal) {
    const ids = byFeed.get(entry.feedHash) ?? [];
    ids.push(entry.articleId);
    byFeed.set(entry.feedHash, ids);
  }

  // 記事 URL を解決（フィードごとに並列取得）
  const articleLinks: Array<{ link: string; title: string }> = [];
  const feedArticleResults = await Promise.allSettled(
    [...byFeed.entries()].map(async ([feedHash, articleIds]) => {
      const articles = await readLatestArticles(bucket, feedHash);
      return { articles, idSet: new Set(articleIds) };
    }),
  );
  for (const result of feedArticleResults) {
    if (result.status !== "fulfilled") continue;
    const { articles, idSet } = result.value;
    for (const a of articles) {
      if (idSet.has(a.id) && a.link) {
        articleLinks.push({ link: a.link, title: a.title });
      }
    }
  }

  if (articleLinks.length === 0) return [];

  // Cache API から全文 HTML を取得してリンク抽出
  const seenHostnames = new Set<string>();
  const candidates: Array<{ url: string; articleTitle: string }> = [];

  for (const { link, title } of articleLinks) {
    try {
      const cacheKey = await buildContentCacheKey(origin, link);
      const cached = await caches.default.match(cacheKey);
      if (!cached) continue;

      const data = (await cached.json()) as { content: string };
      const html = data.content;

      // <a href="..."> を抽出
      const articleHostname = new URL(link).hostname;
      for (const m of html.matchAll(/<a\b[^>]+href\s*=\s*["']([^"'#?][^"']*?)["'][^>]*>/gi)) {
        const href = m[1];
        if (!href.startsWith("http")) continue;
        try {
          const u = new URL(href);
          if (u.hostname === articleHostname) continue;
          if (subscribedUrls.has(href)) continue;
          if (seenHostnames.has(u.hostname)) continue;
          seenHostnames.add(u.hostname);
          candidates.push({ url: href, articleTitle: title });
          if (candidates.length >= 8) break;
        } catch {
          // URL パース失敗はスキップ
        }
      }
      if (candidates.length >= 8) break;
    } catch {
      // キャッシュ読み込み失敗はスキップ
    }
  }

  if (candidates.length === 0) return [];

  // discoverFeedUrl() を並列実行
  const checks = candidates.map(({ url, articleTitle }) =>
    discoverAndBuildFeed(url, subscribedUrls, "ld", () => ({
      title: new URL(url).hostname,
      siteUrl: url,
      reason: `「${sanitizeForPrompt(articleTitle, 60)}」内のリンクから発見`,
      source: "link_discovery" as const,
      score: 0.85,
    })),
  );

  return fulfilledValues(await Promise.allSettled(checks));
}

// ── メインのレコメンド生成関数 ──────────────────────────────────

/**
 * ユーザー向けフィード推薦を生成してR2に保存する。
 *
 * ## 処理フロー
 * 1. エンゲージメントログ取得 → Gemma AI でトピックキーワード抽出
 * 2. 以下の3ソースを並列実行:
 *    - **Web 検索** (`generateWebSearchFeeds`): Brave Search APIでトピック検索 → RSS発見
 *    - **人気フィード** (`generatePopularFeeds`): 他ユーザーの購読数ランキング
 *    - **リンク発見** (`generateLinkDiscoveryFeeds`): 既読記事内リンクからRSS発見
 * 3. feedUrlで重複排除・優先度マージ（Web検索 > リンク発見 > 人気）
 * 4. dismiss済みを除外 → スコア降順でmax20件 → R2にキャッシュ保存
 *
 * @returns 生成された RecommendationCache（R2保存済み）
 */
export async function generateRecommendations(params: {
  userId: string;
  bucket: R2Bucket;
  ai: Ai;
  subscriptions: UserSubscription[];
  origin: string;
}): Promise<RecommendationCache> {
  const { userId, bucket, ai, subscriptions, origin } = params;

  // エンゲージメントログを取得
  const engagement = await r2Get<EngagementLog>(bucket, engagementKey(userId), { entries: [] });

  // 購読済み URL / feedHash の Set を構築
  const subscribedUrls = new Set(subscriptions.map((s) => s.url));
  const subscribedFeedHashes = new Set(subscriptions.map((s) => s.feedHash));

  // トピック抽出（Gemma AI）
  const topics = await extractUserTopics(bucket, subscriptions, engagement, ai);

  // Web 検索・人気フィード・リンク発見を並列実行
  const [webResults, popularResults, linkResults] = (
    await Promise.allSettled([
      generateWebSearchFeeds(topics, subscribedUrls),
      generatePopularFeeds(bucket, subscribedFeedHashes),
      generateLinkDiscoveryFeeds(bucket, engagement, subscribedUrls, origin),
    ])
  ).map((r) => (r.status === "fulfilled" ? r.value : []));

  // feedUrl で重複排除してマージ（Web 検索 → リンク発見 → 人気 の優先度）
  const seenFeedUrls = new Set<string>();
  const merged: RecommendedFeed[] = [];
  for (const feed of [...webResults, ...linkResults, ...popularResults]) {
    if (seenFeedUrls.has(feed.feedUrl)) continue;
    seenFeedUrls.add(feed.feedUrl);
    merged.push(feed);
  }

  // 既存の dismiss 済みを除外してキャッシュ
  const existingCache = await readCache(bucket, userId);
  const dismissedIds = new Set(existingCache?.dismissedIds ?? []);

  const recommendations = merged
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
