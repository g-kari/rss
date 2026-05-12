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

## wasm / 内部 chunk import を持つブラウザ専用ライブラリは `transpilePackages` に追加する

`@mintplex-labs/piper-tts-web` (onnxruntime-web peer-dep) のように **dist/ 配下に複数の内部 chunk file** (`piper-XXXX.js` 等) を持ち、それらを **dynamic import で chunk 分割 load** するブラウザ専用ライブラリは、Next.js Turbopack の dev/build で **内部 chunk 解決失敗** (`Module not found`) を起こすケースがある。`transpilePackages` に追加することで Next.js transformer を通し、chunk 解決の path resolution を補正できる。

```typescript
// アンチパターン: dynamic import だけ + transpilePackages 未設定
// next.config.ts
const nextConfig: NextConfig = {
  /* 既存設定 */
};

// hook 内:
const piperLib = await import("@mintplex-labs/piper-tts-web");
// → Turbopack dev/build で内部 chunk `piper-XXXX.js` が解決できず Module not found
//   playwright e2e の web server 起動失敗 → pre-commit hook fail

// 修正パターン: transpilePackages に明示追加
const nextConfig: NextConfig = {
  // ... 既存設定
  transpilePackages: ["@mintplex-labs/piper-tts-web", "onnxruntime-web"],
};
```

**How to apply**: 以下のいずれかに該当する npm パッケージを追加するときは `transpilePackages` への追加を検討:

1. **wasm ランタイム** を含む (onnxruntime-web / pyodide / sql.js 等)
2. **dist/ 配下に複数の chunk file** を持つ (`ls node_modules/<lib>/dist/` で確認)
3. **dynamic import を内部で行う** (lazy loading / code splitting)
4. **`type: "module"` ESM only** (Webpack/Turbopack の CommonJS interop 経由しない)

実装手順:

1. `pnpm add` 後、test 環境 (`vi.mock` 経由) で unit test pass を確認
2. **`pnpm run dev` / `next build`** で Module not found が出ないか確認
3. 出るなら `next.config.ts` の `transpilePackages` に追加
4. **peer dep も併せて追加**: `@mintplex-labs/piper-tts-web` なら `onnxruntime-web` も必須
5. 再度 build / dev で確認

**反例 (transpilePackages 不要なケース)**:

- 単一 .js ファイルだけのライブラリ (chunk なし) — そのまま動く
- CommonJS で書かれた古いライブラリ — Turbopack の CJS interop で動く
- type 定義のみのパッケージ (`@types/*`) — runtime 影響なし

主な使用箇所: `next.config.ts` — `@mintplex-labs/piper-tts-web` + `onnxruntime-web` (#674 Phase 2b、Piper wasm engine 配線時に判明)
