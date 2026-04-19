---
description: Cloudflare Cache API キャッシュ方針 — 外部フェッチ実装時に必ず参照
paths: "app/api/**"
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
