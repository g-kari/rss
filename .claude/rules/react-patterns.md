---
description: React state / ref / useEffect / Context / コンポーネント分割パターン集
paths: "src/**/*.tsx,src/hooks/**/*.ts,src/contexts/**/*.tsx,src/components/**/*.tsx,app/**/*.tsx"
---

# React パターン (state / ref / useEffect)

`coding-conventions.md` から分割した React 固有の state / ref / useEffect パターン集。
React Context / hook 設計 / コンポーネント分割等の React 関連ルールも順次本ファイルに集約予定。

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

主な使用箇所: `equalSnoozedUntil` / `useReadStateSyncApply` (2 秒毎の主スレッドブロック解消)

### 派生ケース: deps 配列に直接渡せる「structural signature string」パターン

`equalXxxMap` のような **`if (!eq) setXxx(next)` ガード + useRef 経由の安定 reference** は、`useFilteredArticles` のように **複数の派生 state を 1 つの useMemo で生成する** ケースには使えるが、setup が重い (Map 構造ごとに `equalMap` ヘルパー + ref + 条件 update の 3 点セット)。

別パターンとして、**entity 配列を 1 行 signature string にシリアライズ** して useMemo の deps に渡す方式がある。React の useMemo は deps を `===` で比較するため、signature が同じ string なら自動的に再計算 skip される。

```typescript
// アンチパターン: feeds reference を直接 deps に → 5 分 polling で毎回再計算
const { pinnedFeeds, groupedFeeds, ... } = useMemo(() => {
  // ... 重い sort + filter 群
}, [feeds, pinnedFeedIds, feedSearch, ...]);

// 修正パターン: structural signature string で deps を置換
function computeFeedStructuralSignature(feeds: Feed[]): string {
  const parts: string[] = [];
  for (const f of feeds) {
    parts.push(
      `${f.id}|${f.title ?? ""}|${f.category ?? ""}|${f.groupId ?? ""}|${f.nsfw ? 1 : 0}|${f.priority ?? ""}|${f.view ?? ""}`,
    );
  }
  return parts.join("\n");
}

const feedStructuralSignature = useMemo(() => computeFeedStructuralSignature(feeds), [feeds]);
const feedsRef = useRef(feeds);
feedsRef.current = feeds;

// eslint-disable-next-line react-hooks/exhaustive-deps -- signature が feeds 構造を encode 済
const { pinnedFeeds, groupedFeeds, ... } = useMemo(() => {
  const feeds = feedsRef.current; // 構造的等価ガード後の安定 reference を採用
  // ... 既存ロジック (sort / filter)
}, [feedStructuralSignature, pinnedFeedIds, feedSearch, ...]);
```

### Map ガード vs Signature string の使い分け

| 観点                                               | Map / 個別 `equalXxxMap`                    | Signature string                                           |
| -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| **setup コスト**                                   | 中 (ヘルパー + ref + 条件 update)           | 低 (純粋関数 1 個 + signature useMemo + deps 置換)         |
| **deps 配列との整合**                              | 派生 Map を deps に追加                     | signature を deps に置換 (自動再計算)                      |
| **複数 useMemo に再利用**                          | 1 つの安定 reference を deps として共有可能 | signature の文字列 identity を共有可能                     |
| **比較対象が「Map 全体」か「個別 entity 配列」か** | Map 全体 (例: `feedCategoryMap`)            | 配列 (例: `feeds: Feed[]`)                                 |
| **lint warning**                                   | なし                                        | `react-hooks/exhaustive-deps` 1 件 (eslint-disable で許容) |

**選択基準**:

- **派生 Map 1 個だけ作る** → `equalXxxMap` パターン (Map 単位の比較ヘルパー流用可能)
- **配列を sort + filter + group して複数派生 state を生成** → Signature string パターン (deps 置換が自然、`feedsRef.current` で安定参照を提供)
- どちらも構造的等価ガードの目的 (内容変化なしで下流再計算を防ぐ) は同じ

### Signature string パターンの注意点

1. **encode する field を「下流計算に影響する全 field」に絞る**:
   - `feeds: Feed[]` でも `lastFetchedAt` / `articleCount` 等は sidebar layout に影響しない → signature に含めない
   - 漏れると stale render が発生するので慎重に
2. **signature 計算コストを `O(N × c)` に抑える** (c = field 数 + concat overhead):
   - 1000 feeds × 7 field でも < 1ms (本プロジェクト実測)
   - 配列 size に上限が無い場合は signature 計算自体が hot path 化するリスクあり → 上限を確認
3. **`feedsRef.current` で deps 不一致を回避**:
   - 内側 useMemo は `feeds` を closure で参照するが、deps には signature しか入れない
   - `eslint-disable-next-line react-hooks/exhaustive-deps` でルール除外 + 理由コメント明記
   - `feedsRef.current = feeds` を render 中で書く (`useSyncedRef` 同思想)

主な使用箇所: `useSidebarFeeds.ts` の `computeFeedStructuralSignature` — 5 分 polling で feeds reference が新規でも構造変化なしなら 4 派生 state (pinnedFeeds / groupedFeeds / categoryGroups / uncategorizedFeeds) の sort + filter 再計算を skip

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

**How to apply**: `const EMPTY_X = ...` のような module-level sentinel を新規宣言するとき (`ReadonlySet`/`ReadonlyArray` は consumer 全箇所の型変更要求のため漸進移行と相性が悪い、`Object.freeze + as cast` なら scope 最小で runtime 汚染検知できる):

