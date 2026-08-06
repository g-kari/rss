# RSS フィードレコメンド機能 — 実装計画

## 概要

ユーザーの購読・行動データを元に、新しいRSSフィードを提案する機能。
記事のレコメンドではなく、**フィードの発見**が目的。
提案頻度は **24時間に1度**、R2 キャッシュで負荷軽減。

## 1. 全体アーキテクチャ

```
[ブラウザ]
  FeedSidebar
    └─ 「おすすめ」セクション (新規)
         └─ useRecommendations hook (新規)
              └─ GET /api/recommendations (新規)

[Route Handler: GET /api/recommendations]
  ├─ R2 キャッシュ確認: users/{userId}/recommendations.json
  │   └─ generatedAt が 24h 以内 → キャッシュ返却
  │
  └─ キャッシュなし or 期限切れ → 生成パイプライン
       │
       ├─ アプローチ1: AI 興味推定フィード提案
       │   ├─ 購読フィード名 + ブックマーク記事タイトル → Workers AI でトピック抽出
       │   └─ LLM にトピック関連の RSS フィード URL を提案させる
       │
       ├─ アプローチ2: SharedFeedMeta 人気フィード
       │   ├─ listAllFeedHashes() で全フィード列挙
       │   ├─ buildFeedUserMap() で購読者数計算
       │   └─ 未購読フィードを購読者数降順でランキング
       │
       ├─ アプローチ3: 外部フィード検索 (最初に実装)
       │   ├─ トピックキーワードで LLM にフィード URL 候補を提案
       │   └─ 候補 URL → discoverFeedUrl() で実在確認
       │
       └─ アプローチ4: 記事内リンク深度探索
           ├─ ブックマーク済み記事の本文中リンク先ドメインを収集
           └─ 未購読ドメインに対して discoverFeedUrl() でフィード検出

  → 全アプローチの結果をスコアでマージ (最大20件)
  → R2 にキャッシュ保存 + JSON 返却
```

## 2. Phase 分け

### Phase 1: 外部フィード検索 + AI トピック抽出 (アプローチ 3 + 1 のトピック部分) ✅ 実装済み

アプローチ3を動かすには「検索するトピック」が必要なため、アプローチ1のトピック抽出部分を先に実装。
LLM にフィード URL を提案させ、`discoverFeedUrl()` で実在確認する方式。

### Phase 2: AI 興味推定フィード提案の強化 (アプローチ 1) — 実装済み

- **Phase 2a ✅**: いいね・ブックマーク・全文取得など、実際に行動した記事タイトルを
  アクション重み × 7 日半減期で優先し、不足分だけ最新記事で補完する。既存 1 回の
  Workers AI 呼び出しを維持するため追加コストなし。
- **Phase 2b ✅**: 抽出したトピックを第 2 AI ラウンドで統合・多様化してから検索する。
  AI 失敗時は第 1 ラウンドの結果へフォールバックする。

### Phase 3: SharedFeedMeta 人気フィード (アプローチ 2) ✅ 実装済み

`listAllFeedHashes()` と `buildFeedUserMap()` は既存。未購読フィルタとランキングを追加。

### Phase 4: 記事内リンク深度探索 (アプローチ 4) — 実装済み

ブックマーク記事本文から相対 URL を含むリンク先ドメインを抽出し、`discoverFeedUrl()` でフィードを検出する。

## 3. 各 Phase のファイル一覧

### Phase 1 (最初に実装)

| 操作 | ファイル                                   | 内容                                            |
| ---- | ------------------------------------------ | ----------------------------------------------- |
| 新規 | `app/api/recommendations/route.ts`         | `GET /api/recommendations` メイン API           |
| 新規 | `app/api/recommendations/dismiss/route.ts` | `POST /api/recommendations/dismiss`             |
| 新規 | `app/api/recommendations/refresh/route.ts` | `POST /api/recommendations/refresh`             |
| 新規 | `src/lib/recommendation.ts`                | レコメンドエンジンコアロジック                  |
| 新規 | `src/hooks/useRecommendations.ts`          | クライアント hook                               |
| 新規 | `src/components/RecommendationSection.tsx` | サイドバー内おすすめ UI                         |
| 変更 | `src/types.ts`                             | `RecommendedFeed`, `RecommendationCache` 型追加 |
| 変更 | `src/components/FeedSidebar.tsx`           | `RecommendationSection` 組み込み                |
| 変更 | `src/App.tsx`                              | `useRecommendations` hook 呼び出し + props 伝搬 |

### Phase 2

| 操作 | ファイル                      | 内容                                             |
| ---- | ----------------------------- | ------------------------------------------------ |
| 変更 | `src/lib/engagement-score.ts` | 記事単位の行動スコアランキングを共通化           |
| 変更 | `src/lib/recommendation.ts`   | 行動対象タイトル優先 + 最新記事 fallback (2a)    |
| 変更 | `e2e/recommendation.spec.ts`  | 選択順・時間減衰・重複除外・fallback テスト (2a) |
| 変更 | `src/lib/recommendation.ts`   | 第2 AI ラウンドによるトピック統合・多様化 (2b)   |

### Phase 3

| 操作 | ファイル                    | 内容                          |
| ---- | --------------------------- | ----------------------------- |
| 変更 | `src/lib/recommendation.ts` | `generatePopularFeeds()` 追加 |

### Phase 4

