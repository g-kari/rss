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
      translate/route.ts     # POST /api/ai/translate (Workers AI)
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
    stats/route.ts           # GET /api/stats — 読了統計 (日別・年間ヒートマップ・フィード別)
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
    SnoozeModal.tsx          # 記事スヌーズ設定モーダル（1時間後・明日の朝・来週など）
    ReadingStatsModal.tsx    # 読了統計モーダル（日別グラフ・年間ヒートマップ・週間目標）
    FeedQuickSwitchModal.tsx # フィードクイック切り替えモーダル（キーボードナビ対応）
    NSFWEyeAnimation.tsx     # NSFW コンテンツ表示アニメーション
    ServiceWorkerRegistration.tsx # Service Worker 登録コンポーネント
    ErrorBoundary.tsx        # エラー境界
    Spinner.tsx              # ローディングスピナー（ArticleView・ArticleList で共有）
  hooks/
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # /api/feeds + /api/articles fetch (5分ポーリング)
    useFeedOperations.ts     # フィード CRUD 操作
    useKeyboardNav.ts        # キーボードナビ (j/k/n/p/o/b/t/r/m/c/u/d/s/f/l/[/]/?)
    useUIState.ts            # UI 状態管理（テーマ・レイアウト・フォーカスモード・モーダル等）
    useFilteredArticles.ts   # 記事フィルタリング・ソート・ページネーション
    useReadState.ts          # 既読・ブックマーク・後で読む・スヌーズ状態 (localStorage + R2 同期)
    useReadingHistory.ts     # 閲覧履歴管理
    useArticleContent.ts     # /api/content fetch + LRU キャッシュ
    useArticleAi.ts          # /api/ai/* fetch
    useSpeechSynthesis.ts    # 記事読み上げ（Web Speech API: speak / pause / resume / stop）
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
    useMenuOpen.ts           # ドロップダウンメニュー開閉・click-outside 処理
    usePortalMenu.ts         # ポータルベースのドロップダウンメニュー位置管理
    useGracePeriod.ts        # 直前選択記事を 30 秒間フィルター対象外にする猶予期間管理
    useDebounce.ts           # デバウンスユーティリティ
    useAutoReset.ts          # 値セット後に自動リセット (duration 経過後に初期値へ戻す)
    useEventListener.ts      # DOM イベントリスナーライフサイクル管理 (window / document 対応)
    useInboxProgress.ts      # フィード別未読消化率を計算 (unread 数・readRatio、最大 10 件)
    useLocalStorageHistory.ts # localStorage 配列の永続化 (先頭追加・重複排除・上限制御)
    useReadingStats.ts       # 読了統計取得 (/api/stats fetch → ReadingStats)
    useGestureNav.ts         # スワイプ・ホイール・ドラッグによる前後記事ナビゲーション（横スクロール子要素は除外）
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
    validation.ts            # 各種入力バリデーションユーティリティ
    image-mime.ts            # 画像 MIME タイプ検証（ホワイトリスト方式・マジックバイト対応）
    image-error-placeholder.ts # 画像エラー時の SVG プレースホルダー生成
    favicon.ts               # ファビコン未読バッジ
    web-push.ts              # Web Push 送信ヘルパー
    release-notes-data.ts    # RELEASE_NOTES_MARKDOWN 定数 (Workers バンドル用)
    export-markdown.ts       # ブックマーク・読書リスト記事を Markdown ファイルとしてダウンロード
    rate-limit.ts            # R2 ベースのクールダウンチェック・更新 (checkAndUpdateCooldown)
  cron/
    fetch.ts                 # fetchArticles(userId, env) / fetchAllUsers(env)
