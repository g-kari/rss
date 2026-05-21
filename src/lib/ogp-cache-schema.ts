/**
 * #808 Phase 1: OGP cache schema 拡張 + lazy migration 純粋関数。
 *
 * 背景:
 * 旧 schema (`Record<string, string>` = URL → image URL のみ) では title / description
 * が cache されず、`useContentLinkPreviews` (記事本文内 `<a>` リンクのプレビュー取得)
 * が `useOgpCache` (ギャラリー OGP) の cache と分離していたため、同じ URL に対する
 * 重複 fetch が発生していた。
 *
 * 解決アプローチ (ユーザー指定 lazy migration):
 * - 新 schema (v2): `{ image, title, description, fetchedAt? }` を value とする object 形式
 * - 既存 v1 形式 (string) は読込時に v2 object へ自動 migration
 * - title / description は次 fetch 時に追記する **lazy migration** (初回ロード時の
 *   re-fetch burst を回避)
 *
 * Phase 1 (本ファイル):
 * - schema type 定義 + parse / serialize 純粋関数 + TDD spec
 *
 * Phase 2 (次サイクル以降):
 * - `useOgpCache` を v2 schema に拡張 + Context Provider 化
 * - `useContentLinkPreviews` を Context 経由で参照 (重複 fetch 統合)
 *
 * #806 (OGP rate limit 緩和 60s/120件) との相乗効果で重複 fetch 起因の 429 を抑止できる。
 */

/**
 * OGP cache の v2 schema (object 形式)。
 *
 * v1 (string only) は `parseOgpCacheEntry` で読込時に自動 migration される。
 * title / description は **未取得時 undefined** のまま許容 (= lazy migration で次 fetch
 * 時に追記される設計)。
 */
export interface OgpCacheEntry {
  /** OGP image URL (空文字 = 画像なし negative cache) */
  image: string;
  /** OGP title (未取得時 undefined、`useContentLinkPreviews` 等が必要なら次 fetch で追記) */
  title?: string;
  /** OGP description (未取得時 undefined、同上) */
  description?: string;
  /** cache 生成タイムスタンプ (ms、TTL 算出 / migration 履歴で使用、未設定時 undefined) */
  fetchedAt?: number;
}

/**
 * 単一 OGP cache entry を v1 (string) / v2 (object) 両対応で正規化する純粋関数。
 *
 * - **v1 入力** (string): `{ image: <string>, title: undefined, description: undefined }`
 *   として返す。lazy migration で次 fetch 時に title / description が追記される。
 * - **v2 入力** (`{ image, title?, description?, fetchedAt? }`): そのまま返す
 *   (image が string でない / 無いなら null fail)。
 * - **不正値** (null / undefined / number / array / image が無い object): null を返す
 *   (consumer は null を「entry なし」として扱う)。
 *
 * @param raw localStorage から読込まれた生 value
 * @returns 正規化済 `OgpCacheEntry` または null (parse 失敗)
 *
 * @example
 * parseOgpCacheEntry("https://example.com/og.jpg")
 *   // { image: "https://example.com/og.jpg" }
 * parseOgpCacheEntry({ image: "x", title: "T" })
 *   // { image: "x", title: "T" }
 * parseOgpCacheEntry(null)            // null
 * parseOgpCacheEntry({})              // null (image 欠落)
 * parseOgpCacheEntry({ image: 42 })   // null (image が string でない)
 */
export function parseOgpCacheEntry(raw: unknown): OgpCacheEntry | null {
  if (raw == null) return null;

  // v1: string value → v2 object に lazy migration
  if (typeof raw === "string") {
    return { image: raw };
  }

  // v2: object value → field 検証
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.image !== "string") return null;

  const result: OgpCacheEntry = { image: obj.image };
  if (typeof obj.title === "string") result.title = obj.title;
  if (typeof obj.description === "string") result.description = obj.description;
  if (typeof obj.fetchedAt === "number" && Number.isFinite(obj.fetchedAt)) {
    result.fetchedAt = obj.fetchedAt;
  }
  return result;
}

/**
 * OGP cache の Record (URL → raw entry) を一括 parse して v2 schema 化する純粋関数。
 *
 * v1 / v2 混在 cache を読込時に v2 形式に正規化する。parse 失敗 entry (null) は
 * 結果から除外される (= consumer 側は entry の存在を `key in cache` で判定可能)。
 *
 * @param raw localStorage から読込まれた生 Record
 * @returns 正規化済 Record (URL → OgpCacheEntry)
 *
 * @example
 * parseOgpCache({
 *   "https://a/": "https://a/og.jpg",                       // v1
 *   "https://b/": { image: "https://b/og.jpg", title: "B" }, // v2
 *   "https://c/": null,                                      // 不正、除外
 * })
 * // {
 * //   "https://a/": { image: "https://a/og.jpg" },
 * //   "https://b/": { image: "https://b/og.jpg", title: "B" },
 * // }
 */
export function parseOgpCache(raw: unknown): Record<string, OgpCacheEntry> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: Record<string, OgpCacheEntry> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = parseOgpCacheEntry(value);
    if (entry !== null) result[key] = entry;
  }
  return result;
}

/**
 * `OgpCacheEntry` から image URL を取り出す純粋関数。
 *
 * v1 (string) / v2 (object) どちらの形式でも image を取得可能にする (`useContentLinkPreviews`
 * 等の consumer が Phase 2 で Context 経由 migration を受けるまでの compat layer)。
 *
 * @returns image URL (空文字含む) または null (entry なし)
 *
 * @example
 * getOgpImage({ image: "https://x/og.jpg" })  // "https://x/og.jpg"
 * getOgpImage("https://x/og.jpg")             // "https://x/og.jpg"
 * getOgpImage(undefined)                      // null
 */
export function getOgpImage(entry: OgpCacheEntry | string | undefined | null): string | null {
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  return entry.image;
}
