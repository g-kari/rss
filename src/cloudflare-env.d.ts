// Cloudflare Workers バインディングを CloudflareEnv に追加する
// @opennextjs/cloudflare の getCloudflareContext().env で参照される

interface CloudflareEnv {
  RSS_DATA: R2Bucket;
  AI: Ai;
}
