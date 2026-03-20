# アーキテクチャ

## 全体像

```
ブラウザ
  └─ React SPA ('use client' コンポーネント)
       └─ Next.js App Router (app/)
            ├─ /api/auth/*    — 認証フロー (0g0 ID OAuth2)
            ├─ /api/feeds/*   — フィード CRUD (R2)
            ├─ /api/articles  — 記事一覧 (R2)
            ├─ /api/ai/*      — Workers AI (要約・翻訳)
            └─ /api/content   — フルテキスト取得プロキシ

Cloudflare Workers (@opennextjs/cloudflare)
  ├─ .open-next/worker.js   → Next.js Route Handlers / SSR
  └─ .open-next/assets/     → 静的アセット (Cloudflare Assets)

Cloudflare Bindings
  ├─ RSS_DATA (R2)  — users/{sub}/feeds.json, articles.json
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
    articles/route.ts        # GET /api/articles
    ai/
      summarize/route.ts     # POST /api/ai/summarize (Workers AI)
      translate/route.ts     # POST /api/ai/translate (Workers AI)
    content/route.ts         # GET /api/content?url=... (フルテキストプロキシ)
    health/route.ts          # GET /api/health

src/
  App.tsx                    # 3ペインレイアウト + 認証状態管理 ('use client')
  types.ts                   # Feed / Article / UserProfile / AuthSession 型
  cloudflare-env.d.ts        # CloudflareEnv 拡張 (RSS_DATA, AI)
  components/
    FeedSidebar.tsx
    ArticleList.tsx
    ArticleView.tsx
  hooks/
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # /api/feeds + /api/articles fetch
    useKeyboardNav.ts        # j/k/o/b/m キーボードナビ
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # requireSession() / applyRefreshedTokens() / isBetaAllowed()
    r2.ts                    # R2 read/write ヘルパー
    xml-parser.ts            # fast-xml-parser ラッパー (RSS 2.0 + Atom)
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
5. `guid` でdeduplication、max 2000件、`publishedAt` 降順
6. `users/{sub}/articles.json` を更新

### 読み取り状態

- サーバーサイド管理なし
- `localStorage['rss-read']` に既読 article ID の JSON 配列
- `App.tsx` 起動時にロード → `readIds: Set<string>` として state 管理
- 記事クリック時に `markRead(id)` → state 更新 + localStorage 保存
- 未読カウントはクライアントサイドで計算

## Cloudflare バインディングへのアクセス

Route Handlers および cron 内で `getCloudflareContext()` を使う:

```typescript
import { getCloudflareContext } from '@opennextjs/cloudflare';

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
- `.open-next/worker.js`  → Workers スクリプト (wrangler.toml の main)
- `.open-next/assets/`    → 静的アセット (Cloudflare Assets)
