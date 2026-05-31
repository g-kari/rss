/**
 * OGP cache TTL 算出純粋関数 (#706 cache poisoning 防御)。
 *
 * 通常の OGP 経路は 30 日 TTL でキャッシュされる。だが Twitter fallback 経路
 * (`fetchTwitterFallbackImage`) は **tweet 内のリンク先 OGP** を抽出する設計で、
 * 攻撃者が tweet に任意の `<img>` を含む linked page を投稿すると、その image URL
 * が 30 日間 shared cache に居座り、同じ tweet を見る全 user に拡散する poisoning が
 * 成立する (security 監査エージェント Confidence 88% 指摘)。
 *
 * 案 A 採用: fallback 経路の TTL を **1 日に短縮** して影響範囲を限定する
 * (攻撃者が tweet を継続維持しないと poisoning 持続不可)。負例 cache (`OGP_NEGATIVE_CACHE_TTL_SEC`)
 * と同じ TTL なので独立定数は不要。
 */

/** OGP burst 防止用のリクエスト間ステガー遅延 (ms) */
export const OGP_STAGGER_MS = 150;

/** 通常の OGP 取得成功時の cache TTL (30 日) */
export const OGP_CACHE_TTL_SEC = 30 * 24 * 60 * 60;

/** og:image なし / フェッチ失敗 / Twitter fallback 経由の cache TTL (1 日 — #706) */
export const OGP_NEGATIVE_CACHE_TTL_SEC = 24 * 60 * 60;

export interface OgpCacheTtlInput {
  /** image / title / description のいずれかが取得できたか */
  hasContent: boolean;
  /** Twitter fallback 経路で image を取得したか (#706) */
  isFallback: boolean;
}

/**
 * cache TTL を算出する純粋関数。
 *
 * 優先順位:
 * 1. fallback 経路 → 1 日 (poisoning 影響範囲を縮退)
 * 2. content あり (通常成功) → 30 日
 * 3. content なし (空応答) → 1 日 (繰り返しフェッチ防止)
 */
export function computeOgpCacheTtl({ hasContent, isFallback }: OgpCacheTtlInput): number {
  if (isFallback) return OGP_NEGATIVE_CACHE_TTL_SEC;
  if (hasContent) return OGP_CACHE_TTL_SEC;
  return OGP_NEGATIVE_CACHE_TTL_SEC;
}
