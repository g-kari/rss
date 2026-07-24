---
paths: "src/lib/**/*.ts,src/hooks/**/*.ts,app/api/**/*.ts"
description: Helper drift 防止規範 — 新規 Route Handler / hook 実装時に既存 lib helpers (validation / r2 / api-error) を grep して流用、error code 契約破壊しないか確認、新規 dev dep 追加前に既存 grep、同名 type / enum の alias 化判断
---

# Helper drift 防止と既存依存の流用判断

`coding-conventions.md` から #733 案 A-1 Step 1 で分割した、**新規実装時に既存 helper / 依存
を grep して流用を検討する**規範集。

主要テーマ:

- 新規 Route Handler / hook を書くときの既存 helper grep 順序
- helper drift 解消で error code 契約を壊さない判断軸 (API spec 互換性)
- 新規 dev dependency 追加前の既存 devDeps grep 確認
- 同名 enum / type の `type X = Y` alias 化判断

## 新規 Route Handler / hook を書くときは既存 lib helpers を先に grep して流用を検討する

新規 Route Handler / hook を実装するとき、`src/lib/validation.ts` / `src/lib/r2.ts` / `src/lib/api-error.ts` 等に **同じ判定ロジック / 同じ helper が既に存在する** ケースが多い。新規にインライン定義すると **「helper drift」** (= dead code でなく、既存 helper を流用し忘れて重複定義された状態) が発生する。

```typescript
// アンチパターン: 既存 isValidSessionId を知らずに新規 UUID 正規表現を定義
// app/api/collections/[id]/route.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError("Invalid id", 400);
  // ...
}
// → src/lib/validation.ts に isValidSessionId(value: string) が既存 → drift

// 修正パターン: 既存 helper を import して流用
import { isValidSessionId } from "@/lib/validation";
export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!isValidSessionId(id)) return apiError("Invalid id", 400);
  // ...
}
```

**How to apply**: 新規 Route Handler / hook / lib モジュールを書くときに以下を判定:

1. **判定ロジック / バリデーションを書く前に、`src/lib/validation.ts` を grep**:
   ```bash
   grep -nE "isValid|parse|assertValid" src/lib/validation.ts
   ```
2. **R2 アクセス / KV アクセスを書く前に**, `src/lib/r2.ts` の helper を確認:
   ```bash
   grep -nE "^export (async function|function|const)" src/lib/r2.ts
   ```
3. **エラーレスポンスを書く前に** `src/lib/api-error.ts` の `apiError` を使う (素の `NextResponse.json({error}, {status})` は禁止)
4. **同じ pattern (sort / filter / merge) のロジックを 2 ファイルで書きそうになったら**, 共通ユーティリティとして `src/lib/<name>-utils.ts` に切り出す (例: `sort-utils.ts` の `sortByOrder`)
5. **判断時間が惜しいなら** リファクタ監査エージェントに「dead exports + helper drift」観点を渡して定期 sweep

**反例 (新規定義 OK のケース)**:

- 既存 helper が **当該 use case と semantic 的に異なる** (例: `isValidFeedHash` は 16 文字 hex のみで UUID 検証には使えない)
- 既存 helper が **より厳密 / より緩い検証で当該 endpoint の要件と合わない** (例: `isValidPublicUrl` は SSRF 対策込み、内部 fetch には不要すぎる)
- **type guard が必要** で既存 helper が type predicate を返さない場合 (型 narrow のため別途定義)

主な使用箇所: `app/api/collections/[id]/route.ts` / `app/api/auth/dbsc/{challenge,register}/route.ts` の UUID 正規表現 4 箇所重複 → `isValidSessionId` 集約 (リファクタ監査エージェント confidence 92%)

### 派生ケース: 新規 component / hook 追加時は **sibling 配下 shared module を先に grep** して helper 流用を検討する

新規 component / hook を追加するとき、**既存 sibling (同 directory) の `shared.tsx` / `_internal.ts` / `_helpers.ts` 等の集約 module を最初に grep** して既存 helper を見落とさない。他 component を copy-paste でテンプレ作成すると、本来 shared に集約済の handler / hook を **自己再定義** してしまう drift が新規追加サイクルで累積する。