1. **mutable 型 (Set / Map / Array / Object) はすべて freeze 対象**。primitive (string / number / boolean) は不要
2. **frozen 型注釈は元の mutable 型のまま** (`as Set<string>` で consumer 側の型変更を回避)
3. **`ReadonlySet` / `ReadonlyArray` 派にしたいケース** (新規モジュールで consumer もまだ少ない) なら最初からそちらが clean。**既存モジュール** (consumer 多数) に後追いで freeze を入れるなら as cast で
4. プリミティブの sentinel (`const EMPTY_STR = ""` 等) は freeze 不要 (immutable)

検出方法: `grep -rEn "^const EMPTY[A-Z_]*" src/` で module-level sentinel 全件列挙 → `Object.freeze` 無しのものを抽出。`code drift sweep` (`rule-maintenance.md` セクション 5) パターンで定期適用可能。

主な使用箇所:

- `useFilteredArticles.ts` の `EMPTY_SET` / `EMPTY_STR_ARRAY` / `EMPTY_FEED_ARRAY` (3 sentinel を一括 freeze 化)
- `useDelayedGalleryItems.ts` の `EMPTY_SET = Object.freeze(new Set<string>()) as Set<string>` (先行採用パターン)

## ライブラリ仕様への依存は `vi.fakeTimers + rerender` で「実挙動の固定スペック」として残す

`useState(() => new Date())` の **mount 時 initializer 1 回固定** や `useMemo([])` の **React は memo を破棄可能** のような **「React 仕様 or ブラウザ API 仕様への依存」** は、コードコメントだけでなく **vitest で実挙動を spec として固定** する。仕様変更で挙動が変わったときに spec が落ちて検知できる。

```typescript
// 対象実装: const [now] = useState(() => new Date());

// アンチパターン: コメントだけで仕様依存を表明
// → React が将来 useState initializer の挙動を変えたとき、検知できない

// 修正パターン: vitest で「rerender しても now が固定」を assert
it("mount 後に時刻を進めて rerender しても、now は mount 時刻のまま固定される", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-12T10:00:00Z"));

  const feeds = [{ rateLimitedUntil: "2026-05-12T10:10:00Z", ... }];
  const { rerender } = render(<FeedHealthModal feeds={feeds} onClose={() => {}} />);
  expect(screen.getByText("レートリミット中")).toBeInTheDocument();

  // 時刻を 20 分進めて feeds 新インスタンスで rerender
  vi.setSystemTime(new Date("2026-05-12T10:20:00Z"));
  rerender(<FeedHealthModal feeds={[...feeds]} onClose={() => {}} />);

  // useState initializer が再実行されない React 仕様に依存
  // → mount-time now (10:00) で判定継続 → section 残存
  expect(screen.getByText("レートリミット中")).toBeInTheDocument();
});
```

**How to apply**: 実装に「React 仕様 / ブラウザ API 仕様への暗黙的依存」がある箇所を見つけたら (コードコメントだけでは仕様変更時に検知できない、vitest spec で実挙動を固定すれば仕様変更で spec が落ちて早期発見できる):

1. **依存している仕様** を明示 (例: 「`useState(() => fn())` の initializer は mount 時 1 回」「`speechSynthesis.cancel()` は `onend` を発火させない」「`masonic` は viewport 外 item を render しない」)
2. **その仕様が変わったら何が壊れるか** を 1 文で書ける形にする (例: 「now が再評価されると `rateLimitedFeeds` の判定基準が動的に変わって、UI 表示が時刻と共に変わる」)
3. **vitest + RTL + `vi.fakeTimers`** (or 同等の mock) で「仕様通りなら X」「仕様違反なら Y」の差を assert
4. テストファイルの冒頭 JSDoc に **「対象実装」「依存している仕様」「旧実装との差」** を明記
5. 関連する `useMemo([])` などのアンチパターンとの差分も spec で残す (本例: `useState(() => fn())` と `useMemo(() => fn(), [])` で挙動が違うことの実証)

**該当する典型ケース**:

| 実装パターン                                      | 依存仕様                         | 仕様変更時のリスク                      |
| ------------------------------------------------- | -------------------------------- | --------------------------------------- |
| `useState(() => new Date())`                      | initializer は mount 時 1 回固定 | 動的に再評価されると時刻基準が動く      |
| `useMemo(() => fn(), [])`                         | (公式は破棄可能を明言)           | 既に破棄されうるので spec で明示しない  |
| `useRef(initial)`                                 | render 中 identity 不変          | 識別子変動で stale 参照バグ             |
| `speechSynthesis.cancel()` 後の `utterance.onend` | onend 不発火                     | 手動 cancel と自然完了の区別が崩れる    |
| `<masonic>` の viewport 外 item                   | render されない (内部最適化)     | viewport 外 item 高さ取得が不可能になる |
| `localStorage.setItem` 同期書込                   | 同 tick で読み戻し可能           | 非同期化で race condition 発生          |

**反例 (spec 化が overkill なケース)**:

- ライブラリ公式 docs に **「将来変更しない」明記** されている挙動 (例: ECMAScript spec の `Array.prototype.sort` stability — Node.js 12+ 保証)
- 実用上「壊れたら即座に開発時に気付く」挙動 (例: `useState` の setter で render 発火 — 壊れたら全機能停止で即発覚)
- **依存している仕様自体が deprecated 予定** で代替実装に移行中 (spec を書いてもすぐ陳腐化)

