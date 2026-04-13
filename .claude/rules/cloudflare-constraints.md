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