```typescript
// アンチパターン: copy-paste で sibling shared 確認漏れ → 同形 useCallback 再定義
// src/components/article-items/NewLayoutItem.tsx (新規追加)
import { ArticleActions, type ArticleItemProps } from "./shared";  // 既存 import

export const NewLayoutItem = function NewLayoutItem({ article, onSelectArticle, onContextMenu, ... }) {
  // ↓ sibling `shared.tsx` に handleArticleKeyDown が既存だが grep 漏れで再定義
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelectArticle(article);
      }
    },
    [article, onSelectArticle],
  );
  // ...
};

// 修正パターン: sibling shared を必ず grep + import 統一
import {
  ArticleActions,
  handleArticleKeyDown,    // ← shared 既存を使用
  handleArticleContextMenu, // ← shared 既存を使用
  type ArticleItemProps,
} from "./shared";

export const NewLayoutItem = function NewLayoutItem({ article, onSelectArticle, onContextMenu, ... }) {
  const handleKeyDown = handleArticleKeyDown(article, onSelectArticle);
  const handleContextMenu = handleArticleContextMenu(article, onContextMenu);
  // ...
};
```

**How to apply**: 新規 component / hook 追加時に以下を判定 (copy-paste base の追加では sibling shared の grep 漏れが構造的に発生するため、明示 step として強制):

1. **新規 file 作成前に sibling directory の `shared.{ts,tsx}` / `_internal.ts` / `_helpers.ts` を Read** で全 export 確認
2. **コピー元 file の import 文の `from "./shared"` 部分を必ず確認** (copy-paste 時に import を残しても本体ロジックは独自で書きがち)
3. **新規 file の handler / hook 名と shared export 名を 1:1 grep** で衝突確認
4. **`grep -rEn "^(export )?(const|function)\s+handle[A-Z]" <sibling-dir>` で sibling shared の全 handler を列挙** → 新規 component で同形 logic を書きそうになったら既存使用に置換

**該当する典型 path** (本プロジェクトの sibling shared 配置):

| directory                             | sibling shared module               | 集約済 helper の典型                                                                           |
| ------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/components/article-items/`       | `shared.tsx`                        | `handleArticleKeyDown` / `handleArticleContextMenu` / `ArticleActions` / `ArticleThumbnail` 等 |
| `src/components/feed-item/`           | `feedActions.tsx`                   | `buildFeedActions`                                                                             |
| `src/components/article-list-header/` | `types.ts` / `constants.ts`         | shared type / constant                                                                         |
| `src/components/article-view/`        | (なし、機能別分割)                  | sub-component import で対応                                                                    |
| `src/hooks/`                          | (sibling shared なし、各 hook 独立) | 本派生 case 適用外                                                                             |

**反例 (本派生 case 不要なケース)**:

- 新規 component が **完全に独立した責務** (sibling と全く異なる UX、shared helper 流用不可) → grep skip OK
- sibling directory が **flat 構造で集約 module なし** (`src/hooks/` 等) → 全体 lib grep (helper-drift.md 本体規範) に従う
- 新規 component が **prototype / 1 回限り experimental** (本番投入未定) → grep 緩和可

主な使用箇所: `ListItem.tsx` / `MagazineItem.tsx` / `CardItem.tsx` の 3 component が `shared.tsx#handleArticleKeyDown` (既存) + 未抽出の `handleContextMenu` を copy-paste で再定義 → 本サイクル refactor agent 発見で shared に集約 (`handleArticleKeyDown` import 統一 + `handleArticleContextMenu` 新規 export 追加)、commit `3f9bd3e4`。本派生 case で新規 component 追加時の構造的予防可能化

#### 派生サブケース: 同形 `useCallback` 8 行ブロックが 4+ コンポーネントで重複するときは shared に `useXxxHandlers` hook を追加する

sibling shared の pure handler functions (`handleArticleKeyDown` / `handleArticleContextMenu` 等) を各 component が個別に `useCallback` でラップする同形 8 行ブロックが **4 コンポーネント以上** に重複した場合、pure handler を呼ぶ `useCallback` 自体を集約した **`useXxxHandlers` hook** を shared に追加して重複を解消する。