主な使用箇所: `FeedHealthModal.test.tsx` (#682 Phase B-2 / 元 #623) — `useState(() => new Date())` mount 時固定挙動を `vi.fakeTimers + rerender` で間接検証、`useMemo([])` 旧実装との差を spec で固定

### 派生ケース: `new Ctor()` で呼ばれるブラウザ API は **class 形式** で mock する (`vi.fn()` は this binding が崩れる)

`AudioContext` / `Worker` / `WebSocket` / `EventSource` / `IntersectionObserver` / `ResizeObserver` 等の **`new` 演算子で呼ばれる Web API** を mock するとき、**`vi.fn(() => obj)` を `vi.stubGlobal` で注入すると `new` で呼ばれて `this` binding が崩れ、return が無視される or 想定外オブジェクトが返る**。必ず `class` 形式で mock を構築する。

```typescript
// アンチパターン: vi.fn() を new で呼ぶと this binding が想定外
const ContextCtor = vi.fn(() => {
  const ctx = buildMockCtx();
  createdContexts.push(ctx);
  return ctx; // ← `new ContextCtor()` で呼ばれると return が貼り付かないケース有
});
vi.stubGlobal("AudioContext", ContextCtor);

// hook 内で `new AudioContext()` → createdContexts に push されないことが起きる

// 修正パターン: class 形式の mock
class MockAudioContext {
  destination = {};
  close = vi.fn(() => Promise.resolve());

  constructor() {
    createdContexts.push(this); // ← `new` で呼ばれた瞬間に確実に this が積まれる
  }

  createOscillator() {
    const osc = { connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    createdOscillators.push(osc);
    return osc;
  }

  createGain() {
    const gain = { gain: { value: 1 }, connect: vi.fn() };
    createdGains.push(gain);
    return gain;
  }
}
vi.stubGlobal("AudioContext", MockAudioContext);
```

**JavaScript `new` 仕様の罠**:

- `new fn()`: コンストラクタが **object を return すれば** その object が結果、**primitive (undefined 含む) を return すれば `this` (新しい空オブジェクト)** が結果
- `vi.fn(() => mockCtx)` の戻り値型は vitest 内部で wrap されており、`new` 呼び出し時に return が object として認識されないケースがある
- class 構文なら **constructor body 内で `this` をセットアップして `push(this)`** とするので、確実に同じインスタンスが test 側から参照可能

**How to apply**: `new ApiName()` で生成されるブラウザ API を mock するときは (vi.fn() の戻り値が new 演算子で正しく機能しない罠を避けるため、class 形式が唯一安全):

1. **`class MockApiName { ... }`** で mock を定義する (`vi.fn` 単独で `new` 用 mock を作らない)
2. **`constructor()` で `createdInstances.push(this)`** して test 側がインスタンスを参照可能に
3. **メソッドは class field arrow function (`close = vi.fn(...)`)** か **regular method (`createOscillator() { ... }`)** で定義、いずれも `this` 経由でアクセス
4. test の前提となる **child object (Oscillator / GainNode 等) を別配列に push** して個別 assertion 可能に
5. `vi.stubGlobal("AudioContext", MockAudioContext)` で注入、`afterEach` で `vi.unstubAllGlobals()`

**該当する典型 Web API** (`new` で生成):

| API                                   | 用途                 | mock 必要場面                   |
| ------------------------------------- | -------------------- | ------------------------------- |
| `AudioContext` / `webkitAudioContext` | WebAudio 再生        | 無音再生 hook / TTS 制御 hook   |
| `Worker` / `SharedWorker`             | バックグラウンド処理 | 重い計算 / network 処理 hook    |
| `WebSocket`                           | リアルタイム通信     | チャット / 通知 / 同期 hook     |
| `EventSource`                         | サーバー送信イベント | 通知 hook / ライブアップデート  |
| `IntersectionObserver`                | 可視性監視           | 無限スクロール / lazy load hook |
| `ResizeObserver`                      | サイズ変化監視       | 仮想スクロール / 動的レイアウト |
| `MutationObserver`                    | DOM 変化監視         | 動的コンテンツ追跡 hook         |
| `AbortController`                     | fetch cancel         | (実装は native でも mock 可能)  |

**反例 (vi.fn で OK なケース)**:

- `new` を使わない関数呼び出し API (`fetch` / `localStorage.getItem` 等) — `vi.fn()` で問題なし
- mock object 自体を直接 `vi.stubGlobal` に注入する API (`navigator.mediaSession = mockSession`) — class 不要

主な使用箇所: `useBackgroundAudio.test.ts` (#745 Phase A) — `vi.fn(() => mockCtx)` で AudioContext 作成カウントが 0 のまま fail → class MockAudioContext に書き換えで 6 ケース全 pass

### 派生ケース: frozen state を helper 関数で参照したいときは引数化必須 (内部で live API を呼ばない)

`useState(() => new Date())` で **mount 時 1 回固定** された `now` を、コンポーネント内のロジック (`rateLimitedFeeds = filter((f) => new Date(f.until) > now)`) で使うところまでは正しい。ところが **同コンポーネントから呼ぶ helper 関数** (例: `untilLabel(iso)` で「あと N 分」表示) が **内部で `Date.now()` を呼ぶ** と、judging logic と display logic の時間源が乖離して "section に残っているのに『解除済み』表示" のような UI 矛盾が起きる。

```typescript
// アンチパターン: helper が内部で live API
function untilLabel(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now(); // ← live 時刻
  // ...
}
function FeedHealthModal({ feeds }) {
  const [now] = useState(() => new Date()); // ← frozen
  const rateLimitedFeeds = useMemo(
    () => feeds.filter((f) => new Date(f.until) > now),
    [feeds, now],
  );
  return rateLimitedFeeds.map((f) => <span>{untilLabel(f.until)}</span>);
  // ↑ rateLimitedFeeds は frozen now で判定、untilLabel は live Date.now() で判定
  //   → 「セクションに残っているが『解除済み』」が分単位で発生
}

// 修正パターン: helper を引数化して frozen state を渡す
function untilLabel(iso: string, nowMs: number): string {
  const diff = new Date(iso).getTime() - nowMs;
  // ...
}
function FeedHealthModal({ feeds }) {
  const [now] = useState(() => new Date());
  const rateLimitedFeeds = useMemo(
    () => feeds.filter((f) => new Date(f.until) > now),
    [feeds, now],
  );
  return rateLimitedFeeds.map((f) => (
    <span>{untilLabel(f.until, now.getTime())}</span>
  ));
}
```

**How to apply**: `useState(() => fn())` / `useMemo(() => fn(), [])` 等で **mount 時固定** した値を持つコンポーネントで helper 関数を書くとき (judging logic と display logic が異なる時間源を見ると、ユーザーから見て「片方は残っているのに片方は解除済み」のような UI 矛盾が起きる):

1. **helper 関数が内部で参照している API** (`Date.now()` / `performance.now()` / `crypto.randomUUID()` / `Math.random()` / `process.env.X`) を列挙
2. **コンポーネント本体が frozen state を持つか** を確認 — Yes なら helper にその state を引数で渡す
3. helper シグネチャ: `untilLabel(iso, nowMs: number)` のように **frozen 値を primitive で受ける** (Date オブジェクトより `getTime()` した number の方が equality 比較しやすい)
4. **TDD**: helper 単独を pure 関数として spec 書く (`untilLabel("2026-05-12T10:10:00Z", new Date("2026-05-12T10:00:00Z").getTime())` で「あと 10 分」を assert)
5. **「内部で live API を呼ぶ helper を書きそうになったら止まる」** — 呼出元の context (frozen / live) を確認してから決める

**該当する典型ケース**:

| コンポーネント側 frozen state         | helper 内部の live API | リスク                           |
| ------------------------------------- | ---------------------- | -------------------------------- |
| `useState(() => new Date())`          | `Date.now()`           | 判定基準と表示基準が異なる時刻に |
| `useState(() => crypto.randomUUID())` | `crypto.randomUUID()`  | session/instance ID の不一致     |
| `useMemo(() => readConfig(), [])`     | `readConfig()` 直呼出  | 同 render 中の config 不整合     |
| `useRef({ origin: ... })`             | `location.href` 直呼出 | SPA navigate 後の origin 乖離    |

**反例 (引数化が不要なケース)**:

- helper が **frozen state と無関係な計算** (例: 文字列フォーマット / 配列 sort) — 内部で live API を呼ばないなら問題なし
- helper が **明示的に live API の最新値** を表現する責務 (例: `getCurrentBatteryLevel()` のようなセンサー値取得) — frozen 化すべき場面ではない
- 単一 render 中で **frozen / live の差が許容される表示** (例: 数十秒で揮発する toast の表示時刻) — UX 影響を判定して許容

主な使用箇所: `FeedHealthModal.tsx` の `untilLabel(iso, nowMs)` — perf 監査エージェントの指摘で `Date.now()` 内部呼出を引数化し frozen `now` と整合 (judging logic / display logic の時間源乖離防止)

### 派生ケース: 「component 再描画バグ」の test は **hook level の root cause assertion** に降格して setup コストを下げる

memo された Component / Context Consumer が再描画されないバグ (例: #634 ギャラリーブックマーク再描画) を test するとき、Issue 推奨は **完全 component-level 検証** (`<ArticleList layout='gallery'>` + Context Provider 階層 + Modal portal + memo Consumer まで含めた render assertion) になりがち。だが setup コストが大きく、テスト保守 burden + 環境依存 (happy-dom が一部 React 19 機能未対応等) のリスク。

代わりに **「root cause を hook level で 1 layer 上から assert」** することで、setup コストを大幅に下げつつ等価以上の回帰防止を実現する。

```
バグ階層 (再描画されない症状):
  L3 (UI): GalleryCardRenderer の bookmark icon が古いまま
       ↑
  L2 (React): memo + Context Consumer が再描画 skip (= prop reference 不変)
       ↑
  L1 (Hook): useArticleListItemProps の resolveItemProps identity 不変 (= useCallback deps 配列空)
       ↑
  L0 (Root cause): bookmarkIds が useSyncedRef 経由でしか参照されてない (deps に入っていない)

⊕ Issue 推奨: L3 で実 component を render して bookmark アイコン変化を assert
  → setup: Context Provider 階層 + Modal portal + RTL screen.findBy*
  → 環境依存: happy-dom の React 19 strict mode 二重実行 / Context Consumer の memo 挙動

⊕ 修正パターン: L1 で hook を renderHook して identity 変化を assert
  → setup: 1 hook + 純粋データ Set/Record
  → React/Context は test 対象外 (React 自体の責務)
```

```typescript
// 修正パターン: hook level assertion (#682 Phase B-1)
it("bookmarkIds 変更で resolveItemProps の identity が変わる", () => {
  const { result, rerender } = renderHook(
    ({ bookmarkIds }) => useArticleListItemProps(defaultParams({ bookmarkIds })),
    { initialProps: { bookmarkIds: new Set<string>() } },
  );
  const firstResolve = result.current.resolveItemProps;

  rerender({ bookmarkIds: new Set<string>(["art-1"]) });

  // ref 経由 (旧バグ) では identity 不変、state 直接参照 + deps 追加で identity 変化
  expect(result.current.resolveItemProps).not.toBe(firstResolve);
});
```

**How to apply**: 「memo / Context Consumer の再描画」バグの test を計画するとき (setup コストが test 数 × 保守 burden を増やすため、root cause が hook level にあるならそこで止める):

1. **バグ階層を分解** (UI 症状 → memo skip → callback identity 不変 → deps 配列 → root cause)
2. **root cause が `useCallback` / `useMemo` / `useEffect` の deps 配列** にあるなら **hook level で assert**
3. hook test での assert 内容:
   - **identity 変化**: `expect(result.current.fn).not.toBe(firstFn)` (deps 変化時)
   - **identity 維持**: `expect(result.current.fn).toBe(firstFn)` (reference 同一時)
   - **戻り値反映**: `expect(props.isBookmarked).toBe(true)` (戻り値の正しさ)
4. **memo + Consumer の挙動は React の責務** と認識して vitest 対象外にする
5. 完全 component test (UI 描画含む) は **将来必要なら別 Phase で追加** (例: Phase B-1.5)

**反例 (hook level に降格できないケース)**:

- バグの root cause が **DOM レベル** (focus / scroll / `position: absolute`) — hook では再現不能、component test 必須
- **複数 component の協調動作** に起因 (例: Parent の state update → Child の effect → Grandchild の render) — hook 単体では再現不能
- React 自体の **メジャーアップグレード** (React 19 → 20 等) で挙動が変わる可能性 — react-testing-library で実 component を render する価値あり

**判定キーワード**:

| バグ症状                                  | root cause 推定        | test level |
| ----------------------------------------- | ---------------------- | ---------- |
| 「再描画されない」「アイコン変わらない」  | useCallback deps 配列  | **hook**   |
| 「memo skip」「Context Consumer 不変」    | hook 戻り値 identity   | **hook**   |
| 「focus 飛ぶ」「scroll ずれる」           | DOM レベル side effect | component  |
| 「クリックで何も起きない」                | event handler 配線     | component  |
| 「modal 開かない」「portal 描画されない」 | render / portal        | component  |

主な使用箇所: `useArticleListItemProps.test.ts` (#682 Phase B-1 / 元 #634) — bookmarkIds / readIds / notes 変更時の resolveItemProps identity 変化を hook level で検証、完全 component test (GalleryCardRenderer 実描画) は Phase B-1.5 として後回し

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

**How to apply**: 「同じ依存値でユーザー操作の都度 effect を再発火したい」要件を見つけたら:

1. **trigger counter state** を親に置く: `const [trigger, setTrigger] = useState(0);`
2. **increment コールバック** を提供: `const fire = useCallback(() => setTrigger((c) => c + 1), []);`
3. **子の useEffect の依存配列に trigger を追加** + `prevRef` で「同 trigger なら skip」「trigger 変化なら強制実行」を判定
4. **通常変化 vs 手動 trigger の挙動分岐** が必要なら `isManualTrigger` フラグで `align` / `behavior` などを切り替える

主な使用箇所: `App.tsx` の `anchorTrigger` ↔ `ArticleList.tsx` の scroll useEffect (`.` キーで選択中記事を中央アンカー)

### 派生ケース: 子コンポーネントの内部 state を外部から起動するときも trigger counter で「state lift up より侵襲が小さい」配線が選べる

「子コンポーネント (例: `FeedSidebar`) が内部で持つ state (例: `inputOpen = FeedAddModal の表示 boolean`) を、外部 (例: 親の空状態 CTA ボタン) から起動したい」要件のとき、**state lift up (内部 state を親に上げて props でコントロール) は侵襲が大きい** (子の内部 `setInputOpen(true)` を呼ぶ全箇所を controlled モード対応に書き換える必要)。これを **trigger counter pattern** で代替すれば、子の内部 state はそのまま保ちつつ「外部 trigger 変化を検知して内部 setter を呼ぶ useEffect」を 1 つ追加するだけで済む。

```typescript
// アンチパターン: state lift up で子の内部 state を controlled 化
// → 子の既存 setInputOpen(true) callers 全件を props.setInputOpen 経由に書き換え必要
function FeedSidebar({ inputOpen, setInputOpen }: Props) {
  // ... 既存の内部 callers が全部 props 経由になる (10+ 箇所修正)
}

// 修正パターン: trigger counter で「外部 trigger 変化を検知 → 内部 setter 呼出」
function FeedSidebar({ openFeedAddTrigger }: Props & { openFeedAddTrigger?: number }) {
  const [inputOpen, setInputOpen] = useState(false); // ← 内部 state そのまま維持
  const prevTriggerRef = useRef<number | undefined>(openFeedAddTrigger);
  useEffect(() => {
    if (openFeedAddTrigger === undefined) return;
    if (prevTriggerRef.current !== openFeedAddTrigger) {
      prevTriggerRef.current = openFeedAddTrigger;
      setInputOpen(true);
    }
  }, [openFeedAddTrigger]);
  // ... 既存の内部 setInputOpen 利用は触らない (一切変更不要)
}

// 親 (App.tsx):
const [openFeedAddTrigger, setOpenFeedAddTrigger] = useState(0);
const openFeedAddModal = useCallback(() => setOpenFeedAddTrigger((c) => c + 1), []);
// ArticleList の空状態 CTA → onAddFeed: openFeedAddModal を渡す
```

**How to apply**: 「子の内部 state を外部から起動したい」要件を見つけたら (state lift up は既存 callers の controlled 化で侵襲大、trigger counter pattern なら useEffect 1 つ追加で済む):

1. **state lift up vs trigger counter** を比較。lift up の touch ファイル数を見積もる
2. 子の内部 setter 利用箇所が **3 箇所以上 / 触りたくない既存挙動を保つ** なら trigger counter 採用
3. **prevTriggerRef.current** で `prev !== current` 判定を入れる (`useEffect[trigger]` だけだと初回マウントで誤発火)
4. **trigger 型は `number | undefined`** にして、`undefined` のとき (props 未渡し) は何もしない設計が後方互換的
5. trigger counter は **一方向起動専用** (open のみ / close は子の内部 state で完結)。両方向制御が必要なら state lift up が正しい

主な使用箇所: `FeedSidebar` の `openFeedAddTrigger` (空状態 CTA から FeedAddModal を起動、内部 `setInputOpen` 既存 callers はそのまま)

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

**How to apply**: ブラウザネイティブ API のラッパー hook で「自然完了 → 何かを発火」したい要件を実装するとき (state 遷移ベースだと手動 cancel と自然完了が原理的に区別不可、`cancel()` がイベント不発火する API 規約を利用):

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

主な使用箇所: `useSpeechSynthesis` の `endedCount` ↔ `AutoReadController` の `prevEndedCountRef`

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

**How to apply**: extraction 判定で「行数が増えるからやめる」と即決しない:

1. **sibling 概念の数を数える** — 2 つなら微妙、3 つ以上なら強い動機
2. **既に sibling の片方が抽出済** か — Yes なら symmetry のため抽出推奨
3. **将来も sibling として並列扱いか** — Yes なら抽出
4. 上記が複数 Yes なら **行数増減無視で extraction OK**。コミットメッセージに「symmetry のための extraction」を明記して将来の AI/開発者の判断材料にする
5. JSDoc に「対称となる sibling コンポーネント」をリンクで明示 (例: `AppListPane と対称な薄いラッパー`)
6. **「2/3 終わったから残り 1 個もやる」と最初から計画**: 全 sibling を抽出しきって初めて transitive cleanup (親から子 sibling 共通の依存 imports/hooks を一括削除) が発火する。中途半端に終わらせると最大の利得を取りこぼす

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

**How to apply**: 大きな新機能 Issue を見たとき、まず実装計画を「データ変換層 (純粋関数)」と「副作用層 (UI / DOM / async)」に分ける:

1. データ変換層を `src/lib/<feature>.ts` に切り出し可能か判断
2. 可能なら Phase 1 として純粋関数 + TDD を 1 PR で完結
3. Phase 2 として UI 統合を **別 Issue 起票** (Phase 1 の commit hash を参照ピン)
4. 元 Issue には「Phase 1 完了」コメント + Phase 2 Issue 番号を記載

実例:

- `selectGalleryImages` — Phase 単独で UI 統合まで含めた小規模ケース
- `splitIntoSentences` / `selectActiveCharIndex` — Phase 分離の典型

### 派生ケース: Phase 1 実装中は **ライブラリ調査エージェントを並列派遣** して Phase 2 用情報を蓄積する

Phase 1 (純粋関数 + TDD) は **依存ライブラリの内部 API を読まなくても完結する** ことが多い (純粋関数は input/output だけで設計可能)。一方 Phase 2 (UI 統合) はライブラリ API への深い理解が必要で、設計判断ポイント (どの API を使えば「viewport 外のみ更新」を実現できるか等) が事前に分からないと着手の見積もり困難。

`Phase 1 実装 (main thread) + ライブラリ API 調査エージェント (run_in_background: true)` を並列起動することで、Phase 1 commit と同サイクルで **Phase 2 設計メモを Issue コメントに蓄積** できる。次サイクル Phase 2 着手時にウォームスタート可能。

```
main thread:
  Phase 1 spec 作成 → Red 確認 → 純粋関数実装 → Green → commit

並列エージェント (run_in_background: true):
  node_modules/<lib>/ の type definitions + 実装を Read
  → Phase 2 で使う API の挙動を 300 words 以内でレポート
  → 結果は Issue コメントに転載して将来参照可能に
```

**How to apply**: Phase 1 / Phase 2 分離した Issue で Phase 1 着手するとき (Phase 1 main thread + Phase 2 用ライブラリ調査エージェントの並列分業は、依存ライブラリの非自明な制約を Phase 2 着手前に把握する保険になり、Phase 2 設計の手戻りを防ぐ):

1. Phase 1 純粋関数の **signature と TDD spec を main thread で書き始める** と同時に
2. 別エージェント (Agent + run_in_background: true) で **「Phase 2 で使う予定のライブラリ API の挙動」** を調査
   - prompt の形式: 「`node_modules/<lib>/dist/` 配下を Read して、X / Y / Z の挙動と公開メソッドを確認、300 words 以内で報告」
   - 「コード変更は不要」を明示
   - serena tools (find_symbol / search_for_pattern) を使うよう指示
3. Phase 1 commit の commit message + Issue コメントに **エージェント調査結果 (制約 / 回避策) を転載**
4. Phase 2 着手時に **同 Issue コメントから設計メモを参照** してウォームスタート

**反例 (並列派遣が不要なケース)**:

- 純粋関数自体が単純で Phase 2 設計が自明 (例: `selectGalleryImages` のように UI 統合まで含めて小規模)
- 依存ライブラリの API が完全に把握済 (過去サイクルで調査済 / 公式 docs を頻繁に参照中)
- main thread が他の Issue 処理で busy で並列管理コストを正当化できない

主な使用箇所: `gallery-offviewport.ts` (`#714 Phase 1`) — main thread で `isOffViewport` / `computeLastVisibleIndex` / `partitionByViewport` の TDD spec + 実装、並列エージェントで masonic v4 の `positioner.update` / `useResizeObserver` / `onRender(start, stop)` の挙動調査 → 「`positioner.update` は同列再 layout 制約あり / `onRender` の stop 捕捉で回避可能」という Phase 2 設計メモを 1 サイクルで取得

### 派生ケース: ライブラリ調査エージェントの「API 単位の事実」と「シナリオ全体の整合性」を区別する

ライブラリ調査エージェントは **「個別 API の存在 / 挙動」** は正確に報告するが、**「そのライブラリ全体の制約を踏まえたシナリオの実行可能性」** までは検証しないことがある。Phase 2 着手時に **「個別 API は揃っているのに、シナリオ全体としては成立しない」** という事態が発覚することがある。

```
パターン: シナリオ整合性の漏れ
  1. エージェント報告 (API 単位): 「`positioner.update(idx, h)` で任意 index の高さ更新可能」
     ✓ 事実として正しい
  2. Phase 2 着手で判明 (シナリオ全体): 「viewport 外 item で画像 load → update 呼出」
     ✗ 実は masonic は viewport 外を最初から render しないため、画像 load イベント自体が発生しない
  3. → 「個別 API は使える」が「想定シナリオは起きない」のミスマッチ
```

**How to apply**: ライブラリ調査エージェントの結果を Phase 2 設計に取り込む前に (個別 API の事実だけでは「ユーザー要望を満たす実装経路」が成立するかは検証されない):

1. **エージェント prompt に「シナリオ整合性の検証」を明示**:
   - 例: 「`positioner.update` の挙動を確認」だけでなく **「viewport 外 item で画像 load イベントが発生するか? = ライブラリは viewport 外を render するか?」** も併せて報告させる
2. **Phase 2 着手の最初の 30 分で「想定シナリオの最小再現実験」** を試みる (実装着手の前に、想定する trigger event が実際に発火するか確認)
3. **シナリオが成立しない場合は即座に Issue 進捗報告**: 当初の判断 (案 X) では実現不可と判明したことを明示し、代替案 (固定 height グリッド / 部分実装 / 現状受容) を提示
4. **当該シナリオが masonic / lodash / react-router 等の「fundamental design choice」に起因するなら、ライブラリ変更でなく要望側の調整** を選ぶ判断もあり (ユーザー要望「viewport 外のみ適応」を「Pinterest 型を諦めて Instagram 型グリッド」に妥協する等)

主な使用箇所: `#714` Phase 2 — masonic v4 は viewport 外 item を最初から render しない仕様のため、当初の案「viewport 外で画像 load → positioner.update」がシナリオ全体としては成立しないと Phase 2 着手時に判明。代替案 (固定 height グリッド化 / aspectRatio 切替抑制 / 現状受容) を Issue 進捗報告で提示して needs-user-decision 化

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

**How to apply**: 既存実装に代替実装を差し込む大型リファクタ要望 (Issue: 「ライブラリ差し替え」「engine 抽象化」「Provider DI 化」等) を見たとき (Phase 0 を「挙動変化なし」に保つと bisect/revert 可能):

1. 最初の commit を **「型契約 + 既存実装を契約準拠化」** に絞る (実装は touch しない)
2. consumer 側の固有型参照 (`SpeechSynthesisVoice` / `WebSocket` / `Stripe.Subscription` 等) を grep し、**全件抽象型 (`TtsVoice` / `WsLike` / `Subscription`) に置き換える**
3. 抽象型側にヘルパー (`<source>To<abstract>(v)` 関数) を提供し、テストで「不要 field の取捨選択」を assert
4. consumer 側の挙動が一切変わらないことを typecheck + 既存 e2e で確認してから commit
5. Phase 1b 以降を別 Issue 起票して、Phase 0 commit hash をピン留め

主な使用箇所: `src/lib/tts-adapter.ts` — Web Speech API → Piper wasm 差し替えの基盤

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

**How to apply**: 機能別分割が落ち着いたら、サブコンポーネント間で `git diff` 風の比較を行って **「ほぼ同一の 5 行以上のブロック」** がないか確認する。simplify 監査エージェントに「similar sub-components の重複」を観点として渡すと自動検出可能。

主な使用箇所: `VirtualRow` (`article-list-body/` の 3 サブコンポーネントから virtualizer item wrapper を集約)

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

**How to apply**: 既存 hook の使用箇所を増やしたいときは (`useState`/`useRef` ベース hook は呼び出しごとに別 state slot ができるので state 共有要件は Provider 化必須):

1. **既存呼び出し箇所が 1 ヶ所か** を grep で確認 (`useXxx` で全件検索)
2. 1 ヶ所なら → 新規呼び出し側に追加するのではなく、**Provider 化** + 既存呼び出しも context に移行
3. 既に複数箇所なら → そもそも state 分裂バグが潜んでいる可能性あり、調査要
4. App.tsx の Provider 階層に追加するときは **JSX 開閉タグの indent 整合** を check:fix で必ず通す (Provider を 1 段増やすと内側全部の indent が +2 ずれる)

主な使用箇所: `TtsAdapterContext` (`useSpeechSynthesis` を App.tsx で 1 回だけ呼んで記事ヘッダー / 設定モーダル両方で共有)

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

**How to apply**: 早期 return パスをコンポーネント / 関数に切り出すときは (TS 制御フロー解析は関数戻り値の non-null 性で呼出元変数を narrow できないため):

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

**How to apply**: 「早期 return + 抽出データ返却」型の helper を書くとき (TS は discriminator field で union を narrow するので plain object より discriminated union が `!` 不要):

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

**How to apply**: 子コンポーネントに「自分で `null` 返却して消える」設計を入れる場合、必ず onHide / onSkip コールバックも併せて実装する。親は:

1. `hiddenCount` state で集約
2. 子の入力配列が入れ替わったら useEffect でリセット
3. `allHidden = count >= total` 判定で fallback 分岐を追加 (例: 別ソース・空状態プレースホルダ)

主な使用箇所: `FilterableGalleryImage` の `onHide` (全画像が minPx 未満で隠れる時の thumb / No Image fallback)

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

**How to apply**: `React.X` を named import に書き換える sweep 作業を行うとき (React 由来の event 型は DOM global と同名のため、named import すると shadow して `addEventListener` overload マッチが壊れる):

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

主な使用箇所: `useColumnResize.ts` (`React.MouseEvent` → `MouseEvent` 化で `addEventListener("mousemove", ...)` overload と衝突 → `MouseEvent as ReactMouseEvent` で解決)

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

**How to apply**: ファイル中で `import React from "react"` を見つけたら、以下のステップで named import に変換 (React 17+ new JSX transform 以降、`React` global は JSX のために不要):

1. **value 系を named import に追加**: `createElement` / `Fragment` / `forwardRef` / `useImperativeHandle` / `memo` 等
2. **type 系も同時に named import 化** (本ファイル「DOM global 衝突対応」セクションのフロー適用)
3. **default import を削除**: `import React from ...` → `import { ... } from "react";`
4. **`React.X` の qualified 参照を全置換**: `replace_all` で `React.createElement` → `createElement` 等
5. **typecheck で漏れチェック**: `pnpm run typecheck` で残った `React.X` は検出される

**反例 (default import を残すべきケース)**:

- **古い React 16 系プロジェクト** (legacy JSX transform 前提) — 本プロジェクトは React 19 なので該当なし
- **Class component で `React.Component` extending** — 本プロジェクトでは関数コンポーネントのみ (CLAUDE.md 規約) なので該当なし
- **type-only import で `React.X` namespace 全部使うとき** — `import type * as React from "react";` の形なら可だが、named import の方が一般的

主な使用箇所: `article-ui-helpers.ts` (default `import React, { type ReactNode }` → named `import { Fragment, createElement, type ReactNode }` に変換)

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

**How to apply**: `useRef<AbortController>` + `useEffect[targetId]` で abort + cleanup する hook を書くとき (useEffect 発火順は子→親 depth-first なので、子 effect が新 fetch を set した後で親 cleanup がそれを abort する逆転が発生する):

1. **その hook が公開する関数 (fetch / subscribe / start) を、子コンポーネントが effect で呼んでいないか** を確認
2. 呼んでいる場合、**子の effect は親の cleanup より先に発火する** ことを意識
3. ref の値に **「対象 ID」を併記** (`{ controller, articleId }`) して、cleanup では **stale 判定** してから abort
4. ID が一致するときの abort をスキップしても、`fetchFullContent` 内の `ref.current?.controller.abort()` (新 fetch 起動時) で旧 fetch は確実に abort されるので問題ない
5. **本番ログで abort 発火元を切り分ける必要があるとき** は、`articleId-effect-fired { hadController, isStaleController }` のように **ref の状態 + 判定結果** をログに出す

主な使用箇所: `useArticleContent.ts` の `fetchAbortControllerRef = { controller, articleId }` 構造

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

**通常の render 負荷はほぼゼロ**: 境界到達時に 1 回だけ state 変化 → 関連 useMemo / useEffect が再評価されるだけ。`setInterval(1000ms)` のような頻繁な polling は不要 (時刻には変化通知イベントが無いので「次の境界まで `setTimeout` → 境界到達で setState → state 変化で再 schedule」の自己再帰パターン、+1000ms はクロックずれの安全マージン)。

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

主な使用箇所: `useUtcDate` (`useArticleUnreadStats.ts`) — `readTodayCount` の midnight stale バグ修正

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

**How to apply**: ブラウザネイティブ API を呼ぶ useEffect を書くとき (`voiceschanged` / `MutationObserver` / `navigator.mediaDevices.devicechange` / `screen.orientation.change` 等、初期化が非同期で完了する API は初期取得 + イベント購読のペア必須):

1. **「初回呼び出しで完全な値が取れるか？」を必ず確認** (MDN ドキュメント or 動作確認)
2. 取れない場合、**変更通知イベントが提供されているか確認** (`xxxchanged` / `change` 系)
3. 提供されているなら **初期取得 + イベント購読 + cleanup の 3 点セット** を必ず書く
4. 提供されていない (古い API) なら polling / setInterval を最小頻度で

主な使用箇所:

- `useSpeechSynthesis` の `voiceschanged` 購読
- `useResizeObserver` 系 (`ResizeObserver` の初回コールバック)
- `useOnlineStatus` の `online` / `offline` イベント購読
