# RSS Reader

Next.js 16 + Cloudflare Workers で動くパーソナル RSS リーダー。`rss.0g0.xyz` でホスト中。

## 主要機能

| 機能                              | 説明                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| 📰 5種類のレイアウト              | コンパクト / リスト / カード / マガジン / ギャラリー       |
| ✅ 既読・ブックマーク・後で読む   | 記事ごとに状態を管理。デバイス間で自動同期                 |
| 🔍 全文取得                       | RSS サマリーだけでなく記事本文をその場で取得               |
| 🤖 AI 要約・翻訳                  | Workers AI (Llama) による記事要約と日本語翻訳              |
| 🌙 ダーク / ライトテーマ          | システム設定に追従、手動切り替えも可能                     |
| 🔎 全文検索                       | フィールド指定・正規表現対応のクライアントサイド検索       |
| 🏷️ タグ・メモ・スヌーズ           | 記事へのタグ付け、個人メモ、指定日時まで非表示             |
| 📤 OPML インポート / エクスポート | 他リーダーからの移行・バックアップに対応                   |
| ⌨️ キーボードナビゲーション       | `j/k` で移動、`o` で開く、`b` でブックマーク、`?` でヘルプ |
| 🔔 Web Push 通知                  | 新着記事をプッシュ通知で受け取る                           |

## クイックスタート

### 1. サインイン

