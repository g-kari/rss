# アーキテクチャ

## 全体像

```
ブラウザ
  └─ React SPA ('use client' コンポーネント)
       └─ Next.js App Router (app/)
            ├─ /api/auth/*        — 認証フロー (0g0 ID OAuth2)
            ├─ /api/feeds/*           — フィード CRUD + refresh (R2)
            ├─ /api/articles          — 記事一覧・保存 (R2)
            ├─ /api/ai/*              — Workers AI (要約・翻訳)
            ├─ /api/content           — フルテキスト取得プロキシ
            ├─ /api/engagement        — エンゲージメント記録 (R2)
            ├─ /api/read-state        — 既読・ブックマーク・後で読む状態 (R2)
            ├─ /api/recommendations/* — フィード推薦 (Workers AI)
            ├─ /api/image-proxy       — 外部画像プロキシ
            ├─ /api/ogp               — OGP 画像 URL 取得
            ├─ /api/push/*            — Web Push 通知サブスクリプション管理
            ├─ /api/release-notes     — リリースノート
            └─ /api/health            — ヘルスチェック

Cloudflare Workers (@opennextjs/cloudflare)
  ├─ .open-next/worker.js   → Next.js Route Handlers / SSR
  └─ .open-next/assets/     → 静的アセット (Cloudflare Assets)

Cloudflare Bindings
  ├─ RSS_DATA (R2)  — users/{userId}/* (feeds / articles / read-state / push 等)
  └─ AI             — Workers AI モデル

Cron Trigger (wrangler.toml: */30 * * * *)
  └─ src/cron/fetch.ts → fetchAllUsers(env) — R2 から全ユーザーの RSS を取得・更新
```

## ディレクトリ構造