```

## データフロー

### フィード追加

1. ユーザーが FeedSidebar に URL 入力
2. `POST /api/feeds` → RSS 探索 → 見つからない場合は LLM で CSS セレクタ推論
3. `computeFeedHash(url)` で feedHash を計算
4. `getOrCreateFeedMeta` で `feeds/{feedHash}/meta.json` を作成・取得（他ユーザー既登録の場合は既存を流用）
5. `users/{userId}/subscriptions.json` に `UserSubscription` を追加
6. バックグラウンド (`ctx.waitUntil`) で初回記事フェッチ → `feeds/{feedHash}/articles/latest.json` を更新
7. クライアントが再フェッチして表示を更新

### 記事取得 (cron)

1. Cloudflare Cron Trigger が 30 分毎に `scheduled` ハンドラーを起動
2. `buildFeedUserMap(env)` が全ユーザーの `subscriptions.json` を走査して `feedHash → userId[]` マップを構築
3. 各 feedHash に対して RSS を 1 度だけ fetch（共有フィード）
4. `fast-xml-parser` で RSS 2.0 / Atom をパース
5. `mergeNewArticles` で `guid` ベースの dedup → `feeds/{feedHash}/articles/latest.json` を更新（500件超えは `p{N}.json` にカスケード）
6. `feeds/{feedHash}/meta.json` の `lastFetchedAt` / `articleCount` を更新
7. 購読中の各ユーザーに Web Push 通知を送信

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

### 共有フィードデータ（ユーザー間共有）

```
feeds/{feedHash}/meta.json               # SharedFeedMeta（フィードURL・タイトル・エラー状態・CSSセレクタ等）
feeds/{feedHash}/articles/latest.json   # Article[]（最新 PAGE_SIZE=500 件、publishedAt 降順）
feeds/{feedHash}/articles/p{N}.json     # Article[]（過去ページ、N=2〜）
```

`feedHash` = `sha256(feedUrl).slice(0, 16)`（`computeFeedHash` で計算）。
フィード記事データはユーザー間で共有され、複数ユーザーが同じフィードを購読しても記事フェッチは 1 度だけ行われる。
詳細は `src/lib/shared-feed.ts` の `mergeNewArticles` / `cascadeOverflow` を参照。

### ユーザー別データ

```
users/{userId}/subscriptions.json       # UserSubscription[]（購読フィード一覧・フィルター設定等）
users/{userId}/profile.json             # UserProfile（ログイン時に保存）
users/{userId}/read-state.json          # ReadState（readIds・bookmarkIds・readingListIds・likeIds・snoozedUntil・notes・globalFilter・readBeforeTimestamp）
users/{userId}/engagement.json          # EngagementLog（記事への行動履歴）
users/{userId}/recommendations.json     # RecommendationCache（フィード推薦キャッシュ）
users/{userId}/push.json                # PushConfig（Web Push サブスクリプション）
users/{userId}/saved.json               # 手動保存記事（/api/articles/save）
```

`userId` = JWT の `sub` クレームをそのまま使用（`server-auth.ts` で `userId: payload.sub` と設定）。
Route Handler では `session.userId` でアクセスする。

### クールダウン管理（R2）

```
users/{userId}/last-full-refresh.json          # 全フィード一括リフレッシュのクールダウン
users/{userId}/ai-cooldown.json                # AI エンドポイントのクールダウン
users/{userId}/feed-refresh-{feedHash}.json    # 単体フィードリフレッシュのクールダウン
users/{userId}/feed-reinfer-{feedHash}.json    # LLM CSS セレクタ再推論のクールダウン
users/{userId}/recommendations-refresh.json    # 推薦リフレッシュのクールダウン
users/{userId}/recommendations-gen.json        # 推薦生成（GET）の同時実行防止クールダウン
```

### AI キャッシュ（永続）

```
ai-cache/summary/{sha256}               # AI 要約キャッシュ（永続）
ai-cache/translation/{sha256}           # AI 翻訳キャッシュ（永続）
```

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
VAPID_SUBJECT = "mailto:admin@0g0.xyz"  # Web Push 送信元メール
```

