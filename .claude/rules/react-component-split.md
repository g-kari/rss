---
description: React 大規模コンポーネント機能別分割パターン集 — hook 抽出 / 同形 wrapper 集約 / Phase 分離 / Provider 化など
paths: "src/components/**/*.tsx,src/App.tsx,src/hooks/**/*.ts"
---

# React 大規模コンポーネント機能別分割パターン

`react-patterns.md` から `#733` Step (component-split クラスター抽出) で分割。500 行を超えるコンポーネントを機能別にサブコンポーネントへ分離するときの判断軸と派生ケース集。

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

### 派生ケース: 500 行超 sweep 時の「分割対象外カテゴリ表」で false positive を予防する

`find src -name "*.ts" -o -name "*.tsx" | xargs wc -l` 等で機械的に 500 行超ファイルを sweep すると、**「行数だけ見て分割推奨」と判定したくなる罠** がある。観点別 Refactor agent が 500 行超ファイルを「分割未対応」と機械的に判定すると、既存対応済 / 純粋関数集約 / 単一目的 lib 等を false positive で大量提案してくる。**sweep の最初に「分割対象外カテゴリ」を除外** してから真の分割候補を絞り込む。

```
パターン: 500 行超 sweep の分割対象外カテゴリ表
  | カテゴリ                              | 理由                                                                    | 例                                          |
  | ------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
  | orchestrator (既に分割済の薄い親)     | サブディレクトリへの分割が既に実施済、追加分割は Context lift up 等の設計要 | AppShell.tsx / ArticleList.tsx / feed-sidebar/index.tsx / useFilteredArticles.ts |
  | lib (純粋関数集約)                    | 純粋関数なので機能別分割優先度低、ファイル単位の責務境界明確              | shared-feed.ts / xml-parser.ts / recommendation.ts |
  | config (定数集約)                     | 単一責務 (定数 / enum / mapping)、分割は逆に追跡困難化                    | shortcuts.ts                                |
  | cron handler (単一目的 entry point)   | scheduled handler は 1 ファイル完結が canonical                          | cron/fetch.ts                                |
  | 密結合 hook (engine / adapter)        | state / lifecycle が密結合で分離すると stale closure リスク               | usePiperTts.ts / useSpeechSynthesis.ts       |
  | 認証 / 暗号 lib                       | セキュリティ critical で分散させると attack surface 増                    | server-auth.ts                              |
  | parser / serializer                   | 単一目的 (RSS / OPML / JSON-LD)、ロジック塊を分散させると context 切替コスト | xml-parser.ts                               |
```

**How to apply**: 500 行超 sweep で発見した各ファイルを **新規 Issue 起票判定する前に** 以下を確認 (sweep 結果を機械的に Issue 起票すると分割対象外を 80% 以上含む false positive の山になる、カテゴリ表で先に除外すれば真の分割候補のみ残る):

1. **ファイル種別を判定** — 表のカテゴリに該当するか確認 (`src/lib/` / `src/config/` / `src/cron/` / `src/hooks/use<Engine>Tts.ts` 等の path も判定材料)
2. **該当カテゴリなら sweep から除外** — Issue 起票しない
3. **該当しない 500 行超ファイル** (= 真の component / orchestrator で機能別分割可能) のみ評価対象
4. それでも残る候補は **`audit-workflow.md` 派生「観点別 Issue 起票 agent prompt 必須 3 要件」step 1 (`find_symbol` / `get_symbols_overview` で現状確認)** を agent prompt に必須化、orchestrator として既に分割済かを実コード確認
5. **本表は永続記録** — 将来の sweep で agent が同じ false positive を出さないよう、agent prompt に本表を引用させる

**反例 (本表の例外として分割すべきケース)**:

- orchestrator でも **30+ props を取る** + **複数機能を集約** している (例: `AppShell.tsx 930` の Context lift up 設計判断) → Issue 起票して **ユーザー判断要 (`needs-user-decision`)** で進める
- 純粋関数集約でも **テスト不能な巨大関数** が混ざっている → 関数単位の純粋関数化 + spec 追加 (これは「機能別分割」とは別軸)
- config でも **動的計算 / 副作用** が混入している → config 純粋化 + lib 切り出し (config の責務逸脱)

主な使用箇所:

- 500 行超 sweep で 11 件発見 → 全 11 件が本カテゴリ表で「分割対象外」と判定 (`AppShell.tsx 930` / `feed-sidebar/index.tsx 724` / `ArticleList.tsx 657` / `shared-feed.ts 619` / `shortcuts.ts 609` / `cron/fetch.ts 574` / `usePiperTts.ts 552` / `xml-parser.ts 536` / `useFilteredArticles.ts 536` / `server-auth.ts 518` / `recommendation.ts 517`) → Issue 起票 0 件で完結、`rule-maintenance.md § 9` 派生「全 sweep クリーンサイクル」の正常事例
- 過去サイクル Refactor agent が `useFilteredArticles.ts 536` を「分割未対応」と機械的判定 → 既に `useArticleFilters` / `useArticleSorting` / `useArticlePagination` orchestrator 化済の事実を見落とし → false positive。本表があれば agent prompt 段階で除外可能

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

### 派生ケース: ユーザー採用回答後でも、移行先 API の **機能 1:1 マッピング検証** で追加縮退が判明したら訂正コメント + 再判断仰ぎ

「Phase 1 完了後の代替案検証判定マトリクス」(上) で案提示 → ユーザー採用 → 実装着手前に **詳細 API 調査** を再度行い、**元実装の prop / 機能が代替先で 1:1 サポートされるか網羅検証** する。初回調査で見落とした機能縮退が判明した場合、**実装着手せず訂正コメントを投稿** して再判断を仰ぐ (issue-handling skill 「過去セッションの AI 返信を訂正するパターン」適用)。

```
パターン: ユーザー採用後の詳細 API 検証フロー
  1. 初回調査エージェント (e.g., cycle 67): bundle size / fundamental design / viewport behavior 等
     **「高レベル fit / unfit」** に焦点
  2. ユーザー採用回答
  3. 実装着手前 (e.g., cycle 75): 詳細 API 調査エージェント
     **「元実装の全 prop × 代替先の対応 prop」マッピング表** で網羅検証
  4. 追加縮退判明:
     - 移行先に存在しない prop (列幅 / overscan / itemKey / onEndReached 等)
     - 暗黙化された機能 (内部自動制御で外部からチューニング不可)
     - 自前実装が必要な機能 (pagination 等)
  5. **実装着手せず訂正コメント** で trade-off 再整理 + 再判断仰ぎ
  6. 訂正後の案 (案 B-Revised / 案 A-Revised / 案 C) で再採用待ち
```

**判断軸の進化**: 初回調査の「移行コスト × 元目的達成」マトリクスに加えて、ユーザー採用後の詳細調査では **「機能 1:1 マッピング」** を独立軸として評価する:

| 軸                             | 評価対象                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| 高レベル fit (初回)            | bundle size / fundamental design / viewport behavior / license |
| 元目的達成 (初回)              | 当初要求 (例: viewport 外列バランス) が代替先で満たせるか      |
| **機能 1:1 マッピング (詳細)** | **全 prop / 全 callback / 全イベントが代替先に存在するか網羅** |
| Phase 1 投資の活用             | 純粋関数 / spec / 抽象型 / 設定値が代替先でも生きるか          |

**How to apply**: ユーザーが採用回答した代替ライブラリ移行に着手する前に (初回調査は高レベル fit に焦点を当てるので、詳細 API は実装直前に再検証することで `移行可能だが機能縮退あり` の盲点を防げる):

1. **初回採用回答 commit を確定する前に、詳細 API 調査エージェントを派遣**
   - prompt に「元実装の全 prop / callback を列挙して、代替先での対応関係を 1:1 マッピング表で出力」を明示
   - 「機能不足があれば自前実装の選択肢も併記」を依頼
2. **追加縮退判明** したら issue-handling skill の **「過去セッションの AI 返信を訂正するパターン」** を発動:
   - `> 🤖 **AI 投稿 (Claude Code)** — 採用案 X 採用後の詳細調査で〇〇判明、再確認仰ぎ`
   - 「前回コメントの誤りを訂正」セクションで何を見落としていたかを明記
   - trade-off 再整理表 (cost / 元目的達成度 / 機能縮退 / Phase 1 活用) を出して `案 X-Revised` / `案 Y-Revised` / `案 Z (現状維持)` の 3 択を提示
3. **絶対に「先に実装着手して縮退発覚後に手戻り」を避ける** — 訂正コメントは数分、手戻りは数時間 〜 数日
4. 「ユーザーは案 X と回答済だから黙って実装すべき」と判断しない — **採用回答時の判断材料が誤っていた可能性** を考えて、判断材料の精度判明後は必ず追加投稿

**反例 (詳細調査が overkill なケース)**:

- 移行先が **同 family ライブラリ** (例: lodash → lodash-es、masonic v3 → v4) — API 互換性が高く、詳細マッピングは内部 changelog で確認可能
- 元実装が **prop 3-5 個程度の薄い wrapper** — 初回調査時点で全 prop 列挙済
- ユーザーが **「機能縮退 OK」を明示済** — `案 X (機能縮退込みで採用)` のような書き方で採用回答済なら詳細調査不要

主な使用箇所: `#714` cycle 75 — virtuoso 案 B ユーザー採用 (cycle 73) 後の詳細 API 調査で **columnWidth / overscanBy / itemKey / onEndReached の 4 機能縮退** + 別パッケージ `@virtuoso.dev/masonry` 必要 + bundle 1.7x (cycle 67 の 3-4x より小) が判明 → 訂正コメント + 案 B-Revised (機能縮退込み実装) / 案 A-Revised (masonic 続行 + Phase 2 統合) / 案 C (現状維持) で再判断仰ぎ

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

### 派生ケース: 大規模 UI 置換は「テストモード segregation」で 4 段階に分離する

masonic → 自前 virtualizer / Web Speech API → Piper wasm / Stripe v3 → v5 のような **library 差し替えを伴う大規模 UI 置換** は、いきなり全コードを書き換えるのでなく **テストモード設定 flag で dual implementation 切替 → ユーザー検証 → 旧削除** の 4 段階に分離する。default OFF で既存挙動互換を保ち、ユーザーが本番で動作確認できる経路を確保する。

```
Phase Xa: テストモード設定追加
  - localStorage 永続化 boolean flag (default false)
  - useReaderSettings / 同等の設定 Context に key 追加
  - UI に「実験的機能」セクション + toggle 配置
  - touch: 3-5 ファイル / 機能変化なし

Phase Xb: dual implementation
  - 新規 <NewImpl> コンポーネント (代替実装)
  - 既存 <Wrapper> 内で `if (flag) <NewImpl> else <OldImpl>` の薄い親で切替
  - touch: 2-3 ファイル / default OFF のため挙動変化なし

Phase Xc: 動作確認 (ユーザー実機検証)
  - master 反映後 Cloudflare CI/CD デプロイ完了
  - ユーザーがテストモード ON で本番動作確認
  - 異常時は toggle OFF に戻して Issue コメントで報告
  - バグ判明なら修正 → 再 Phase Xc

Phase X+1: default ON + 旧削除
  - flag default を true に変更 (or 設定 UI 削除)
  - 既存 <OldImpl> 経路を削除
  - 依存 library を package.json から削除 + lockfile 同期
```

**How to apply**: 大規模 UI 置換を計画するときに以下を判定 (一括書き換えは「動作確認なしで本番投入」になり revert 粒度が大きい、テストモード segregation なら本番でユーザー検証 + bisect 容易):

1. **対象が「library 差し替え / 主要 component 書き換え / fundamental design 変更」** か確認 (touch ≥ 5 ファイル + 既存ユーザー挙動に影響しうる)
2. **テストモード segregation 4 段階に分割可能か** 検証:
   - Xa: 設定 flag を localStorage + Context に追加可能か (= 既存設定パターンの延長で書ける)
   - Xb: dual implementation の薄い親 (`if (flag) ... else ...`) で切替可能か (= 新旧両方が同 Props で動作する形に設計可能)
   - Xc: ユーザーが本番で検証可能か (= 設定 UI に toggle が表示され、動作確認手順が明確)
   - X+1: 旧削除でファイル / 依存 library が消えるか (= 旧経路への参照がフラグ分岐のみに集約)
3. **Phase Xa-Xb は同サイクル or 別サイクル**:
   - 同サイクル: flag 追加 + dual impl 同時 → 1 master push でテスト可能、ただし touch 増
   - 別サイクル: Xa で flag のみ → Xb で dual impl → 各 commit が独立で revert 容易 (推奨)
4. **Phase Xc は AI 着手不可** (ユーザー本人の実機検証必須) — Phase Xb 完了報告コメントに「テストモード ON 手順 + 確認ポイント表」を含める
5. **Phase X+1 はユーザーから「問題なし → default ON で」承認後** に着手 (検証期間を 1-2 週間設ける運用も可)

**反例 (テストモード segregation が overkill なケース)**:

- **小規模変更** (touch ≤ 3 ファイル + 既存挙動互換) → flag なしで直接書き換え OK
- **複数 sub-component に拡散しない isolated 変更** (例: 1 純粋関数の signature 変更 + caller も 1 箇所) → dual impl のコスト > 利得
- **revert 不要が明らか** (例: bug fix で「壊れた状態 → 直った状態」の単方向遷移、戻る価値なし)
- **ユーザーが UI 検証する手段がない** (バックエンド処理 / CI/CD pipeline 等) → flag より直接 deploy で OK