```typescript
// アンチパターン: CompactItem / ListItem / CardItem / MagazineItem の全 4 コンポーネントで同形 8 行重複
const handleKeyDown = useCallback(
  (e: ReactKeyboardEvent<HTMLElement>) => handleArticleKeyDown(article, onSelectArticle)(e),
  [article, onSelectArticle],
);
const handleContextMenu = useCallback(
  (e: ReactMouseEvent<HTMLElement>) => handleArticleContextMenu(article, onContextMenu)(e),
  [article, onContextMenu],
);

// 修正パターン: shared.tsx に useArticleHandlers hook を追加して 1 行に集約
// (shared.tsx に追加)
export function useArticleHandlers(
  article: Article,
  onSelectArticle: (a: Article, event?: ReactMouseEvent) => void,
  onContextMenu: ((a: Article, x: number, y: number) => void) | undefined,
): {
  handleKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  handleContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
} {
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => handleArticleKeyDown(article, onSelectArticle)(e),
    [article, onSelectArticle],
  );
  const handleContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => handleArticleContextMenu(article, onContextMenu)(e),
    [article, onContextMenu],
  );
  return { handleKeyDown, handleContextMenu };
}

// 各コンポーネントは 1 行に簡素化
const { handleKeyDown, handleContextMenu } = useArticleHandlers(
  article,
  onSelectArticle,
  onContextMenu,
);
```

**How to apply**: sibling shared の pure handler を `useCallback` で呼ぶ同形ブロックが 4+ コンポーネントで重複しているとき (3 コンポーネント以下は重複許容でも可読性損なわないが、4+ になると新規 component 追加時の確認対象が増え drift 温床になる):

1. **重複件数を確認** (`grep -rln "useCallback" <dir>` + 中身比較): 3 件以下は shared の pure handler 呼び出しで十分、4 件以上なら hook 化判断
2. **hook シグネチャは pure handler と同じ引数** を受け取り、`useCallback` の deps も pure handler の引数と一致させる
3. **hook 名は `use<Subject>Handlers`** (例: `useArticleHandlers`、`use<Component>EventHandlers` 等) で「複数 handler を返す hook」と判別可能に
4. **sibling shared の同 file に追記** (新規 file を作らず `shared.tsx` 内に handler 関数と並べる)
5. **既存 component を新 hook に置き換え** + typecheck で deps 整合確認

**判断軸: pure handler 直接呼び出し vs `useXxxHandlers` hook 化**:

| 状況                                              | 判断                                       |
| ------------------------------------------------- | ------------------------------------------ |
| 3 コンポーネント以下の重複                        | pure handler 直接呼び出し (hook 化不要)    |
| 4+ コンポーネントで同形 `useCallback` ブロック    | `useXxxHandlers` hook を shared に追加     |
| 新規 component を追加するたびに同形コードが増える | hook 化で「追加時に 1 行で済む」基盤を作る |

主な使用箇所: `src/components/article-items/shared.tsx#useArticleHandlers` — CompactItem / ListItem / CardItem / MagazineItem の 4 コンポーネントで `handleKeyDown` / `handleContextMenu` の同形 `useCallback` 8 行ブロックが重複 → hook 化で各 component 1 行に簡素化

### 派生ケース: helper drift 解消で「同じエンドポイントの既存 error code 契約」を変更してはならない

別 Route Handler から helper (`assertValidFeedHash` / `assertFeedSubscribed` 等) を流用するとき、helper の error code が **既存エンドポイントの API spec に記載されている error code と異なる** ケースがある (例: helper は `INVALID_FEED` を返すが、対象 endpoint の既存 spec は `INVALID_PAYLOAD`)。helper を機械的に置換すると **client 側の error 分岐コードが壊れる** + **api-spec.md と実装が乖離する** という二重損失が発生する。

