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

| 案  | 内容                                                                                               | 適用範囲                                                                          |
| --- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A   | `next.config.ts` の **`webpack` callback で `resolve.fallback`** に `fs: false / path: false` 設定 | webpack mode の Next.js                                                           |
| B   | **`next/dynamic({ ssr: false })`** で library 使用コンポーネントを完全 client 隔離                 | server bundle 除外のみ。**Turbopack の client bundle 静的解析エラーは解決しない** |
| C   | **library 使用部分を一時撤去** + 別 Issue で対応 (短期)                                            | scope を一時縮小したいケース                                                      |
| D   | **`turbopack.resolveAlias` で `{ browser: empty-module }` 条件付き alias** (推奨)                  | Turbopack mode (Next.js 16 default)。option B と併用が canonical                  |

**Next.js 16 default の Turbopack mode では option B 単独では不十分**。`next/dynamic({ ssr: false })` は SSR (server bundle) を skip するだけで、Turbopack は **client bundle 内で `require("fs")` を依然静的解析しようとする** ため build / dev で `Module not found: Can't resolve 'fs'` を吐き続ける。**option D (resolveAlias) を併用** することで、browser bundle 解決時のみ `fs`/`path` を empty module に向けて build を通す (実行時は `ENVIRONMENT_IS_NODE === false` で dead code 化されるので影響なし)。

```typescript
// 自前 empty module (src/lib/empty-module.js):
//   module.exports = {};

// next.config.ts:
const nextConfig: NextConfig = {
  transpilePackages: ["@mintplex-labs/piper-tts-web", "onnxruntime-web"],
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/empty-module.js" },
      path: { browser: "./src/lib/empty-module.js" },
    },
  },
};
```

**How to apply**: Emscripten / wasm ラッパーを含む npm パッケージを統合するとき (option B 単独だと build / dev は依然 fail、option D 併用で client bundle 解決を補正):

1. **build / dev で `Can't resolve 'fs'` / `'path'` / `'crypto'` 等が出る** か確認
2. **option B (`next/dynamic({ ssr: false })`) で library 使用コンポーネントを client 隔離**:
   ```typescript
   const PiperHost = dynamic(() => import("./PiperHost"), { ssr: false });
   ```
   server bundle に library を含めないことで SSR 失敗を防ぐ
3. **option D (`turbopack.resolveAlias`) で `fs` / `path` を browser-only empty module に alias** (`{ browser: <empty-module path> }` 条件付き):
   - 自前 `empty-module.js` を `src/lib/` 等に配置 (`module.exports = {};`)
   - `turbopack.resolveAlias: { fs: { browser: "./src/lib/empty-module.js" }, path: { browser: "..." } }`
4. PiperHost 内で `usePiperTts` 等を直接呼ぶ — server bundle 除外 + client bundle 静的解析回避の 2 段構え
5. **adapter pattern と組合せ**: PiperHost が render prop で `TtsAdapter` を expose する場合、React Rules of Hooks (callback 内 hook 呼出禁止) のため **App.tsx の中身を別コンポーネント (AppShell) に切り出して PiperHost の render prop 内で render** する必要がある

主な使用箇所: `#674` Phase 2c (closes `#753`) で `@mintplex-labs/piper-tts-web` を配線するとき、初回 option B のみで commit → master push → Cloudflare CI/CD build が依然 `Module not found: Can't resolve 'fs'` で fail と判明 → option D (`turbopack.resolveAlias`) を追加 commit で本配線完成。option B 単独が「最も汎用」という旧 codify は本サイクルで訂正済

## Cloudflare Workers の単一 asset 25 MiB 上限に抵触する wasm は R2 セルフホスト + Route Handler 経由で fetch

`onnxruntime-web@1.26.0` の `ort-wasm-simd-threaded.jsep.wasm` (25.02 MiB) のように、**Cloudflare Workers の単一 asset 最大サイズ 25 MiB にちょうど抵触** する大型 wasm を `.open-next/assets/_next/static/media/` 配下に bundle すると、`opennextjs-cloudflare deploy` が `Error: Asset too large` で fail する。Turbopack build / Next.js 互換性が通っても deploy 不能になる別軸の制約。

