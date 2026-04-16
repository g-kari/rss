# RSS Reader

Next.js 16 + Cloudflare Workers で動くパーソナル RSS リーダー。`rss.0g0.xyz` でホスト中。

## 技術スタック

| レイヤー       | 技術                                                           |
| -------------- | -------------------------------------------------------------- |
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare                 |
| フロントエンド | React 19 + TypeScript + Tailwind CSS v4                        |
| API            | Next.js Route Handlers (`app/api/**`)                          |
| 認証           | 0g0 ID (OAuth2 + ES256 JWT)                                    |
| データ         | Cloudflare R2 (`rss-reader-data`) — ユーザー別 JSON            |
| AI             | Workers AI (要約・翻訳・フィード推薦)                          |
| 自動更新       | Cloudflare Cron Trigger（30分ごと）                            |
| デプロイ       | Cloudflare Workers CI/CD（master push で自動ビルド＆デプロイ） |

## セットアップ

### 1. 依存パッケージインストール

```bash
pnpm install
```

### 2. R2 バケット作成

```bash
npx wrangler r2 bucket create rss-reader-data
```

### 3. シークレット設定

0g0 ID でアプリを登録して取得した `CLIENT_ID` / `CLIENT_SECRET` を設定:

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

Web Push 通知用 VAPID 鍵（`scripts/generate-vapid-keys.mjs` で生成）:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

