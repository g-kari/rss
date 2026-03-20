# RSS Reader — Cloudflare Workers

Cloudflare Workers + D1 で動くセルフホスト RSS リーダー。

## 技術スタック

- **バックエンド**: Hono.js on Cloudflare Workers
- **DB**: Cloudflare D1 (SQLite)
- **フロントエンド**: React + TypeScript + Tailwind CSS v4
- **自動更新**: Cloudflare Workers Cron Trigger（30分ごと）

## セットアップ

### 1. D1 データベース作成

```bash
npx wrangler d1 create rss-reader-db
```

出力された `database_id` を `wrangler.toml` に記入:

```toml
[[d1_databases]]
database_id = "ここに貼り付け"
```

### 2. マイグレーション適用

```bash
# ローカル開発用
npx wrangler d1 migrations apply rss-reader-db --local

# 本番用
npx wrangler d1 migrations apply rss-reader-db
```

### 3. 依存パッケージインストール

```bash
npm install
```

### 4. ローカル開発

```bash
npm run dev
```

→ http://localhost:5173 でアクセス

### 5. デプロイ

```bash
npm run deploy
```

## API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/feeds` | フィード一覧（未読数付き） |
| POST | `/api/feeds` | フィード追加 `{ url: string }` |
| DELETE | `/api/feeds/:id` | フィード削除 |
| POST | `/api/feeds/:id/refresh` | 手動更新 |
| GET | `/api/articles` | 記事一覧（`?feedId=&page=1&limit=30&unreadOnly=true`） |
| PATCH | `/api/articles/:id/read` | 既読にする |
| PATCH | `/api/articles/:id/unread` | 未読に戻す |
