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

## Import path 規約 (`src/hooks/` は `../` relative path 統一)

`src/hooks/` 配下は **`../` relative path で統一** (de facto canonical 224 件 vs 過去 outlier 12 件、`#816` で全 outlier 修正済 235 vs 0)。`tsconfig.json` の `paths` alias で `@/` absolute import も resolution 可能だが、`src/hooks/` 配下では `../` 統一が canonical。

```typescript
// アンチパターン (mix):
import type { Article } from "@/types"; // absolute
import { apiFetch } from "../lib/api-fetch"; // relative
// → 同一 file 内の import style mixing は cognitive load + 規範 drift シグナル

// canonical:
import type { Article } from "../types";
import { apiFetch } from "../lib/api-fetch";
import { useSyncedRef } from "./useSyncedRef"; // 同一 dir 内は ./
```

**How to apply**: `src/hooks/` 配下で新規 hook を追加 / 既存 hook を edit するときに以下 (新規開発時の cognitive load 低減 + de facto canonical との整合性 + `useImageDownload.ts` (#816 前 commit) `useCollections.ts` / `useReaderSettingsValue.ts` / `useArticleListItemProps.ts` / `useArticleListItemProps.test.ts` (#816) で実証済):

1. **新規 import 文を書くときは `../` で始める** (`@/` は src/hooks/ では非 canonical)
2. **同一 dir (`src/hooks/` 内) の hook 参照は `./` で開始** (`./useSyncedRef` のような短縮形)
3. **既存 file edit で `@/` が見つかったら同 commit で `../` に書き換え** (drift 累積防止)
4. **新規追加 hook の typecheck pass 後、import path 全件を再確認** で混在防止

**`src/components/` 配下の規範**: 現状 `../` relative 280 件 vs `@/` absolute 74 件 で過半数 relative だが、まだ statistically clean な canonical でない。本規範は **`src/hooks/` 限定** とし、`src/components/` の規範統一は将来別 Issue で段階対応 (scope 大、touch 50+ files 想定)。

**ai-grep 検出パターン**:

```bash
# src/hooks/ で @/ absolute import の残存確認
grep -rnE '^import.*from\s+["\x27]@/' src/hooks/*.ts 2>/dev/null
# (0 件なら canonical 維持、hit があれば本規範違反として修正)
```

## 関連参照

- 早期 return パスを関数/コンポーネントに切り出すと TypeScript narrowing が失われる対処 → `react-patterns.md`
- discriminated union 戻り値で `!` (non-null assertion) を消す pattern → `react-patterns.md` (「早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる」の派生ケース「戻り値型を discriminated union にすれば呼び出し元で narrowing が効く」)
- 同名 enum / type の重複は canonical の `type X = Y` alias に統合 → `helper-drift.md` (`AiErrorType = HttpErrorType` 派生ケース、#733 Step 1 で分割)