```typescript
// アンチパターン: helper drift 解消で error code を変更
// app/api/engagement/route.ts (元実装)
if (!feedHash || !isValidFeedHash(feedHash)) {
  return apiError("Invalid payload", 400, { code: "INVALID_PAYLOAD" });
}

// アンチパターン: helper を機械的に置換 → error code が INVALID_FEED に変わる
const err = assertValidFeedHash(feedHash);
if (err) return err; // ← INVALID_FEED を返す!
// → api-spec.md の "INVALID_PAYLOAD" 記載と乖離、client の error 分岐コード破綻

// 修正パターン: error code 互換性を確認してから判断
// 案 A: helper 流用見送り (既存 error code 維持)
if (!feedHash || !isValidFeedHash(feedHash)) {
  return apiError("Invalid payload", 400, { code: "INVALID_PAYLOAD" });
}
// 案 B: helper に optional error code 引数を追加
const err = assertValidFeedHash(feedHash, { code: "INVALID_PAYLOAD" });
if (err) return err;
// 案 C: api-spec.md と client 側を含めて全体移行 (大規模変更、別 Issue)
```

**How to apply**: 別 Route Handler の validation logic を helper に集約しようとするとき (helper の機械的置換は drift 解消としては正しいが、error code 契約破壊は client / api-spec.md 二箇所の不整合を生むので「helper drift 解消」と「API 互換性破壊」は別の問題として分離する):

1. **対象 endpoint の `api-spec.md` を Read** して既存 error code を確認 (`grep -nE "code.+:" .claude/rules/api-spec.md`)
2. **helper の error code が既存 spec と一致するか** を確認:
   - 一致 → helper 流用 OK (典型: 同じ `INVALID_FEED` を返す articles / feeds / refresh など)
   - 不一致 → 案 A (流用見送り) / 案 B (helper 拡張) / 案 C (全体移行) のいずれかを選択
3. **`grep -rn "code:.+INVALID_PAYLOAD"` 等で client 側の error 分岐コードも確認** — 影響範囲が広いなら helper 拡張 (案 B) で互換維持
4. **commit message に「helper 流用見送りの理由」を明記** (将来の AI/開発者が「なぜ helper 化しなかった」と疑問を持ったとき答えられるよう)

**反例 (helper drift 解消が妥当なケース)**:

- 対象 endpoint の error code 仕様 (`api-spec.md` 記載) が helper と完全一致 → そのまま流用
- 対象 endpoint が **新規 endpoint で client 側 caller がまだ存在しない** → helper の error code に合わせて新規仕様策定
- error code 差異が **意味的に同等** (例: `INVALID_FEED_HASH` ↔ `INVALID_FEED`) で API spec も同サイクルで更新可能 → 案 C 全体移行

主な使用箇所: `articles` route の `assertValidFeedHash` 流用 (INVALID_FEED 互換) は採用、`engagement` route の同 helper 流用は INVALID_PAYLOAD → INVALID_FEED に error code 変更してしまうため撤回 (api-spec.md "INVALID_PAYLOAD" 記載維持のため `isValidFeedHash` 直接呼び出しを継続)

### 派生ケース: 新規 dev dependency 追加前に既存 devDeps の流用可能性を grep 確認する

Issue 本文や監査エージェント report で推奨された npm パッケージ (例: `jsdom` / `axios` / `date-fns`) を追加する前に、**`package.json` の `devDependencies` / `dependencies` を grep して同等機能の既存依存がないか確認する**。「Issue 推奨だから」と機械的に追加すると、**依存重複** (同じ機能を持つ複数パッケージが共存) や **bundle size 膨張** を招く。

```bash
# 新規 dep 追加前に必須チェック:
grep -nE "<推奨パッケージ名>|<類似機能>" package.json
# 例: jsdom 追加前 → happy-dom が既に devDeps にあると判明
```

**How to apply**: 新規 npm 依存追加の判断時 (新規 dep 追加コスト: install サイズ + lock file 肥大 + supply chain 攻撃面拡大、既存 dep 流用が安全):

1. **`grep -nE "<推奨>|<類似>" package.json`** で推奨パッケージ + 類似機能パッケージを両方検索
2. **既存依存あり + API 互換 + 性能同等以上** なら代替採用 (Issue 推奨と差分を完了コメントに明示)
3. **既存依存あり + API 非互換 / 性能劣る / 維持困難** なら新規 dep 追加 (代替検討記録を commit message に残す)
4. **既存依存なし** なら新規 dep 追加 (Issue 推奨に従う)
5. 代替採用時は **「将来 X の互換性問題が出たら推奨パッケージに切替」plan を Phase 完了コメントに記載** (`happy-dom → jsdom` 等、置き換え準備の知識残存)

