---
description: React hooks の stale closure 回避・循環依存解消パターン
paths: "src/hooks/**/*.ts"
---

# React Hook パターン

## stale closure 回避パターン (`useSyncedRef`)

`useEffect` / `useCallback` のクロージャが古い値を参照する問題を `useSyncedRef` で回避する。
レンダーごとに `ref.current` を自動更新するため、常に最新値を参照できる。

```typescript
// Before: useRef + 手動更新（ミスしやすい）
const callbackRef = useRef(onUpdate);
callbackRef.current = onUpdate;
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);

// After: useSyncedRef（レンダーごとに自動更新）
const callbackRef = useSyncedRef(onUpdate);
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);
```

主な使用箇所: `useReadState`, `useFilteredArticles`, `useKeyboardNav`

### 派生ケース: `useSyncedRef` を `useMemo` / `useEffect` の **deps 配列** に入れてはいけない

`useSyncedRef` の戻り値は「ref オブジェクト自体」が安定 reference (`useRef` と同じ identity 不変)。これを useMemo / useCallback / useEffect の **deps 配列に入れると、ref.current が変わってもメモが再計算されず、effect も再発火しない**。「ref 経由で最新値が読めるから deps 不要」という直感は **キャッシュ無効化** を引き起こす。

```typescript
// アンチパターン: deps に ref を入れて「ref で最新値を参照するから deps 不要」のつもり
const readIdsRef = useSyncedRef(readIds);
const result = useMemo(() => {
  // ref.current は最新だが、useMemo はそもそも再実行されない
  for (const a of articles) {
    if (!isArticleRead(a, readIdsRef.current, ...)) { /* ... */ }
  }
  return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref で deps 不要 ← 嘘
}, [articles, readIdsRef]); // ← readIdsRef は永久に同 identity → readIds 変化が無視される

// 修正パターン: 値を直接 deps に渡す
const result = useMemo(() => {
  for (const a of articles) {
    if (!isArticleRead(a, readIds, ...)) { /* ... */ }
  }
  return result;
}, [articles, readIds, readBeforeTimestamp]); // ← 値の identity 変化で再計算される
```

**How to apply**: `useSyncedRef` を使うときは以下の判定:

1. **`useEffect(() => { ... }, [])` の中で参照** (subscription / 1 度だけのセットアップ) → ✅ ref で OK
2. **`useEffect(() => { ... }, [deps])` の deps 配列** → ❌ ref を deps に入れない / 値を直接 deps に渡す
3. **`useMemo(() => { ... }, [deps])` の deps 配列** → ❌ ref を deps に入れない / 値を直接 deps に渡す
4. 「perf 最適化のため ref に逃がす」のは罠。**まず素直に値を deps に渡し、計測して問題があれば別の最適化** (例: 構造的等価性ガード) を検討
5. `eslint-disable-next-line react-hooks/exhaustive-deps` を書きたくなったら、本当に正しい設計か疑う。多くは間違ったパターンの言い訳

**lint warning との関係**: `useSyncedRef` 化で `react-hooks/exhaustive-deps` warning が増える (lint が「ref を deps に追加すべき」と誤検知する) ことがある。これは lint が `useSyncedRef` 規範を完全認識できないため発生する **既知の false positive**。**規範通りなら warning 件数増は許容**、`// eslint-disable-next-line` も追加しない (上記ステップ 5 の延長)。warning 件数だけで「修正失敗?」と判断せず、規範整合 (`useEffect` の `[]` deps で 1 度だけセットアップ + ref で最新値を読む) を優先する。実際、既存の `useReadingProgress` / `useReadState` 等、`useSyncedRef` を採用済みの hook はすべて同 warning を許容している。

主な使用箇所: `useSidebarFeeds.ts` (前は `readIdsRef` を deps に入れて未読カウント永続的にキャッシュされる重大バグが発生 → 直接 `readIds` deps に修正)

## hook の循環依存を ref で解消する

