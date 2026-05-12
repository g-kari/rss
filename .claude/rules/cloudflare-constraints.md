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

## `initOpenNextCloudflareForDev` の `remoteBindings` で wrangler 認証要求を制御する

`next.config.ts` の `initOpenNextCloudflareForDev()` は内部で wrangler の `getPlatformProxy()` を呼び、その option `remoteBindings` が **default `true`** で本番 R2 / AI / KV へのリモート接続認証 (`wrangler login`) を要求する。`wrangler login` が切れた環境では `Failed to fetch auth token: 400 Bad Request` で `next dev` 起動失敗 → playwright e2e の web server 起動も連鎖失敗する。

```typescript
// アンチパターン (default): wrangler login 必須
initOpenNextCloudflareForDev();
// → next dev 起動時に wrangler remote dev session 認証要求 → login 切れで 400 Bad Request

// 修正パターン: ローカル miniflare のみで動作
initOpenNextCloudflareForDev({ remoteBindings: false });
// → wrangler login 不要、KV / R2 / DO は miniflare local mock を使う
//   AI binding は依然 remote (warning 表示、charges 発生注意)
```

**判定軸**:

- **dev で本番 R2 / KV を確認したい** → `remoteBindings: true` (default)、`wrangler login` 必須
- **dev で本番 binding を汚さず作業したい (= 大部分のケース)** → `remoteBindings: false`、login 不要
- **CI / playwright e2e** → `remoteBindings: false` 推奨 (認証 secret 不要、build 安定)

**How to apply**: `initOpenNextCloudflareForDev()` を見直すタイミング:

1. **pre-commit hook の playwright e2e が wrangler 認証で fail** したら、`remoteBindings: false` を試す
2. **dev で getCloudflareContext().env を使う Route Handler** をテストするとき、ローカル miniflare で十分なら `false`
3. **本番 R2 データを dev で直接見たい** ときだけ `true` に戻して `wrangler login` 実行

主な使用箇所: `next.config.ts` — `initOpenNextCloudflareForDev({ remoteBindings: false })` で wrangler login 不要 + playwright e2e の web server 安定起動 (#674 Phase 2b 配線時に判明)

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

### 派生ケース: Emscripten 生成 wasm ラッパーは `require("fs")` / `require("path")` で Turbopack build fail する

`@mintplex-labs/piper-tts-web` の内部 chunk `piper-XXXX.js` のような **Emscripten で wasm から生成された JS wrapper** は、Node.js 実行環境向け fallback として `require("fs")` / `require("path")` を含む (`ENVIRONMENT_IS_NODE` 分岐内)。これは browser runtime では `false` になって dead code 化されるが、**ビルド時には Turbopack が解決を試みて `Module not found: Can't resolve 'fs'`** を出す。`transpilePackages` だけでは解決しない (transpile してもコード自体は残る)。

```typescript
// Emscripten 生成 chunk の典型 pattern:
var read_, readAsync, readBinary;
if (ENVIRONMENT_IS_NODE) {
  var fs = require("fs"); // ← Turbopack build で「fs not found」を出す
  var nodePath = require("path");
  // ...
}
// browser runtime では ENVIRONMENT_IS_NODE === false で dead code、
// しかし build 時の static 解析では解決が試みられる
```

**対処オプション**:

| 案  | 内容                                                                                               | 適用範囲                                 |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| A   | `next.config.ts` の **`webpack` callback で `resolve.fallback`** に `fs: false / path: false` 設定 | webpack mode の Next.js                  |
| B   | **`next/dynamic({ ssr: false })`** で library 使用コンポーネントを完全 client 隔離                 | Turbopack mode (現状 Next.js 16 default) |
| C   | **library 使用部分を一時撤去** + 別 Issue で対応 (短期)                                            | scope を一時縮小したいケース             |

Next.js 16 default の Turbopack mode では **option A は効かない** ことがある (webpack callback が Turbopack に伝わらない)。option B が最も汎用。

**How to apply**: Emscripten / wasm ラッパーを含む npm パッケージを統合するとき (transpilePackages だけでは Node.js fallback の require が残る、SSR を skip して client-only bundle に隔離するのが最も汎用):

1. **build / dev で `Can't resolve 'fs'` / `'path'` / `'crypto'` 等が出る** か確認
2. 出たら **option B (`next/dynamic({ ssr: false })`)** で library を呼ぶコンポーネントを wrap:
   ```typescript
   const PiperHost = dynamic(() => import("./PiperHost"), { ssr: false });
   ```
3. PiperHost 内で `usePiperTts` 等を直接呼ぶ — server bundle には含まれず client のみで解決
4. 親コンポーネント (App.tsx 等) は PiperHost を JSX で render するだけ、hook 直呼びは避ける
5. **adapter pattern と組合せ**: PiperHost が `useTtsAdapter()` Context の value を提供する別 Provider tree を構築すれば、既存 consumer は変更不要

主な使用箇所: `#674` Phase 2b で `@mintplex-labs/piper-tts-web` の `piper-XXXX.js` chunk が `require("fs")` を含み Turbopack で Module not found → Phase 2c で `next/dynamic({ssr:false})` 隔離予定