**反例 (新規 dep 追加が正しいケース)**:

- 既存依存と **本質的に異なるドメイン** (例: `vitest` は test runner、既存の `vite` は build tool — 同 family だが責務別)
- 既存依存が **deprecated** で migration 推奨されている
- 既存依存の **active maintenance が停止** している (`npm info <pkg> maintainers` で確認)

主な使用箇所: #682 Phase A で `jsdom` 推奨だったが `happy-dom@20.9.0` が既存 devDeps にあり代替採用 — API 互換 + 3x 高速 + 依存重複回避

### 派生ケース: 同名 enum / type の重複は canonical の `type X = Y` alias に統合する

別 hook で **canonical 型と同じ意味の独立 enum** が定義されているケース (例: `AiErrorType = "network" | "rate_limit" | "model_error" | "unknown"` と canonical `HttpErrorType = "network" | "rate_limit" | "server_error" | "client_error" | "unknown"`)。consumer が narrow チェック (例: `aiError.type === "rate_limit"`) するだけなら、**`type AiErrorType = HttpErrorType;` の alias 化** で互換性を保ちつつ統合できる。

**判定フロー**:

1. **consumer の narrow チェック箇所を grep**: `grep -rn "<typeName>\|\.type === \"" src/ --include="*.tsx"` で `.type === "X"` のような literal 比較を全件抽出
2. **canonical 型に含まれない literal を参照しているか確認**: 例えば `AiErrorType` の `"model_error"` は canonical `HttpErrorType` (`"server_error"`) に統合可能か → consumer で `"model_error"` を直接参照していなければ OK
3. canonical 型に含まれない literal が consumer で参照されているなら、その literal を canonical 型に追加してから alias 化
4. **canonical 型と完全に同じ意味なら type alias 化**: `export type X = CanonicalType;` で互換性維持

**反例 (alias 化が不適切なケース)**:

- canonical 型に **意図的に存在しない literal** がローカル enum にある場合 → alias 化は別の場所で drift を生む。alias 化せず canonical 型に variant を追加するか、独立を維持
- canonical 型の責務とローカル型の責務が **本質的に異なる** 場合 (例: HTTP 由来の error vs AI モデルロード状態) → alias 化せず独立を維持
- alias 化で **メッセージ文言が canonical と乖離** する場合 → canonical の `formatXxx(type, opts)` を同時に流用すれば文言も統一可能

**How to apply**: 同名 / 同意味の type / enum 重複を発見したら上記「判定フロー」4 step を順次実行、canonical 型に統合可能なら `export type X = CanonicalType;` で alias 化、不可なら反例の理由を明記して独立維持。

主な使用箇所: `useArticleAi.ts` の `AiErrorType = HttpErrorType` 統合 — `classifyHttpError` / `getErrorMessage` 重複定義削除 + 429 で Retry-After ヘッダー秒数表示バグも同時修正

### 派生ケース: `Map<K, V>` 等価判定 helper の重複は generic + `ReadonlyMap` 引数で canonical 集約 + 既存 named export は thin wrapper で残置

「Map の size + key/value 比較」ロジックが複数 file (例: `unread-stats-merge.ts#equalUnreadByFeed` + `equalLastPublishedByFeed` / `article-filter-equality.ts#equalMap`) で inline 重複するケース。value 型 (`number` / `string` / etc.) が違うだけで size compare + `for (const [k, v] of a) { if (b.get(k) !== v) return false }` の構造は同じ。canonical の `equalMap<V>(a, b): boolean` に集約するが、**既存 named export を thin wrapper として残置** して caller signature 維持 + 実装は canonical 1 箇所に集約する。

canonical 側で以下 2 点を先に修正して安全に統合:

1. **`Map<string, V>` → `ReadonlyMap<string, V>`** に緩和 (`Map` / `ReadonlyMap` どちらの caller からも呼べる superset、`Map extends ReadonlyMap` なので既存 `Map` caller に破壊なし)
2. **`function equalMap<V>` に `export` 追加** して外 file から import 可能に

