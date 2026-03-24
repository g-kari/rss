// Cloudflare Workers バインディングを CloudflareEnv に追加する
// @opennextjs/cloudflare の getCloudflareContext().env で参照される

// Cloudflare Workers の CacheStorage は標準 DOM 型を拡張し caches.default を持つ
interface CacheStorage {
  default: Cache;
}

interface CloudflareEnv {
  RSS_DATA: R2Bucket;
  NEXT_INC_CACHE_R2_BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  IMAGES: ImagesBinding;
  /** findme-rss サービスバインディング (内部通信で Bot 検出を回避) */
  FINDME_RSS: Fetcher;
}
