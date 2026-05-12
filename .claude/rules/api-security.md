---
paths: "app/api/**/*.ts"
---

# API セキュリティ規範

`coding-conventions.md` から #733 案 A-1 Step 3 で分割した、API Route Handler の **認証 + 所有権チェック / shared cache TTL / dev/e2e エンドポイント二重ガード** に関する規範集。

主要テーマ:

- `withSession` の認証だけでは shared resource を保護できない (所有権チェックを二段で必要)
- shared cache に未検証ソース由来データを注入する経路は TTL 短縮で影響範囲を時間軸で限定
- `/api/test/*` のような dev / e2e 限定エンドポイントは NODE_ENV + bypass userId で二重ガード

## shared resource を変更する API は「認証 + 所有権チェック」を二段で行う

`withSession` は **「認証されたユーザーかどうか」** しか判定しない。共有リソース (shared cache / 共有フィードデータ / 他ユーザーが購読する R2 オブジェクト) を変更する API では、**追加で「リクエストユーザーが対象リソースを所有 / 購読しているか」のチェックが必須**。

```typescript
// アンチパターン: 認証だけで shared resource を操作可能
export async function POST(request, { params }) {
  return withSession(request, async ({ session, env }) => {
    const { id: feedHash } = await params;
    if (!isValidFeedHash(feedHash)) return apiError("Invalid", 400);
    // ↓ 認証されていれば任意の feedHash の shared cache を破棄可能 → DoS 攻撃成立
    await purgeSharedCache(feedHash);
    return NextResponse.json({ ok: true });
  });
}

// 修正パターン: 認証 + 購読チェック (所有権チェック)
export async function POST(request, { params }) {
  return withSession(request, async ({ session, env }) => {
    const { id: feedHash } = await params;
    if (!isValidFeedHash(feedHash)) return apiError("Invalid", 400);
    // ↓ リクエストユーザーが対象 feed を購読していなければ 404
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (!subs.some((s) => s.feedHash === feedHash)) {
      return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
    }
    await purgeSharedCache(feedHash);
    return NextResponse.json({ ok: true });
  });
}
```

**How to apply**: API 設計時に以下のチェックリスト:

1. **このエンドポイントが変更/削除する対象は shared resource か？**
   - shared cache (`Cloudflare Cache API` / `caches.default`) → YES
   - 共有 R2 オブジェクト (`feeds/{feedHash}/...`) → YES
   - ユーザー別 R2 オブジェクト (`users/{userId}/...`) → NO (session.userId と path が一致するなら認証だけで OK)
2. YES なら **所有権/購読チェックを追加**:
   - フィード関連: `subs.some((s) => s.feedHash === feedHash)` で購読確認
   - 記事関連: 該当フィードを購読しているか or 自分の bookmark/savedArticles に含まれるか
   - グループ/コレクション: 自分のユーザー ID と紐付くデータか
3. **チェック失敗時は 404** (`FEED_NOT_FOUND` 等) で返す。403 だと「リソースは存在するが権限なし」を leak するので、未購読フィードは存在しないかのように見せる
4. e2e テストで「他ユーザーの feedHash で操作 → 404」を必ず追加 (テスト infra が整ったら)
5. PR コメントに「shared resource 変更 → 所有権チェック追加」を明示

**反例 (チェック不要なケース)**:

- `GET /api/articles` — 自分の subscriptions と join して返すだけで、他人のデータに副作用なし
- `POST /api/read-state` — `users/{session.userId}/read-state.json` のみ更新で他ユーザーに影響なし

主な使用箇所: `POST /api/feeds/{feedHash}/purge-content-cache` の購読チェック — 認証だけで cache busting DoS が成立していた脆弱性を修正

### 派生ケース: shared cache に「未検証ソース由来のデータ」を注入する経路は TTL を短縮して影響範囲を限定する

shared cache (Cloudflare Cache API / 共有 R2) に「ユーザー入力を起点に外部から fetch した結果」を保存する経路では、**保存内容の検証だけでなく「攻撃者が任意データを注入できた場合の persistence 期間」** を考慮する必要がある。完全な input sanitization が困難なケース (HTML / OGP / fallback fetcher 等の構造的に複雑な入力) では、**TTL 短縮で影響範囲を時間軸で限定** する案が defense in depth として有効。