**対処パターン**: bundle から wasm を除外 + R2 セルフホスト + Route Handler 経由 fetch + library 側 wasm path 設定の 4 点セット。

```typescript
// 1. scripts/remove-bundled-wasm.mjs — build:cf post-step で wasm を削除
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
const MEDIA_DIR = ".open-next/assets/_next/static/media";
for (const f of await readdir(MEDIA_DIR)) {
  if (!f.endsWith(".wasm")) continue;
  const p = join(MEDIA_DIR, f);
  const s = await stat(p);
  await rm(p);
  console.log(`removed ${f} (${(s.size / 1024 / 1024).toFixed(2)} MiB)`);
}

// 2. package.json build:cf に統合:
// "build:cf": "npx @opennextjs/cloudflare build && node scripts/remove-bundled-wasm.mjs && ..."

// 3. app/api/wasm/[file]/route.ts — R2 から fetch して serve
const ALLOWED_FILES: ReadonlySet<string> = new Set([
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  // ... allowlist 厳格化
]);
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!ALLOWED_FILES.has(file)) return apiError("Not Found", 404, { code: "NOT_FOUND" });
  const { env } = await getCloudflareContext({ async: true });
  const obj = await env.RSS_DATA.get(`piper-wasm/${file}`);
  if (!obj) return apiError("Not Found", 404, { code: "NOT_FOUND" });
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/wasm",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// 4. library 側で wasm 解決先を指定 (onnxruntime-web 例)
const ort = await import("onnxruntime-web");
ort.env.wasm.wasmPaths = "/api/wasm/"; // trailing slash 必須
```

**事前 R2 upload (デプロイ前に手動 1 回)**:

```bash
WASM_DIR=node_modules/.pnpm/<lib-pkg>/node_modules/<lib>/dist
for f in <wasm-files>; do
  npx wrangler r2 object put rss-reader-data/<prefix>/$f --file=$WASM_DIR/$f
done
```

**How to apply**: 新規 wasm 依存追加 (onnxruntime-web / pyodide / sql.js 等) の build / deploy fail を見たら (25 MiB 制約は Cloudflare Workers asset の硬性上限で、bundle 内では回避不能 + 別ホスト fetch が唯一の解):

1. **deploy fail log で `Asset too large` 確認** + 該当 wasm ファイルサイズを `ls -lh` で確認
2. **bundle から除外する script を `scripts/remove-bundled-wasm.mjs` で書く** + `package.json` の `build:cf` に統合 (post `@opennextjs/cloudflare build` step)
3. **Route Handler `app/api/<prefix>/[file]/route.ts` を ALLOWED_FILES allowlist で作る** (任意 R2 object 参照を防ぐ + immutable cache)
4. **library 側の wasm path option を確認** (例: `ort.env.wasm.wasmPaths` / `pyodide.indexURL` / `sql.js locateFile`) → `/api/<prefix>/` を指定
5. **R2 へ wasm を事前 upload** (`wrangler r2 object put` を手動 1 回、運用作業として明文化)
6. **CSP 確認**: `/api/<prefix>/` は same-origin なので `script-src` / `connect-src` 緩和不要

**反例 (R2 セルフホストが不要なケース)**:

- wasm サイズが 25 MiB 未満 → bundle 内で OK (= 通常の `_next/static/media/` 配下)
- library が CDN URL を default で参照する (例: pyodide の jsdelivr CDN default) → CSP 緩和で fetch 許可するだけで動く
- 一時的 PoC で deploy しない (`next dev` 開発のみ) → 不要

主な使用箇所: `#674` Phase 2c (closes `#753`) で `onnxruntime-web@1.26.0` の `ort-wasm-simd-threaded.jsep.wasm` (25.02 MiB) が Cloudflare deploy 上限抵触 → `scripts/remove-bundled-wasm.mjs` で bundle 除外 + `app/api/wasm/[file]/route.ts` + `ort.env.wasm.wasmPaths = "/api/wasm/"` の 4 点セットで配線 (commit `29d0e629`)
