// CSS ファイルのサイドエフェクトインポートを許可する（tsgo はプラグイン非対応のため明示宣言が必要）
declare module "*.css" {}

// Cloudflare Workers バインディングを CloudflareEnv に追加する
// @opennextjs/cloudflare の getCloudflareContext().env で参照される

// Cloudflare Workers の CacheStorage は標準 DOM 型を拡張し caches.default を持つ
interface CacheStorage {
  default: Cache;
}

type AiModelId = Parameters<Ai["run"]>[0];

interface CloudflareEnv {
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
