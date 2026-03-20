# RSS Reader — Claude Code ガイド

Cloudflare Workers + React の RSS リーダー (SaaS)。`rss.0g0.xyz` でホスト中。

## ツール

このプロジェクトでは **Serena** (MCP サーバー) を優先的に使用する。

- シンボルレベルの検索・編集には `find_symbol` / `replace_symbol_body` を使う
- ファイル全体の読み書きより、必要なシンボルだけを読んで効率よく作業する
- `get_symbols_overview` でファイルの構造を把握してから詳細を読む

## スタック

| レイヤー | 技術 |
|---|---|
| Workers API | Hono.js (`src/worker.ts`) |
| フロントエンド | React + TypeScript + Vite + Tailwind v4 |
| 認証 | 0g0 ID (OAuth2 + ES256 JWT) |
| データ | R2 (`rss-reader-data`) — ユーザー別 JSON |
| デプロイ | `npm run deploy` → wrangler deploy |

## ディレクトリ

```
src/
  worker.ts              # Hono エントリーポイント + Cron scheduled handler
  types.ts               # Feed / Article / UserProfile / Env / HonoEnv 型
  lib/
    auth.ts              # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    r2.ts                # R2 read/write ヘルパー
    xml-parser.ts        # fast-xml-parser ラッパー (RSS 2.0 + Atom)
  middleware/
    auth.ts              # requireAuth ミドルウェア (cookie → JWT 検証 → 自動リフレッシュ)
  routes/
    auth.ts              # GET /login, /callback, /me、POST /logout
    feeds.ts             # GET/POST/DELETE /api/feeds (R2 ユーザー別)
    articles.ts          # GET /api/articles (R2 ユーザー別)
  cron/
    fetch.ts             # fetchArticles(userId) / fetchAllUsers() — RSS 取得
  components/
    FeedSidebar.tsx      # サイドバー 200px (フィード管理 + ユーザー情報)
    ArticleList.tsx      # 記事一覧 380px
    ArticleView.tsx      # 記事本文 1fr
  App.tsx                # 3ペインレイアウト + 認証状態管理
```

## R2 データ構造

```
users/{sub}/profile.json    # UserProfile (ログイン時に保存)
users/{sub}/feeds.json      # Feed[]
users/{sub}/articles.json   # Article[] (max 2000, publishedAt 降順)
```

`sub` = 0g0 ID のペアワイズ識別子 (JWT の `sub` クレーム)

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

## 開発

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Workers + SPA ビルド
npx wrangler dev     # Workers local emulation
npm run deploy       # ビルド + wrangler deploy
npm run typecheck    # TypeScript 型チェック
```

## 必要なシークレット

| キー | 設定方法 |
|---|---|
| `CLIENT_ID` | `npx wrangler secret put CLIENT_ID` |
| `CLIENT_SECRET` | `npx wrangler secret put CLIENT_SECRET` |

## 規約ドキュメント

- `.claude/rules/design-system.md` — カラーパレット・タイポグラフィ・レイアウト
- `.claude/rules/coding-conventions.md` — TypeScript・React・Hono パターン
- `.claude/rules/architecture.md` — データフロー・Workers 構造
