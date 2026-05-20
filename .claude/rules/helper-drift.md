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

主な使用箇所: `useArticleAi.ts` の `AiErrorType = HttpErrorType` 統合 — `classifyHttpError` / `getErrorMessage` 重複定義削除 + 429 で Retry-After ヘッダー秒数表示バグも同時修正

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