| 操作 | ファイル                    | 内容                                                |
| ---- | --------------------------- | --------------------------------------------------- |
| 変更 | `src/lib/recommendation.ts` | `generateLinkDiscoveryFeeds()` と相対リンク対応追加 |

## 4. API 設計

### `GET /api/recommendations`

認証必須 (`withSession`)。24時間キャッシュ。

```json
{
  "recommendations": [
    {
      "id": "rec_abc123",
      "feedUrl": "https://example.com/feed",
      "title": "Example Blog",
      "siteUrl": "https://example.com",
      "reason": "ブックマークした記事のトピック「TypeScript」に関連",
      "source": "ai_suggestion",
      "score": 0.85
    }
  ],
  "generatedAt": "2026-03-27T00:00:00.000Z",
  "expiresAt": "2026-03-28T00:00:00.000Z"
}
```

`source` 値: `"ai_suggestion"` | `"popular"` | `"link_discovery"`

### `POST /api/recommendations/dismiss`

```json
{ "id": "rec_abc123" }
```

→ `dismissedIds` 配列に追加。

### `POST /api/recommendations/refresh`

キャッシュの `generatedAt` を null にして次回 GET で再生成をトリガー。

## 5. R2 データ構造

```
users/{userId}/recommendations.json    # RecommendationCache
```

24h TTL はアプリロジックで管理（Cloudflare Cache API ではなく R2 に保存。永続的ユーザーデータのため）。

## 6. UI 設計

### 配置場所: FeedSidebar

```
┌─────────────────────┐
│ RSS            🔍 + ↻│
├─────────────────────┤
│ すべて          42   │
│ 履歴             8   │
│ ブックマーク    12   │
│ 後で読む         3   │
│ + URL を保存         │
├─────────────────────┤
│ ✦ おすすめ     ↻  ✕ │  ← 新規セクション
│  □ Example Blog      │     ホバーで追加/非表示ボタン
│    TypeScript に関連  │     reason テキスト (11px text-text-faint)
│  □ Tech Blog         │
│    人気フィード       │
├─────────────────────┤
│ [ピン留めフィード]   │
│ [通常フィード]       │
└─────────────────────┘
```

- 最大 5 件表示、それ以上は「もっと見る」で展開
- 「追加」クリック → `POST /api/feeds` → 成功したら提案から除去
- 「非表示」クリック → `POST /api/recommendations/dismiss`
- 提案 0 件ならセクション非表示
- デザインシステム準拠（セマンティックカラートークン、インライン SVG）

## 7. 型定義 (`src/types.ts` に追加)

```typescript
export type RecommendationSource = "ai_suggestion" | "popular" | "link_discovery";

export interface RecommendedFeed {
  id: string;
  feedUrl: string;
  title: string;
  siteUrl: string;
  reason: string;
  source: RecommendationSource;
  score: number;
}

export interface RecommendationCache {
  recommendations: RecommendedFeed[];
  generatedAt: string;
  dismissedIds: string[];
  topics: string[];
}
```

## 8. コアロジック (`src/lib/recommendation.ts`)

```
extractUserTopics(subscriptions, feedMetas, bookmarkArticleTitles, ai)
  → Promise<string[]>
  // Workers AI でトピックキーワード 5-10 個抽出

generateAiSuggestions(topics, subscribedUrls, ai)
  → Promise<RecommendedFeed[]>
  // LLM にフィード URL を提案 → discoverFeedUrl() で実在確認
  // タイムアウト: 15秒

generatePopularFeeds(bucket, subscribedHashes, dismissedIds)
  → Promise<RecommendedFeed[]>
  // SharedFeedMeta 購読者数ランキング
  // タイムアウト: 10秒

generateLinkDiscovery(bucket, bookmarkArticles, subscribedDomains, origin, ctx)
  → Promise<RecommendedFeed[]>
  // ブックマーク記事本文のリンク先 → discoverFeedUrl()
  // 最大 10 ドメイン、タイムアウト: 20秒

generateRecommendations(params: { session, env, ctx })
  → Promise<RecommendationCache>
  // Promise.allSettled で並行実行、スコアソート、最大 20 件
```

## 9. 注意点

1. **LLM ハルシネーション**: 存在しない URL を返す可能性大。必ず `discoverFeedUrl()` で実在確認
2. **Workers 実行時間 (30秒)**: `Promise.allSettled` で並行実行 + 個別タイムアウト
3. **R2 list 操作コスト**: 人気フィード (Phase 3) は 24h に 1 回なので許容範囲
4. **個人利用前提**: `BETA_ALLOWED_SUBS` でアクセス制限済み、24h キャッシュで十分

## 10. 既存関数の再利用

| 関数                  | ファイル                    | 用途                             |
| --------------------- | --------------------------- | -------------------------------- |
| `discoverFeedUrl()`   | `src/lib/feed-discovery.ts` | 提案 URL の RSS フィード実在確認 |
| `listAllFeedHashes()` | `src/lib/shared-feed.ts`    | Phase 3 全フィード列挙           |
| `buildFeedUserMap()`  | `src/cron/fetch.ts`         | Phase 3 購読者数計算             |
| `withSession()`       | `src/lib/server-auth.ts`    | 認証付き Route Handler           |
| `r2Get()` / `r2Put()` | `src/lib/r2.ts`             | R2 読み書き                      |
| `sha256Hex()`         | `src/lib/r2.ts`             | recommendation ID 生成           |