```
app/
  layout.tsx                 # ルートレイアウト (CSS import)
  page.tsx                   # エントリーポイント (force-dynamic + <App />)
  globals.css                # Tailwind v4 + CSS 変数テーマ
  api/
    auth/
      login/route.ts         # GET /api/auth/login — OAuth2 開始
      callback/route.ts      # GET /api/auth/callback — コード交換・cookie セット
      me/route.ts            # GET /api/auth/me — セッション確認・自動リフレッシュ
      logout/route.ts        # POST /api/auth/logout — トークン失効・cookie クリア
    feeds/
      route.ts               # GET (一覧) / POST (追加) /api/feeds
      [id]/route.ts          # DELETE /api/feeds/:id
      [id]/refresh/route.ts  # POST /api/feeds/:id/refresh — 単体フィード手動更新
      [id]/reinfer/route.ts  # POST /api/feeds/:id/reinfer — LLM CSS セレクタ再推論
      refresh/route.ts       # POST /api/feeds/refresh — 全フィード手動更新
      import/route.ts        # POST /api/feeds/import — OPML インポート
      export/route.ts        # GET /api/feeds/export — OPML エクスポート
    articles/
      route.ts               # GET /api/articles
      save/route.ts          # POST /api/articles/save — 記事保存
    ai/
      summarize/route.ts     # POST /api/ai/summarize (Workers AI)
    content/route.ts         # GET /api/content?url=... (フルテキストプロキシ)
    engagement/route.ts      # GET / POST /api/engagement — エンゲージメント記録
    image-proxy/route.ts     # GET /api/image-proxy?url=... (外部画像プロキシ)
    ogp/route.ts             # GET /api/ogp?url=... (OGP 画像 URL 取得)
    read-state/route.ts      # GET / POST /api/read-state (既読・ブックマーク・後で読む)
    recommendations/
      route.ts               # GET /api/recommendations — フィード推薦一覧
      dismiss/route.ts       # POST /api/recommendations/dismiss — 推薦を非表示
      refresh/route.ts       # POST /api/recommendations/refresh — 推薦を更新
    release-notes/route.ts   # GET /api/release-notes
    push/
      vapid-key/route.ts     # GET /api/push/vapid-key
      status/route.ts        # GET /api/push/status
      subscribe/route.ts     # POST /api/push/subscribe
      unsubscribe/route.ts   # POST /api/push/unsubscribe
      test/route.ts          # POST /api/push/test — Push 通知テスト送信
    health/route.ts          # GET /api/health

src/
  App.tsx                    # 3ペインレイアウト + 認証状態管理 ('use client')
  types.ts                   # Feed / Article / UserProfile / AuthSession 型
  cloudflare-env.d.ts        # CloudflareEnv 拡張 (RSS_DATA, AI)
  components/
    FeedSidebar.tsx          # サイドバー (フィード管理・ユーザー情報)
    FeedItem.tsx             # フィードアイテム（コンテキストメニュー付き）
    FeedDetailModal.tsx      # フィード詳細モーダル
    FeedFilterModal.tsx      # キーワードフィルター設定モーダル
    ArticleList.tsx          # 記事一覧 (4レイアウト対応)
    ArticleItems.tsx         # 記事一覧アイテム（レイアウト別 memo コンポーネント）
    ArticleView.tsx          # 記事本文
    Modal.tsx                # 汎用モーダル基盤コンポーネント
    RecommendationSection.tsx # フィード推薦セクション
    KeyboardShortcutsModal.tsx # キーボードショートカット一覧モーダル
    ReleaseNotesModal.tsx    # リリースノートモーダル
    NSFWEyeAnimation.tsx     # NSFW コンテンツ表示アニメーション
    ServiceWorkerRegistration.tsx # Service Worker 登録コンポーネント
    ErrorBoundary.tsx        # エラー境界
  hooks/
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # /api/feeds + /api/articles fetch (5分ポーリング)
    useFeedOperations.ts     # フィード CRUD 操作
    useKeyboardNav.ts        # キーボードナビ (j/k/n/p/o/b/t/r/m/c/u/d/s/f/l/[/]/?)
    useUIState.ts            # UI 状態管理（テーマ・レイアウト・モーダル等）
    useFilteredArticles.ts   # 記事フィルタリング・ソート・ページネーション
    useReadState.ts          # 既読・ブックマーク・後で読む状態 (localStorage + R2 同期)
    useReadingHistory.ts     # 閲覧履歴管理
    useArticleContent.ts     # /api/content fetch + LRU キャッシュ
    useArticleAi.ts          # /api/ai/* fetch
    useContentLinkPreviews.ts # 記事本文内リンクのプレビュー取得
    useEngagement.ts         # エンゲージメント記録 (/api/engagement)
    useRecommendations.ts    # フィード推薦 (/api/recommendations) fetch
    useOgpCache.ts           # /api/ogp fetch (OGP 画像キャッシュ)
    useImageDownload.ts      # 記事画像一括ダウンロード
    usePushNotifications.ts  # Web Push サブスクリプション管理
    useSearchHistory.ts      # 検索履歴管理 (localStorage)
    useOnlineStatus.ts       # オンライン/オフライン状態
    useMobilePane.ts         # モバイル向けペイン切り替え (sidebar/list/view)
    useNSFWMode.ts           # NSFW モード（連打で活性化）
    useSyncedRef.ts          # stale closure 回避用の最新値 ref ユーティリティ
    useColumnResize.ts       # カラム幅リサイズ操作と localStorage 永続化
    useDebounce.ts           # デバウンスユーティリティ
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # withSession() / requireSession() / applyRefreshedTokens()
    r2.ts                    # r2Get() / r2Put() / sha256Hex()
    xml-parser.ts            # fast-xml-parser ラッパー (RSS 2.0 + Atom)
    content.ts               # コンテンツ抽出・後処理パイプライン (Readability + postProcess)
    html.ts                  # sanitizeHtml() / escapeHtml() / toPlainText()
    article-utils.ts         # readingTime() / timeAgo() / isLikelyJapanese()
    fetch.ts                 # RSS/HTML フェッチヘルパー (タイムアウト・リトライ)
    fetch-article-content.ts # /api/content 内のコンテンツ取得ロジック
    feed-discovery.ts        # フィード URL 自動検出
    ai-cache.ts              # AI 結果 R2 キャッシュ
    ai-route-helper.ts       # AI Route Handler 共通処理
    api-fetch.ts             # 認証付きクライアントサイド fetch ラッパー
    embed-utils.ts           # iframe embed 処理ユーティリティ
    engagement-score.ts      # エンゲージメントスコア計算ロジック
    article-filter.ts        # 記事フィルタリングロジック (feedId / 日付 / キーワード / クエリ)
    keyword-filter.ts        # キーワードフィルタリングマッチング（正規表現対応）
    llm-feed-generator.ts    # LLM で RSS のないサイトからフィード生成
    lru-cache.ts             # クライアントサイド LRU キャッシュ
    ogp.ts                   # OGP メタデータ取得ロジック
    recommendation.ts        # フィード推薦ロジック
    shared-feed.ts           # 共有フィードの R2 ストレージヘルパー
    storage.ts               # localStorage キー定数・安全なラッパー
    url.ts                   # URL バリデーションヘルパー
    favicon.ts               # ファビコン未読バッジ
    web-push.ts              # Web Push 送信ヘルパー
    release-notes-data.ts    # RELEASE_NOTES_MARKDOWN 定数 (Workers バンドル用)
  cron/
    fetch.ts                 # fetchArticles(userId, env) / fetchAllUsers(env)
```

