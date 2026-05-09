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
