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

チャットに URL (http:// / https://) が貼られたときは **Cloudflare Markdown MCP** (`mcp__cloudflare-markdown__convert_url_to_markdown`) を使って Markdown に変換する。
ツールが利用できない場合は `WebFetch` でフォールバックする。

## スタック

| レイヤー       | 技術                                                                                               |
| -------------- | -------------------------------------------------------------------------------------------------- |
| フレームワーク | Next.js 16 App Router + @opennextjs/cloudflare                                                     |
| フロントエンド | React 19 + TypeScript + Tailwind v4 (`'use client'`)                                               |
| API            | Next.js Route Handlers (`app/api/**`)                                                              |
| 認証           | 0g0 ID (OAuth2 + ES256 JWT)                                                                        |
| データ         | R2 (`rss-reader-data`) + KV (`RATE_LIMIT`) — 共有フィードデータ + ユーザー別 JSON + レートリミット |
| AI             | Workers AI (要約・翻訳・フィード推薦)                                                              |
| 自動更新       | Cloudflare Cron Trigger (30 分ごと)                                                                |
| デプロイ       | Cloudflare Workers の CI/CD (master push → 自動ビルド＆デプロイ)                                   |

## デプロイ

**本番デプロイは Cloudflare Workers の CI/CD が担う。**
`master` ブランチに push すると Cloudflare Workers 側で自動的にビルド＆デプロイが実行される。
GitHub Actions (`deploy.yml`) は存在しない。`npm run deploy` をローカルで手動実行する必要もない。

GitHub Actions では **`ci.yml`** (master push / PR で `pnpm check` + `pnpm typecheck`) と **`dependabot-auto-merge.yml`** (patch / minor 自動マージ、major は手動レビュー) が実行される。詳細は `.claude/rules/architecture.md § GitHub Workflows` 参照。

**禁止**: Route Handler に `export const runtime = 'edge'` を書かないこと（`@opennextjs/cloudflare` は Edge Runtime 非対応）。

## Issue / PR の起票主体マーカー

AI が起票・コメントする GitHub Issue / PR は、起票主体を一目で識別できるバナー（`> 🤖 AI 起票 (Claude Code)` / `> 🤖 AI 投稿 (Claude Code)`）を **必ず** 付ける。詳細は `issue-handler` skill の規定に従うこと。

## Issue / PR 作業時のプロジェクト固有ルール

`gh issue` (`view` / `close` / `comment` / `list`) を扱うとき、または Issue / PR の本文・コメントを作成するときは、本プロジェクト固有の処理前チェックリスト・設計方針コメントテンプレート・タイトルのみ Issue 対応・自動クローズ後コメント運用・最小スコープ判断軸・自走採用条件などの retrospective 派生ケースが集約された **`issue-handling` skill を必ず invoke** してから作業すること。

## Cursor Cloud specific instructions

- 依存関係は `pnpm install --frozen-lockfile`（`packageManager` は pnpm 10.29.3）。ユニットテストの `node:sqlite` は SQLite FTS5 が必要。Node 22.22.2（`/home/ubuntu/.nvm/versions/node/v22.22.2`）を使い、`/usr/local/bin` と `/usr/local/cargo/bin` から参照する。
- 開発サーバーは `APP_BASE_URL=http://localhost:3000` と `DEV_AUTH_BYPASS_USER_ID=dev-local` を付けて `pnpm dev --hostname 0.0.0.0 --port 3000`。`next.config.ts` はローカル miniflare（`remoteBindings: false`）なので wrangler login は不要。バイパスは `NODE_ENV` が production 以外のときだけ有効。
- 確認コマンドは `pnpm check`、`pnpm typecheck`、`pnpm test:unit`、`pnpm build`。
- 未作成の記事ヘッドへの実フィード取得は、R2 の条件付き put が `new Headers` を miniflare の dev proxy に渡して `DevalueError: Cannot stringify arbitrary non-POJOs` になる。購読レコードは残る。記事の投入と一覧表示は開発バイパス中の `POST /api/test/seed` で確認できる。
