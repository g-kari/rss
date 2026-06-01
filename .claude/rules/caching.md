---
description: Cloudflare Cache API キャッシュ方針 — 外部フェッチ実装時に必ず参照
paths: "app/api/**/route.ts,src/lib/cache-helper.ts,src/lib/r2.ts"
---

# キャッシュ方針

**元サイト側のリソースは一度だけ取得する。** 外部 URL へのフェッチは必ずキャッシュし、次回以降はキャッシュから返す。

## キャッシュ層の使い分け

| 対象         | キャッシュ層                         | TTL  | 実装場所                        |
| ------------ | ------------------------------------ | ---- | ------------------------------- |
| 記事全文     | **Cloudflare Cache API**             | 7日  | `app/api/content/route.ts`      |
| OGP 画像 URL | **Cloudflare Cache API**             | 30日 | `app/api/ogp/route.ts`          |
| AI 要約      | **R2** (`ai-cache/summary/{sha256}`) | 永続 | `app/api/ai/summarize/route.ts` |

**R2 は使わない** — 揮発性のキャッシュには Cloudflare Cache API (`caches.default`) を使う。R2 は永続データ（ユーザーデータ・AI 結果）専用。

## Cloudflare Cache API パターン

キャッシュキーは認証情報を含まない合成 URL。`/__cache/` プレフィックスで名前空間を分離する。
共通処理は `src/lib/cache-helper.ts` のヘルパーに集約済み：

- `buildCacheKey(origin, type, url)` — 合成キャッシュキー生成
- `matchCfCache(cacheKey)` — HIT 時 Response / MISS 時 null
- `buildJsonCacheResponse(payload, ttlSec)` — JSON キャッシュエントリ構築
- `cachePutAsync(cacheKey, response, ctx, label)` — fire-and-forget で保存

```typescript
import {
  buildCacheKey,
  buildJsonCacheResponse,
  cachePutAsync,
  matchCfCache,
} from "@/lib/cache-helper";

const { ctx } = await getCloudflareContext({ async: true });
const reqUrl = new URL(request.url);
const cacheKey = await buildCacheKey(reqUrl.origin, "content", url);

// ① キャッシュ確認
const cached = await matchCfCache(cacheKey);
if (cached) return NextResponse.json(await cached.json());

// ② 外部フェッチ（キャッシュミス時のみ）
const content = await fetchFromOrigin(url);

// ③ キャッシュ保存（fire-and-forget）
cachePutAsync(cacheKey, buildJsonCacheResponse({ content }, TTL_SEC), ctx, "content");
```

新しい外部フェッチを追加する場合は必ずこのヘルパー経由で実装すること。R2 を使わないこと。

## 呼び出しごとに高コストな計算を繰り返す純粋関数はコンテキスト経由の `Map` キャッシュで共有する

`stripHtml` / `toPlainText` 等の **CPU コストが高い純粋関数** を「N 件の記事 × M フィールド」のような繰り返し評価の内側で呼ぶと、同一入力に対する重複計算が累積する。呼び出し元 (hook / pipeline) が `Map<id, result>` を **コンテキストオブジェクトとして渡す** ことで、同一クエリ実行中の重複計算を消去できる。

```typescript
// アンチパターン: 毎記事 × 毎クエリで stripHtml を再実行
function defaultHaystack(article: SearchableArticle): string {
  return stripHtml(article.content ?? "");
  // ↑ N 記事 × クエリ変更ごとに全件 stripHtml 実行 → 検索クエリ更新のたびに数百回実行
}

// 修正パターン: SearchContext の haystackCache に結果を保持し、cache miss 時のみ計算
export interface SearchContext {
  feedTitleByHash: ReadonlyMap<string, string>;
  /** defaultHaystack 結果キャッシュ。クエリ変更ごとの stripHtml 重複実行を回避 */
  haystackCache?: Map<string, string>;
}

function defaultHaystack(article: SearchableArticle, ctx: SearchContext): string {
  if (ctx.haystackCache) {
    const cached = ctx.haystackCache.get(article.id);
    if (cached !== undefined) return cached;
  }
  const result = stripHtml(article.content ?? "");
  ctx.haystackCache?.set(article.id, result);
  return result;
}

// 呼び出し元 hook (React): useRef で Map を永続化
const haystackCacheRef = useRef(new Map<string, string>());
// クエリ変更時に cache をリセット (記事内容の変化に追従)
useEffect(() => {
  haystackCacheRef.current = new Map();
}, [articles]);

const ctx: SearchContext = {
  feedTitleByHash,
  haystackCache: haystackCacheRef.current, // ← hook lifecycle と一致するキャッシュ
};
```

**How to apply**: 純粋関数が「N 記事 × クエリ更新ごとに呼ばれる」構造になっているとき (高コスト関数の重複実行が累積するパターンを事前に設計に組み込む):

1. **コンテキストオブジェクトに `xxxCache?: Map<key, result>` フィールドを追加** — optional にすることで cache 不要な呼び出し元に影響なし
2. **純粋関数内で「cache hit → 即返却 / miss → 計算して set」** を実装
3. **呼び出し元 hook で `useRef(new Map())` を作成** し、コンテキストに渡す
4. **クエリ / 入力変更時に `useEffect` で Map をリセット** — stale cache が蓄積しないよう lifecycle と同期
5. **cache key は安定な識別子 (article.id 等)** を使う — オブジェクト参照は不可 (Map は reference equality で比較)

**反例 (コンテキストキャッシュが不要なケース)**:

- 対象関数が **`useMemo` や `createReadingTimeCache` 等の既存 memoize 機構でカバー済み** → 二重 cache 不要
- 呼び出し回数が **記事 1 件 × 1 回** で高コスト計算でない → overhead 不要
- 計算対象が **頻繁に変化する入力** (毎記事で異なる長い文字列) → cache hit 率が低く効果が出ない

主な使用箇所: `full-text-search.ts#SearchContext.haystackCache` / `useFilteredArticles.ts#haystackCacheRef` — 検索クエリ変更時に全記事 × stripHtml の重複実行を消去
