---
description: React state / ref パターン集 — 構造的等価性ガード / vi.fakeTimers + rerender / ref vs state / trigger counter / ref 論理リセット
paths: "src/hooks/**/*.ts,src/**/*.tsx"
---

# React state / ref パターン

`react-patterns.md` から `#733` Step (state-ref クラスター 5 セクション抽出) で分割。`useState` / `useRef` / `vi.fakeTimers` を使ったテスト / state 更新最適化 / ライブラリ仕様への依存固定に関するパターン集。

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

### 派生ケース: 複数 state を return する hook は **戻り値全体を `useMemo` で wrap** して Provider value の identity を安定化する

`useSpeechSynthesis` のような **複数 state field + 複数関数を集約した object を return する hook** は、毎 render で新オブジェクト reference を作る。これを Provider value に渡すと、内部 state (`isPlaying` 等) が変わらなくても全 consumer が re-render される。

```typescript
// アンチパターン: 戻り値が毎 render で新オブジェクト identity
export function useSpeechSynthesis(): TtsAdapter {
  const [isPlaying, setIsPlaying] = useState(false);
  // ... 他 state / callback
  return {
    engine: "web-speech",
    isPlaying,
    speak,
    pause,
    // ... 15 field
  };
}

// App.tsx で:
const ttsAdapter = useSpeechSynthesis();
// → ttsAdapter は毎 render 新 reference → TtsAdapterProvider value identity が毎 render 変わる
// → useTtsAdapter() consumer が全員 re-render

// 修正パターン: 戻り値を useMemo で wrap
export function useSpeechSynthesis(): TtsAdapter {
  // ... state / callback
  return useMemo<TtsAdapter>(
    () => ({
      engine: "web-speech",
      isPlaying,
      speak,
      pause,
      // ... 15 field
    }),
    [isPlaying, speak, pause /* 他 deps */],
  );
}
```

**How to apply**: 複数 state / callback を集約した object を返す hook を作るとき (戻り値の identity が毎 render 変わると、Provider value 経由で配下 consumer が全員 re-render する。useMemo wrap で state 変化時のみ identity 更新に切り替えれば、不要 re-render を防げる):

1. **hook が `return { ... }` で複数 field の object を返している** か確認
2. **その hook の戻り値が Provider value や useMemo deps に渡される** か確認 (= 下流の identity 比較が走る)
3. 該当するなら **戻り値を `useMemo<ReturnType>(() => ({ ... }), [field1, field2, ...])` で wrap**
4. **deps 配列に全 field を列挙** — 漏れると stale closure バグ。useCallback で identity 安定化された関数は deps に入れても安全
5. useMemo wrap しない hook の戻り値はそのまま使う場合 (= 1 consumer のみ + Provider 経由しない) は不要

**反例 (useMemo wrap が overkill なケース)**:

- hook の戻り値が **1 consumer 1 用途** で Provider に渡らない (例: useArticleContent → 単一 component で消費)
- 戻り値が **primitive 単体** (`return value` / `return [a, b]` 配列 destructure pattern) → React の `===` 比較で skip される
- 戻り値が **絶対に変化しない constant object** (例: `useState(() => ...)` の setter のみ返す) → 既に identity 安定