[rss.0g0.xyz](https://rss.0g0.xyz) を開き「**Google でログイン**」をクリック。
0g0 ID (OAuth2) 経由で認証が完了するとメイン画面に遷移します。

### 2. フィードを追加する

左サイドバー上部の **「+ フィードを追加」** ボタンをクリックし、RSS フィードの URL またはサイトの URL を入力します。

- **RSS 自動検出**: サイトの URL を入力すると、`<link rel="alternate">` タグや一般的なパスから RSS フィードを自動検出します。
- **LLM フォールバック**: RSS フィードが見つからない場合は Workers AI がサイト構造を解析し、CSS セレクタを推論して記事リストを取得します。
- **OPML インポート**: 他のリーダーからまとめて移行する場合は「インポート」からOPMLファイルをアップロードしてください。

### 3. 記事を読む

画面は **3ペインレイアウト** で構成されています。

```
┌─────────────┬──────────────────┬──────────────────────────┐
│  サイドバー  │    記事一覧      │      記事本文            │
│  (フィード) │  (タイトル一覧)  │  (フルテキスト表示)      │
└─────────────┴──────────────────┴──────────────────────────┘
```

- **サイドバー**: 購読フィード一覧、グループ、ブックマーク、履歴、コレクション等の特殊ビュー
- **記事一覧**: 選択中フィードの記事。未読のみ表示・レイアウト切り替え可
- **記事本文**: 選択した記事の本文。「全文取得」ボタンで元サイトから本文を取得できる

### 4. キーボードショートカット

| キー      | 操作                        |
| --------- | --------------------------- |
| `j` / `k` | 次の記事 / 前の記事         |
| `n` / `p` | 次のフィード / 前のフィード |
| `o`       | 記事を元サイトで開く        |
| `b`       | ブックマーク切り替え        |
| `r`       | 既読 / 未読切り替え         |
| `m`       | 一括既読（現在のフィード）  |
| `u`       | 未読フィルター切り替え      |
| `s`       | スヌーズ                    |
| `f`       | 全文取得                    |
| `a`       | AI 要約                     |
| `z`       | AI 翻訳                     |
| `?`       | ショートカット一覧を表示    |

全ショートカットの詳細は [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) を参照してください。

---

## 技術スタック

| レイヤー       | 技術                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare                                           |
| フロントエンド | React 19 + TypeScript + Tailwind CSS v4                                                  |
| API            | Next.js Route Handlers (`app/api/**`)                                                    |
| 認証           | 0g0 ID (OAuth2 + ES256 JWT)                                                              |
| データ         | Cloudflare R2 (`rss-reader-data`) + KV (`RATE_LIMIT`) — ユーザー別 JSON + レートリミット |
| AI             | Workers AI (要約・翻訳・フィード推薦)                                                    |
| 自動更新       | Cloudflare Cron Trigger（30分ごと）                                                      |
| デプロイ       | Cloudflare Workers CI/CD（master push で自動ビルド＆デプロイ）                           |

## キーボードショートカット

主要な操作はすべてキーボードから実行できる。詳細は [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) を参照。
アプリ内では `?` キーで一覧モーダルを表示できる。

## セットアップ

### 1. 依存パッケージインストール

```bash
pnpm install
```

### 2. R2 バケット作成

```bash
npx wrangler r2 bucket create rss-reader-data
```

### 3. 0g0 ID OAuth2 アプリ登録

[https://id.0g0.xyz](https://id.0g0.xyz) にログインし、OAuth2 アプリを登録する。登録時の必須項目:

| 項目         | 値                                          |
| ------------ | ------------------------------------------- |
| アプリ名     | 任意（例: `RSS Reader`）                    |
| Callback URL | `https://your-domain.com/api/auth/callback` |
| 許可スコープ | `openid profile email`                      |

> **Callback URL** は必ず `APP_BASE_URL + /api/auth/callback` の形で登録する。ローカル開発用には別途 `http://localhost:3000/api/auth/callback` を追加する。

登録完了後、発行される `CLIENT_ID` / `CLIENT_SECRET` を次節で設定する。

### 4. VAPID 鍵の生成（Web Push 用）

Web Push 通知の VAPID 鍵ペアを生成する。**Node.js 18.17 以上** が必要:

```bash
node scripts/generate-vapid-keys.mjs
```

出力例:

```
=== VAPID 鍵ペア ===

VAPID_PUBLIC_KEY (65 bytes uncompressed P-256):
BN1q...（base64url、88 文字程度）

VAPID_PRIVATE_KEY (32 bytes P-256 scalar):
xY7k...（base64url、43 文字程度）
```

この 2 つの値を次節でシークレットとして登録する。

### 5. Cloudflare API トークンの生成（オプション）

全文取得フォールバック (`toMarkdown` API) を使う場合のみ必要。使わなければスキップ可。

1. [Cloudflare ダッシュボード → My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) を開く
2. 「Create Token」→「Create Custom Token」を選択
3. 権限 (Permissions) に次を追加:
   - `Account` / `Workers AI` / `Read`
4. アカウントリソースを該当アカウントに限定して作成
5. 同じダッシュボード右サイドバーの「Account ID」を控える

> `toMarkdown` 用の `CLOUDFLARE_ACCOUNT_ID` は `wrangler.toml` の `[vars]` に平文で持つか、`npx wrangler secret put CLOUDFLARE_ACCOUNT_ID` で設定する。

### 6. シークレット設定

0g0 ID で登録した `CLIENT_ID` / `CLIENT_SECRET` を設定:

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

手順 4 で生成した VAPID 鍵:

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

手順 5 の Cloudflare API トークン（`toMarkdown` フォールバック用、オプション）:

```bash
npx wrangler secret put CLOUDFLARE_API_TOKEN
npx wrangler secret put CLOUDFLARE_ACCOUNT_ID   # wrangler.toml [vars] に記載しない場合
```

Brave Search API キー（フィード推薦で外部検索を使う場合のみ、オプション）:

```bash
npx wrangler secret put BRAVE_SEARCH_API_KEY
```

セルフホスト RSSHub を使う場合（オプション）:

```bash
npx wrangler secret put RSSHUB_INSTANCE_URL   # 例: https://rsshub.example.com
npx wrangler secret put RSSHUB_ACCESS_KEY     # RSSHub のアクセスキー（未設定時はなし）
```

### 7. wrangler.toml 設定

`wrangler.toml` の `[vars]` を環境に合わせて更新:

```toml
[vars]
AUTH_BASE_URL     = "https://id.0g0.xyz"        # 0g0 ID エンドポイント
APP_BASE_URL      = "https://your-domain.com"   # アプリのドメイン（Callback URL のプレフィックス）
VAPID_SUBJECT     = "mailto:admin@example.com"  # Web Push 送信元メール
BETA_ALLOWED_SUBS = ""                          # ベータ制限: カンマ区切り sub リスト。空文字で制限なし
```

### 8. ローカル開発

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
pnpm run test:unit    # Vitest ユニットテスト実行（#682 Phase C で導入、~500ms）
pnpm run test:unit:watch  # Vitest watch モード
```

> **デプロイについて**: `master` ブランチへの push で Cloudflare Workers 側が自動ビルド＆デプロイを実行する。ローカルで `deploy` を手動実行する必要はない。

### Pre-commit フック

`.pre-commit-config.yaml` で以下のフックがコミット時に自動実行される:

1. **oxlint + oxfmt** — lint & フォーマット自動修正
2. **tsc --noEmit** — 型チェック
3. **vitest unit** — ユニットテスト（#682 Phase C で追加、playwright より高速）
4. **playwright e2e** — E2E テスト

```bash
pre-commit install   # 初回セットアップ
```

## API エンドポイント一覧

### 認証

| メソッド | パス                       | 説明                                |
| -------- | -------------------------- | ----------------------------------- |
| GET      | `/api/auth/login`          | OAuth2 認証開始                     |
| GET      | `/api/auth/callback`       | OAuth2 コールバック                 |
| GET      | `/api/auth/me`             | セッション確認・自動リフレッシュ    |
| POST     | `/api/auth/logout`         | ログアウト（cookie クリア）         |
| POST     | `/api/auth/dbsc/register`  | DBSC 公開鍵登録（スタブ）           |
| POST     | `/api/auth/dbsc/challenge` | DBSC チャレンジ発行・検証（スタブ） |
| DELETE   | `/api/auth/dbsc/session`   | DBSC バインド済みデバイス登録解除   |

### フィード

| メソッド | パス                                 | 説明                                                                        |
| -------- | ------------------------------------ | --------------------------------------------------------------------------- |
| GET      | `/api/feeds`                         | フィード一覧取得                                                            |
| POST     | `/api/feeds`                         | フィード追加 `{ url }`                                                      |
| DELETE   | `/api/feeds/:id`                     | フィード削除                                                                |
| PATCH    | `/api/feeds/:id`                     | フィード設定更新                                                            |
| POST     | `/api/feeds/:id/refresh`             | 単体フィード手動更新                                                        |
| POST     | `/api/feeds/:id/reinfer`             | LLM CSS セレクタ再推論                                                      |
| POST     | `/api/feeds/refresh`                 | 全フィード手動更新                                                          |
| POST     | `/api/feeds/import`                  | OPML インポート                                                             |
| GET      | `/api/feeds/export`                  | OPML エクスポート                                                           |
| POST     | `/api/feeds/:id/purge-content-cache` | フィード全記事の content / clip Cache 一括クリア (CLI 用、購読チェック必須) |

### フィードグループ

| メソッド | パス                       | 説明                                                             |
| -------- | -------------------------- | ---------------------------------------------------------------- |
| GET      | `/api/feed-groups`         | グループ一覧取得（`order` 昇順ソート）                           |
| POST     | `/api/feed-groups`         | グループ新規作成 `{ name }` → 201 Created で `FeedGroup` を返す  |
| PATCH    | `/api/feed-groups/:id`     | グループ更新 `{ name?, order?, collapsed?, muted? }`（部分更新） |
| DELETE   | `/api/feed-groups/:id`     | グループ削除（所属購読の `groupId` は自動クリアを試みる）        |
| POST     | `/api/feed-groups/reorder` | グループ並べ替え `{ orderedIds: string[] }` で一括更新           |

- レスポンス型は `FeedGroup = { id, name, order, collapsed?, muted?, createdAt }`
- POST 時の `order` は既存グループの最大値 + 1 で自動採番される
- グループ上限は 100 件 (`MAX_FEED_GROUPS_PER_USER`)、名前は最大 50 文字 (`FEED_GROUP_NAME_MAX_LENGTH`) でユーザー内重複不可
- 保存先: `users/{userId}/feed-groups.json`（JSON 配列）
- DELETE は R2 のトランザクション非対応のため、グループ除去後に購読側の `groupId` クリアを行う。後半が失敗すると orphan な `groupId` が購読側に残るが、クライアントは未知の `groupId` を無視するため実害はない

### コレクション

| メソッド | パス                   | 説明                                                                  |
| -------- | ---------------------- | --------------------------------------------------------------------- |
| GET      | `/api/collections`     | コレクション一覧取得                                                  |
| POST     | `/api/collections`     | コレクション作成 `{ name }` → 201 Created                             |
| PATCH    | `/api/collections/:id` | コレクション更新 `{ name?, order?, addArticleId?, removeArticleId? }` |
| DELETE   | `/api/collections/:id` | コレクション削除                                                      |

### 記事

| メソッド | パス                       | 説明                                                   |
| -------- | -------------------------- | ------------------------------------------------------ |
| GET      | `/api/articles`            | 記事一覧取得                                           |
| POST     | `/api/articles/save`       | 記事保存                                               |
| GET      | `/api/content?url=...`     | 記事フルテキスト取得プロキシ                           |
| DELETE   | `/api/content?url=...`     | 自分の clip cache を削除 (共有 cache は触らない、冪等) |
| GET      | `/api/ogp?url=...`         | OGP 画像 URL 取得                                      |
| GET      | `/api/image-proxy?url=...` | 外部画像プロキシ                                       |
| GET      | `/api/video-proxy?url=...` | 外部動画プロキシ (image-proxy と同 handler)            |
| POST     | `/api/clip`                | SingleFile 拡張からの HTML クリップ保存                |

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

| メソッド | パス                    | 説明                                                           |
| -------- | ----------------------- | -------------------------------------------------------------- |
| GET      | `/api/push/vapid-key`   | VAPID 公開鍵取得                                               |
| GET      | `/api/push/status`      | サブスクリプション状態確認                                     |
| POST     | `/api/push/subscribe`   | Push 通知登録                                                  |
| POST     | `/api/push/unsubscribe` | Push 通知解除                                                  |
| POST     | `/api/push/test`        | テスト通知送信                                                 |
| GET/PUT  | `/api/push/config`      | 通知設定 (disabledFeeds / silent 時間帯 / timezone) 取得・更新 |

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

#### フィードグループ

| エンドポイント                      | ステータス | `code`                      | 説明                               |
| ----------------------------------- | ---------- | --------------------------- | ---------------------------------- |
| `POST /api/feed-groups`             | 400        | `INVALID_NAME`              | name が空・文字列でない・50 文字超 |
| `POST /api/feed-groups`             | 409        | `DUPLICATE_NAME`            | 同名グループがすでに存在           |
| `POST /api/feed-groups`             | 409        | `FEED_GROUP_LIMIT_EXCEEDED` | グループ数上限（100）に到達        |
| `PATCH /api/feed-groups/:id`        | 400        | `INVALID_NAME`              | name が空・文字列でない・50 文字超 |
| `PATCH /api/feed-groups/:id`        | 400        | `INVALID_ORDER`             | order が整数でない                 |
| `PATCH /api/feed-groups/:id`        | 400        | `INVALID_COLLAPSED`         | collapsed が boolean でない        |
| `PATCH /api/feed-groups/:id`        | 400        | `INVALID_MUTED`             | muted が boolean でない            |
| `PATCH /api/feed-groups/:id`        | 409        | `DUPLICATE_NAME`            | 別グループが同名                   |
| `PATCH/DELETE /api/feed-groups/:id` | 404        | `FEED_GROUP_NOT_FOUND`      | 該当グループが存在しない           |

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
users/{userId}/feed-groups.json         # FeedGroup[]（フィードグループ定義）
users/{userId}/collections.json         # Collection[]（コレクション定義）
users/{userId}/saved.json               # 手動保存記事（/api/articles/save）

# サーバーサイドセッション
sessions/{sessionId}.json              # ServerSessionData（refreshToken 管理）

# AI キャッシュ（永続）
ai-cache/summary/{sha256}               # AI 要約キャッシュ
ai-cache/translation/{sha256}           # AI 翻訳キャッシュ
```

`userId` = JWT の `sub` クレームをそのまま使用。
`feedHash` = `sha256(feedUrl).slice(0, 16)`（URL からの決定論的な識別子）。
記事データはユーザー別ではなくフィード単位で共有管理されるため、複数ユーザーが同じフィードを購読しても記事フェッチは 1 回だけ実行される。

> **運用向け**: バックアップ・ディザスタリカバリ手順は [docs/backup-recovery.md](docs/backup-recovery.md) を参照。

## 読み取り状態の管理

クライアント優先・サーバー同期の二重管理方式:

- `localStorage` に既読・ブックマーク・後で読む ID を保持（オフライン対応）
- ログイン時に `/api/read-state` でサーバーデータとマージ（ローカル ∪ サーバー）
- 状態変更から 2秒後にデバウンスして R2 に同期
- ページ離脱時 (`beforeunload`) は `sendBeacon` で即時送信

## セキュリティ対応

### pnpm.overrides — 強制バージョン根拠

`package.json` の `pnpm.overrides` は脆弱性対応のためにサブ依存のバージョンを強制固定している。
各エントリの根拠と、削除可能になる条件は以下の通り:

| パッケージ        | 強制バージョン | 対応 CVE / 理由                                                                                              |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `path-to-regexp`  | `^6.3.0`       | **CVE-2024-45296** — ReDoS 脆弱性。6.2.x 以下で壊滅的バックトラッキングが発生。                              |
| `yaml`            | `>=2.8.3`      | **CVE-2025-27789** — Prototype Pollution / DoS。2.8.2 以下で発生、2.8.3 で修正。                             |
| `brace-expansion` | `>=5.0.5`      | ReDoS 脆弱性対策。特定パターンの展開で壊滅的バックトラッキングが発生する。                                   |
| `minimatch`       | `>=10.0.0`     | `brace-expansion` 依存の ReDoS 脆弱性に連鎖するため、対応版に固定。                                          |
| `vite`            | `>=8.0.5`      | パストラバーサル / SSRF 系脆弱性対策（詳細は vite の該当リリースノートを参照）。                             |
| `postcss`         | `>=8.5.13`     | [CVE-2025-6245](https://github.com/advisories/GHSA-86g3-cmjm-g2xj) ほか — コードインジェクション脆弱性対策。 |
| `fast-xml-parser` | `>=5.7.0`      | Prototype Pollution / Entity Expansion DoS 対策。5.7.0 で修正。                                              |

> **削除タイミング**: 直接依存（Next.js / vite 等）が対応版に更新されたら該当 `override` を削除できる。
> 削除前に `pnpm why <pkg>` でバージョンが引き上げ済みであることを確認すること。

## ライセンス

このプロジェクトは [MIT License](./LICENSE) の下で公開されています。

### 主要依存ライブラリのライセンス

| パッケージ              | ライセンス   |
| ----------------------- | ------------ |
| Next.js                 | MIT          |
| React                   | MIT          |
| Tailwind CSS            | MIT          |
| @opennextjs/cloudflare  | MIT          |
| @cloudflare/puppeteer   | Apache-2.0   |
| @mozilla/readability    | Apache-2.0   |
| fast-xml-parser         | MIT          |
| linkedom                | ISC          |
| highlight.js            | BSD-3-Clause |
| katex                   | MIT          |
| marked                  | MIT          |
| masonic                 | MIT          |
| @tanstack/react-virtual | MIT          |
| piper-plus              | MIT          |
| @piper-plus/g2p         | MIT          |
| onnxruntime-web         | MIT          |

### 音声素材ライセンス (TTS engine: Piper)

Piper TTS engine の voice として **つくよみちゃんコーパス** (CC BY 4.0 + コーパス利用規約) を採用しています。

- **音声合成には、フリー素材キャラクター「つくよみちゃん」の音声データを使用しています。**
- **つくよみちゃんコーパス（CV.夢前黎）**
- 公式: <https://tyc.rei-yumesaki.net/material/corpus/>

出力音声を以下の用途に使用することは禁止されています (コーパス利用規約に基づく):

- 批判・攻撃
- 政治的主張への賛同呼びかけ
- 成人向け作品でゾーニングなしの公開
- 他者の二次素材としての再配布

詳細はアプリ内「設定 → 表示 → 読み上げ音声」のクレジット欄、および公式規約をご確認ください。

### デザイン参考

記事詳細ビューの設計・UXは [Readeck](https://codeberg.org/readeck/readeck) (AGPL v3.0) を参考にしています。
コードの直接流用はなく、設計・機能アイデアのみを参考にしています。