全文取得フォールバック用 Cloudflare API トークン（オプション）:

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN
```

Brave Search API キー（フィード推薦用、オプション）:

```bash
npx wrangler secret put BRAVE_SEARCH_API_KEY
```

### 4. wrangler.toml 設定

`wrangler.toml` の `[vars]` を環境に合わせて更新:

```toml
[vars]
AUTH_BASE_URL     = "https://id.0g0.xyz"        # 0g0 ID エンドポイント
APP_BASE_URL      = "https://your-domain.com"   # アプリのドメイン
VAPID_SUBJECT     = "mailto:admin@example.com"  # Web Push 送信元メール
BETA_ALLOWED_SUBS = ""                          # ベータ制限: カンマ区切り sub リスト。空文字で制限なし
```

### 5. ローカル開発

```bash
pnpm run dev      # Next.js dev server (localhost:3000)
pnpm run preview  # Cloudflare Workers ローカルエミュレーション (wrangler dev)
```

## 開発コマンド

```bash
pnpm run dev          # Next.js dev server (localhost:3000)
pnpm run build        # next build（動作確認・型チェック込み）
pnpm run preview      # Workers ローカルエミュレーション (wrangler dev)
pnpm run build:cf     # Cloudflare Workers 向けビルド（CI/CD が自動実行するため手動不要）
pnpm run deploy       # ローカルから手動デプロイ（通常不要）
pnpm run check        # Oxlint + Oxfmt + tsgo 型チェック
pnpm run check:fix    # 自動修正付きチェック
pnpm run typecheck    # tsc --noEmit（完全な型チェック）
pnpm run test:e2e     # Playwright E2E テスト実行
pnpm run test:e2e:ui  # Playwright UI モード（デバッグ用）
```

> **デプロイについて**: `master` ブランチへの push で Cloudflare Workers 側が自動ビルド＆デプロイを実行する。ローカルで `deploy` を手動実行する必要はない。

### Pre-commit フック

`.pre-commit-config.yaml` で以下のフックがコミット時に自動実行される:

1. **oxlint + oxfmt** — lint & フォーマット自動修正
2. **tsc --noEmit** — 型チェック
3. **playwright e2e** — E2E テスト

```bash
pre-commit install   # 初回セットアップ
```

## API エンドポイント一覧

### 認証

| メソッド | パス                 | 説明                             |
| -------- | -------------------- | -------------------------------- |
| GET      | `/api/auth/login`    | OAuth2 認証開始                  |
| GET      | `/api/auth/callback` | OAuth2 コールバック              |
| GET      | `/api/auth/me`       | セッション確認・自動リフレッシュ |
| POST     | `/api/auth/logout`   | ログアウト（cookie クリア）      |

### フィード

| メソッド | パス                     | 説明                   |
| -------- | ------------------------ | ---------------------- |
| GET      | `/api/feeds`             | フィード一覧取得       |
| POST     | `/api/feeds`             | フィード追加 `{ url }` |
| DELETE   | `/api/feeds/:id`         | フィード削除           |
| POST     | `/api/feeds/:id/refresh` | 単体フィード手動更新   |
| POST     | `/api/feeds/:id/reinfer` | LLM CSS セレクタ再推論 |
| POST     | `/api/feeds/refresh`     | 全フィード手動更新     |
| POST     | `/api/feeds/import`      | OPML インポート        |
| GET      | `/api/feeds/export`      | OPML エクスポート      |

### 記事

| メソッド | パス                       | 説明                                    |
| -------- | -------------------------- | --------------------------------------- |
| GET      | `/api/articles`            | 記事一覧取得                            |
| POST     | `/api/articles/save`       | 記事保存                                |
| GET      | `/api/content?url=...`     | 記事フルテキスト取得プロキシ            |
| GET      | `/api/ogp?url=...`         | OGP 画像 URL 取得                       |
| GET      | `/api/image-proxy?url=...` | 外部画像プロキシ                        |
| POST     | `/api/clip`                | SingleFile 拡張からの HTML クリップ保存 |

### 既読・ブックマーク状態

| メソッド | パス              | 説明                                           |
| -------- | ----------------- | ---------------------------------------------- |
| GET      | `/api/read-state` | 既読・ブックマーク・後で読む・スヌーズ状態取得 |
| POST     | `/api/read-state` | 状態を R2 に保存（2秒デバウンス後）            |

### AI

| メソッド | パス                | 説明                  |
| -------- | ------------------- | --------------------- |
| POST     | `/api/ai/summarize` | 記事要約 (Workers AI) |
| POST     | `/api/ai/translate` | 記事翻訳 (Workers AI) |

### フィード推薦

| メソッド | パス                           | 説明             |
| -------- | ------------------------------ | ---------------- |
| GET      | `/api/recommendations`         | 推薦フィード一覧 |
| POST     | `/api/recommendations/dismiss` | 推薦を非表示     |
| POST     | `/api/recommendations/refresh` | 推薦を再生成     |

### Web Push 通知

| メソッド | パス                    | 説明                       |
| -------- | ----------------------- | -------------------------- |
| GET      | `/api/push/vapid-key`   | VAPID 公開鍵取得           |
| GET      | `/api/push/status`      | サブスクリプション状態確認 |
| POST     | `/api/push/subscribe`   | Push 通知登録              |
| POST     | `/api/push/unsubscribe` | Push 通知解除              |
| POST     | `/api/push/test`        | テスト通知送信             |

### 統計・その他

| メソッド | パス                 | 説明                             |
| -------- | -------------------- | -------------------------------- |
| GET      | `/api/stats`         | 読了統計（日別・ヒートマップ等） |
| GET      | `/api/engagement`    | エンゲージメント記録取得         |
| POST     | `/api/engagement`    | エンゲージメント記録             |
| GET      | `/api/release-notes` | リリースノート                   |
| GET      | `/api/health`        | ヘルスチェック                   |

## API エラーレスポンス

すべてのエラーは `src/lib/api-error.ts` の `apiError()` ヘルパーによって以下の統一形式で返される。

```json
{
  "error": "人間可読メッセージ",
  "code": "MACHINE_READABLE_CODE",
  "hint": "ユーザー向け補足（オプション）",
  "retryable": true,
  "retryAfter": 30
}
```

| フィールド   | 型         | 説明                                                                |
| ------------ | ---------- | ------------------------------------------------------------------- |
| `error`      | `string`   | 人間可読のエラーメッセージ                                          |
| `code`       | `string?`  | クライアントが分岐に使う機械可読コード（`SCREAMING_SNAKE_CASE`）    |
| `hint`       | `string?`  | ユーザー向けの補足ヒント                                            |
| `retryable`  | `boolean?` | リトライで成功する可能性がある場合 `true`                           |
| `retryAfter` | `number?`  | リトライまでの秒数（429 時は `Retry-After` ヘッダーにも同値が入る） |

### 全エンドポイント共通

| ステータス | `code`           | 発生条件                                                 |
| ---------- | ---------------- | -------------------------------------------------------- |
| 400        | `INVALID_JSON`   | リクエストボディが JSON としてパース失敗                 |
| 401        | `UNAUTHORIZED`   | セッション未認証またはトークン失効（`withSession` 経由） |
| 429        | `RATE_LIMITED`   | クールダウン中（`Retry-After` ヘッダー付与）             |
| 500        | `INTERNAL_ERROR` | 想定外サーバーエラー（`withSession` の例外ハンドラ）     |

### エンドポイント別

#### フィード

| エンドポイント                | ステータス | `code`                | 説明                                                                    |
| ----------------------------- | ---------- | --------------------- | ----------------------------------------------------------------------- |
| `POST /api/feeds`             | 400        | `INVALID_URL`         | URL が空または http/https でない                                        |
| `POST /api/feeds`             | 400        | `INVALID_COOKIE`      | cookie 値が不正                                                         |
| `POST /api/feeds`             | 400        | `INVALID_SELECTOR`    | cssSelector が 1〜500 文字外、または構文不正                            |
| `POST /api/feeds`             | 409        | `FEED_EXISTS`         | 同じ feedHash がすでに購読済み                                          |
| `POST /api/feeds`             | 422        | `FEED_NOT_FOUND`      | RSS 探索・LLM 推論ともに失敗（`canRetryWithSelector: true` 付き）       |
| `POST /api/feeds`             | 422        | `FEED_LIMIT_REACHED`  | 1 ユーザー当たりの上限超過                                              |
| `PATCH /api/feeds/:id`        | 400        | `INVALID_TITLE` ほか  | title / filter / nsfw / priority / category / mutedUntil いずれかが不正 |
| `PATCH/DELETE /api/feeds/:id` | 404        | `FEED_NOT_FOUND`      | 該当購読またはメタが存在しない                                          |
| `POST /api/feeds/:id/refresh` | 404        | `FEED_NOT_FOUND`      | 購読が存在しない                                                        |
| `POST /api/feeds/:id/reinfer` | 400        | `NOT_LLM_FEED`        | LLM スクレイピングではないフィードに対する再推論                        |
| `POST /api/feeds/:id/reinfer` | 422        | `REINFER_FAILED`      | LLM が新しいセレクタを生成できなかった                                  |
| `POST /api/feeds/import`      | 400        | `INVALID_OPML`        | OPML が空・1MB 超・パース失敗                                           |
| `POST /api/feeds/import`      | 400        | `EMPTY_OPML`          | OPML から 1 件もフィードを抽出できなかった                              |
| `POST /api/feeds/import`      | 400        | `OPML_TOO_MANY_FEEDS` | 1 回のインポートあたりの上限超過                                        |
| `POST /api/feeds/import`      | 422        | `FEED_LIMIT_REACHED`  | ユーザーの購読上限に達している                                          |

#### 記事

| エンドポイント            | ステータス | `code`                          | 説明                                                              |
| ------------------------- | ---------- | ------------------------------- | ----------------------------------------------------------------- |
| `GET /api/articles`       | 400        | `INVALID_FEED` / `INVALID_PAGE` | feed/page クエリが不正                                            |
| `GET /api/articles`       | 404        | `FEED_NOT_FOUND`                | 指定された feed が購読リストに存在しない                          |
| `POST /api/articles/save` | 400        | `INVALID_URL`                   | url が空または http/https でない                                  |
| `POST /api/articles/save` | 422        | `SAVED_LIMIT_REACHED`           | 保存記事の上限に達した                                            |
| `GET /api/content`        | 400        | `INVALID_URL`                   | url クエリが空または http/https でない                            |
| `GET /api/content`        | 4xx        | `FETCH_FAILED`                  | 取得先が 4xx を返した（元ステータスをそのまま返す）               |
| `GET /api/content`        | 413        | `PAYLOAD_TOO_LARGE`             | 取得先のサイズが上限超過                                          |
| `GET /api/content`        | 415        | `UNSUPPORTED_CONTENT_TYPE`      | HTML 以外（`text/html` を含まない `Content-Type`）                |
| `GET /api/content`        | 502        | `EMPTY_BODY` / `FETCH_FAILED`   | レスポンスボディなし、またはネットワーク失敗（`retryable: true`） |
| `GET /api/content`        | 504        | `TIMEOUT`                       | フェッチタイムアウト（`retryable: true`）                         |
| `POST /api/clip`          | 400        | `INVALID_CLIP_PAYLOAD`          | SingleFile 拡張からのペイロードが不正                             |

#### 既読・ブックマーク

| エンドポイント         | ステータス | `code`              | 説明                     |
| ---------------------- | ---------- | ------------------- | ------------------------ |
| `POST /api/read-state` | 413        | `PAYLOAD_TOO_LARGE` | 同期ペイロードが上限超過 |

#### AI

| エンドポイント                       | ステータス | `code`                 | 説明                                                  |
| ------------------------------------ | ---------- | ---------------------- | ----------------------------------------------------- |
| `POST /api/ai/{summarize,translate}` | 400        | `INVALID_URL`          | url が空または http/https でない                      |
| `POST /api/ai/{summarize,translate}` | 401        | `UNAUTHORIZED`         | Workers AI が 401 を返した                            |
| `POST /api/ai/{summarize,translate}` | 429        | `RATE_LIMITED`         | ユーザークールダウン中、または Workers AI が 429 返却 |
| `POST /api/ai/{summarize,translate}` | 502        | `CONTENT_FETCH_FAILED` | 元記事の取得失敗（`retryable: true`）                 |
| `POST /api/ai/{summarize,translate}` | 502        | `AI_ERROR`             | Workers AI 呼び出しが想定外失敗（`retryable: true`）  |
| `POST /api/ai/{summarize,translate}` | 503        | `SERVICE_UNAVAILABLE`  | Workers AI が 503 を返した（`retryable: true`）       |

#### フィード推薦

| エンドポイント                      | ステータス | `code`       | 説明                    |
| ----------------------------------- | ---------- | ------------ | ----------------------- |
| `POST /api/recommendations/dismiss` | 400        | `INVALID_ID` | id クエリが空または不正 |

#### Web Push

| エンドポイント               | ステータス | `code`                   | 説明                                               |
| ---------------------------- | ---------- | ------------------------ | -------------------------------------------------- |
| `POST /api/push/subscribe`   | 400        | `INVALID_SUBSCRIPTION`   | サブスクリプションオブジェクトが不正               |
| `POST /api/push/subscribe`   | 400        | `INVALID_ENDPOINT`       | endpoint URL が不正                                |
| `POST /api/push/subscribe`   | 400        | `INVALID_P256DH`         | p256dh 公開鍵が不正                                |
| `POST /api/push/subscribe`   | 400        | `INVALID_AUTH_KEY`       | auth 認証鍵が不正                                  |
| `POST /api/push/subscribe`   | 429        | `TOO_MANY_SUBSCRIPTIONS` | 1 ユーザー当たりの登録上限超過                     |
| `POST /api/push/unsubscribe` | 400        | `INVALID_ENDPOINT`       | endpoint URL が空または不正                        |
| `GET /api/push/vapid-key`    | 503        | `PUSH_NOT_CONFIGURED`    | サーバー側 VAPID 公開鍵が未設定                    |
| `POST /api/push/test`        | 503        | `VAPID_NOT_CONFIGURED`   | サーバー側 VAPID 鍵が未設定（hint に設定コマンド） |
| `POST /api/push/test`        | 404        | `NO_SUBSCRIPTIONS`       | このユーザーに登録済みサブスクリプションがない     |

#### エンゲージメント

| エンドポイント         | ステータス | `code`            | 説明                     |
| ---------------------- | ---------- | ----------------- | ------------------------ |
| `POST /api/engagement` | 400        | `INVALID_PAYLOAD` | payload の形式・値が不正 |

> 新しいエラーコードを追加する場合は `src/lib/api-error.ts` の `apiError()` を経由し、上記表に追記すること。

## データ構造 (R2)

```
# 共有フィードデータ（ユーザー間で共有）
feeds/{feedHash}/meta.json               # SharedFeedMeta（フィードメタ情報）
feeds/{feedHash}/articles/latest.json   # Article[]（最新 500 件）
feeds/{feedHash}/articles/p{N}.json     # Article[]（古いページ、N >= 2）

