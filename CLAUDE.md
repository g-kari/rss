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

## デプロイ

**本番デプロイは Cloudflare Workers の CI/CD が担う。**
`master` ブランチに push すると Cloudflare Workers 側で自動的にビルド＆デプロイが実行される。
GitHub Actions (`deploy.yml`) は存在しない。`npm run deploy` をローカルで手動実行する必要もない。

**禁止**: Route Handler に `export const runtime = 'edge'` を書かないこと（`@opennextjs/cloudflare` は Edge Runtime 非対応）。

## Issue / PR の起票主体マーカー

AI が起票・コメントする GitHub Issue / PR は、起票主体を一目で識別できるバナー（`> 🤖 AI 起票 (Claude Code)` / `> 🤖 AI 投稿 (Claude Code)`）を **必ず** 付ける。詳細は `issue-handler` skill の規定に従うこと。

## Issue / PR 作業時のプロジェクト固有ルール

`gh issue` (`view` / `close` / `comment` / `list`) を扱うとき、または Issue / PR の本文・コメントを作成するときは、本プロジェクト固有の処理前チェックリスト・設計方針コメントテンプレート・タイトルのみ Issue 対応・自動クローズ後コメント運用・最小スコープ判断軸・自走採用条件などの retrospective 派生ケースが集約された **`issue-handling` skill を必ず invoke** してから作業すること。