```typescript
// canonical: article-filter-equality.ts
export function equalMap<V>(a: ReadonlyMap<string, V>, b: ReadonlyMap<string, V>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, val] of a) {
    if (!b.has(key)) return false;
    if (b.get(key) !== val) return false;
  }
  return true;
}

// wrapper: unread-stats-merge.ts (caller signature 維持)
import { equalMap } from "./article-filter-equality";
export function equalUnreadByFeed(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
): boolean {
  return equalMap(a, b);
}
```

wrapper 残置は `rule-maintenance.md § 6 派生「wrapper adapter で callsite 不変を保ち scope 圧縮する」` と同じ trade-off — caller 側 書き換え diff 回避 + 実装 canonical 1 箇所集約 の canonical pattern。

**How to apply**: `equalXxxMap` / `equalXxxByYyy` 名の Map 等価判定 helper を実装 or 発見したら (`Map` / `ReadonlyMap` 変換の generic 一段昇格は caller 破壊ゼロで scope 最小、named wrapper は semantic 明示性を維持):

1. **同ロジック helper を grep**: `grep -rn "for (const \[.*\] of a)" src/lib/ | grep "b.get\|b.has"` で size compare + get 比較 pattern を全件列挙
2. **canonical 候補 (最古 / 最も一般的 / 既に export 済) の 1 つを選択** — 通常は既に他 helper (`equalDigestLimitMap` / `equalStringMap` 等) を集約している hub file
3. **canonical を `ReadonlyMap<string, V>` generic + `export` に昇格** — この 2 修正は既存 caller 破壊なし (safe widening)
4. **重複 file の同ロジック関数を wrapper に置換** — 実装 body を `return equalMap(a, b);` 1 行に、named export + signature (arg 型) は変更しない
5. **JSDoc に統合済 note 追記** (「内部実装は `equalMap` generic に委譲、named export は signature 維持のため残置」) — 次回 sweep での重複再検出防止
6. **TDD**: 既存 named wrapper の spec が pass すれば regression なし、追加 spec 不要 (canonical `equalMap` に既存 spec があれば流用)

**反例 (wrapper 残置が不要 / 全 caller 直接置換が canonical なケース)**:

- **caller が 1-2 箇所のみ** — wrapper 残置のオーバーヘッド > caller 書き換え、直接 `equalMap(a, b)` で置換
- **wrapper の named export が semantic 情報を持たない** (例: `equalMapV1` / `equalMapCopy` 等の一時名) — semantic 価値なしなら削除 + caller 直接置換
- **generic に含まれない特殊比較** (`Object.is` / deep equal / 数値許容誤差等) が値比較に必要 — canonical `===` に統合不可、独立維持

主な使用箇所: `unread-stats-merge.ts` の `equalUnreadByFeed` / `equalLastPublishedByFeed` 2 関数 (計 12 行 inline 実装) を `article-filter-equality.ts#equalMap<V>` 経由に統合 — canonical を `ReadonlyMap` generic + export に昇格 + wrapper 残置で caller (unread stats context) 側 diff ゼロ、実装 22 → 6 行に圧縮

### 派生ケース: sibling hook 統合前に「内部 silent 副作用経路」を grep して signature を先に確定する

2 つの hook (例: `useSpeechSynthesis` / `usePiperTts`) で **rate/voice/volume 制御コードが ~120 行重複** していて共通化したくなる、というケース。同じ public API (state + setter) でも、片方の hook が **内部で silent に state を書き換える経路** (例: error event handler 内で `setVoiceUriState(null)` を直接呼ぶ + `onChange` callback を呼ばない自動 reset) を持っていることがある。この経路を見落として共通 hook の `setVoiceUri(uri)` 経由に置き換えると、`onChange` callback で `speak()` 等の副作用が**再発火する罠**になる。