# ユーザー別データ
users/{userId}/subscriptions.json       # UserSubscription[]（購読フィード一覧）
users/{userId}/profile.json             # UserProfile（ログイン時に保存）
users/{userId}/read-state.json          # ReadState（既読・ブックマーク・いいね・メモ等）
users/{userId}/engagement.json          # EngagementLog（行動履歴）
users/{userId}/recommendations.json     # RecommendationCache（フィード推薦キャッシュ）
users/{userId}/push.json                # PushConfig（Web Push サブスクリプション）

# AI キャッシュ（永続）
ai-cache/summary/{sha256}               # AI 要約キャッシュ
ai-cache/translation/{sha256}           # AI 翻訳キャッシュ
```

`userId` = JWT の `sub` クレームをそのまま使用。
`feedHash` = `sha256(feedUrl).slice(0, 16)`（URL からの決定論的な識別子）。
記事データはユーザー別ではなくフィード単位で共有管理されるため、複数ユーザーが同じフィードを購読しても記事フェッチは 1 回だけ実行される。

## 読み取り状態の管理

クライアント優先・サーバー同期の二重管理方式:

- `localStorage` に既読・ブックマーク・後で読む ID を保持（オフライン対応）
- ログイン時に `/api/read-state` でサーバーデータとマージ（ローカル ∪ サーバー）
- 状態変更から 2秒後にデバウンスして R2 に同期
- ページ離脱時 (`beforeunload`) は `sendBeacon` で即時送信

## ライセンス

このプロジェクトは [MIT License](./LICENSE) の下で公開されています。

### 主要依存ライブラリのライセンス

| パッケージ             | ライセンス   |
| ---------------------- | ------------ |
| Next.js                | MIT          |
| React                  | MIT          |
| Tailwind CSS           | MIT          |
| @opennextjs/cloudflare | MIT          |
| @mozilla/readability   | Apache-2.0   |
| fast-xml-parser        | MIT          |
| linkedom               | ISC          |
| highlight.js           | BSD-3-Clause |
| katex                  | MIT          |
| marked                 | MIT          |

### デザイン参考

記事詳細ビューの設計・UXは [Readeck](https://codeberg.org/readeck/readeck) (AGPL v3.0) を参考にしています。
コードの直接流用はなく、設計・機能アイデアのみを参考にしています。