**「Phase 0/1 純粋関数 + テストモード segregation」の組み合わせ**:

純粋関数層 (`computeXxx` / `selectXxx`) を Phase 0/1 で先行実装 + spec 網羅 → Phase 2a 設定追加 → Phase 2b dual impl (純粋関数を呼ぶ新 component) → Phase 2c 検証 → Phase 3 default ON + 旧削除、の **5 階層 Phase 構造** が library 差し替えの canonical pattern。純粋関数層が先にあると UI 統合層の touch が薄くなる。

主な使用箇所: `#773` masonic → 自前 virtualizer 移行 — Phase 0 (型抽象化 + 純粋関数 2 つ) → Phase 1 (computeMasonryLayout + computeScrollAnchorDelta) → Phase 2a (`gallerySelfMasonryEnabled` flag 追加 + DisplayTabPanel 「実験的機能」セクション) → Phase 2b (`<GalleryMasonrySelf>` + `useMasonryLayout` + 親で dual impl 分岐) → Phase 2c (ユーザー検証待ち) → Phase 3 (default ON + masonic 削除予定)

### 派生ケース: Phase 2a の「純粋関数 + TDD (part1) → hook 実装 + ライブラリ追加 (part2)」細分でライブラリ追加判断を遅らせる

Phase 0 (型抽象化) 完了済の Issue で Phase 2a (新 engine 実装) に着手するとき、**Phase 2a を更に part1 (ライブラリ追加なしの mapping 純粋関数 + TDD) / part2 (ライブラリ追加 + hook 実装)** に細分すると、ライブラリ追加 commit を遅らせて以下のメリットを得られる:

1. **bisect 粒度向上** — 純粋関数 commit と hook 実装 commit が分かれるので、回帰検出時にどちらが原因か即特定
2. **既存依存への擦り寄せ調査余地** — part1 完了時点で純粋関数 spec が走るため、ライブラリ追加判断 (npm install) を 1 サイクル遅らせて既存依存 (`@cloudflare/workers-types` / 既存 hook 等) で代替可能か再評価できる
3. **TDD の安心感** — ライブラリ依存のない mapping ロジックが Green になっていると、hook 実装で「失敗の原因がライブラリか mapping か」を即区別可能
4. **ライセンス調査の遅延** — npm install 前にライブラリの再配布権・transitive deps を debate できる

```
パターン: Phase 2a 細分による段階的着手
  ├─ Phase 0 (完了済): 型抽象化のみ (TtsAdapter / TtsVoice 等の interface)
  ├─ Phase 2a-part1: ライブラリ独立な mapping 純粋関数 + TDD ← 本サイクル commit
  │   - 例: piperVoiceToTtsVoice(voiceId): TtsVoice | null
  │   - 例: parsePiperVoiceId, formatVoiceName, langCodeConvert 等
  │   - 全 spec が Green、ライブラリ未 install
  ├─ Phase 2a-part2: ライブラリ追加 + hook 実装 ← 次サイクル commit
  │   - npm install + usePiperTts 実装 + Audio 再生管理
  └─ Phase 2b: UI 配線 + engine 切替 ← part2 完了後別サイクル
```

**How to apply**: 「大規模新機能 (新 engine / 新 lib / 新 wasm) 着手時に Phase 2a が複数 step を含む場合」(part1 commit が pre-commit hook を独立通過することで bisect 粒度 + ライブラリ追加判断遅延の両方を得られる):

1. **Phase 2a の touch ファイル一覧** を先に列挙 (型 mapping 純粋関数 / hook / コンポーネント設定変更 / ライブラリ install)
2. **mapping 純粋関数 (= ライブラリ独立)** と **hook 実装 (= ライブラリ依存)** を分離可能か確認
3. 分離可能なら part1 / part2 で別 commit
4. part1 commit に「**Phase 2a-part1: 純粋関数 + TDD、ライブラリ追加は part2 で**」と明記
5. part2 着手時に **既存依存で代替可能か再評価** (1 サイクル経過で他観点の調査結果も入っているかも)

**反例 (細分が overkill なケース)**:

- Phase 2a が小規模 (50 行未満) で mapping と hook が一体的に書ける → 単一 commit で OK
- ライブラリ API が複雑で純粋関数 part だけで全てカバーできない (戻り値型がライブラリ依存) → part1 で型を `unknown` 的に書くと spec が薄くなる、part1 を見送り
- 純粋関数層が **既存抽象型 (`tts-adapter.ts` 等) を import するだけ** で自己完結する場合は適用範囲広い