Hook A の出力 (state) を Hook B の入力に渡し、かつ Hook B の出力 (callback) を Hook A の内部処理 (例: `speak` 内の boundary handler) に注入したいとき、宣言順だけでは解決できない循環が発生する。**callback 用の ref を「Hook A 呼び出し前」に作って両方に渡す** と解決する。

```typescript
// アンチパターン: useTts の handleTtsToggle が useHighlight.handleBoundary を呼びたいが
// useHighlight は useTts の isPlaying を必要とするので宣言順を入れ替えられない
const tts = useTts(article); // ← speak 内で onBoundary を呼びたい
const highlight = useHighlight(sentences, tts.isPlaying); // ← isPlaying が必要
// tts.handleTtsToggle が highlight.handleBoundary を呼びたいが、ここでは tts は既に確定済み

// 修正パターン: ref を 1 つ前で作って両方に渡す
const onBoundaryRef = useRef<((idx: number) => void) | null>(null);
const tts = useTts(article, onBoundaryRef); // 内部で onBoundaryRef.current?.(idx) を呼ぶ
const highlight = useHighlight(sentences, tts.isPlaying);
onBoundaryRef.current = highlight.handleBoundary; // 後付けで assign
```

**How to apply**: hook 同士で「片方の output が他方の input、その output 先が更にもう片方の internal 処理を呼ぶ」三角関係を見つけたら、callback 用 ref を 1 つ前に作って両 hook に渡す。Hook A 内部では `ref.current?.(...)` で安全に呼び出し (null チェック必須)、Hook B から取得した callback を効果的に **後付け assign** する。assign は render 中で OK (ref はマウント前から不変)。

主な使用箇所: `useArticleViewTts` ↔ `useTtsHighlight` の boundary 配線

## hook 数変化は「全 render で一律変化 (OK)」と「render 間で差 (NG)」を区別する

React の `Uncaught Error: Rendered more hooks than during the previous render` は **同一コンポーネントの異なる render 間で hook 数が変化** することを禁じるルール。**全 render で一律に増減** する変更 (例: dead hook 削除 / 新規 hook の無条件追加) は **全 render で同じ hook 数** を維持するため violation にならない。

```typescript
// 一律削減 (OK): 全 render で useRef × 1 削減、render 間差なし
export function useFoo(): void {
-  const deadRef = useRef<number>(0);  // 削除
  const liveRef = useRef<number>(0);
  useEffect(() => { ... });
}

// render 間差 (NG): 条件分岐で hook 呼び出し数が変動
export function useBar(flag: boolean) {
  useEffect(() => { ... });
  if (flag) useEffect(() => { ... });  // ← flag の値で hook 数が変わる → violation
}
```

**How to apply**: hook 数を変える変更 commit で pre-commit e2e に `Rendered more hooks` 系 React error が出たとき (本変更が真因か、master HEAD 既存 React bug の影響かを区別する):

1. **本変更が hook 数を「全 render で一律」変化させているか確認** (条件分岐 / early return 内の hook 呼び出し追加削除でない、無条件 hook 呼び出しの増減のみ)
2. **一律変化なら React rules of hooks 違反にならない** — pre-commit e2e fail は他の master HEAD 既存 bug の影響
3. **失敗 spec の stack trace を確認** で本変更が touch していない hook (例: `useOgpCache` 等) が指されているか確認 → 既存 bug 起源と確定
4. **build-check.md 派生「React runtime error 切り分け」規範に従い SKIP=e2e-test 適用** + commit message に「本変更は hook 数一律変化で React rendering 無関係」明示
5. **本変更影響範囲 spec を単体実行で全 pass 確認** + commit message にエビデンス記載

**反例 (本変更が真因のケース)**:

- 本変更が **条件分岐 / early return 内に hook 呼び出しを追加** → render 間差発生、本変更 trigger 確定
- 本変更が **既存 hook の deps 配列を変更** で hook 数 indirect に変化 → 本変更 trigger 候補
- 本変更前は e2e pass、本変更後に大量 fail + stack trace が本変更 touch ファイルを指す → 本変更 trigger 確定