## データフロー

### フィード追加

1. ユーザーが FeedSidebar に URL 入力
2. `POST /api/feeds` → Route Handler が R2 の `users/{sub}/feeds.json` を更新
3. Route Handler が即座に RSS を fetch して `users/{sub}/articles.json` も更新
4. クライアントが再フェッチして表示を更新

### 記事取得 (cron)

1. Cloudflare Cron Trigger が 30 分毎に `scheduled` ハンドラーを起動
2. `fetchAllUsers(env)` が R2 の `users/` プレフィックスを列挙
3. 各ユーザーの `feeds.json` を読んで全フィードを fetch
4. `fast-xml-parser` で RSS 2.0 / Atom をパース
5. `guid` でdeduplication、max 500件、`publishedAt` 降順
6. `users/{sub}/articles.json` を更新

### 読み取り状態

- **クライアント優先、サーバー同期**の二重管理
- `localStorage` に既読・ブックマーク・後で読む ID を JSON 配列で保存
- ログイン時に `/api/read-state` (GET) でサーバーデータをマージ（ローカル ∪ サーバー）
- 状態変更から 2秒後にデバウンスして `/api/read-state` (POST) でサーバーに保存
- ページ離脱時 (`beforeunload`) は `sendBeacon` で即時送信
- `useReadState` hook (`src/hooks/useReadState.ts`) が全ロジックを管理
- 未読カウントはクライアントサイドで計算

## Cloudflare バインディングへのアクセス

Route Handlers および cron 内で `getCloudflareContext()` を使う:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET() {
  const { env } = await getCloudflareContext({ async: true });
  // env.RSS_DATA: R2Bucket
  // env.AI: Ai
}
```

文字列の環境変数 (wrangler.toml `[vars]` / シークレット) は `process.env` で参照:

```typescript
const AUTH_BASE_URL = process.env.AUTH_BASE_URL!;
const CLIENT_ID = process.env.CLIENT_ID!;
```

## R2 データ構造

```
users/{userId}/profile.json     # UserProfile (ログイン時に保存)
users/{userId}/feeds.json       # Feed[]
users/{userId}/articles.json    # Article[] (max 500, publishedAt 降順)
users/{userId}/read-state.json  # { readIds, bookmarkIds, readingListIds }
users/{userId}/push.json        # PushConfig (Web Push サブスクリプション)
ai-cache/summary/{sha256}       # AI 要約キャッシュ (永続)
ai-cache/translation/{sha256}   # AI 翻訳キャッシュ (永続)
```

`userId` = 0g0 内部ユーザーID（`AuthSession.userId`）
`sub` クレーム（`AuthSession.sub`）とは別物に注意 — R2 キーには `userId` を使う

## 認証フロー

```
ブラウザ → GET /api/auth/login
         → id.0g0.xyz/auth/login?redirect_to=...&state=...
         → Google 認証
         → GET /api/auth/callback?code=...&state=...
         → POST id.0g0.xyz/auth/exchange (Basic 認証)
         → access_token (15分) + refresh_token (30日) を HttpOnly cookie にセット
         → /
```

## 環境変数・シークレット

### wrangler.toml vars (公開情報)

```toml
[vars]
AUTH_BASE_URL = "https://id.0g0.xyz"
APP_BASE_URL  = "https://rss.0g0.xyz"
BETA_ALLOWED_SUBS = "..."   # カンマ区切り sub リスト (空 = 制限なし)
```

### Cloudflare Workers シークレット

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

## ビルド・デプロイ

```bash
npm run build    # next build
npm run deploy   # @opennextjs/cloudflare build && wrangler deploy
```

ビルド成果物:

- `.open-next/worker.js` → Workers スクリプト (wrangler.toml の main)
- `.open-next/assets/` → 静的アセット (Cloudflare Assets)
