# RSS Reader — Claude Code ガイド

Next.js 16 + Cloudflare Workers (@opennextjs/cloudflare) の RSS リーダー (SaaS)。`rss.0g0.xyz` でホスト中。

## ツール

このプロジェクトでは **Serena** (MCP サーバー) を優先的に使用する。

- シンボルレベルの検索・編集には `find_symbol` / `replace_symbol_body` を使う
- ファイル全体の読み書きより、必要なシンボルだけを読んで効率よく作業する
- `get_symbols_overview` でファイルの構造を把握してから詳細を読む

### URL が貼られた場合

チャットに URL (http:// / https://) が貼られたときは **Cloudflare Markdown MCP** (`mcp__cloudflare__markdown_from_url`) を使って Markdown に変換する。
ツールが利用できない場合は `WebFetch` でフォールバックする。

## スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare |
| フロントエンド | React 19 + TypeScript + Tailwind v4 (`'use client'`) |
| API | Next.js Route Handlers (`app/api/**`) |
| 認証 | 0g0 ID (OAuth2 + ES256 JWT) |
| データ | R2 (`rss-reader-data`) — ユーザー別 JSON |
| AI | Workers AI (要約・翻訳) |
| デプロイ | Cloudflare Workers の CI/CD (master push → 自動ビルド＆デプロイ) |

## ディレクトリ

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
    FeedSidebar.tsx          # サイドバー 200px (フィード管理 + ユーザー情報)
    ArticleList.tsx          # 記事一覧 360px
    ArticleView.tsx          # 記事本文 1fr
  hooks/
    useAuth.ts               # /api/auth/me fetch → user / betaRestricted
    useFeeds.ts              # /api/feeds + /api/articles fetch (5分ポーリング)
    useKeyboardNav.ts        # j/k/o/b/m キーボードナビ
  lib/
    auth.ts                  # JWT 検証 (JWKS)、トークン交換・リフレッシュ・失効
    server-auth.ts           # requireSession() / applyRefreshedTokens() / isBetaAllowed()
    r2.ts                    # R2 read/write ヘルパー
    xml-parser.ts            # fast-xml-parser ラッパー (RSS 2.0 + Atom)
    content.ts               # 全文取得後処理パイプライン (コンテンツ抽出・画像処理・サニタイズ)
  cron/
    fetch.ts                 # fetchArticles(userId, env) / fetchAllUsers(env) — RSS 取得
```

## キャッシュ方針（重要）

**元サイト側のリソースは一度だけ取得する。** 外部 URL へのフェッチは必ずキャッシュし、次回以降はキャッシュから返す。

### キャッシュ層の使い分け

| 対象 | キャッシュ層 | TTL | 実装場所 |
|---|---|---|---|
| 記事全文 | **Cloudflare Cache API** | 7日 | `app/api/content/route.ts` |
| OGP 画像 URL | **Cloudflare Cache API** | 30日 | `app/api/ogp/route.ts` |
| AI 要約 | **R2** (`ai-cache/summary/{sha256}`) | 永続 | `app/api/ai/summarize/route.ts` |
| AI 翻訳 | **R2** (`ai-cache/translation/{sha256}`) | 永続 | `app/api/ai/translate/route.ts` |

**R2 は使わない** — 揮発性のキャッシュには Cloudflare Cache API (`caches.default`) を使う。R2 は永続データ（ユーザーデータ・AI 結果）専用。

### Cloudflare Cache API パターン（記事全文・OGP 等）

キャッシュキーは認証情報を含まない合成 URL。`/__cache/` プレフィックスで名前空間を分離する。

```typescript
const { ctx } = await getCloudflareContext({ async: true });
const reqUrl = new URL(request.url);
const cacheKey = new Request(`${reqUrl.origin}/__cache/content/${await sha256Hex(url)}`);
const cfCache = caches.default;

// ① キャッシュ確認
const cached = await cfCache.match(cacheKey);
if (cached) return NextResponse.json(await cached.json());

// ② 外部フェッチ（キャッシュミス時のみ）
const content = await fetchFromOrigin(url);

// ③ キャッシュ保存（fire-and-forget）
const cacheRes = new Response(JSON.stringify({ content }), {
  headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${TTL_SEC}` },
});
ctx.waitUntil(cfCache.put(cacheKey, cacheRes));
```

### 新しい外部フェッチを追加する場合

外部 URL にリクエストする新しいエンドポイントは、必ずこのパターンで Cloudflare Cache API キャッシュを実装すること。R2 を使わないこと。

## R2 データ構造

```
users/{sub}/profile.json       # UserProfile (ログイン時に保存)
users/{sub}/feeds.json         # Feed[]
users/{sub}/articles.json      # Article[] (max 2000, publishedAt 降順)
ai-cache/summary/{sha256}      # AI 要約キャッシュ (永続)
ai-cache/translation/{sha256}  # AI 翻訳キャッシュ (永続)
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

## デプロイ

**本番デプロイは Cloudflare Workers の CI/CD が担う。**
`master` ブランチに push すると Cloudflare Workers 側で自動的にビルド＆デプロイが実行される。
GitHub Actions (`deploy.yml`) は存在しない。`npm run deploy` をローカルで手動実行する必要もない。

## 開発

```bash
npm run dev          # Next.js dev server (localhost:3000)
npm run build        # next build
npx wrangler dev     # Workers local emulation (@opennextjs/cloudflare)
npm run typecheck    # TypeScript 型チェック
```

## 修正後の必須テスト手順

**バグ修正・ロジック変更を行った場合は、コミット前に必ず動作を検証すること。**

### ロジック単体テスト（node スクリプト）

サーバー不要で検証できる関数（正規表現・パーサー・ユーティリティ等）は `node -e` でインラインスクリプトを書いて動作確認する。

```bash
# 例: 正規表現の修正前後を比較
node -e "
const html = '<article><p>段落1</p><article>inner</article><p>段落2</p></article>';
const result = html.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
console.log(result?.[1]);
console.log('段落2が含まれるか:', result?.[1].includes('段落2'));
"
```

### 確認観点

- 修正した条件分岐・正規表現が期待通りに動作するか
- 修正前に再現する入力で、修正後は正しく動作するか（before/after 比較）
- エッジケース（空文字・ネスト・複数要素）で意図しない挙動がないか

### typecheck は常に実行

```bash
npm run typecheck
```

### E2E テスト

バグ修正・新機能追加後は Playwright E2E テストも実行する。

```bash
npm run test:e2e                        # 全テスト実行
npx playwright test e2e/xxx.spec.ts     # 特定ファイルのみ
npm run test:e2e:ui                     # UI モードでデバッグ
```

| ファイル | 対象 |
|---|---|
| `e2e/landing.spec.ts` | 未ログイン時のランディングページ |
| `e2e/api-health.spec.ts` | API エンドポイントの基本動作・認証ガード |
| `e2e/content-extraction.spec.ts` | 全文取得 `extractMainContent` の回帰テスト |

新しいバグ修正を行った場合は、そのバグを再現するテストケースを `e2e/` に追加してから修正すること。

## 記事本文の画像処理（注意事項）

記事本文の画像処理は `src/lib/content.ts` の `postProcess` パイプラインで行う。

### 処理パイプライン（適用順）

```
removeNoise            → EC ギャラリー / Qiita・Zenn UI のノイズ除去
transformZennLinkEmbeds   → embed.zenn.studio の card/tweet iframe を外部リンクに変換
transformZennMermaidEmbeds → zenn.dev の mermaid を <pre><code> に変換
fixLazyImages          → data-src → src 解決、Shopify _NNNx → _800x 高解像度化
fixImageDimensions     → 相対パス絶対URL化 / loading="lazy" 追加
rewriteImageUrls       → 画像 URL を /api/image-proxy 経由に書き換え
wrapTables             → <table> を overflow-x:auto でラップ
sanitizeHtml           → XSS 対策（<script>/<style>/<link>/イベントハンドラ除去）
```

### ルール

- **`fixImageDimensions` に `pageUrl` を必ず渡す** — 相対パスを絶対URL化するために必要
- **`sanitizeHtml` は必ずパイプラインの最後に実行** — 途中で実行すると後の処理が無効化される
- **新しい後処理を追加する場合は `sanitizeHtml` の前に挿入する**
- **`loading="lazy"` は `fixImageDimensions` で自動付与** — 個別に追加しない
- **`onerror` ハンドラは付与しない** — `sanitizeHtml` でイベントハンドラが除去されるため不要。壊れた画像は `/api/image-proxy` が透明 GIF を返すことで対処する

### CSS（`app/globals.css`）

`.article-content img` に `background-color: var(--color-surface-subtle)` でスケルトン表示。
読み込み完了後は `:not([src=""])` セレクタで背景を消す。

## 必要なシークレット

| キー | 設定方法 |
|---|---|
| `CLIENT_ID` | `npx wrangler secret put CLIENT_ID` |
| `CLIENT_SECRET` | `npx wrangler secret put CLIENT_SECRET` |

## @opennextjs/cloudflare 制約事項（必読）

### `export const runtime = 'edge'` は使用禁止

Route Handler に `export const runtime = 'edge'` を書いてはいけない。
`@opennextjs/cloudflare` は Edge Runtime 非対応（公式ドキュメント Get Started Step 9 参照）。
書いた場合、デプロイ後に `TypeError: Cannot read properties of undefined (reading 'default')` が発生する。

新しい Route Handler を作成する際も絶対に書かないこと。

### Next.js バージョンは `~16.1.7` に固定

Next.js 16.2.0 以降で追加された `prefetch-hints.json` / `subresource-integrity-manifest.json` は
`@opennextjs/cloudflare` のビルド時グロブ外のため、実行時に `Unexpected loadManifest` エラーが発生する。
`@opennextjs/cloudflare` 側で修正されるまで `~16.1.7` に固定する。

バージョンを上げる場合は必ず本番デプロイ後にエラーログを確認すること。

## 規約ドキュメント

- `.claude/rules/design-system.md` — カラーパレット・タイポグラフィ・レイアウト
- `.claude/rules/coding-conventions.md` — TypeScript・React・Next.js パターン
- `.claude/rules/architecture.md` — データフロー・Workers 構造