```typescript
// アンチパターン: 通常成功と「攻撃 vector になりうる経路」を同じ長 TTL で扱う
const ttl = hasContent ? CACHE_TTL_30D : NEGATIVE_TTL_1D;
cachePutAsync(key, response, ctx, "ogp");
// ↑ fallback 経路 (tweet 内リンク先 OGP 抽出) で攻撃者が任意 image 注入可能
//   → 30 日間 shared cache に居座り全ユーザーに拡散

// 修正パターン: 「攻撃 vector になりうる経路」を pure function で識別 + 短 TTL
function computeCacheTtl({ hasContent, isFallback }: Input): number {
  if (isFallback) return NEGATIVE_TTL_1D; // 攻撃影響範囲を 1 日に限定
  if (hasContent) return CACHE_TTL_30D;
  return NEGATIVE_TTL_1D;
}
const ttl = computeCacheTtl({ hasContent, isFallback });
```

**How to apply**: 新しい cache 注入経路 (Route Handler で `cachePutAsync` を呼ぶ箇所) を実装するときに以下を判定:

1. **cache に保存するデータの「ソース」を分類**:
   - **検証済みソース** (自社 API レスポンス / signed URL / static asset) → 長 TTL OK
   - **未検証ソース** (ユーザー入力 URL から fetch した HTML / OGP / fallback chain で別ドメインから取得) → **短 TTL を検討**
2. **fallback 経路** (元 source が空 / エラー時に別の URL を fetch する経路) は **要注意**:
   - 攻撃者が「元 source を空にする」「fallback が別ドメインから fetch する」を悪用可能
   - 例: Twitter OGP fallback / RSS feed link → original site fetch / OEmbed fallback
3. **TTL 算出を pure function に切り出す**: `computeXxxCacheTtl({ ...源由来フラグ })` の形で TDD 可能に
4. **既存 negative cache TTL を再利用**: 多くの場合 1 日 TTL は「失敗 cache」と同じなので、独立定数は不要 (命名だけで意図を表現)
5. **ユーザー UX 影響を測る**: fallback 経路の 1 日 TTL でも cache hit 率が許容範囲か (Cloudflare Analytics / log で確認)

**反例 (短 TTL 不要なケース)**:

- 自社 R2 から取得した article content (検証済みソース) → 7 日 TTL OK
- 検証済み画像 URL (HTTPS only / SSRF check 通過 / MIME 検証済み) → 30 日 TTL OK
- 認証されたユーザー専用 cache (cache key にユーザー ID 含む) → 攻撃影響が単一ユーザーに限定されるので長 TTL OK

主な使用箇所: `src/lib/ogp-cache-ttl.ts#computeOgpCacheTtl` (Twitter fallback 経路の TTL を 30 日 → 1 日に短縮して poisoning 影響範囲を限定)

## dev / e2e 限定エンドポイントの二重ガード

`/api/test/seed` のようなテスト inject 系エンドポイントを本番に絶対漏らさないために、Route Handler の冒頭で **二重ガード** を行う。

```typescript
// app/api/test/seed/route.ts
import { getDevBypassUserId } from "@/lib/dev-auth-bypass";

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  // ガード 1: production ビルドでは Next.js が NODE_ENV を inline するため
  // この比較式が `false` 固定となり、以降のコードは tree-shaking で dead code 化される
  if (process.env.NODE_ENV === "production") return notFound();

  // ガード 2: dev でも DEV_AUTH_BYPASS_USER_ID が未設定なら 404
  const userId = getDevBypassUserId();
  if (!userId) return notFound();

  // ... seed ロジック
}
```

**なぜ二重ガード**: ガード 1（NODE_ENV）は production ビルドで dead code 化を保証する。ガード 2（getDevBypassUserId）は staging などの非 production 環境でも誤って公開しないための実行時安全網。

主な使用箇所: `app/api/test/seed/route.ts`（e2e テスト用 R2 シード）
