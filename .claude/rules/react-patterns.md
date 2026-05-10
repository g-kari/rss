---
description: React state / ref / useEffect / Context / コンポーネント分割パターン集
paths: "src/**/*.tsx,src/hooks/**/*.ts,src/contexts/**/*.tsx,src/components/**/*.tsx,app/**/*.tsx"
---

# React パターン (state / ref / useEffect)

`coding-conventions.md` から #694 Step 1 で分割した React 固有の state / ref / useEffect パターン集。
React Context / hook 設計 / コンポーネント分割等の React 関連ルールも順次本ファイルに集約予定 (#694 Step 2 以降)。

## state 更新前に「構造的等価性ガード」を入れて reference を安定化する

`useState<Record<string, T>>` のような object/Record state を周期的に再生成 (例: サーバー同期マージ) する処理は、**内容が変わっていなくても新しい reference を作って `setState` を呼ぶ**ことが多い。React は値の === 比較で再 render を skip する閾値を持つが、object の比較は reference 比較のため、**毎回 reference が変わると下流の useMemo が再計算される**。

```typescript
// アンチパターン: 内容が同じでも毎回新しい reference
function useReadStateSyncApply() {
  function applyServerState(state) {
    if ("snoozedUntil" in state) {
      const merged = mergeSnoozedUntil(currentSnoozed, state.snoozedUntil);
      // ↓ merged の中身が currentSnoozed と同じでも新しい object → 再 render
      setSnoozedUntil(merged);
    }
  }
}

// → useFilteredArticles の useMemo([..., snoozedUntil]) が 2 秒毎に再実行
//   全記事 (500+) でフィルター pass を再走 → 主スレッド 20-80ms ブロック

// 修正パターン: 構造的等価性ガード
function useReadStateSyncApply() {
  function applyServerState(state) {
    if ("snoozedUntil" in state) {
      const merged = mergeSnoozedUntil(currentSnoozed, state.snoozedUntil);
      if (!equalSnoozedUntil(currentSnoozed, merged)) {
        setSnoozedUntil(merged); // 内容変化ありのみ更新
      }
    }
  }
}
```

**Why**: object/Record state は reference 不安定が直接 useMemo / useCallback / useEffect の再実行を引き起こす。同期処理 (R2 / WebSocket / polling) は通常「内容変化なし」のケースが多数派 (例: スヌーズエントリは滅多に変わらない)。この多数派ケースで state 更新を skip すれば下流の再計算が完全停止する。

**How to apply**: 周期的・冗長な setState 呼出を見つけたら、以下を確認:

1. **state の type は object / Record / array か** — boolean / number / string なら React の === 比較で skip されるので問題なし
2. **内容変化なしの呼出が多数派か** — debounce / polling / WebSocket イベントで毎回新 object を作るパターン
3. **下流に重い useMemo / useEffect があるか** — 軽量 derive なら問題なし
4. 全部 yes なら **構造的等価性ガード** を追加:
   - 純粋関数 `equalXxx(a, b): boolean` を `src/lib/<feature>-merge.ts` に切り出す
   - TDD で「同 reference / 同内容別 reference / 順序差異 / キー差異 / 値差異 / N 件大量 entries」を網羅
   - setState 直前に `if (!equalXxx(prev, next)) setXxx(next)` でガード

注意点:

- 等価判定が **更新ロジックより重い** ケースは逆効果 (例: 100 万件 array の deep equal)。state size に上限がある (本プロジェクトの snoozed: 500 件) のが前提
- **JSON.stringify による等価判定は避ける** — オブジェクト key 順序に依存して誤判定する可能性 (V8 と Safari で順序が違う)
- ref 安定化は副次的に **debounce / throttle が不要になる** ことがある (内容変化のみで naturally fired される)

主な使用箇所: `equalSnoozedUntil` / `useReadStateSyncApply` (#686 — 2 秒毎の主スレッドブロック解消)

### 派生ケース: モジュールレベル sentinel オブジェクトは `Object.freeze` で下流汚染を防ぐ

`useFilteredArticles` のように **多数の派生 props** として `EMPTY_SET` / `EMPTY_ARRAY` 等の sentinel を渡す hook では、freeze されていない sentinel を下流が誤って `.add()` / `.push()` するとプロセス全体で sentinel が汚染され「次回からは empty じゃない」状態になる。`Object.freeze` で runtime safety net を入れる。

```typescript
// アンチパターン: freeze なし sentinel
const EMPTY_SET = new Set<string>();
// 多数の consumer に渡される → 1 箇所で .add() されたら全 consumer が汚染
//   → 「filter 適用してないのに empty じゃない」連鎖バグ

// 修正パターン: Object.freeze で runtime safety net
const EMPTY_SET = Object.freeze(new Set<string>()) as Set<string>;
// 型は Set<string> のまま (consumer 側の型変更を要求しない) +
// runtime で .add() が TypeError throw する defense in depth
```

**Why**: TypeScript の `Set<string>` / `Array<T>` 型は **mutable をマークしない**。`ReadonlySet` / `ReadonlyArray` で渡せば型でも守れるが、consumer 全箇所の型変更を要求するため漸進的移行と相性が悪い。`Object.freeze + as cast` なら **PR スコープを最小化** しながら runtime での汚染検知を獲得できる。安定参照のため module-level で 1 度だけ作る sentinel は consumer が増えるほど誰かが mutate する事故確率が上がるため、defense in depth として freeze を入れる価値がある。

**How to apply**: `const EMPTY_X = ...` のような module-level sentinel を新規宣言するとき:

1. **mutable 型 (Set / Map / Array / Object) はすべて freeze 対象**。primitive (string / number / boolean) は不要
2. **frozen 型注釈は元の mutable 型のまま** (`as Set<string>` で consumer 側の型変更を回避)
3. **`ReadonlySet` / `ReadonlyArray` 派にしたいケース** (新規モジュールで consumer もまだ少ない) なら最初からそちらが clean。**既存モジュール** (consumer 多数) に後追いで freeze を入れるなら as cast で
4. プリミティブの sentinel (`const EMPTY_STR = ""` 等) は freeze 不要 (immutable)

検出方法: `grep -rEn "^const EMPTY[A-Z_]*" src/` で module-level sentinel 全件列挙 → `Object.freeze` 無しのものを抽出。`code drift sweep` (`rule-maintenance.md` セクション 5) パターンで定期適用可能。

主な使用箇所:

- `useFilteredArticles.ts` の `EMPTY_SET` / `EMPTY_STR_ARRAY` / `EMPTY_FEED_ARRAY` (3 sentinel を一括 freeze 化)
- `useDelayedGalleryItems.ts` の `EMPTY_SET = Object.freeze(new Set<string>()) as Set<string>` (先行採用パターン)

## ref vs state の使い分け（同期チェック vs useEffect 再実行）

「外部からの一時的中断 → 自動回復」シナリオ（429 クールダウン後の再開、スリープからの復帰など）では **ref だけでは不十分**。`useRef` は React 再レンダーをトリガーしないため、ref に「期限値」を書き込んでも `useEffect` は再実行されない。

- **ref**: 同期 fetch ループ内の高頻度チェック用（`if (Date.now() < ref.current) return;`）
- **state**: `useEffect` 再実行のトリガー用（依存配列に含める）

両方を併用するパターン:

```typescript
const rateLimitUntilRef = useRef<number>(0);
const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);

// クールダウン期限到達 → state リセット → メイン useEffect 再実行
useEffect(() => {
  if (rateLimitedUntil <= 0) return;
  const remaining = rateLimitedUntil - Date.now();
  if (remaining <= 0) {
    setRateLimitedUntil(0);
    return;
  }
  const id = setTimeout(() => setRateLimitedUntil(0), remaining);
  return () => clearTimeout(id);
}, [rateLimitedUntil]);

// メイン useEffect: rateLimitedUntil を依存に入れることで再開がトリガーされる
useEffect(() => {
  if (Date.now() < rateLimitUntilRef.current) return; // ref で同期チェック
  // ... fetch loop
  // 429 受信時:
  // const until = Date.now() + retryAfterMs;
  // rateLimitUntilRef.current = until;
  // setRateLimitedUntil(until);  // ← state にも反映して useEffect 再実行を予約
}, [, /* ... */ rateLimitedUntil]);
```

主な使用箇所: `usePrefetchGalleryContents`（429 クールダウン後の自動リトライ）

## trigger counter で「同じ依存値」でも useEffect を強制再実行する

「同じ記事を選んでいるけど **もう一度** 強制スクロールしたい」「同じ条件のまま **再** 取得したい」のように、**state は変わらないがユーザー操作の都度 effect を再発火** したいケース。`useEffect` の依存配列は **値の equality** で判定するため、同じ値を再代入しても再実行されない。

```typescript
// アンチパターン: setSelectedArticleId(同じ id) では useEffect 再実行されない
function App() {
  const [selectedId, setSelectedId] = useState<string>("a");
  // ユーザーが「同じ記事の中央にスクロールし直し」したくても再実行されない
  return <List selectedId={selectedId} />;
}

// 修正パターン: increment-only な trigger counter を別 state で持つ
function App() {
  const [selectedId, setSelectedId] = useState<string>("a");
  const [anchorTrigger, setAnchorTrigger] = useState(0);
  const anchorListToSelected = useCallback(() => setAnchorTrigger((c) => c + 1), []);
  return <List selectedId={selectedId} anchorTrigger={anchorTrigger} />;
}

// 子側: trigger counter を ref に保存し、変化検知 + 通常の id 変化と区別
function List({ selectedId, anchorTrigger }: Props) {
  const prevRef = useRef<{ id: string | null; anchor: number | undefined }>({
    id: null,
    anchor: undefined,
  });
  useEffect(() => {
    const idChanged = selectedId !== prevRef.current.id;
    const isManualAnchor = anchorTrigger !== prevRef.current.anchor;
    if (!idChanged && !isManualAnchor) return;
    prevRef.current = { id: selectedId, anchor: anchorTrigger };
    // ↓ isManualAnchor フラグで通常選択 vs 手動アンカーの挙動を切り替える
    scrollToItem(selectedId, { force: isManualAnchor });
  }, [selectedId, anchorTrigger]);
}
```

**Why**: 同じ `selectedId` で再スクロールさせたい場合、`setSelectedId(同じ値)` では React が re-render を skip するため effect も発火しない。`anchorTrigger` のような **monotonic に増えるカウンタ** を別 state に持てば、increment のたびに必ず re-render + effect 再実行を引き起こせる。ref と組み合わせれば「id 変化なのか / trigger 変化なのか」を区別して挙動を切り替えられる (例: 通常選択は `align: "auto"`、手動 anchor は `align: "center"`)。

**How to apply**: 「同じ依存値でユーザー操作の都度 effect を再発火したい」要件を見つけたら:

1. **trigger counter state** を親に置く: `const [trigger, setTrigger] = useState(0);`
2. **increment コールバック** を提供: `const fire = useCallback(() => setTrigger((c) => c + 1), []);`
3. **子の useEffect の依存配列に trigger を追加** + `prevRef` で「同 trigger なら skip」「trigger 変化なら強制実行」を判定
4. **通常変化 vs 手動 trigger の挙動分岐** が必要なら `isManualTrigger` フラグで `align` / `behavior` などを切り替える

主な使用箇所: `App.tsx` の `anchorTrigger` ↔ `ArticleList.tsx` の scroll useEffect (#684 — `.` キーで選択中記事を中央アンカー)

### 派生ケース: ブラウザ API の「手動 cancel」と「自然完了」を物理的に区別する monotonic counter

`speechSynthesis.cancel()` (TTS 手動停止) と `utterance.onend` (TTS 自然完了) のように、**ブラウザ API には「手動 cancel パス」と「自然完了パス」が別の callback / event を持つ** ものが多い (Web Speech / WebSocket close / `<video>` `<audio>` end vs pause / `EventSource.close()` 等)。これらを **派生 boolean (= state 遷移)** で判定すると、両方のパスで同じ state 遷移 (`playing: true → false` 等) が起きて誤判定する。

```typescript
// アンチパターン: state 遷移ベースで「TTS 完了」を判定
useEffect(() => {
  if (prevPlayingRef.current && !ttsPlaying && !ttsPaused) {
    advanceToNextItem(); // ← cancel() でも発火してしまう!
  }
  prevPlayingRef.current = ttsPlaying;
}, [ttsPlaying, ttsPaused]);

// 修正パターン: 自然完了側のイベントだけを monotonic counter 化
// useSpeechSynthesis (engine 側):
const [endedCount, setEndedCount] = useState(0);
utterance.onend = () => setEndedCount((c) => c + 1); // 自然完了のみ increment
const stop = () => speechSynthesis.cancel(); // cancel は increment しない (onend 不発火)

// AutoReadController (consumer 側):
useEffect(() => {
  if (ttsEndedCount > prevEndedCountRef.current && !ttsPaused) {
    advanceToNextItem(); // 手動 cancel と確実に区別される
  }
  prevEndedCountRef.current = ttsEndedCount;
}, [ttsEndedCount, ttsPaused]);
```

**Why**: ブラウザ API の挙動規約として **「`cancel()` 系メソッドは自然完了イベントを発火させない」** ものが多数 (Web Speech / WebSocket / EventSource / fetch AbortController 等)。この規約を活用して **「自然完了イベントの発火回数」を monotonic counter で expose** すれば、`cancel()` がイベントを発火させない事実を利用して、手動停止と自然完了を **物理的に区別** できる。state 遷移 (`playing: true → false`) は両パスで同じため、派生 boolean ベースの判定は原理的に区別不可能。

**How to apply**: ブラウザネイティブ API のラッパー hook で「自然完了 → 何かを発火」したい要件を実装するとき:

1. **API の挙動規約を MDN で確認** — 「`cancel()` (or 同等の手動停止メソッド) は自然完了イベントを発火させるか?」を確認
2. **発火させない仕様** なら → **自然完了イベントだけで increment する monotonic counter** を hook の戻り値に追加 (例: `endedCount` / `closedCount` / `naturalEndCount`)
3. **発火させる仕様** なら → 別の判定軸が必要 (例: イベント payload の `wasClean` / `reason` フィールド、もしくは「直前に手動 stop を呼んだか」の ref フラグ)
4. **派生 boolean で判定したくなったら止まる** — `playing: true → false` のような遷移は手動 / 自然両方で起きるので、必ず「どちらの起源か」を識別できる field を別に持つ
5. **TDD** で「手動 cancel → counter 不変 → finished=false」「自然完了 → counter 増加 → finished=true」を network mock 不要の純粋関数として網羅可能

**該当する典型 API**:

| API                     | 手動 cancel メソッド          | 自然完了イベント                      | counter 化対象       |
| ----------------------- | ----------------------------- | ------------------------------------- | -------------------- |
| Web Speech API          | `speechSynthesis.cancel()`    | `utterance.onend`                     | endedCount           |
| WebSocket               | `ws.close()`                  | `onclose` (server 主導)               | (要 reason 判定)     |
| `<video>` / `<audio>`   | `pause()` / `currentTime = 0` | `ended` event                         | endedCount           |
| EventSource             | `es.close()`                  | (`onerror` で自然切断時 readyState=2) | (要 readyState 判定) |
| AbortController + fetch | `controller.abort()`          | resolve した promise                  | resolvedCount        |

**反例 (counter 化が不要なケース)**:

- 状態の **値そのものに意味がある** (例: form input の値、select の選択肢) → state 遷移ベースで OK
- 自然完了パスが存在しない、もしくは手動 cancel しか起きない単方向 API → counter 不要
- 手動 cancel と自然完了で **異なる UI 結果を期待する要件がない** (例: どちらでも「停止状態」表示で十分) → counter 不要 (派生 boolean で十分)

主な使用箇所: `useSpeechSynthesis` の `endedCount` ↔ `AutoReadController` の `prevEndedCountRef` (#716 — TTS 手動停止で勝手に次記事へ遷移するバグ修正)

## ref の論理リセットポイントを忘れない

「前 tick の値を保持する ref」（例: `prevPlayingRef`, `prevSelectedRef`, `lastFiredAtRef`）は、状態の **論理的なリセットポイント**で同期的にリセットしないと、次の cycle で誤判定の連鎖を起こす。

リセットポイントの典型:

- 選択対象（記事 / フィード / セッション）の切替
- モード（オートモード / フォーカスモード）の ON / OFF
- ユーザーログアウト

```typescript
// アンチパターン: ref はそのまま残るので、新記事で「前は再生中だった」と誤判定
useEffect(() => {
  // ... ttsPlaying の遷移を見て次記事へ進む
  prevPlayingRef.current = ttsPlaying;
}, [ttsPlaying, articleId]);

// 修正パターン: 切替時に ref をリセットする独立 effect を置く
useEffect(() => {
  prevPlayingRef.current = false;
}, [articleId]);
```

**Why**: ref をリセットしないと「前は再生中だった」が次記事に持ち越され、新記事 TTS 開始前の `ttsPlaying = false` で「完了」と誤判定 → 即次記事への連鎖遷移ループになる。

### 派生ケース: effect の二重発火を防ぐ「実行済み ID」ref

「現在対象 (articleId / sessionId) で副作用を **1 回だけ** 実行したい」effect は、依存配列の変動値（テキスト・派生 state など）で再発火しないように **実行済み ID** を ref で覚える。

```typescript
// アンチパターン: ttsText / processedContent が変化するたびに onSpeak が再呼ばれる
useEffect(() => {
  if (start) onSpeak(ttsText);
}, [ttsText, ttsPlaying /* ... */]);

// 修正パターン: 同 articleId で speak 済みなら早期 return + 切替時にリセット
const speakTriggeredRef = useRef<string | null>(null);
useEffect(() => {
  if (speakTriggeredRef.current === articleId) return;
  if (!start) return;
  speakTriggeredRef.current = articleId;
  onSpeak(ttsText);
}, [articleId, ttsText /* ... */]);

// articleId 切替時の独立 reset effect で speakTriggeredRef.current = null
```

**Why**: 二重防止 ref がないと TTS 完了で `ttsPlaying=false` に戻った瞬間に effect が再発火し、同記事を無限に再 speak するループが発生する。

**How to apply**: 「副作用が一度だけ走るべき」effect の依存配列に変動値が入っているなら、必ず ID ベースの `triggeredRef` で防護する。`fetchTriggeredRef` / `speakTriggeredRef` のように **「何 ID で何を実行したか」** を ref に持たせて、同 ID で再実行しないようにガードする。

## 大きいコンポーネントの機能別分割パターン

500 行を超えるコンポーネントは機能別にサブコンポーネントへ分離する。プロジェクトに繰り返し現れるパターン：

```
（分割前）大きいファイル
  Component.tsx (648 行: 10 機能集約 + Props 73 行)

（分割後）機能別ファイル
  Component.tsx              # オーケストレーター（薄い親、250 行）
  ComponentMeta.tsx          # メタ情報
  ComponentActionsA.tsx      # 機能 A
  ComponentActionsB.tsx      # 機能 B
  ComponentActionsC.tsx      # 機能 C
```

### 分割の指針

- **親（オーケストレーター）の責務**: Props 型定義、Context subscribe (`useToast` / `useReaderSettings` 等)、サブコンポーネントの合成
- **子（サブコンポーネント）の責務**: 受け取った props だけでレンダリング。Context は直接呼ばず、親からコールバック (`(msg) => toast.info(msg)` 等) を受け取る
- **既存 import パスを維持**: `Component.tsx` を空ファイルにせず、オーケストレーターとして残すことで呼び出し側の変更ゼロ
- **型の引き継ぎ**: `KeywordFilter | null` のような共有型はサブ Props でも正しく宣言する。`{ include: string[]; ... }` のような構造型に置き換えると親との互換性が壊れる

### プロジェクトでの使用箇所

- `ArticleListHeader` → `article-list-header/`（オーケストレーター + LayoutSwitcher / FilterPills 等）
- `useUIState` → 9 サブフック分割
- `useArticleViewState` → useArticleViewContent / useArticleViewTts / useArticleViewShortcuts / useArticleViewProgress に内部分離
- `ArticleHeader` → `ArticleHeaderMeta` / `ArticleHeaderAiTts` / `ArticleHeaderShare` / `ArticleHeaderEngagement`

### いつ分割しないか

- 共有 state（local useState）が密結合してサブで取り回しが面倒になるケースは、まず純粋関数化の余地を検討してから分割を進める
- 1 機能だけ抽出して残りが 400 行以下になるなら、分割するメリット < 移動コスト

### Step 内のさらなる最小スコープ化

大規模リファクタを Step 1 / Step 2 / Step 3 に分けても、各 Step 自体が大きい場合がある。**Step 内をさらに細分化して 1 PR を確実に通すパターン**:

```
Step 1: render 分岐の関数化
  ├─ 1-a: compact / list レイアウトのみ関数化 ← 最初の PR
  ├─ 1-b: card レイアウトを関数化            ← 次の PR
  ├─ 1-c: magazine レイアウトを関数化        ← 次の PR
  └─ 1-d: gallery レイアウトを関数化         ← 次の PR
```

**Why**: 一度に全レイアウトを関数化すると差分が大きく、レビュー困難・回帰リスク高。1 レイアウトずつ抽出すれば typecheck + e2e で確実に検証でき、問題があれば局所的にロールバック可能。

**How to apply**: Step を着手する前に「この Step で扱う対象を 1 つに絞れるか」を判断する。1〜3 個に絞れる場合は最も独立性が高い 1 個から開始し、別 PR に分けて進める。

### 派生ケース: 巨大コンポーネントの hook 抽出は 1 hook ずつ別 commit で進める

App.tsx / 巨大ページコンポーネントから複数の `useEffect` / `useState` / `useCallback` を切り出すリファクタは、**1 hook ずつ別 commit** で進める。8 個まとめて抽出して 1 commit にまとめると、回帰の切り分け不能 + レビュー困難になる。

```
リファクタ: App.tsx 段階分割
  ├─ Step 1a: useArticleSelection 抽出   ← typecheck + e2e 通過 → commit
  ├─ Step 1b: useSaveArticleUrl 抽出     ← typecheck + e2e 通過 → commit
  ├─ Step 1c: useSnoozeHandler 抽出      ← typecheck + e2e 通過 → commit
  └─ ... (1 hook ごとに小 commit を積む)
```

抽出候補の優先順位:

1. **State + Effect が 1 セット** で外部依存が少ないもの (例: `document.title` 更新 effect) — 純粋にコピペで切り出せる
2. **既存 hook で完結する handler** (例: トースト表示・URL POST) — Props 経由で依存注入すれば切り離せる
3. **早期 return パス** (loading / unauthenticated) — コンポーネント or 関数として抽出。ただし「TypeScript narrowing が失われる」罠 (本ファイル別節) に注意
4. **関連する複数の useState を集約した hook** (例: `useAppModalState` で 3 つのモーダル state + キーボードショートカット) — まとめて抽出した方がカプセル化が綺麗

**Why**: 1 hook ずつ commit すれば、後で `git bisect` でバグ commit を 1 hook 単位に絞り込める。8 hook 一括 commit だと「どの抽出で挙動が変わったか」を再調査する手間が爆発する。各 commit で typecheck + e2e を通すと「この hook 抽出時点では動いていた」が確定するため、心理的負担も減る。

**How to apply**: 巨大コンポーネントから抽出する hook を最初に箇条書きで列挙 (4〜10 個程度) → 上記優先順位で 1 個ずつ抽出 → 各 commit で `pnpm run typecheck` 通過を確認 → 8 個程度溜まったら master へ no-ff merge して 1 ブランチを完了させる。

### 派生ケース: 同じ意味のインライン lambda が複数箇所に散在 → 既存 hook 内の useCallback に集約

巨大コンポーネントから state hook (`useFeedSelection` / `useReadState` 等) の戻り値 setter を取り出して **複数箇所でインライン lambda として** 同じ操作を組み立てているケース:

```typescript
// アンチパターン: 同じ「フィード切替時に記事もクリア」が 2 箇所に散在
function App() {
  const { setSelectedFeedId, setSelectedGroupId, setSelectedArticle } = useFeedSelection(...);

  // 場所 1: useFeedSidebarActions に渡す
  const sidebarActions = useFeedSidebarActions({
    setSelectedFeedIdNull: () => {
      setSelectedFeedId(null);
      setSelectedGroupId(null);
      setSelectedArticle(null);
    },
    // ...
  });

  // 場所 2: useKeyboardNav に渡す
  useKeyboardNav({
    onSelectFeed: (id) => {
      setSelectedFeedId(id);
      setSelectedArticle(null);
    },
    // ...
  });
}
```

これは **state hook 自体に「複合操作」名を持つ useCallback を追加** して 1 箇所に集約する:

```typescript
// 修正パターン: useFeedSelection 内に useCallback で公開
export function useFeedSelection(...) {
  const [selectedFeedId, setSelectedFeedId] = useState(null);
  // ... 他 state

  const selectFeedClearingArticle = useCallback((id: string | null) => {
    setSelectedFeedId(id);
    setSelectedArticle(null);
  }, []);

  const clearFeedGroupArticleSelection = useCallback(() => {
    setSelectedFeedId(null);
    setSelectedGroupId(null);
    setSelectedArticle(null);
  }, []);

  return {
    selectedFeedId, setSelectedFeedId,
    // ...
    selectFeedClearingArticle,        // ← 公開
    clearFeedGroupArticleSelection,   // ← 公開
  };
}

// App.tsx 側
function App() {
  const { selectFeedClearingArticle, clearFeedGroupArticleSelection } = useFeedSelection(...);

  const sidebarActions = useFeedSidebarActions({
    setSelectedFeedIdNull: clearFeedGroupArticleSelection, // ← 1 行
    // ...
  });

  useKeyboardNav({
    onSelectFeed: selectFeedClearingArticle, // ← 1 行
    // ...
  });
}
```

**Why**:

1. **アトミック性が名前で表現される**: `selectFeedClearingArticle` の名前から「フィード選択 + 記事クリア」が 1 つの不可分操作と読める。インライン lambda だと「複数 setter の集まり」にしか見えない
2. **2 箇所のインライン lambda が乖離するリスクを排除**: 一方が「`setSelectedGroupId(null)` も追加」と修正されたとき、他方が古いままになる drift を物理的に防ぐ
3. **render-stability 向上**: `useCallback` 化で reference 不変になり、子コンポーネント (例: `useFeedSidebarActions` の `useMemo` deps) の不要な再計算を抑制できる
4. **state hook の責務が明確化**: 「state を持つ」だけでなく「state に対するアトミック操作を提供する」役割が明示される

**How to apply**: 巨大コンポーネントから抽出済の state hook (`useXxxxxxx`) を見たら、**そこから取り出した setter を複数箇所でインライン lambda として組み合わせている箇所** を grep で探す:

1. `set<HookState>` setter を grep して使用箇所を列挙
2. 同じ複数 setter を **同じ順序** で呼ぶ lambda が 2 箇所以上あれば集約候補
3. その lambda の意図を表す **名前** を考える (例: `selectFeedClearingArticle` / `clearFeedGroupArticleSelection`)
4. state hook 内に `useCallback` で追加 → consumer 側を 1 行に簡素化
5. **deps 配列は空 `[]`**: setter は `useState` の戻り値で identity 不変なので deps 不要

主な使用箇所: `useFeedSelection` の `selectFeedClearingArticle` / `clearFeedGroupArticleSelection` (App.tsx Step 1n) — 元々 `setSelectedFeedIdNull: () => {...}` と `onSelectFeed: (id) => {...}` の 2 インライン lambda が散在していた

### 派生ケース: 同形 JSX ラッパーが 3 回以上重複 → ポリモーフィック `as` props 付きラッパーコンポーネント化

App.tsx / レイアウトコンポーネントで、**同形の wrapper JSX** (`<div data-X className="..." style={{...}} aria-X inert ...>...</div>`) が **同じ props pattern + 微妙に異なる属性値** で 3 回以上繰り返されているケース。

```tsx
// アンチパターン: 3 ペインそれぞれに 6 行のラッパーが重複
<div
  data-pane="sidebar"
  className="absolute inset-0 ... mobile-pane"
  style={{ transform: getMobilePaneTransform("sidebar", mobilePane) }}
  aria-hidden={(!isDesktop && mobilePane !== "sidebar") || undefined}
  inert={(!isDesktop && mobilePane !== "sidebar") || undefined}
>...</div>
<div data-pane="list" /* 同パターン */>...</div>
<main data-pane="view" /* 同パターン (要素タイプだけ違う) */>...</main>

// 修正パターン: ラッパーコンポーネントに集約 + as prop で要素タイプ切替
<MobilePane pane="sidebar" currentPane={mobilePane} isDesktop={isDesktop}>...</MobilePane>
<MobilePane pane="list" currentPane={mobilePane} isDesktop={isDesktop} id="main-content" tabIndex={-1}>...</MobilePane>
<MobilePane pane="view" currentPane={mobilePane} isDesktop={isDesktop} as="main">...</MobilePane>
```

**Why**:

1. **属性派生ロジック (例: `aria-hidden` / `inert` の同期) を 1 箇所に閉じ込める**: 「PC 時は無効」のような条件が散在すると、片方だけ条件追加されてアクセシビリティが壊れるリスク
2. **新ペイン追加時のコピペミス防止**: コピペで一部属性を書き換え忘れる事故を物理的に防ぐ
3. **要素タイプの差異** (`<div>` vs `<main>`) は `as: ElementType` props で吸収すれば 1 コンポーネントで対応可能

**How to apply**: 同形 wrapper JSX を見たら以下を判定:

1. **同形 JSX が 3 回以上** あるか (2 回程度は重複の判断微妙)
2. **属性値の差異が「派生可能」** か (例: `data-pane="sidebar"` の `"sidebar"` だけ違う = props で渡せる / 完全に違う style = 集約困難)
3. **要素タイプの違い** は `as: ElementType = "div"` の polymorphic component pattern で吸収
4. ラッパーコンポーネントの位置: `src/components/<Wrapper>.tsx` (汎用なら) / `src/components/<feature>/<Wrapper>.tsx` (機能限定なら)
5. **JSDoc に「集約した属性派生ロジック」を明示**: 後の開発者が「なぜラッパー化したか」を理解できる

主な使用箇所: `MobilePane` (App.tsx Step 1o) — 元々 sidebar / list / view 3 ペインに 6 行ラッパーが重複、`aria-hidden` / `inert` の PC 無効化ロジックを集約

### 派生ケース: 子コンポーネントの 30+ props 一括 forwarding は `ComponentProps<typeof Child>` 型継承で受ける

巨大コンポーネントから「子コンポーネント (例: `<ArticleList>`) を ErrorBoundary や Skeleton 分岐と一緒に包んだ薄いラッパー (例: `<AppListPane>`)」を抽出するとき、子コンポーネントが **30+ props を取る** 場合がある。このとき **props を 1 つずつ手動で再宣言すると drift しやすい** (子の props が増えたら親も毎回追従修正が必要)。

```tsx
// アンチパターン: ArticleList の Props を手動で再宣言 → 子の prop 追加で 2 箇所同期更新
interface AppListPaneProps {
  feeds: Feed[];
  readIds: Set<string>;
  // ... 30 行の prop 宣言
  duplicateInfo?: Map<string, string[]>;
  anchorTrigger?: number;
  // ↑ ArticleList の Props と完全同期しなければならない
  loadingFeeds: boolean;
  feedsEmpty: boolean;
  mobilePane: MobilePaneId;
  isDesktop: boolean;
}
export function AppListPane({ feeds, readIds, /* 30 props 個別 */, ... }) {
  return <ArticleList feeds={feeds} readIds={readIds} /* 30 props 個別 */ />;
}

// 修正パターン: ComponentProps<typeof Child> で型継承 + spread 渡し
interface AppListPaneProps {
  // 親独自の状態だけ宣言
  mobilePane: MobilePaneId;
  isDesktop: boolean;
  loadingFeeds: boolean;
  feedsEmpty: boolean;
  /** 子コンポーネントに丸ごと渡す props */
  articleListProps: ComponentProps<typeof ArticleList>;
}
export function AppListPane({ articleListProps, ... }) {
  return <ArticleList {...articleListProps} />;
}
```

**Why**:

1. **drift 防止**: `ComponentProps<typeof ArticleList>` は子コンポーネントの Props 型を **TypeScript が自動継承** するので、ArticleList の Props 追加・削除に親が自動追従する
2. **親の責務が明示**: 親独自の状態 (`mobilePane` / `isDesktop` / `loadingFeeds`) と「子に転送するだけ」の状態 (`articleListProps`) が型レベルで分離される
3. **テスト時の mock が容易**: `articleListProps` を 1 つの object として渡せば良いので、テストで 30 props を個別に与える必要がない

**How to apply**: 「子コンポーネントを薄く包むラッパー」を新設するとき:

1. 子コンポーネントの Props を **個別宣言しない** — 必ず `ComponentProps<typeof Child>` で受ける
2. 親独自の追加 props (loading 状態 / レイアウト制御等) は `interface` の別フィールドとして宣言
3. JSX で **spread 渡し** (`<Child {...articleListProps} />`) で全 props を転送
4. 子コンポーネントが `Props` interface を export していなくても `ComponentProps` は使える (型推論ベース)
5. ラッパーが特殊属性 (例: MobilePane の `id="main-content"` / `tabIndex={-1}`) を持つなら、それは親の責務として `ComponentProps` 外で固定

主な使用箇所: `AppListPane` (Step 1p) / `AppViewPane` (Step 1q) — `articleListProps: ComponentProps<typeof ArticleList>` / `articleViewProps: ComponentProps<typeof ArticleView>` で 29+30 props を 1 オブジェクトで継承

### 派生ケース: 行数削減ゼロでも「対称性」のための extraction は採用する判断軸

JSX 抽出で **行数が変わらない (or 増える)** ケースでも、以下の条件が揃えば extraction の価値あり:

- **同列の sibling 概念** が 2 つ以上 (例: 3 ペインの sidebar/list/view、4 つの dialog)
- **片方だけ抽出済** で他方がインラインのまま → 「視覚的不整合 + 認知負荷」
- 将来も sibling として並列に扱う見込み (機能拡張で同パターンが増える)

```tsx
// アンチパターン: AppListPane だけ抽出 → AppViewPane (5 行) は inline のまま
<AppListPane mobilePane={...} isDesktop={...} loadingFeeds={...} ... />
<MobilePane pane="view" currentPane={mobilePane} isDesktop={isDesktop} as="main">
  <ErrorBoundary label="記事表示">
    <ArticleView {...articleViewProps} />
  </ErrorBoundary>
</MobilePane>
// → 「なぜ list だけ component で view は inline なのか?」が読み手に問いを生む

// 修正パターン: 両方 component 化して symmetric に
<AppListPane mobilePane={...} isDesktop={...} loadingFeeds={...} ... />
<AppViewPane mobilePane={...} isDesktop={...} articleViewProps={...} />
```

**Why**:

1. **認知一貫性**: 「sidebar / list / view が同じパターンで書かれている」は読み手にとって理解負荷が低い。片方だけ inline だと「なぜ?」と立ち止まらせる
2. **将来の拡張に強い**: 例えば 4 ペイン目を追加したくなったとき、symmetric な構造なら新コンポーネントを 1 つ作るだけで済む
3. **Provider / Boundary 配置の一元化**: ErrorBoundary / Skeleton / Provider のラップは「ペインの責務」として閉じ込められる
4. **行数削減を絶対視しない**: コード品質 != 行数。symmetry / cohesion が高いほど保守性向上
5. **transitive cleanup の機会を逃さない**: 全 sibling を抽出しきると、親で使われていた「子 sibling 共通の依存」(import / hook / wrapper component) が **不要になって一括削除可能** になる。例: `AppSidebarPane` / `AppListPane` / `AppViewPane` を全部抽出した時点で、親から `FeedSidebar` / `ArticleList` / `ArticleView` / `ErrorBoundary` / `MobilePane` / `Skeleton*` のインポートが **5 個以上一括削除** できた

**How to apply**: extraction 判定で「行数が増えるからやめる」と即決しない:

1. **sibling 概念の数を数える** — 2 つなら微妙、3 つ以上なら強い動機
2. **既に sibling の片方が抽出済** か — Yes なら symmetry のため抽出推奨
3. **将来も sibling として並列扱いか** — Yes なら抽出
4. 上記が複数 Yes なら **行数増減無視で extraction OK**。コミットメッセージに「symmetry のための extraction」を明記して将来の AI/開発者の判断材料にする
5. JSDoc に「対称となる sibling コンポーネント」をリンクで明示 (例: `AppListPane と対称な薄いラッパー`)
6. **「2/3 終わったから残り 1 個もやる」と最初から計画**: 全 sibling を抽出しきって初めて transitive cleanup (上記 Why#5) が発火する。中途半端に終わらせると最大の利得を取りこぼす

主な使用箇所: `AppViewPane` (Step 1q) — `AppListPane` (Step 1p) との symmetry のため、行数削減ゼロでも extraction を採用 / `AppSidebarPane` (Step 1r) — 3 ペイン全 extraction 完了で親から 5 imports を一括削除

### 派生ケース: 「カテゴリで括れる異種 JSX 群」は category-bucket 集約コンポーネントに

巨大コンポーネントの JSX に **異なる責務だが同じ category に属する小さな JSX が複数並ぶ** ケース (例: 「overlays / banners / floating chrome」「forms 群」「dashboard widgets」)。個別に extract するほど大きくなく、symmetry もない (各々違う props を取る) が、**「親の責務から離す」価値はある**。

```tsx
// アンチパターン: 11 個の異種 overlay JSX が親に並んでいる
function App() {
  return (
    <ThreePaneLayout>
      <A11yHelpers announcement={articleAnnouncement} />
      <OfflineBanner isOnline={isOnline} hasPendingChanges={hasPendingChanges} />
      <ToastContainer />
      <ConfirmModal {...confirmModalProps} />
      <AppModals { /* 17 props */ } />
      {showNSFWAnimation && <NSFWEyeAnimation onComplete={...} />}
      <NewArticleBanner { /* 4 props */ } />
      <FocusModeExitButton { /* 2 props */ } />
      <FocusModeOverlay { /* 3 props */ } />
      <ArticleDetailOverlay { /* 3 props */ } />
      <ColumnResizeHandles { /* 6 props */ } />
      {/* ... 3 panes */}
    </ThreePaneLayout>
  );
}
// → 親が「3 panes + 11 overlays」を抱えて JSX が縦に長い
//   各 overlay は個別に extract するほど大きくない (3-5 props) が、
//   並べると「概念のごちゃ混ぜ」感がある

// 修正パターン: category-bucket コンポーネントに集約
function App() {
  return (
    <ThreePaneLayout>
      <AppOverlays
        articleAnnouncement={articleAnnouncement}
        isOnline={isOnline}
        hasPendingChanges={hasPendingChanges}
        confirmModalProps={confirmModalProps}
        appModalsProps={{ /* 17 props まとめ */ }}
        // ... 残り
      />
      {/* 3 panes */}
    </ThreePaneLayout>
  );
}
```

**Why**:

1. **親の責務を「3 panes 構造の組み立て」だけに絞れる** — overlay の追加・削除で親の JSX が肥大化しなくなる
2. **category 内の cohesion 向上** — 「floating chrome を追加したい」要望が来たとき、AppOverlays 1 ファイルだけ修正すれば済む
3. **import の transitive cleanup** — 11 個の overlay コンポーネントが親で不要になるので、まとめてインポート削除可能 (#650 Step 1s 実例で 11 imports 削除)
4. **集約コンポーネント自身は state を持たない pure pass-through** で良い — 状態管理は親に残るので bug surface は変わらない

**How to apply**: 異種 JSX の集約候補を判定:

1. **同じ category** に属するか (例: 「overlay」「dashboard widget」「dialog 群」) — Yes が前提
2. **3 個以上** の JSX が並んでいるか (2 個以下なら個別の方が読みやすい)
3. **個別 extract するほど大きくない** か (3-10 props 程度の小さい単位)
4. 上記 3 つ Yes なら **category-bucket コンポーネント** (`<AppOverlays>` / `<DashboardWidgets>` 等) を作る:
   - 各 JSX 子の props は **flat prop** で受ける (15+ props) or **nested object** (例: `appModalsProps: ComponentProps<typeof AppModals>`) で受ける
   - 集約コンポーネント自身は **状態を持たず pure pass-through**
   - 親の JSX が「カテゴリ単位の 1 行」になることを目標にする

**反例 (やらない方が良いケース)**:

- 1 個か 2 個しか並んでいない → bucket 化のオーバーヘッドが純益を上回る
- 異なる category が混ざっている (「overlay とか settings panel とか」) → 中途半端な集約になる
- 親の状態 (state hook) が大量に必要 → bucket 化しても prop drilling が酷くなるだけ

主な使用箇所: `AppOverlays` (Step 1s) — 11 個の overlay/modal/banner/handles を集約、親 (App.tsx) を「`<ThreePaneLayout>` → `<AppOverlays>` → 3 panes」の 5 行構造に簡素化

### 派生ケース: 新機能は「Phase 1: 純粋関数 + TDD」「Phase 2: UI 統合」で分離する

`splitIntoSentences` / `selectActiveCharIndex` / `findSentenceAtCharIndex` のような **データ変換・状態判定ロジック** を含む機能は、UI 統合と切り離して **Phase 1 で純粋関数 + TDD だけ commit** する。Phase 2 で React hook + DOM 操作 + CSS を統合する。

```
新機能: TTS 読み上げハイライト
  ├─ Phase 1: 純粋関数 + TDD 全分岐網羅 + speak() callback 拡張    ← 1 PR (testable / shippable)
  └─ Phase 2: useTtsHighlight hook + DOM span ラップ + scroll 追従 + 設定 UI ← 別 Issue / 別 PR
```

**Why**: 純粋関数だけなら TDD で全分岐網羅できて高信頼で commit 可能。UI 統合は React state / DOM 副作用が絡んで複雑なので別フェーズに分けると、Phase 1 のロジックを既に検証済みの土台として Phase 2 を組み立てられる。「Phase 1 が動かない」という不確実性を最初に潰せる。

**How to apply**: 大きな新機能 Issue を見たとき、まず実装計画を「データ変換層 (純粋関数)」と「副作用層 (UI / DOM / async)」に分ける:

1. データ変換層を `src/lib/<feature>.ts` に切り出し可能か判断
2. 可能なら Phase 1 として純粋関数 + TDD を 1 PR で完結
3. Phase 2 として UI 統合を **別 Issue 起票** (Phase 1 の commit hash を参照ピン)
4. 元 Issue には「Phase 1 完了」コメント + Phase 2 Issue 番号を記載

実例:

- `selectGalleryImages` (#671) — Phase 単独で UI 統合まで含めた小規模ケース
- `splitIntoSentences` / `selectActiveCharIndex` (#659 Phase 1 / #672 Phase 2) — Phase 分離の典型

### 派生ケース: 既存実装の差し替え基盤は「Phase 0: 型抽象化のみ」を先行する

既存の動く実装に **代替実装** を後から差し込みたい場合 (Web Speech API → Piper wasm 等)、いきなり大きな書き換えに着手せず **「Phase 0: 型契約だけ抽象化」を最初の commit にする**。実装のロジックは一切変えない。

```
リファクタ: TTS engine 抽象化
  ├─ Phase 0: TtsAdapter / TtsVoice 型 + 既存実装を型に合わせる    ← 1 PR (挙動変化なし)
  ├─ Phase 1b: voice 選択 UI を抽象 API 経由に切替 + 設定モーダル化  ← 別 PR
  └─ Phase 2: 代替実装 (Piper wasm) を usePiperTts として追加      ← 別 Issue
```

**Phase 0 の責務 (型のみ)**:

1. `src/lib/<feature>-adapter.ts` に **engine 共通インターフェース** を定義 (例: `interface TtsAdapter`)
2. **既存実装を型契約に合わせる** (戻り値型を `TtsAdapter` 明示、内部で API 固有型 → 抽象型へ map)
3. consumer の prop / state 型を **抽象型に置き換え** (例: `SpeechSynthesisVoice[]` → `TtsVoice[]`)
4. **TDD**: 抽象型契約のスモーク (dummy 実装が型を満たす) + 既存純粋関数との互換 (例: `selectTtsVoice<TtsVoice>` がそのまま動く) + 変換ヘルパー (例: `speechSynthesisVoiceToTtsVoice` の field 取捨選択) を網羅

**Phase 0 がやらないこと**:

- 実装の差し替え (DI / Provider / Context は Phase 1b へ)
- 設定 UI の追加 (Phase 1b へ)
- 代替実装の追加 (Phase 2 へ)

**Why**: 既存実装の書き換えと代替実装追加を一度にやると、変更原因と挙動変化の対応が追えなくなる。Phase 0 を「ユーザー視点で挙動変化なし」に保つと、もし代替実装で問題が出ても Phase 0 commit までは確実に safe な state として bisect / revert 可能。型契約だけ先に確定すれば Phase 1b / 2 は **「型を満たす実装を書く」** 単純な責務に絞れる。

**How to apply**: 既存実装に代替実装を差し込む大型リファクタ要望 (Issue: 「ライブラリ差し替え」「engine 抽象化」「Provider DI 化」等) を見たとき:

1. 最初の commit を **「型契約 + 既存実装を契約準拠化」** に絞る (実装は touch しない)
2. consumer 側の固有型参照 (`SpeechSynthesisVoice` / `WebSocket` / `Stripe.Subscription` 等) を grep し、**全件抽象型 (`TtsVoice` / `WsLike` / `Subscription`) に置き換える**
3. 抽象型側にヘルパー (`<source>To<abstract>(v)` 関数) を提供し、テストで「不要 field の取捨選択」を assert
4. consumer 側の挙動が一切変わらないことを typecheck + 既存 e2e で確認してから commit
5. Phase 1b 以降を別 Issue 起票して、Phase 0 commit hash をピン留め

主な使用箇所: `src/lib/tts-adapter.ts` (#675 Phase 1a) — Web Speech API → Piper wasm 差し替えの基盤

### 派生ケース: 機能別分割後の「逆方向の集約」(共通 wrapper 抽出) も忘れない

「大きいコンポーネントを機能別に分割」したあと、**サブコンポーネント間に同じ wrapper / 同じ前処理が重複** することがある。これは「分割した結果、本来 1 箇所だった共通部分が複製された」逆向きの問題。分割完了で満足せず、サブコンポーネント完成後にもう一度 **共通部分を抜き出して helper 化** する第 2 段階を意識する。

```
段階 1: 1000 行モノリシック ArticleList
  ↓ 機能別分割
段階 2: CompactListBody / CardBody / MagazineBody / GalleryBody (各 100-200 行)
  ↓ ⚠️ ここで止めると同じ virtualizer wrapper が 3 ファイルに重複
段階 3: VirtualRow ヘルパー抽出 (絶対配置 div + transition を集約)
```

判定:

- サブコンポーネント間で **5 行以上の同一 JSX ブロック** が発見されたら helper 候補
- ただし「**たまたま似ているだけ**」なら集約しない (将来の分岐で乖離する可能性)
- 同じ「**意図** (例: virtualizer item を絶対配置)」を表現しているなら集約適格

実装パターン:

1. ヘルパー名は **何の責務か** を明示 (`VirtualRow` ✅ / `Wrapper` ❌)
2. props 設計で **個別バリエーション** に対応 (`extraStyle?: CSSProperties` で CardBody の padding など)
3. 「閉じた抽象」にする (内部の動作詳細は隠蔽、必要に応じて props で漏らす)
4. テストなし: 純粋抽出は挙動変化なし、`typecheck` + 既存 e2e で OK

**Why**: 機能別分割は「1000 行 → 200 行 × 5 ファイル」を達成して満足しがち。だが本当の保守性は「**各サブコンポーネントが個別に完結している** + **共通部分は 1 箇所にまとまっている**」両方が必要。前者だけだと「virtualizer 挙動を変えるとき 3 ファイル同期修正が要る」状態が残る。

**How to apply**: 機能別分割が落ち着いたら、サブコンポーネント間で `git diff` 風の比較を行って **「ほぼ同一の 5 行以上のブロック」** がないか確認する。simplify 監査エージェントに「similar sub-components の重複」を観点として渡すと自動検出可能。

主な使用箇所: `VirtualRow` (#692 — `article-list-body/` の 3 サブコンポーネントから virtualizer item wrapper を集約)

## React Context パターン (`src/contexts/`)

コンポーネントツリーの深い階層に props を渡す（prop drilling）代わりに、React Context を使用する。
Context ファイルは `src/contexts/` に配置し、`createContext` + Provider + `useXxx` カスタムフックをセットで提供する。

```typescript
// src/contexts/ToastContext.tsx
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ value, children }: ProviderProps) {
  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

主な使用箇所:

- `SelectedArticleContext` — 選択記事 ID（ArticleItem の不要な re-render 回避）
- `ArticleFilterContext` — 記事フィルター状態の共有
- `ReaderSettingsContext` — リーダー表示設定（フォントサイズ・行間・テーマ等）
- `ToastContext` — トースト通知 API のグローバル提供
- `TtsAdapterContext` — TTS engine adapter（記事ヘッダー TTS と設定モーダル voice 選択で同一インスタンスを共有）

### 派生ケース: 「内部 state を持つ hook」を複数 consumer で共有したいときは Provider 化必須

`useState` / `useRef` を内包する hook (例: `useSpeechSynthesis` の `isPlaying` / `voiceUri`) を **複数の異なる箇所で別々に呼ぶと別インスタンスになる** ため、state 共有が崩れる。「同じ adapter / 同じ state を複数 consumer で共有したい」要件が出たら、必ず Provider 化する。

```typescript
// アンチパターン: 各 consumer で個別に呼ぶ → state が分裂
function ArticleHeader() {
  const { isPlaying, voiceUri } = useSpeechSynthesis(); // インスタンス A
}
function SettingsModal() {
  const { voiceUri, setVoiceUri } = useSpeechSynthesis(); // インスタンス B
  // → SettingsModal の voice 変更が ArticleHeader に伝わらない
}

// 修正パターン: App level で 1 度だけ呼んで Provider に注入
function App() {
  const ttsAdapter = useSpeechSynthesis(); // 単一インスタンス
  return (
    <TtsAdapterProvider value={ttsAdapter}>
      <ArticleHeader /> {/* useTtsAdapter() でアクセス */}
      <SettingsModal /> {/* useTtsAdapter() でアクセス — 同一 state */}
    </TtsAdapterProvider>
  );
}
```

**Why**: `useState` / `useRef` ベースの hook は呼び出すたびに新しい state slot を React が作る。複数箇所で呼ぶと state 同期が取れず、片方の更新が他方に反映されないバグになる。プロジェクトの典型は「ある UI を別 UI に移動したい」とき: 元の場所だけで使われていた hook を、新しい場所からも参照させると state 分裂が起きる。

**How to apply**: 既存 hook の使用箇所を増やしたいときは:

1. **既存呼び出し箇所が 1 ヶ所か** を grep で確認 (`useXxx` で全件検索)
2. 1 ヶ所なら → 新規呼び出し側に追加するのではなく、**Provider 化** + 既存呼び出しも context に移行
3. 既に複数箇所なら → そもそも state 分裂バグが潜んでいる可能性あり、調査要
4. App.tsx の Provider 階層に追加するときは **JSX 開閉タグの indent 整合** を check:fix で必ず通す (Provider を 1 段増やすと内側全部の indent が +2 ずれる)

主な使用箇所: `TtsAdapterContext` (#675 Phase 1b — `useSpeechSynthesis` を App.tsx で 1 回だけ呼んで記事ヘッダー / 設定モーダル両方で共有)

## 早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる

巨大コンポーネントの「ロード中 / エラー / 未認証」のような **早期 return パス** をサブコンポーネントや関数に切り出すと、後続のコードで TypeScript narrowing が失われる。呼び出し側で `null` 戻り値を early-return する形に書き換えても、TS の制御フロー解析は呼び出し先関数の戻り値を追跡できないため。

```tsx
// アンチパターン: 切り出し後 TS が user の non-null narrowing を失う
function AppLandingState({ user, betaRestricted }: Props) {
  if (user === undefined) return <Loading />;
  if (betaRestricted) return <BetaPage />;
  if (!user) return <LandingPage />;
  return null;
}

function App() {
  const { user, betaRestricted } = useAuth();
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  // ↓ ここで user は依然 UserProfile | null | undefined のまま
  return <MainUI userId={user.id} />; // TS2322: undefined / null を assign できない
}

// 修正パターン: landingNode 後に narrowing を再現する明示的なガードを置く
function App() {
  const { user, betaRestricted } = useAuth();
  const landingNode = AppLandingState({ user, betaRestricted });
  if (landingNode) return landingNode;
  if (!user) return null; // ← TS narrowing を再導入 (実行時に到達しないが型のために必要)
  return <MainUI userId={user.id} />; // OK: user は UserProfile に絞り込まれた
}
```

**Why**: TypeScript の制御フロー解析は呼び出した関数の **戻り値が non-null かどうか** で呼び出し元の変数を絞り込めない。早期 return を関数に切り出した場合、呼び出し元では「landingNode が null でなければ既に return している」だけしか TS には伝わらず、元の `if (user === undefined) return ...` で得られていた `user: UserProfile` への narrowing は復元されない。

**How to apply**: 早期 return パスをコンポーネント / 関数に切り出すときは、

1. 切り出し前に「**この early-return が narrow していた変数は何か**」を確認する (例: `user`)
2. 切り出し後、呼び出し元に `if (!targetVar) return null;` のような **TS narrowing 用の明示ガード** を追加する (実行時には早期 return パスで既に弾かれているため到達しないが、型のためだけに残す)
3. ガード行には `// TS narrowing 用` のような短いコメントを添えて、実行時には冗長に見える理由を明示する

主な使用箇所: `src/components/AppLandingState.tsx` (オーケストレーター呼び出し側で `if (!user) return null;` ガードを併記)

### 派生ケース: 戻り値型を **discriminated union** にすれば呼び出し元で narrowing が効く

「早期 return ガード関数」(例: `assertFeedSubscribed(r2, userId, feedHash)`) を抽出するとき、**戻り値型を discriminated union にすると呼び出し元で TypeScript narrowing が効く**。`!` (non-null assertion) や別行ガード を書かずに済む。

```typescript
// アンチパターン: { sub: T | undefined, err: NextResponse | null } の plain object
async function assertFeedSubscribed(...) {
  const sub = subs.find(...);
  if (!sub) return { subs, sub: undefined, err: apiError(...) };
  return { subs, sub, err: null };
}
// 呼び出し側:
const { sub, err } = await assertFeedSubscribed(...);
if (err) return err;
sub.requestCookie; // ← TS error: sub は UserSubscription | undefined のまま
sub!.requestCookie; // ← `!` で誤魔化す or `if (!sub) return null;` を別途書く

// 修正パターン: discriminated union 戻り値
type FeedSubscribedResult =
  | { subs: UserSubscription[]; sub: UserSubscription; err: null }
  | { subs: UserSubscription[]; sub: undefined; err: NextResponse };

async function assertFeedSubscribed(...): Promise<FeedSubscribedResult> { /* same impl */ }

// 呼び出し側:
const guard = await assertFeedSubscribed(...);
if (guard.err) return guard.err; // ← TS narrowing: guard が { sub: UserSubscription; err: null } に絞られる
const { sub } = guard;            // ← sub: UserSubscription (non-null narrowed)
sub.requestCookie;                // ← `!` 不要
```

**Why**: TypeScript の制御フロー解析は **discriminator field** (本例の `err`) で union を絞り込む。`if (guard.err) return guard.err;` の後、`guard.err === null` が確定するため、union のうち `sub: UserSubscription` の枝に narrowed される。plain object ベースだと `err === null` と `sub !== undefined` の関係を TS が知らないので narrowing できず、`!` で誤魔化す醜いコードになる。

**How to apply**: 「早期 return + 抽出データ返却」型の helper を書くとき:

1. 戻り値を **plain object でなく discriminated union** にする
2. **discriminator field** を 1 つ選ぶ (本例の `err`、または `ok: true | false` も慣用)
3. 各 union メンバーで「err = null のとき他フィールドは確実に存在」を **型レベルで保証** する
4. 呼び出し側は `if (guard.err) return guard.err;` (TS narrowing が走る) → 以降 `!` 不要
5. helper の jsdoc に **typing の意図** (「`err === null` なら他フィールド non-null」) を必ず明記
6. 旧 plain object 戻り値の helper があれば段階的に discriminated union へ置き換える

主な使用箇所: `src/lib/api-feed-guard.ts#FeedSubscribedResult` — `feeds/[id]/{,refresh,reinfer,purge-content-cache}` の subscription guard で `sub: UserSubscription` を `!` なしで取得

## 子コンポーネントの「自己判断で hidden になる UI」は親で「全件 hidden」を検知して fallback する

子コンポーネントが「自分の都合 (画像が小さすぎる・コンテンツが空・条件不一致など) で `null` を返す」設計のとき、**親はその事実を知らない**ため、全子が `null` を返した結果 **UI が空っぽ** になる症状が発生する。

```tsx
// アンチパターン: FilterableGalleryImage が単独で hidden 判定して null
function FilterableGalleryImage({ src, minPx }) {
  const [hidden, setHidden] = useState(false);
  const onLoad = (e) => {
    if (e.currentTarget.naturalWidth < minPx) setHidden(true);
  };
  if (hidden) return null;
  return <img src={src} onLoad={onLoad} />;
}

// 親: imageSource === "prefetched" → No Image プレースホルダ条件に該当しない
// → 全子 null だと「空コンテナ + タイトルだけ表示」状態に
{imageSource !== "none" ? (
  <div>
    {images.map((src) => <FilterableGalleryImage src={src} minPx={...} />)}
  </div>
) : (
  <NoImagePlaceholder />
)}

// 修正パターン: 子は onHide コールバックで hidden を親に通知
function FilterableGalleryImage({ src, minPx, onHide }) {
  const [hidden, setHidden] = useState(false);
  const onLoad = (e) => {
    if (e.currentTarget.naturalWidth < minPx) {
      setHidden(true);
      onHide?.(); // ← 親に通知
    }
  };
  if (hidden) return null;
  return <img src={src} onLoad={onLoad} />;
}

// 親: hiddenCount を集約して「全件 hidden」を判定 → fallback 描画
const [hiddenCount, setHiddenCount] = useState(0);
useEffect(() => setHiddenCount(0), [images]); // images 入れ替えで reset
const allHidden = hiddenCount > 0 && hiddenCount >= images.length;
return allHidden ? <Fallback /> : (
  <div>
    {images.map((src) => (
      <FilterableGalleryImage src={src} minPx={...} onHide={() => setHiddenCount(c => c + 1)} />
    ))}
  </div>
);
```

**Why**: 子の自己判断 hidden は「個別の見た目」を制御するには良いが、UI 全体としては「何も表示されない不可視な状態」を生む。親は子が消えた事実を知らないので fallback を出せず、ユーザーは「タイトルだけ残った謎の状態」を体験する。

**How to apply**: 子コンポーネントに「自分で `null` 返却して消える」設計を入れる場合、必ず onHide / onSkip コールバックも併せて実装する。親は:

1. `hiddenCount` state で集約
2. 子の入力配列が入れ替わったら useEffect でリセット
3. `allHidden = count >= total` 判定で fallback 分岐を追加 (例: 別ソース・空状態プレースホルダ)

主な使用箇所: `FilterableGalleryImage` の `onHide` (#671 後追い・全画像が minPx 未満で隠れる時の thumb / No Image fallback)

## React event 型を named import 化するときに DOM global と衝突する

`React.MouseEvent` のような qualified 形式を `MouseEvent` named import に書き換えると、**同名の DOM global と shadow 衝突** する。同じファイル内で `addEventListener("mousemove", handler)` のように DOM event を扱っている箇所があると、TypeScript overload マッチに失敗して typecheck エラーになる。

```typescript
// アンチパターン: React 由来 MouseEvent の named import が DOM global を覆す
import { type MouseEvent } from "react";
function handleClick(e: MouseEvent) { /* React.MouseEvent */ }
function onMouseMove(ev: MouseEvent) { /* ← React.MouseEvent と推論される */ }
document.addEventListener("mousemove", onMouseMove);
// ↑ TS2769: '(ev: React.MouseEvent) => void' is not assignable to
//   '(this: Document, ev: globalThis.MouseEvent) => any'

// 修正パターン A: ファイル内に DOM addEventListener が無い → そのまま named import OK
import { type MouseEvent } from "react";
function handleClick(e: MouseEvent) { ... }

// 修正パターン B: DOM addEventListener と React handler 両方使う → import alias で区別
import { type MouseEvent as ReactMouseEvent } from "react";
function handleClick(e: ReactMouseEvent) { /* React */ }
function onMouseMove(ev: MouseEvent) { /* DOM global そのまま */ }
document.addEventListener("mousemove", onMouseMove); // 型整合 OK
```

**Why**: React の event 型 (`MouseEvent` / `KeyboardEvent` / `TouchEvent` / `WheelEvent` / `FocusEvent` / `DragEvent` / `ClipboardEvent` / `PointerEvent` / `AnimationEvent` / `TransitionEvent` / `UIEvent`) は **DOM global と完全同名**。`React.X` qualified 形式なら namespace で区別できるが、named import に書き換えると import がモジュールスコープ内で global を shadow する。`addEventListener("mousemove", h)` の callback signature は DOM `MouseEvent` を要求するため、shadow された React 由来型を渡すと overload マッチ失敗で typecheck が連鎖的に壊れる。

**How to apply**: `React.X` を named import に書き換える sweep 作業を行うとき:

1. **書き換え対象ファイルで DOM event listener が使われていないかチェック**:
   ```bash
   grep -nE "addEventListener|removeEventListener" <target-file>
   ```
2. **DOM event 名 (`"mousemove"` / `"keydown"` / `"touchstart"` / `"wheel"` / `"focus"` / `"blur"` / `"drag"` / `"copy"` / `"paste"` 等) が見つかった場合**: import alias を使う
   - `import { type MouseEvent as ReactMouseEvent } from "react";`
   - 同様に `KeyboardEvent as ReactKeyboardEvent` / `TouchEvent as ReactTouchEvent` 等
3. **DOM event listener が無い (React handler のみ) ファイル**: alias 不要、そのまま named import で OK
4. **判断に迷ったら alias 採用が安全側** — alias で書いても可読性は大きく落ちない (むしろ「React 由来か DOM か」の区別が明示的)

**衝突する React event 型の一覧** (DOM global と同名):

`MouseEvent` / `KeyboardEvent` / `TouchEvent` / `WheelEvent` / `FocusEvent` / `DragEvent` / `ClipboardEvent` / `PointerEvent` / `AnimationEvent` / `TransitionEvent` / `UIEvent` / `Event`

**衝突しない React event 型** (DOM global に同名なし、alias 不要):

`SyntheticEvent` / `ChangeEvent` / `FormEvent` / `CompositionEvent` (DOM にはあるが日常的に使う形式が異なる) / `InvalidEvent`

**反例 (alias 不要なケース)**: 修正パターン A の通り、ファイル内が React handler のみで DOM `addEventListener` を使わない場合は alias 不要。**全ファイルで予防的に alias する必要はない** (可読性とのトレードオフで shadow が無いケースは素直な named import が良い)。

主な使用箇所: `useColumnResize.ts` (#712 第 2 段階 sweep 作業時、`React.MouseEvent` → `MouseEvent` 化で `addEventListener("mousemove", ...)` overload と衝突 → `MouseEvent as ReactMouseEvent` で解決)

### 派生ケース: `import React from "react"` default import は React 19 + Next.js 16 では named import に置き換える

React 19 + Next.js 16 の **JSX runtime auto** (Next.js が自動で `react/jsx-runtime` を挿入) では、JSX を書くために default `React` import は **不要**。`React.createElement` / `React.Fragment` / `React.forwardRef` 等の value も全て named import で取り出せる。

```typescript
// アンチパターン: default import + qualified value 使用
import React, { type ReactNode } from "react";
function highlight(): ReactNode {
  return React.createElement(React.Fragment, null, ...parts);
}

// 修正パターン: named import に統一
import { Fragment, createElement, type ReactNode } from "react";
function highlight(): ReactNode {
  return createElement(Fragment, null, ...parts);
}
```

**Why**: React 17+ の new JSX transform 以降、JSX は内部で `react/jsx-runtime` の `jsx()` を呼ぶため `React` global は不要。`React 19` + `Next.js 16` ではこれが標準で自動有効。default `React` import を残すと:

1. **bundle に React 全モジュールがインポートされる可能性** (tree-shaking が tsconfig 設定によっては効きにくい)
2. **「React の何を使っているか」が見えない** (`React.createElement` / `React.Fragment` 等を qualified で使うと grep しにくい)
3. **React.X 形式と named import 形式の混在で一貫性が崩れる** (本ファイル冒頭の「DOM global 衝突対応」と同じ理由 — 全ファイル統一が望ましい)

**How to apply**: ファイル中で `import React from "react"` を見つけたら、以下のステップで named import に変換:

1. **value 系を named import に追加**: `createElement` / `Fragment` / `forwardRef` / `useImperativeHandle` / `memo` 等
2. **type 系も同時に named import 化** (本ファイル「DOM global 衝突対応」セクションのフロー適用)
3. **default import を削除**: `import React from ...` → `import { ... } from "react";`
4. **`React.X` の qualified 参照を全置換**: `replace_all` で `React.createElement` → `createElement` 等
5. **typecheck で漏れチェック**: `pnpm run typecheck` で残った `React.X` は検出される

**反例 (default import を残すべきケース)**:

- **古い React 16 系プロジェクト** (legacy JSX transform 前提) — 本プロジェクトは React 19 なので該当なし
- **Class component で `React.Component` extending** — 本プロジェクトでは関数コンポーネントのみ (CLAUDE.md 規約) なので該当なし
- **type-only import で `React.X` namespace 全部使うとき** — `import type * as React from "react";` の形なら可だが、named import の方が一般的

主な使用箇所: `article-ui-helpers.ts` (#712 第 7 段階 sweep 作業時、default `import React, { type ReactNode }` → named `import { Fragment, createElement, type ReactNode }` に変換)

## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する

masonic / react-virtual のような **絶対座標で要素を配置する仮想化ライブラリ** を使うと、コンテナの `scrollHeight` はレイアウト確定後に動的に書き換わる。「コンテンツが viewport を埋めているか」を判定する必要がある場合、static な useEffect だけでは初回レイアウト確定タイミングを捉えられない。

```typescript
// アンチパターン: visible.length 依存だけだと masonic のレイアウト確定後の高さ変化を捕捉できない
useEffect(() => {
  const isShort = scrollEl.scrollHeight <= scrollEl.clientHeight;
  // ↑ 初回レンダー時はまだ masonry 配置前で scrollHeight が 0
}, [visible.length]);

// 修正パターン: ResizeObserver で scrollContainer のサイズ変化も監視
useEffect(() => {
  const observer = new ResizeObserver(() => {
    const isShort = scrollEl.scrollHeight <= scrollEl.clientHeight + 1;
    if (isShort && hasMore) loadMore();
  });
  observer.observe(scrollEl);
  return () => observer.disconnect();
}, []);
```

**注意点**: `ResizeObserver` は要素自身のリサイズを検知する。子要素が追加されてコンテナが拡張する場合は通常検知されるが、絶対座標配置で **親コンテナ自身の clientHeight が変わらない** ケースでは発火しない。その場合は `MutationObserver` (subtree childList 監視) との併用や、`requestAnimationFrame` を 2 段で待ってからチェックする手法を組み合わせる。

**Why**: masonic / react-virtual の絶対座標配置では、`scrollHeight` がレイアウト確定後に動的に書き換わるため、IntersectionObserver の sentinel に依存するだけでは「列偏在で sentinel に届かない」状態を検知できず無限スクロールが止まる。`ResizeObserver` + rAF 2 段待機の併用で解消する。

## AbortController.abort() の伝播範囲を限定する

**1 つの `AbortController` を複数の並列 fetch で共有しないこと**。共有してしまうと、1 件の fetch を止めるための `controller.abort()` が **他の進行中の fetch も全て中断** してしまう。

```typescript
// アンチパターン: 全 worker が同じ controller を共有
const controller = new AbortController();
async function worker() {
  while (!cancelled) {
    await fetchOne({ signal: controller.signal });
    // 1 件で 429 → onRateLimit が controller.abort() を呼ぶ
    // → 進行中の他 worker の fetch も全て中断 → 残り未処理記事は処理されない
  }
}

// 修正パターン A: フラグだけ立てて while 条件で自然停止
const controller = new AbortController();
let rateLimited = false;
async function worker() {
  while (!cancelled && !rateLimited) {
    await fetchOne({
      signal: controller.signal,
      onRateLimit: () => {
        rateLimited = true;
        // controller.abort() は呼ばない — 進行中の fetch は完走させる
      },
    });
  }
}

// 修正パターン B: 各 fetch で個別の controller を作る
async function fetchOne(article) {
  const localController = new AbortController();
  return fetch(url, { signal: localController.signal });
}
```

**Why**: 共有 controller を 1 件のエラーで abort すると、進行中の他記事の fetch も全て中断され、それらは `failedIds` にも入らず UI 上にリトライボタンも出ない「空カードで停止」状態になる。

**How to apply**: `AbortController` を共有する設計を採るときは、abort のスコープを明示する:

- **コンポーネントアンマウント / effect cleanup での中断** → 1 つの controller で OK（全部止めるのが正しい）
- **個別エラー時の中断** → 各 fetch ごとに別 controller、または `controller.abort()` ではなくフラグで自然停止
- **どちらも必要** → cleanup 用 controller と個別 controller を分ける

判定基準: 「この abort で止まる対象は、止めるべき対象と一致しているか？」。一致しないなら controller 共有は誤り。

### 派生ケース: useEffect で「articleId 変更時に in-flight fetch を abort」する設計は **child → parent の effect 発火順** で破綻する

「データ取得 hook」(useArticleContent / useFeedContent 等) の `useEffect[targetId]` で「対象が変わったら進行中の fetch を abort」する設計はよくあるが、**同じ親コンポーネントが render する子コンポーネント (AutoXxxController など) が effect(1) で同 hook の `fetchFullContent` を呼ぶと、effect 発火順 (子 → 親) のせいで子が起動した新 fetch を親の cleanup effect が abort する**。

```typescript
// アンチパターン: 親の cleanup が子の起動した新 fetch を abort
function useArticleContent(articleId) {
  const fetchAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAbortControllerRef.current?.abort(); // ← 子が直前に set した V_new を abort!
    fetchAbortControllerRef.current = null;
  }, [articleId]);

  const fetchFullContent = useCallback(async () => {
    fetchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    await apiFetch(url, { signal: controller.signal });
  }, [articleId]);
}

// 子コンポーネント (AutoReadController) で effect(1) が onFetch を呼ぶ
useEffect(() => {
  if (shouldFetch) onFetch(); // ← この effect は子のため先に発火
}, [articleId, ...]);

// 発火順:
//  1. 子 effect: onFetch → fetchFullContent → V_new set, await yield
//  2. 親 useEffect[articleId]: V_new.abort()  ← 即 abort!
```

修正パターン: **controller に articleId を併記して、stale (古い articleId 用) のときのみ abort**:

```typescript
const fetchAbortControllerRef = useRef<{
  controller: AbortController;
  articleId: string | undefined;
} | null>(null);

useEffect(() => {
  const ref = fetchAbortControllerRef.current;
  // 自身と同じ articleId 用 (= 子が直前に set した新 fetch) はスキップ
  if (ref && ref.articleId !== articleId) {
    ref.controller.abort();
    fetchAbortControllerRef.current = null;
  }
}, [articleId]);

const fetchFullContent = useCallback(async () => {
  fetchAbortControllerRef.current?.controller.abort();
  const controller = new AbortController();
  fetchAbortControllerRef.current = { controller, articleId }; // ← articleId 記録
  await apiFetch(url, { signal: controller.signal });
}, [articleId]);
```

**Why**: React の useEffect 発火順は **子 → 親** (depth-first, bottom-up)。親が render する子コンポーネントが「親の hook で公開された関数 (fetchFullContent / startSubscription 等) を effect(1) で呼ぶ」設計の場合、子の effect が先に走って ref を set し、その後に親の cleanup effect が abort する逆転現象が起きる。「無条件 abort」が正しいのは「親の hook 内だけで完結する設計」のときのみ。子に hook の public 関数を渡している場合は **「自分が起動した fetch か / 古い fetch か」を ref で識別** しないと cleanup が新 fetch を殺してしまう。

**How to apply**: `useRef<AbortController>` + `useEffect[targetId]` で abort + cleanup する hook を書くとき:

1. **その hook が公開する関数 (fetch / subscribe / start) を、子コンポーネントが effect で呼んでいないか** を確認
2. 呼んでいる場合、**子の effect は親の cleanup より先に発火する** ことを意識
3. ref の値に **「対象 ID」を併記** (`{ controller, articleId }`) して、cleanup では **stale 判定** してから abort
4. ID が一致するときの abort をスキップしても、`fetchFullContent` 内の `ref.current?.controller.abort()` (新 fetch 起動時) で旧 fetch は確実に abort されるので問題ない
5. **本番ログで abort 発火元を切り分ける必要があるとき** は、`articleId-effect-fired { hadController, isStaleController }` のように **ref の状態 + 判定結果** をログに出す

主な使用箇所: `useArticleContent.ts` の `fetchAbortControllerRef = { controller, articleId }` 構造 (#678 — オートモードで全文取得が即 abort されて summary だけ読み上げのバグ修正)

`articles` のような **配列全体を対象に処理したい** useEffect で、依存配列キーを `articles.slice(0, N).map(a => a.id).join(...)` のように作ると、**N+1 件目以降の追加・削除を検知できなくなる**。

```typescript
// アンチパターン: 先頭 N 件 ID だけのキーで「visible 拡張」を検知できない
const articlesKey = articles
  .slice(0, 20) // ← 21 件目以降の変化が無視される
  .map((a) => a.id)
  .join("\0");

useEffect(() => {
  // 21 件目以降の処理がこの effect で行われるべきだが、再実行されない
  void prefetch(articlesRef.current);
}, [articlesKey]);

// 修正パターン: 全件 ID でキーを作る (visible 拡張を確実に検知)
const articlesKey = articles
  .filter((a) => Boolean(a.link))
  .map((a) => a.id)
  .join("\0");
```

**Why**: 先頭 N 件 ID だけのキーでは、ユーザーがスクロールして visible が拡張されてもキー不変 → effect 再実行されず → N+1 件目以降が永遠に未処理のまま放置される症状になる。

**How to apply**: 依存配列キーを文字列ハッシュで作るときは:

1. **何の変化を検知したいか** を明確にする（先頭固定 N 件 / 全件 / フィルタ後の集合 etc.）
2. **slice / take / 先頭 N 件**を入れたら、N+1 件目以降の変化が **意図的に無視される設計** か再確認
3. 「処理対象の上限」と「変化検知の対象」は **別概念** として分離する。上限は effect 内の `targets.slice(0, lim)` で、検知は `articlesKey` で全件。
4. 全件キーが長くなりすぎる懸念があれば、**ハッシュ関数** (`SHA-1` 短縮など) で短縮するのも一手。ただし `join("\0")` の単純文字列でも数千件までは実用上問題なし

## モード OFF 時に進行中の副作用を停止する

state を OFF にしただけでは、すでに実行中の副作用（TTS 発話・進行中の fetch・タイマー）は止まらない。**モード変化を監視する useEffect で明示的に停止コールを行う**。

```typescript
// アンチパターン: enabled = false でも TTS は鳴り続ける
function AutoReadController({ enabled /* ... */ }) {
  // 停止ハンドラなし
}

// 修正パターン: enabled の変化で副作用を止める
useEffect(() => {
  if (enabled) return;
  onTtsStop();
  // または: abortRef.current?.abort();
}, [enabled]);
```

**Why**: state を OFF にしただけだと、ユーザー目線では「停止ボタンが効かない」体感になる。フラグの変化を監視する独立 effect で副作用を明示停止させる必要がある。

**How to apply**: 機能が「ON / OFF」のフラグで動く場合、OFF 遷移時のクリーンアップが副作用を 100% 止めているか必ず確認する。fetch / timer / 音声 / WebSocket / IntersectionObserver などすべて。

## 時刻境界 (midnight / 月跨ぎ等) で再 render する hook pattern

`new Date()` を `useMemo` 内で呼ぶと **memo 作成時の日付/時刻がキャプチャ** されて、後続 render で古い値を使い続けるバグが起きる。tab を開きっぱなしで日付跨ぎ / 月跨ぎ / 年跨ぎが起きたとき、UI 表示が前日基準のまま腐る。

```typescript
// アンチパターン: useMemo 内で new Date() — memo 再実行されない限り stale
const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
const todayCount = articles.filter((a) => a.publishedAt?.startsWith(today)).length;
// → 日付跨ぎで「今日の記事 0 件」表示が一日中続く

// 修正パターン: midnight setTimeout で state を更新する hook
function useUtcDate(): string {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
    );
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();
    const id = setTimeout(
      () => setDate(new Date().toISOString().slice(0, 10)),
      msUntilMidnight + 1000,
    );
    return () => clearTimeout(id);
  }, [date]);
  return date;
}

// consumer 側
const today = useUtcDate();
const todayCount = articles.filter((a) => a.publishedAt?.startsWith(today)).length;
```

**Why**: 時刻自体には「変化通知イベント」が無い (ブラウザ API の `voiceschanged` 等とは異なる)。**「次の境界まで `setTimeout`」+「境界到達で setState」+「state 変化で次の `setTimeout` を再 schedule」** の自己再帰パターンで実装する必要がある。+1000ms はクロックずれ / 微小遅延の安全マージン。

**通常の render 負荷はほぼゼロ**: 境界到達時に 1 回だけ state 変化 → 関連 useMemo / useEffect が再評価されるだけ。`setInterval(1000ms)` のような頻繁な polling は不要。

**How to apply**: 「**時刻境界をキー** にした表示 / 集計」を書くときは hook 化を検討:

| 用途                          | hook 名                       | 境界                   | 適用例                        |
| ----------------------------- | ----------------------------- | ---------------------- | ----------------------------- |
| 「今日」の件数 / バッジ       | `useUtcDate` / `useLocalDate` | midnight (UTC / local) | `readTodayCount` / 既読バッジ |
| 「今月」の集計 / グラフ       | `useCurrentMonth`             | 月初 0:00              | 月間統計 / heatmap 区切り     |
| 「今週」の集計                | `useCurrentWeek`              | 週初 (月曜 0:00 等)    | 週間目標 / streak 計算        |
| 「シフト中か」(7-19 時)       | `useShiftWindow`              | shift 開始 / 終了時刻  | 業務時間限定 UI               |
| cron 風タイマー (毎時 0 分等) | `useCronTick`                 | 任意の cron expression | データ自動更新トリガー        |

**TDD**: `now` を引数化して純粋に判定:

```typescript
export function nextMidnightDelay(now: Date): number {
  const nextMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0),
  );
  return nextMidnight.getTime() - now.getTime();
}
```

これを spec で「now=23:59:59 → 1000ms」「now=00:00:01 → 約 24h」等を assert 可能に。

**反例 (時刻境界 hook が不要なケース)**:

- 表示する時刻自体がリアルタイムで動く必要がある (例: 時計 UI) → `setInterval(1000)` で full polling が正解
- ユーザーアクションで再 render される頻度が「日付境界より高い」 (例: 自動ポーリング 5 分) → useMemo 再評価で副作用的に最新化されるので hook 不要
- SSR で時刻を確定させる必要があるとき (本プロジェクトは CSR 'use client' のため非該当)

主な使用箇所: `useUtcDate` (`useArticleUnreadStats.ts`) — `readTodayCount` の midnight stale バグ修正 (37th cycle perf #3, confidence 82%)

## ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く

`speechSynthesis.getVoices()` のように **初回呼び出しでは空配列を返し、後から `voiceschanged` イベントで利用可能になる** ブラウザ API がある。useEffect で初期取得だけしても永遠に空のままなので、必ずイベント購読とペアで実装する。

```typescript
// アンチパターン: 初期取得のみで遅延通知を捕捉できない
useEffect(() => {
  setVoices(window.speechSynthesis.getVoices()); // Chrome では空配列
}, []);

// 修正パターン: 初期取得 + voiceschanged 購読をペア
useEffect(() => {
  const update = () => setVoices(window.speechSynthesis.getVoices());
  update(); // Safari など初期取得で取れる環境用
  window.speechSynthesis.addEventListener("voiceschanged", update);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
}, []);
```

**Why**: ブラウザ API には「初期化が非同期で完了する」ものが多く、初期取得だけだと一部環境で永遠に空/旧値のままになる。Chrome の `voiceschanged` / DOM の `MutationObserver` / `navigator.mediaDevices.devicechange` / `screen.orientation.change` などはすべて同じパターン。

**How to apply**: ブラウザネイティブ API を呼ぶ useEffect を書くとき:

1. **「初回呼び出しで完全な値が取れるか？」を必ず確認** (MDN ドキュメント or 動作確認)
2. 取れない場合、**変更通知イベントが提供されているか確認** (`xxxchanged` / `change` 系)
3. 提供されているなら **初期取得 + イベント購読 + cleanup の 3 点セット** を必ず書く
4. 提供されていない (古い API) なら polling / setInterval を最小頻度で

主な使用箇所:

- `useSpeechSynthesis` の `voiceschanged` 購読 (#654)
- `useResizeObserver` 系 (`ResizeObserver` の初回コールバック)
- `useOnlineStatus` の `online` / `offline` イベント購読