主な使用箇所: `useSpeechSynthesis` (#674 Phase 2b 配線 + 79th cycle perf 監査) — 戻り値 16 field を `useMemo([isPlaying, isPaused, endedCount, errorCount, rate, cycleRate, volume, setVolume, ttsVoices, voiceUri, setVoiceUri, speak, pause, resume, stop])` で wrap。App.tsx の `ttsAdapter` useMemo + TtsAdapterProvider value の identity が state 変化時のみ更新されるようになり、不要 re-render を防止

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

主な使用箇所: `useBackgroundAudio.test.ts` — `vi.fn(() => mockCtx)` で AudioContext 作成カウントが 0 のまま fail → class MockAudioContext に書き換えで 6 ケース全 pass

### 派生ケース: ハイブリッド API (constructor + 静的メソッド併用) は **全体 stub せず個別メソッドを `Object.defineProperty` で stub** する

`URL` / `Request` / `Response` のように **`new URL()` (constructor) + `URL.createObjectURL()` (静的メソッド)** の両方を使う Web API は、`vi.stubGlobal("URL", { createObjectURL: vi.fn(), ... })` で **全体 stub すると constructor 機能が消失** する。テスト対象が同じファイル内で `new URL(absoluteUrl).hostname` のような constructor 利用箇所を持つと、`TypeError: URL is not a constructor` で全 case fail する典型罠。

```typescript
// アンチパターン: URL 全体を stub → new URL() が壊れる
vi.stubGlobal("URL", {
  createObjectURL: vi.fn((blob) => "blob:mock-1"),
  revokeObjectURL: vi.fn(),
});
// テスト対象内: new URL(href) → TypeError: URL is not a constructor

// 修正パターン: 既存 URL の静的メソッドのみ Object.defineProperty で上書き
Object.defineProperty(URL, "createObjectURL", {
  value: vi.fn((blob: Blob) => `blob:mock-${++count}`),
  configurable: true,
  writable: true,
});
Object.defineProperty(URL, "revokeObjectURL", {
  value: vi.fn(),
  configurable: true,
  writable: true,
});
// → constructor (new URL(href)) は native のまま、静的メソッドだけ mock
```

**How to apply**: 「constructor + 静的メソッド」の両方を持つ Web API (`URL` / `Request` / `Response` / `Blob` / `File` / `FormData`) を mock するとき (全体 `vi.stubGlobal` は class 形式 mock で動くが、ハイブリッド API では constructor 機能が消失して別箇所の `new` 呼び出しが破壊される):

1. **対象 API が constructor で呼ばれている箇所をテスト対象ファイルで grep** (例: `new URL\(` / `new Blob\(`)
2. **constructor も静的メソッドも使う** なら個別 `Object.defineProperty(API, "method", {value, configurable, writable})` で stub
3. **constructor は使われていない** (`vi.stubGlobal` の class 形式パターンが正しい) ケースは前述 (前項) のとおり全体 stub OK
4. **afterEach での cleanup**: `configurable: true` なら test 終了時に `Object.defineProperty(URL, "createObjectURL", { value: originalURLCreateObjectURL })` で復元可能 (`vi.unstubAllGlobals` は個別 defineProperty を戻さないので、必要なら手動)
5. `vi.spyOn(URL, "createObjectURL")` も使えるが、`vi.spyOn` は **元実装の振る舞いを保持** するので spy 用途。完全 mock したいなら `Object.defineProperty` の `value` 上書き

**該当する典型 API** (constructor + 静的メソッド併用):

| API        | constructor               | 静的メソッド                                     |
| ---------- | ------------------------- | ------------------------------------------------ |
| `URL`      | `new URL(href, base?)`    | `URL.createObjectURL` / `URL.revokeObjectURL`    |
| `Blob`     | `new Blob([data], opts?)` | (V8 にはなし、仕様上将来追加可能性)              |
| `Response` | `new Response(body)`      | `Response.json` / `Response.error` / `.redirect` |
| `Request`  | `new Request(input)`      | (なし)                                           |
| `FormData` | `new FormData(form?)`     | (なし)                                           |
| `Headers`  | `new Headers(init?)`      | (なし)                                           |

主な使用箇所: `usePiperTts.test.ts` — `URL.createObjectURL` mock のため `vi.stubGlobal("URL", {...})` を採用したら hook 内部の `new Audio(url)` 経由で URL constructor が呼ばれず TypeError、`Object.defineProperty(URL, "createObjectURL", {...})` に書き換えで 11 ケース全 pass

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

### 派生ケース: fallback chain hook の consumer 通知タイミングは「中間 attempt」と「諦め (最終 attempt)」で分離する

`attempt 0: proxy URL → 1: 原 URL → 2: 諦め` のような **fallback chain を内包する hook** で consumer に `onError` callback を pass-through するとき、**中間 attempt の onError と最終 attempt (諦め) の onError を区別** する。中間でも consumer に通知すると、consumer 側で「alt UI を出した直後に次 attempt で load 成功」のような状態管理矛盾が発生する。

```typescript
// アンチパターン: すべての attempt で consumer 通知 → 中間 attempt で alt UI チラつき
export function useImageProxyFallback(url, options?: { onError?: (e) => void }) {
  const [attempt, setAttempt] = useState(0);
  const onError = useCallback((e) => {
    setAttempt((prev) => (prev === 0 && canFallback ? 1 : 2));
    options?.onError?.(e); // ← attempt 0→1 (中間) でも発火、consumer が誤って fallback UI 表示
  }, [...]);
}

// 修正パターン: 諦め (attempt 2) 到達時のみ consumer 通知
export function useImageProxyFallback(url, options?: { onError?: (e) => void }) {
  const [attempt, setAttempt] = useState(0);
  const onError = useCallback((e) => {
    if (attempt === 0 && canFallback) {
      setAttempt(1);
      return; // 中間 attempt は consumer 通知せず fallback 継続
    }
    setAttempt(2);
    if (e) options?.onError?.(e); // 諦めた時点でのみ通知
  }, [attempt, canFallback, options?.onError]);
}
```

**How to apply**: fallback chain (proxy → 原 URL → 諦め / engine A → engine B → 諦め / endpoint primary → secondary → tertiary 等) を提供する hook で consumer callback を受け取るときに以下を判定 (前述「monotonic counter で手動 cancel と自然完了の区別」と同テーマ — API 内部の異なる完了パスを区別して consumer 通知タイミングを分離):

1. **attempt 状態を hook 内部 state で持つ** (`useState<0 | 1 | 2>(0)` 等の有限状態)
2. **「中間 (fallback 継続中)」と「諦め (最終 attempt 到達)」を 2 値で判別**:
   - 中間 → setState のみ、consumer 通知 skip
   - 諦め → setState + consumer.onError 発火
3. **`onLoad` は全 attempt で consumer 通知 OK** (load 成功は src がどの attempt かに関わらず良いニュース)
4. **既存 spec が引数なしで `onError()` を呼んでいる場合** は signature を `(e?: SyntheticEvent) => void` で optional 化 + 引数有無で consumer 通知の有無を分岐 (後方互換)
5. **JSDoc に「中間 vs 諦め」通知タイミングを明記** — consumer が「全 attempt で発火する」と誤解しないため
6. **TDD spec で「中間で consumer 不発火 / 諦めで consumer 発火」を網羅** (`vi.fn()` で発火回数 + 引数 assert)

**反例 (全 attempt で通知すべきケース)**:

- consumer が **debug / metric collection 目的** で全 attempt を観測したい → 別 callback (`onAttemptChange` 等) を別途提供
- attempt 数が 2 (chain なし、原 URL → 諦めの 1 fallback のみ) → 中間 / 諦めの区別が無意味、1 callback で OK
- consumer 側が **attempt ごとに異なる UI を出したい** (例: progressive enhancement で各 src 段階のアニメーション) → 全 attempt で通知する設計が正解

主な使用箇所: `useImageProxyFallback` — `attempt 0: /api/image-proxy → 1: 原 URL → 2: 諦め` の chain、consumer (`FallbackImage` 経由で `<img onError>` consumer) には attempt 2 到達時のみ通知して中間 fallback を意識させない

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
