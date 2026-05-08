---
description: @opennextjs/cloudflare 制約事項 — Route Handler・next.config・package.json 編集時に参照
paths: "app/api/**/route.ts,next.config.*,package.json"
---

# @opennextjs/cloudflare 制約事項

## `export const runtime = 'edge'` は使用禁止

Route Handler に `export const runtime = 'edge'` を書いてはいけない。
`@opennextjs/cloudflare` は Edge Runtime 非対応（公式ドキュメント Get Started Step 9 参照）。
書いた場合、デプロイ後に `TypeError: Cannot read properties of undefined (reading 'default')` が発生する。

新しい Route Handler を作成する際も絶対に書かないこと。

## Next.js バージョンは `~16.2.3` 以降を使用

`@opennextjs/cloudflare` 1.19.0 で Next.js 16.2.3+ サポートが追加された（`peerDependencies: next: >=16.2.3`）。
`~16.1.7` 以下への固定制約は解消済み。現在は `~16.2.3` に固定している（CVE DoS 修正を含む最初の安定版）。

バージョンを上げる場合は必ず本番デプロイ後にエラーログを確認すること。

## dev サーバーで `globalThis.caches` は未定義

`next dev` 環境では Cloudflare の Cache API (`caches.default`) は mock されず、参照すると
`ReferenceError: caches is not defined` が発生する。Cache API を使う Route Handler は dev で 500 を返す。

**影響を受ける route**: `/api/feeds`, `/api/content`, `/api/ogp` ほか `cache-helper.ts` を経由するルート。

**e2e テストでの回避策**:

- これらのルートを e2e から直接呼ばない（API 経由の確認は本番デプロイ後の smoke test に任せる）
- 確認したい状態は **R2 を直接読む** か、**UI 経由で表示確認** する（UI レイヤーは Cache API 失敗時のフォールバックで動く設計）
- どうしても dev で API レスポンスを検証したい場合は、`buildCacheKey` をスタブする global mock を導入する（未実装。必要なら別 Issue 化）

新しい外部フェッチを追加する際は、e2e カバレッジ手段（UI 経由 or R2 直接読み）を実装と同時に検討すること。
