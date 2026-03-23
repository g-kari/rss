# RSS Reader

Next.js 16 + Cloudflare Workers で動くセルフホスト RSS リーダー。`rss.0g0.xyz` でホスト中。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare |
| フロントエンド | React 19 + TypeScript + Tailwind CSS v4 |
| API | Next.js Route Handlers (`app/api/**`) |
| 認証 | 0g0 ID (OAuth2 + ES256 JWT) |
| データ | Cloudflare R2 (`rss-reader-data`) — ユーザー別 JSON |
| AI | Workers AI (要約・翻訳) |
| 自動更新 | Cloudflare Cron Trigger（30分ごと） |
| デプロイ | @opennextjs/cloudflare + wrangler |

## セットアップ

### 1. R2 バケット作成

```bash
npx wrangler r2 bucket create rss-reader-data
npx wrangler r2 bucket create rss-reader-cache
```

### 2. シークレット設定

0g0 ID でアプリを登録して取得した `CLIENT_ID` / `CLIENT_SECRET` を設定:

```bash
npx wrangler secret put CLIENT_ID
npx wrangler secret put CLIENT_SECRET
```

### 3. 依存パッケージインストール

```bash
npm install
```

### 4. ローカル開発

```bash
# Next.js dev server (localhost:3000)
npm run dev

# Cloudflare Workers ローカルエミュレーション
npx wrangler dev
```

### 5. デプロイ

```bash
npm run deploy
```

## wrangler.toml 設定

`wrangler.toml` の `[vars]` を環境に合わせて更新:

```toml
[vars]
AUTH_BASE_URL = "https://id.0g0.xyz"        # 0g0 ID エンドポイント
APP_BASE_URL  = "https://your-domain.com"   # アプリのドメイン
BETA_ALLOWED_SUBS = ""                      # ベータ制限: カンマ区切り sub リスト。空文字で制限なし
```

## API

### 認証

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/auth/login` | OAuth2 認証開始 |
| GET | `/api/auth/callback` | OAuth2 コールバック |
| GET | `/api/auth/me` | セッション確認・自動リフレッシュ |
| POST | `/api/auth/logout` | ログアウト（cookie クリア） |

### フィード

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/feeds` | フィード一覧取得 |
| POST | `/api/feeds` | フィード追加 `{ url: string }` |
| DELETE | `/api/feeds/:id` | フィード削除 |

### 記事

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/articles` | 記事一覧取得 |
| GET | `/api/content?url=...` | 記事フルテキスト取得プロキシ |

### AI

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/ai/summarize` | 記事要約 (Workers AI) |
| POST | `/api/ai/translate` | 記事翻訳 (Workers AI) |

### その他

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/health` | ヘルスチェック |

## データ構造 (R2)

```
users/{sub}/profile.json    # UserProfile (ログイン時に保存)
users/{sub}/feeds.json      # Feed[]
users/{sub}/articles.json   # Article[] (max 2000, publishedAt 降順)
```

`sub` = 0g0 ID のペアワイズ識別子 (JWT の `sub` クレーム)

## 読み取り状態

サーバーサイドでは管理しない。`localStorage['rss-read']` にブラウザ側で保持。

## 開発コマンド

```bash
npm run dev         # Next.js dev server (localhost:3000)
npm run build       # next build
npm run preview     # wrangler dev (Workers ローカルエミュレーション)
npm run build:cf    # @opennextjs/cloudflare build
npm run deploy      # build:cf + wrangler deploy
npm run typecheck   # TypeScript 型チェック
```
