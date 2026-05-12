---
description: React パターン集 — コンポーネント機能別分割 / Context / 早期 return narrowing / 子 hidden 検知 / DOM event 型 named import
paths: "src/**/*.tsx,src/hooks/**/*.ts"
---

# React パターン (コンポーネント設計 / Context / TS narrowing)

`coding-conventions.md` から分割した React 固有のコンポーネント分割 / Context / TS narrowing / DOM event 型パターン集。

## React state / ref パターン

→ `.claude/rules/react-state-ref.md` を参照 (#733 Step で分割)

含まれるセクション:

- state 更新前に「構造的等価性ガード」を入れて reference を安定化する (派生: signature string / モジュール sentinel freeze)
- ライブラリ仕様への依存は `vi.fakeTimers + rerender` で実挙動の固定スペック (派生: `new Ctor()` API は class 形式 mock / hook level 降格テスト / frozen state を helper で引数化)
- ref vs state の使い分け (同期チェック vs useEffect 再実行)
- trigger counter で「同じ依存値」でも useEffect を強制再実行 (派生: 子内部 state の外部起動 / monotonic counter で手動 cancel vs 自然完了の区別)
- ref の論理リセットポイントを忘れない (派生: 実行済み ID ref で effect 二重発火防止)

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

### 派生ケース: Phase 1 完了後に「ライブラリ乗り換え」代替案が出てきたら、移行コストでなく「乗り換え先が元目的を達成できるか」で判断する

Phase 1 (純粋関数 + TDD) 完了 → Phase 2 (UI 統合) 着手前に **ユーザーから「いっそ別ライブラリに乗り換えませんか」型の代替案** が提示されるケースがある。このとき:

- **移行コスト自体が小さい** ことだけを根拠に乗り換えると、**乗り換え先が Phase 1 で達成しようとしていた目的を満たさない**ケースで二重損失 (Phase 1 投資 dead code + 元目的未達) になる
- 「移行コストが小さい」と「元目的が達成できる」は **独立した判断軸**

```
パターン: Phase 1 完了後の代替案検証フロー
  1. 並列調査エージェント 2 体派遣 (互いに非依存):
     - Agent A: 代替ライブラリの API / bundle size / 機能調査 (cloudflare-markdown / WebFetch)
     - Agent B: 既存ライブラリの移行コスト分析 (public API leak / 内部結合 / e2e 影響)
  2. 結果を 2 軸で整理:
     - 軸 1: 移行コスト (small / medium / large)
     - 軸 2: 乗り換え先で **元 Phase 1 目的が達成できるか** (yes / no / partial)
  3. 判定マトリクス:
     | 移行コスト | 元目的達成 | 推奨                                                   |
     | ---------- | ---------- | ------------------------------------------------------ |
     | small      | yes        | 乗り換え推奨                                           |
     | small      | no         | **乗り換え見送り推奨** (Phase 1 投資が dead code 化)   |
     | small      | partial    | trade-off 整理して **ユーザー判断仰ぎ**                |
     | large      | yes        | trade-off 整理して **ユーザー判断仰ぎ**                |
     | large      | no         | 乗り換え見送り (二重損失)                              |
  4. Phase 1 投資 (純粋関数 + spec) が dead code 化するなら **その旨を Issue コメントに明示**
  5. 3 案 (続行 / 乗り換え / 中止) を flat 提示してユーザーがトレードオフを選べる形にする
```

**How to apply**: Phase 1 完了済 Issue で「いっそ X に乗り換えませんか」型コメントを受けたら (移行コスト自体が小さくても乗り換え先で元目的が未達なら二重損失、調査エージェントの「機能事実」と「元目的との整合」を独立軸で判定する):

1. **採用済 Phase 1 投資 (純粋関数 / spec / 設計判断) を列挙** — 何が dead code 化するかを最初に明確化
2. **代替ライブラリの fundamental design choice** が **元 Phase 1 の目的と整合するか** を最優先で確認
   - 例: 「viewport 外を render しない」設計の lib に「viewport 外でレイアウトを整える」を期待しても不可能
   - 例: 「automatic measurement only」の lib に「manual height override」を期待しても不可能
3. **trade-off を 3 軸表で整理** (bundle size / Phase 1 投資ロス / 機能達成度 / 移行コスト)
4. **「移行コスト小 + 元目的未達」と判明したら、乗り換えを default 見送り推奨に** (Phase 1 投資 dead code 化が真の cost)
5. 3 案 (continue / migrate / cancel) を flat 提示して **「ユーザーが何を最優先したいか」で案を選べる** 判定軸を併記

**反例 (乗り換え採用が妥当なケース)**:

- 代替ライブラリが Phase 1 純粋関数を **そのまま再利用できる** 構造 (= 抽象化が library に依存していない)
- 元 Phase 1 目的自体が **Phase 1 完了後にユーザー側で取り下げられた** (= 当初要求が変わった、これは codify 対象外)
- 代替ライブラリの設計思想が **元目的の上位互換** (= より広い問題を解決する) で trade-off 一方向に有利

主な使用箇所: `#714` Phase 1 完了 → ユーザー「いっそ virtuoso に乗り換えませんか」コメント → 2 体並列調査 (virtuoso API + 移行コスト) → 「移行コスト SMALL だが viewport-only rendering 強制で『viewport 外の列バランス維持』元目的が原理的に達成不能」と判明 → 案 A 続行 vs 案 B 乗り換え (元目的諦め) vs 案 C 中止の 3 案 trade-off 比較コメントで再判断仰ぎ

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

## React useEffect 副作用パターン

→ `.claude/rules/react-effect-patterns.md` を参照 (#733 Step で分割)

含まれるセクション:

- ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する
- AbortController.abort() の伝播範囲を限定する (派生: 子→親 effect 発火順で stale な abort を防ぐ)
- モード OFF 時に進行中の副作用を停止する
- 時刻境界 (midnight / 月跨ぎ等) で再 render する hook pattern
- ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く
