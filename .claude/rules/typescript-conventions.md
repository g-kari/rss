---
description: TypeScript 型システム規約 (strict / interface / Cloudflare バインディング型)
paths: "src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts"
---

# TypeScript 規約

`coding-conventions.md` から #733 Step 1 で分割した、TypeScript 型システムに関する規約。

## 基本方針

- `strict: true` 前提。`any` は使わない
- 型は `interface` で定義 (`src/types.ts` に集約)
- Cloudflare バインディングは `src/cloudflare-env.d.ts` の `CloudflareEnv` インターフェースで拡張
  ```typescript
  // src/cloudflare-env.d.ts
  interface CloudflareEnv {
    RSS_DATA: R2Bucket;
    AI: Ai;
  }
  ```
- `tsconfig.json` の `types` に `"@cloudflare/workers-types"` を含める
- `tsconfig.json` の `lib` に `"DOM"` と `"DOM.Iterable"` を含める (Workers + React 共存)

## 関連参照

- 早期 return パスを関数/コンポーネントに切り出すと TypeScript narrowing が失われる対処 → `react-patterns.md`
- discriminated union 戻り値で `!` (non-null assertion) を消す pattern → `coding-conventions.md` (`assertFeedSubscribed` 派生ケース)
- 同名 enum / type の重複は canonical の `type X = Y` alias に統合 → `coding-conventions.md` (`AiErrorType = HttpErrorType` 派生ケース)