```typescript
// アンチパターン (silent reset 経路を見落として共通化)
// 既存 useSpeechSynthesis 内部:
utterance.onerror = (e) => {
  if (code === "voice-unavailable") {
    storageSet(STORAGE_KEYS.TTS_VOICE_URI, "");
    voiceUriRef.current = null;
    setVoiceUriState(null); // ← 内部 state setter 直接、onChange 呼ばない silent reset
  }
};

// 共通 useTtsControls 化:
const { setVoiceUri } = useTtsControls({
  onVoiceChange: () => {
    if (currentText) speak(currentText);
  }, // ← speak 再発火 callback
});

// 既存 onerror を共通 hook 経由に書き換え:
utterance.onerror = (e) => {
  if (code === "voice-unavailable") setVoiceUri(null);
  //                                ↑ onChange で speak(currentText) が呼ばれて
  //                                  voice-unavailable 直後に再 speak で同じ error 連鎖!
};

// 修正パターン (共通 hook signature に silent variant を用意)
const { setVoiceUri, setVoiceUriSilent } = useTtsControls({
  onVoiceChange: () => {
    if (currentText) speak(currentText);
  },
});

utterance.onerror = (e) => {
  if (code === "voice-unavailable") setVoiceUriSilent(null); // ← onChange skip
};
```

**How to apply**: 2 hook 間で「同 public API + ~100 行重複」を見つけて共通 hook 化したくなったら、**実装着手前に内部 silent 経路を grep** (silent 経路を後から発見すると共通 hook の signature 修正 + 全 caller 再修正で context 倍増):

1. **対象 hook 内で内部 state setter (`setXxxState` / `setVoiceUriState` 等) の直接呼出を全件 grep**:
   ```bash
   grep -nE "set[A-Z][a-zA-Z]*State\s*\(" src/hooks/<target1>.ts src/hooks/<target2>.ts
   ```
2. **各呼出が public API (`setXxx`) ではなく内部 setter なら、その意図を確認**:
   - 通常の user action 経由 (props / event handler) → 共通 hook の public `setXxx` 経由に置き換え OK
   - **internal error / cleanup / 自動 reset 経路** で silent (callback を呼ばずに state だけ変える) → 共通 hook signature に **`setXxxSilent` (callback skip variant) を用意**する必要あり
3. **silent variant が必要と判明したら signature を先に確定** してから共通 hook を実装 (signature 設計が後追いになると Phase 分離 + 全 caller 再修正で context overflow リスク)
4. 共通 hook の signature は **`setXxxSilent` 追加 / `setXxx(uri, { silent: true })` 2 引数化 / consumer 側で reentrancy ガード** の 3 案を trade-off で比較 (semantic 明示性 vs API 個数)
5. **TDD spec で silent / non-silent 両方の経路を assert** (silent 経路は callback 呼ばれないことを spec で固定)

**反例 (silent variant 不要なケース)**:

- 内部 state setter 呼出が **同 hook 内で 1 経路だけ** (cleanup / mount 初期化等で副作用なし) → 共通 hook の `setXxx` で十分
- silent 経路の副作用 (callback 内容) が **本質的に冪等** (同じ値で呼んでも害なし) → callback 経由でも OK

主な使用箇所: `useTtsControls` の `useSpeechSynthesis` voice-unavailable silent reset 経路 — agent 委譲時に grep を怠った結果 signature 修正が必要と判明 → Phase 分離で次サイクル送り

### 派生ケース: エラーレスポンス JSON parse + fallback の inline 重複は `tryParseErrorBody` helper に集約する

`useCollections.ts` / `useFeedGroups.ts` 等の hook で `!res.ok` 分岐内に `res.json().catch(() => ({}))` を inline で書くパターンが複数 hook に散在すると、同じ「JSON parse 失敗時は空オブジェクト返却」ロジックが重複 drift する。`api-fetch.ts` に `tryParseErrorBody` として helper 集約するのが canonical。

```typescript
// アンチパターン: 各 hook に inline で重複
// useCollections.ts
if (!res.ok) {
  const body = await (res.json() as Promise<{ code?: string; error?: string }>).catch(() => ({}));
  throw new Error(body.error ?? `HTTP ${res.status}`);
}

// useFeedGroups.ts (同 pattern が 2〜4 箇所)
if (!res.ok) {
  const body = await (res.json() as Promise<{ code?: string; error?: string }>).catch(() => ({}));
  throw new Error(body.error ?? `HTTP ${res.status}`);
}

// 修正パターン: api-fetch.ts に集約
// import { tryParseErrorBody } from "../lib/api-fetch";
if (!res.ok) {
  const body = await tryParseErrorBody(res);
  throw new Error(body.error ?? `HTTP ${res.status}`);
}
```

