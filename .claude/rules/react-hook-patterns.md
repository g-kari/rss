---
description: React hooks の stale closure 回避・循環依存解消パターン
paths: "src/hooks/**/*.ts,src/hooks/**/*.tsx"
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
