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

## dead return 削除時は内部 write-only variable も同 commit で sweep する

関数の戻り値 `return { x: xRef.current }` を削除して戻り値型を `void` 化したとき、戻り値経路でしか read されていなかった内部変数 (`xRef` 等) は **write-only な dead variable** に転落する。戻り値削除と同 commit で内部 dead variable も sweep するのが canonical。別 commit に分けると「なぜ片方だけ残っているのか」レビュアーの認知負荷が発生する。

```typescript
// アンチパターン: 戻り値だけ削除して xRef を残す
export function useFoo(): void {
  const xRef = useRef<number>(0); // ← write-only dead variable
  useEffect(() => {
    xRef.current = compute();
    callback?.(compute()); // callback は別 path で計算済値を直接受領
  }, []);
  // return { x: xRef.current } を削除
}

// 修正パターン: 戻り値削除と同 commit で内部 dead variable も削除
export function useFoo(): void {
  useEffect(() => {
    const v = compute();
    callback?.(v);
  }, []);
}
```

**How to apply**: 戻り値削除 commit を準備するとき (戻り値依存の内部変数は戻り値経路の消失で機械的に dead 化するため、同 commit で sweep するのが効率的):

1. **戻り値型を `void` 化** + return 文削除
2. **戻り値で参照していた変数 (例: `xRef`) を `search_for_pattern` / `grep` で全 reference 確認**
3. **write 専用 (代入のみ、read なし) なら同 commit で削除** (変数定義 + 全代入箇所)
4. **read が残るなら削除不可** (戻り値以外で使われている = 機能変化なし削除は不可能)
5. **commit message に「戻り値削除 + 内部 write-only variable sweep」を明示** で sweep 意図を履歴に残す

**反例 (内部変数を残すケース)**:

- 内部変数が **他 effect / callback の read 対象** で戻り値以外で使われている → 削除不可
- 内部変数が **debug log / devError 等の dev 用途で参照** → 削除可だが別判断要素

主な使用箇所: `useReadingProgress` 戻り値 `{ progress: progressRef.current }` 削除時、`progressRef` が write-only と確認 → 同 commit で `useRef` 定義 + 2 箇所の代入を削除し 4 行 → 7 行削減に拡張

## 関連参照

- 早期 return パスを関数/コンポーネントに切り出すと TypeScript narrowing が失われる対処 → `react-patterns.md`
- discriminated union 戻り値で `!` (non-null assertion) を消す pattern → `react-patterns.md` (「早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる」の派生ケース「戻り値型を discriminated union にすれば呼び出し元で narrowing が効く」)
- 同名 enum / type の重複は canonical の `type X = Y` alias に統合 → `helper-drift.md` (`AiErrorType = HttpErrorType` 派生ケース、#733 Step 1 で分割)