主な使用箇所: `useReadingProgress` の `useRef × 1` (`progressRef`) を削除したとき、全 render で hook 数が一律 1 減少 = render 間差なし → React rules of hooks 違反にならず、pre-commit e2e fail は master HEAD 既存 `useOgpCache` hook order regression の影響と判定して SKIP=e2e-test で commit

## 同一 hook 内で `useEffect` と `useMemo` 両方から参照する `Date.parse` 結果は `useMemo` の `Map<id, timestamp>` にキャッシュする

`useEffect` と `useMemo` の **両方で同じ items の `Date.parse(item.mutedUntil)` を呼ぶ** hook は、render ごとに重複計算が発生する。`useMemo` で `Map<id, timestamp>` を作り、`useEffect` / `useMemo` 両方がその Map を参照する設計に変更することで重複 `Date.parse` を 1 回に集約できる。

```typescript
// アンチパターン: useEffect と useMemo が両方 Date.parse を独自に呼ぶ
useEffect(() => {
  const now = Date.now();
  const toUnmute = feeds.filter((f) => {
    if (!f.mutedUntil) return false;
    return Date.parse(f.mutedUntil) <= now; // ← useEffect 内で Date.parse
  });
  // ...
}, [feeds]);

const mutedFeedIds = useMemo(() => {
  const now = Date.now();
  return new Set(
    feeds
      .filter((f) => f.mutedUntil && Date.parse(f.mutedUntil) > now) // ← useMemo 内でも Date.parse
      .map((f) => f.id),
  );
}, [feeds]);

// 修正パターン: useMemo で Map<id, timestamp> をキャッシュして両方から参照
const parsedUntilMap = useMemo(
  () =>
    new Map(
      feeds.filter((f) => f.mutedUntil).map((f) => [f.id, Date.parse(f.mutedUntil!)] as const),
    ),
  [feeds],
);

useEffect(() => {
  const now = Date.now();
  const toUnmute = feeds.filter((f) => {
    const until = parsedUntilMap.get(f.id);
    return until !== undefined && until <= now; // ← Map から O(1) 参照
  });
  // ...
}, [feeds, parsedUntilMap]);

const mutedFeedIds = useMemo(() => {
  const now = Date.now();
  return new Set(
    feeds
      .filter((f) => {
        const until = parsedUntilMap.get(f.id);
        return until !== undefined && until > now; // ← Map から O(1) 参照
      })
      .map((f) => f.id),
  );
}, [feeds, parsedUntilMap]);
```

**How to apply**: hook 内で同じ items の `Date.parse` を `useEffect` と `useMemo` の両方で呼んでいるとき (重複 parse は N 件 × 2 箇所の計算コストに加え、`Date.parse` の結果が両箇所で一致しない可能性の認知負荷も生む):

1. **`useMemo` で `Map<id, timestamp>` を作成** — deps に items 配列を含める
2. **`useEffect` の deps に Map を追加** + Map 経由で `parsedUntilMap.get(item.id)` で参照
3. **`useMemo` (フィルタ) も Map 経由に変更** + deps に Map を追加
4. **`undefined` チェックを `!== undefined` で明示** — `until !== undefined && until <= now` の形、`!until` だと `0` (1970年) を誤排除する罠あり

**反例 (Map キャッシュが不要なケース)**:

- `Date.parse` を呼ぶ箇所が **1 つだけ** (`useEffect` か `useMemo` のどちらか一方のみ) → 重複なし、inline で OK
- items が **常に 0-2 件** で計算コストが無視できる → overhead より冗長性のなさを優先して inline
- `mutedUntil` 等のフィールドが **頻繁に変化** して Map の安定性が低い → `useMemo` の deps も毎回 miss して恩恵なし

主な使用箇所: `useFeedFilters.ts` — `feeds` 配列の `mutedUntil` フィールドを `parsedUntilMap` にキャッシュして `useEffect` (期限切れ mute 解除) と `useMemo` (mutedFeedIds 集合) の両方から参照