### Cloudflare Workers シークレット

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
npx wrangler secret put VAPID_PUBLIC_KEY       # Web Push VAPID 公開鍵
npx wrangler secret put VAPID_PRIVATE_KEY      # Web Push VAPID 秘密鍵
npx wrangler secret put CLOUDFLARE_API_TOKEN   # 全文取得フォールバック用 (オプション)
npx wrangler secret put BRAVE_SEARCH_API_KEY   # フィード推薦検索用 (オプション)
```

## コンテンツ抽出戦略 (`src/lib/content.ts`)

`extractMainContent` は以下の 3 段階で本文を抽出する。

```
1. resolveScriptLoadedImages  — JS で動的セットされる画像 src を静的に解決（<script> 除去前に必須）
2. extractThumbListImgs       — ギャラリー UL を別途取得して末尾に hidden div として付与
3. extractWithReadability     — @mozilla/readability + linkedom で DOM パース → 本文抽出
   ├─ 成功 + 画像損失チェック:
   │    srcImgCount >= 8 かつ rcImgCount < srcImgCount * 20% の場合
   │    → extractWithRegex にフォールバック（PR TIMES 等の画像主体ページ対策）
   └─ 失敗 / 本文不十分: extractWithRegex へフォールバック
4. extractWithRegex           — stripPageChrome → サイト固有セレクター → EC セレクター → 汎用セレクター
5. postProcess                — ノイズ除去 → 画像処理 → リンク修正 → テーブルラップ → sanitizeHtml
```

### 画像損失チェックの閾値（20%）

Readability は本文テキストの精度を優先するため、画像主体のページで多数の `<img>` を脱落させることがある。
`srcImgCount >= 8 && rcImgCount * 5 < srcImgCount` の条件で regex フォールバックを試みる。
regex 結果が Readability 結果の 2 倍以上の画像を含む場合のみ regex を採用する。

### extractWithRegex のフォールバック順

1. サイト固有セレクター（Qiita `itemprop="articleBody"`, Zenn `class="znc"` など）
2. EC / 商品ページ（Schema.org `itemprop="description"`, Shopify 等）
3. 汎用セレクター（`<article>`, `class="article"` 等）
4. 最終フォールバック（`<main>` または `<body>`）

### postProcess パイプライン（適用順）

```
removeNoise → transformZennLinkEmbeds → transformZennMermaidEmbeds
→ fixLazyImages → fixImageDimensions(pageUrl) → rewriteImageUrls
→ fixExternalLinks → wrapTables → sanitizeHtml
```

> **重要**: `sanitizeHtml` は必ずパイプライン最後に実行。途中で実行すると後続処理が XSS を再注入する可能性がある。

---

## キーワードフィルタリング設計 (`src/lib/keyword-filter.ts`)

### CompiledKeywordFilter パターン

フィルター設定変更時に一度だけ正規表現をコンパイルし、記事ごとの再コンパイルを回避する。

```typescript
// フィルター設定変更時（useFilteredArticles の useMemo 内）
const filterMap = buildFilterMap(feeds, keywordFilters);

// 記事ごとの判定（コンパイル済みを再利用）
const match = matchesKeywordFilter(article, compiledFilter);
```

### ReDoS 対策 (`hasCatastrophicBacktracking`)

ユーザー入力の正規表現を `/pattern/` 形式で受け付けるが、壊滅的バックトラッキングを検出した場合は
`null`（マッチしない）扱いにしてサービス拒否を防ぐ。検出対象パターン:

- ネストした量指定子: `(a+)+` / `(a{2,})+`
- 量指定子付き交互化グループ: `(a|aa)+`
- 文字クラスが混在するネストグループ: `([a-z)]+)+`

---

## ビルド・デプロイ

```bash
npm run build    # next build
npm run deploy   # @opennextjs/cloudflare build && wrangler deploy
```

ビルド成果物:

- `.open-next/worker.js` → Workers スクリプト (wrangler.toml の main)
- `.open-next/assets/` → 静的アセット (Cloudflare Assets)
