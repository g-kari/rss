// CSS ファイルのサイドエフェクトインポートを許可する（tsgo はプラグイン非対応のため明示宣言が必要）
declare module "*.css" {}

// Cloudflare Workers バインディングを CloudflareEnv に追加する
// @opennextjs/cloudflare の getCloudflareContext().env で参照される

// Cloudflare Workers の CacheStorage は標準 DOM 型を拡張し caches.default を持つ
interface CacheStorage {
  default: Cache;
}

type AiModelId = Parameters<Ai["run"]>[0];

interface CloudflareEnv extends Partial<SearchIndexEnv> {
  /** Explicit opt-in after OAuth storage provisioning and approved rollout. Unset is OFF. */
  RSS_MCP_ENABLED?: string;
  /** Separate owner-approved subscription-add rollout. Unset is OFF. */
  RSS_MCP_SUBSCRIBE_ENABLED?: string;
  /** Canonical app origin, used by the native MCP/OAuth boundary. */
  APP_BASE_URL?: string;
  /** Native OAuth exchanges must retain the existing beta access boundary. */
  BETA_ALLOWED_SUBS?: string;
  /** Separate OAuth state storage. Never alias the existing rate-limit namespace. */
  OAUTH_KV?: KVNamespace;
  /** Request-local helper injected by the OAuth provider before OpenNext consent routes. */
  OAUTH_PROVIDER?: import("@cloudflare/workers-oauth-provider").OAuthHelpers;
  /** Opt in only after writer drain and verified storage migration preparation. */
  RSS_ARTICLE_STORAGE_V2?: string;
  /** Opt in only after the D1 binding, schema and all relevant feed indexes are ready. */
  RSS_ARTICLE_SEARCH_INDEX?: string;
  /** Operator-controlled feed-writer pause. Unset/"false" allows writes; other values pause. */
  RSS_FEED_WRITES_PAUSED?: string;
  /** Summary precompute requires an explicit model and all budget limits; unset is OFF. */
  RSS_SUMMARY_PRECOMPUTE_ENABLED?: string;
  RSS_SUMMARY_PRECOMPUTE_MODEL?: string;
  RSS_SUMMARY_PRECOMPUTE_RUN_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_DAY_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_MONTH_USD?: string;
  RSS_SUMMARY_PRECOMPUTE_MAX_ARTICLES?: string;
  RSS_SUMMARY_PRECOMPUTE_MAX_DAILY_ARTICLES?: string;
  RSS_SUMMARY_PRECOMPUTE_CONCURRENCY?: string;
  RSS_DATA: R2Bucket;
  /** レートリミット用 KV namespace */
  RATE_LIMIT: KVNamespace;
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  IMAGES: ImagesBinding;
  /** findme-rss サービスバインディング (内部通信で Bot 検出を回避) */
  FINDME_RSS: Fetcher;
  /** Browser Rendering バインディング (#768) — booth.pm 等の bot 検出 sites を実ブラウザで fetch */
  BROWSER: Fetcher;
}
