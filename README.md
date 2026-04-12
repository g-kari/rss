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

| メソッド | パス                       | 説明                         |
| -------- | -------------------------- | ---------------------------- |
| GET      | `/api/articles`            | 記事一覧取得                 |
| POST     | `/api/articles/save`       | 記事保存                     |
| GET      | `/api/content?url=...`     | 記事フルテキスト取得プロキシ |
| GET      | `/api/ogp?url=...`         | OGP 画像 URL 取得            |
| GET      | `/api/image-proxy?url=...` | 外部画像プロキシ             |

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