**How to apply**: hook / Route Handler でエラーレスポンスの JSON parse に `res.json().catch()` を書きたくなったら (同 pattern が 2 箇所以上で発生した段階で helper drift):

1. **`api-fetch.ts` に `tryParseErrorBody` が既にあるか grep** — `grep -n "tryParseErrorBody" src/lib/api-fetch.ts`
2. あれば **`import { tryParseErrorBody } from "../lib/api-fetch"` で流用**
3. なければ `api-fetch.ts` に **`export async function tryParseErrorBody(res: Response): Promise<{ code?: string; error?: string }>`** を追加してから流用
4. `helper-drift.md` 本規範「新規 Route Handler / hook を書くときは既存 lib helpers を先に grep」の延長として適用

**反例 (inline で OK なケース)**:

- エラーレスポンスの shape が `{ code?: string; error?: string }` 以外の **特殊 schema** で parse ロジックが固有 → inline 可、または別名 helper
- `tryParseErrorBody` が返す型では **narrowing 不十分** (例: 追加フィールドが型安全に必要) → 専用 parse helper を作成

主な使用箇所: `useCollections.ts` / `useFeedGroups.ts` — 各 hook に 2 件ずつ (計 4 件) の inline `res.json().catch` 重複を `tryParseErrorBody` に集約

### 派生ケース: `tryParseErrorBody` の戻り型に index signature を追加して追加フィールドに型アサーションアクセスする

`tryParseErrorBody` の戻り型 `{ code?: string; error?: string }` に **`[key: string]: unknown`** index signature を追加すると、caller が `canRetryWithSelector` 等の API 固有の追加フィールドに安全にアクセスできる。index signature なしで追加フィールドを読もうとすると `Property 'X' does not exist on type` の型エラーが発生するため、`as { canRetryWithSelector?: boolean }` のような型アサーションが必要になる。

```typescript
// api-fetch.ts の tryParseErrorBody 戻り型
export async function tryParseErrorBody(
  res: Response,
): Promise<{ code?: string; error?: string; [key: string]: unknown }> {
  return res.json().catch(() => ({})) as Promise<{
    code?: string;
    error?: string;
    [key: string]: unknown;
  }>;
}

// caller 側: 型アサーションで API 固有フィールドにアクセス
if (!res.ok) {
  const body = await tryParseErrorBody(res);
  const canRetry = (body as { canRetryWithSelector?: boolean }).canRetryWithSelector;
  if (canRetry) {
    /* ... */
  }
  throw new Error(body.error ?? `HTTP ${res.status}`);
}
```

**How to apply**: `tryParseErrorBody` の戻り値で `code` / `error` 以外のフィールドにアクセスしたいとき (index signature なしだと型エラー、`as` キャストが型ルールに反しない):

1. **`api-fetch.ts` の `tryParseErrorBody` 戻り型に `[key: string]: unknown` が含まれているか確認** — `grep -n "tryParseErrorBody" src/lib/api-fetch.ts`
2. 含まれていなければ **index signature を追加** (呼び出し元の変更なし、下位互換)
3. **caller で `(body as { extraField?: T }).extraField` 形式でアクセス** — 型アサーションは 1 回のみ、アクセスパスを明示
4. **追加フィールドが 3 種類以上 / 複数 caller で使う** なら専用の parse helper を別途作成する方が canonical (本パターンは 1-2 フィールドの ad-hoc アクセス向け)

**反例 (index signature + アサーション不要なケース)**:

- 追加フィールドが多く全て型安全に扱いたい → `tryParseErrorBody` を呼ばず専用型の `res.json().catch` inline か別名 helper
- 追加フィールドが `code` / `error` のどちらかの別名 → 既存フィールドを流用または helper 戻り型に直接追加

主な使用箇所: `useFeedOperations.ts#addFeed` — `/api/feeds` POST の `canRetryWithSelector` フィールドに `(body as { canRetryWithSelector?: boolean }).canRetryWithSelector` でアクセス、index signature 追加で型エラー解消