主な使用箇所: `#674` Phase 2a-part1 — `piper-adapter.ts` (87 行) + 13 ケース spec を `@mintplex-labs/piper-tts-web` 未 install のまま先行 commit。Phase 2a-part2 (本サイクル) で hook 実装 + npm install を完了 (`usePiperTts.ts` 332 行 + 11 ケース spec + dynamic import lazy load パターン)

### 派生ケース: Phase 2a-part2 (代替 engine 実装) の dynamic import singleton + token counter で「engine 起動コスト分離 + 進行中処理破棄」を両立する

Phase 2a-part1 で型 mapping を切り出し済の hook 実装 part2 で、**wasm engine のような重い依存** を統合するとき:

1. **engine 起動 (wasm load + onnxruntime init) コストは初回 speak() 時のみ** にしたい → module-level `Promise<X> | null` singleton + `await import("...")` で実現
2. **進行中 predict() の Promise を新 speak / stop で破棄** したい → `playToken: number` counter で「自分の token が `playTokenRef.current` と一致するか」で破棄判定
3. **boundary 通知 (charIndex) を提供しない engine** にも対応 → 経過時間 × 推定 cps × playbackRate で setInterval 擬似発火

```typescript
// 単一 promise キャッシュで lazy load を 1 回に限定
let piperLibPromise: Promise<PiperLib> | null = null;
function loadPiperLib(): Promise<PiperLib> {
  if (!piperLibPromise) {
    piperLibPromise = import("@mintplex-labs/piper-tts-web").then(
      (mod) => ({ predict: mod.predict, voices: mod.voices }) as PiperLib,
    );
  }
  return piperLibPromise;
}

// token counter で進行中 predict 結果を破棄判定
const playTokenRef = useRef(0);

const stop = useCallback(() => {
  playTokenRef.current += 1; // 即無効化
  resetState();
}, [...]);

const speak = useCallback((text, onBoundary?) => {
  releaseAudio();
  const token = ++playTokenRef.current;
  (async () => {
    const lib = await loadPiperLib();
    const blob = await lib.predict({ text, voiceId });
    if (token !== playTokenRef.current) return; // stop / 別 speak で破棄
    // ... <audio> 生成 + 再生
  })();
}, [...]);

// boundary 擬似発火 (engine API なし)
const ESTIMATED_CPS = 12;
boundaryTimerRef.current = setInterval(() => {
  const elapsedMs = Date.now() - startTimeRef.current;
  const charIndex = Math.floor((elapsedMs * ESTIMATED_CPS * rateRef.current) / 1000);
  onBoundaryRef.current?.(Math.min(charIndex, currentTextRef.current.length));
}, 100);
```

**How to apply**: 既存 hook (`useSpeechSynthesis` 等) と並列で代替 engine の hook を実装するとき (engine 起動コストは module-level singleton で確実に 1 回に絞れる + token counter で非同期境界での race condition を予防):

1. **dynamic import を関数化** (`loadXxxLib()`) + module-level `let xxxPromise: Promise<X> | null = null` で singleton
2. **非同期 fetch / predict / connect を含む `speak()` / `start()` / `connect()`** は **token counter** で進行中処理破棄パターンを採用
3. **engine が boundary / progress 等の通知 API を提供しない** なら、setInterval + 推定式で擬似発火 (精度が必要なら別 Phase で改善)
4. **`<audio>` / `<video>` / `Worker` などの DOM/runtime resource** は `releaseXxx()` ヘルパーで cleanup を 1 箇所に集約 (resetState / stop / 新 speak / unmount すべてから呼ぶ)
5. test mock では library を `vi.mock("@xxx/lib", () => ({ ... }))` + DOM API (`Audio` / `URL.createObjectURL`) を class 形式 mock + 個別メソッド `Object.defineProperty` (前述「ハイブリッド API」派生ケース) で stub

**反例 (token counter 不要なケース)**:

- engine 起動と speak() が同期で完結 (Web Speech API のように `speak()` が即時 queue に積むのみ) → token 不要、`utteranceRef.current === utterance` の identity 比較で十分
- 非同期境界が 1 つしかない (predict() の単一 await のみ) → AbortController でも代替可能だが、ライブラリが AbortSignal を受け取らない場合は token counter が現実的

主な使用箇所: `usePiperTts.ts` (#674 Phase 2a-part2) — dynamic import singleton + `playToken` counter で `predict()` await 中の stop / 別 speak を破棄、`setInterval` 経由 boundary 擬似発火で onBoundary callback を提供

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
