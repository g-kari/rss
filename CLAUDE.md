# RSS Reader — Claude Code ガイド

Cloudflare Workers + React の RSS リーダー。`rss.0g0.xyz` でホスト中。

## スタック

| レイヤー | 技術 |
|---|---|
| Workers API | Hono.js (`src/worker.ts`) |
| フロントエンド | React + TypeScript + Vite + Tailwind v4 |
| データ | GitHub Actions が `public/data/*.json` を更新 → Workers deploy |
| 認証なし | 個人利用、読み取り状態は `localStorage` |

## ディレクトリ

```
src/
  worker.ts          # Hono エントリーポイント
  types.ts           # Feed / Article / Env 型
  routes/feeds.ts    # POST/DELETE /api/feeds (GitHub Contents API)
  lib/xml-parser.ts  # fast-xml-parser ラッパー
  App.tsx            # 3ペインレイアウト
  components/
    FeedSidebar.tsx  # サイドバー (200px)
    ArticleList.tsx  # 記事一覧 (380px)
    ArticleView.tsx  # 記事本文 (1fr)

public/data/
  feeds.json         # フィード一覧 (GitHub Actions が読む)
  articles.json      # 記事一覧 (GitHub Actions が書く)

scripts/
  fetch.mjs          # Node.js 記事取得スクリプト

.github/workflows/
  fetch.yml          # cron + workflow_dispatch で記事取得
  deploy.yml         # master push で wrangler deploy
```

## 開発

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Workers + SPA ビルド
npx wrangler dev     # Workers local emulation
```

## デプロイフロー

1. `master` に push → `deploy.yml` が `npm run build && wrangler deploy`
2. cron (30分) → `fetch.yml` が記事取得 → JSON 更新 → push → deploy

## 必要なシークレット

| 場所 | キー | 設定方法 |
|---|---|---|
| Cloudflare Workers | `GITHUB_TOKEN` | `npx wrangler secret put GITHUB_TOKEN` |
| GitHub Secrets | `CLOUDFLARE_API_TOKEN` | リポジトリ設定 |
| GitHub Secrets | `CLOUDFLARE_ACCOUNT_ID` | リポジトリ設定 |

## 規約ドキュメント

- `.claude/rules/design-system.md` — カラーパレット・タイポグラフィ・レイアウト
- `.claude/rules/coding-conventions.md` — TypeScript・React・Hono パターン
- `.claude/rules/architecture.md` — データフロー・Workers 構造
