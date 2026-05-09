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
