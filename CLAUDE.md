# RSS Reader — Claude Code ガイド

Next.js 16 + Cloudflare Workers (@opennextjs/cloudflare) の RSS リーダー (SaaS)。`rss.0g0.xyz` でホスト中。

## ライセンス

- **このプロジェクト**: MIT License (Copyright 2024-2026 g-kari)
- **デザイン参考**: [Readeck](https://codeberg.org/readeck/readeck) (AGPL v3.0) — コード流用なし。設計・UXのみ参考
- **主要依存**: MIT / Apache-2.0 / BSD-3-Clause / ISC (詳細は README.md 参照)
- **新規依存追加時**: `npm info <pkg> license` でライセンス確認し README.md のライセンス表に追記すること

## ツール

このプロジェクトでは **Serena** (MCP サーバー) を**必ず優先的に使用する**。

| 操作                   | 使うツール                 |
| ---------------------- | -------------------------- |
| シンボルの検索         | `find_symbol`              |
| シンボルの編集         | `replace_symbol_body`      |
| ファイル構造の把握     | `get_symbols_overview`     |
| 参照関係の確認         | `find_referencing_symbols` |
| ファイル全体の読み取り | `read_file`（Serena 経由） |
| パターン検索           | `search_for_pattern`       |

**ルール**:

- Read / Grep / Glob ツールよりも Serena のシンボルツールを優先する
- ファイル全体を読む前に `get_symbols_overview` で構造を把握してから必要なシンボルだけ読む
- 編集は `replace_symbol_body` / `insert_after_symbol` を使い、必要最小限の変更にとどめる

### URL が貼られた場合

チャットに URL (http:// / https://) が貼られたときは **Cloudflare Markdown MCP** (`mcp__cloudflare__markdown_from_url`) を使って Markdown に変換する。
ツールが利用できない場合は `WebFetch` でフォールバックする。

## スタック

| レイヤー       | 技術                                                             |
| -------------- | ---------------------------------------------------------------- |
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare                   |
| フロントエンド | React 19 + TypeScript + Tailwind v4 (`'use client'`)             |
| API            | Next.js Route Handlers (`app/api/**`)                            |
| 認証           | 0g0 ID (OAuth2 + ES256 JWT)                                      |
| データ         | R2 (`rss-reader-data`) — 共有フィードデータ + ユーザー別 JSON    |
| AI             | Workers AI (要約・翻訳)                                          |
| デプロイ       | Cloudflare Workers の CI/CD (master push → 自動ビルド＆デプロイ) |

## キャッシュ方針（重要）

**元サイト側のリソースは一度だけ取得する。** 外部 URL へのフェッチは必ずキャッシュし、次回以降はキャッシュから返す。

### キャッシュ層の使い分け

| 対象         | キャッシュ層                         | TTL  | 実装場所                        |
| ------------ | ------------------------------------ | ---- | ------------------------------- |
| 記事全文     | **Cloudflare Cache API**             | 7日  | `app/api/content/route.ts`      |
| OGP 画像 URL | **Cloudflare Cache API**             | 30日 | `app/api/ogp/route.ts`          |
| AI 要約      | **R2** (`ai-cache/summary/{sha256}`) | 永続 | `app/api/ai/summarize/route.ts` |

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
  headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${TTL_SEC}` },
});
ctx.waitUntil(cfCache.put(cacheKey, cacheRes));
```

### 新しい外部フェッチを追加する場合

外部 URL にリクエストする新しいエンドポイントは、必ずこのパターンで Cloudflare Cache API キャッシュを実装すること。R2 を使わないこと。

## デプロイ

**本番デプロイは Cloudflare Workers の CI/CD が担う。**
`master` ブランチに push すると Cloudflare Workers 側で自動的にビルド＆デプロイが実行される。
GitHub Actions (`deploy.yml`) は存在しない。`npm run deploy` をローカルで手動実行する必要もない。

## 開発コマンド

```bash
# 開発サーバー
npm run dev          # Next.js dev server (localhost:3000)
npm run preview      # Workers ローカルエミュレーション (wrangler dev)

# ビルド
npm run build        # next build（動作確認・型チェック込み）
npm run build:cf     # Cloudflare Workers 向けビルド（CI/CD が自動実行するため手動不要）

# 品質チェック（コミット前に必ず実行）
npm run check        # vp check — Oxlint + Oxfmt + tsgo 型チェック
npm run check:fix    # vp check --fix — 自動修正
npm run typecheck    # tsc --noEmit — Next.js plugin 込みの完全な型チェック

# E2E テスト
npm run test:e2e     # Playwright 全テスト実行
npm run test:e2e:ui  # Playwright UI モード（デバッグ用）
```

## @opennextjs/cloudflare 制約事項（必読）

### `export const runtime = 'edge'` は使用禁止

Route Handler に `export const runtime = 'edge'` を書いてはいけない。
`@opennextjs/cloudflare` は Edge Runtime 非対応（公式ドキュメント Get Started Step 9 参照）。
書いた場合、デプロイ後に `TypeError: Cannot read properties of undefined (reading 'default')` が発生する。

新しい Route Handler を作成する際も絶対に書かないこと。

### Next.js バージョンは `~16.2.3` 以降を使用

`@opennextjs/cloudflare` 1.19.0 で Next.js 16.2.3+ サポートが追加された（`peerDependencies: next: >=16.2.3`）。
`~16.1.7` 以下への固定制約は解消済み。現在は `~16.2.3` に固定している（CVE DoS 修正を含む最初の安定版）。

バージョンを上げる場合は必ず本番デプロイ後にエラーログを確認すること。
