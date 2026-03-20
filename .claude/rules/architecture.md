# アーキテクチャ

## 全体像

```
ブラウザ
  └─ React SPA (Cloudflare Assets として配信)
       ├─ /data/feeds.json    ← GitHub Actions が管理
       ├─ /data/articles.json ← GitHub Actions が管理
       └─ /api/feeds          ← Cloudflare Workers (Hono)
                                   └─ GitHub Contents API でfeeds.json 更新
                                        └─ workflow_dispatch で fetch.yml トリガー

GitHub Actions
  ├─ fetch.yml (cron 30分 + workflow_dispatch)
  │     node scripts/fetch.mjs
  │       └─ feeds.json 読む → RSS fetch → articles.json 更新 → git push
  └─ deploy.yml (master push)
        npm run build → wrangler deploy → Cloudflare Workers
```

## データフロー

### フィード追加

1. ユーザーが FeedSidebar に URL 入力
2. `POST /api/feeds` → Worker が GitHub Contents API で `public/data/feeds.json` を更新
3. Worker が `workflow_dispatch` で `fetch.yml` をトリガー
4. GitHub Actions が RSS 取得 → `articles.json` 更新 → push
5. push が `deploy.yml` をトリガー → 新しい記事が配信される

### 記事取得 (cron)

1. `fetch.yml` が30分毎に起動
2. `scripts/fetch.mjs` が `feeds.json` を読んで全フィードを fetch
3. `fast-xml-parser` で RSS 2.0 / Atom をパース
4. `guid` でデduplication、max 2000件、publishedAt 降順
5. `articles.json` が変化した場合のみ commit & push
6. push → `deploy.yml` → wrangler deploy

### 読み取り状態

- サーバーサイド管理なし
- `localStorage['rss-read']` に既読 article ID の JSON 配列
- `App.tsx` が起動時にロード → `readIds: Set<string>` として state 管理
- 記事クリック時に `markRead(id)` → state 更新 + localStorage 保存
- 未読カウントはクライアントサイドで計算

## Workers 構造

```
src/worker.ts
  └─ Hono<{ Bindings: Env }>
       ├─ CORS: /api/*
       ├─ /api/feeds  → src/routes/feeds.ts
       │    ├─ GET    → 404 (feeds は static JSON から取得)
       │    ├─ POST   → feeds.json に追加 + workflow_dispatch
       │    └─ DELETE → feeds.json から削除
       └─ /api/health → { ok: true, timestamp }
```

静的ファイル (`public/`) は `@cloudflare/vite-plugin` が Cloudflare Assets として配信。
Workers は `/api/*` のみ処理。

## 環境変数・シークレット

### Cloudflare Workers シークレット

```bash
npx wrangler secret put GITHUB_TOKEN
```

- GitHub PAT (Contents API 読み書き + workflow dispatch 権限)

### wrangler.toml vars (公開情報)

```toml
[vars]
GITHUB_OWNER = "g-kari"
GITHUB_REPO = "rss"
GITHUB_BRANCH = "master"
```

### GitHub Actions シークレット

- `CLOUDFLARE_API_TOKEN` — wrangler deploy 用
- `CLOUDFLARE_ACCOUNT_ID` — wrangler deploy 用

## 将来: R2 移行

R2 バケット `rss-reader-data` は作成済み。Git コミット数が問題になったら移行検討。

移行時の変更点:
1. `wrangler.toml` に `[[r2_buckets]]` 追加
2. `src/types.ts` の `Env` に `RSS_DATA: R2Bucket` 追加
3. `src/routes/feeds.ts` の GitHub Contents API → R2 API
4. `scripts/fetch.mjs` を GitHub Actions → Workers Cron Trigger に変更
5. `deploy.yml` の push トリガーは不要になる

## ビルド

```bash
npm run build
# = vite build
# @cloudflare/vite-plugin が Workers + SPA を dist/ にまとめる
# dist/index.js   → Workers スクリプト
# dist/_worker.js → Workers エントリー
# dist/assets/    → 静的ファイル (Cloudflare Assets)
```

`package.json` に `"type": "module"` が必須 (`@cloudflare/vite-plugin` は ESM only)。
