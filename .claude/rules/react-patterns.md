---
description: React パターン集 — Context / 早期 return narrowing / 子 hidden 検知 / DOM event 型 named import
paths: "src/**/*.tsx,src/hooks/**/*.ts"
---

# React パターン (Context / TS narrowing / DOM event)

`coding-conventions.md` から分割した React 固有の Context / TS narrowing / DOM event 型パターン集。state/ref / コンポーネント分割 / useEffect は別ファイルに分離済 (下記 redirect 参照)。

## React state / ref パターン

→ `.claude/rules/react-state-ref.md` を参照 (#733 Step で分割)

含まれるセクション:

- state 更新前に「構造的等価性ガード」を入れて reference を安定化する (派生: signature string / モジュール sentinel freeze)
- ライブラリ仕様への依存は `vi.fakeTimers + rerender` で実挙動の固定スペック (派生: `new Ctor()` API は class 形式 mock / hook level 降格テスト / frozen state を helper で引数化)
- ref vs state の使い分け (同期チェック vs useEffect 再実行)
- trigger counter で「同じ依存値」でも useEffect を強制再実行 (派生: 子内部 state の外部起動 / monotonic counter で手動 cancel vs 自然完了の区別)
- ref の論理リセットポイントを忘れない (派生: 実行済み ID ref で effect 二重発火防止)

## 大きいコンポーネントの機能別分割パターン

→ `.claude/rules/react-component-split.md` を参照 (#733 Step で分割)

含まれるセクション:

- 機能別分割の指針 (オーケストレーター + 子の責務 / 既存 import パス維持 / 型の引き継ぎ)
- Step 内のさらなる最小スコープ化
- 派生ケース: 1 hook ずつ別 commit / 同 lambda の useCallback 集約 / 同形 JSX wrapper の polymorphic 化 / 30+ props 一括 forwarding の `ComponentProps<typeof Child>` 型継承 / 対称性のための symmetric extraction / category-bucket 集約 / Phase 分離新機能 / ライブラリ調査エージェント並列派遣 / Phase 0 型抽象化先行 / Phase 1 完了後の代替案検証判定マトリクス / 共通 wrapper の transitive cleanup

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

### 派生ケース: closure 内で narrowing が失効する罠 — narrowed const 束縛で保持する

TypeScript の **control flow 解析は closure (arrow function / 関数式) 内では narrowing 結果を持ち越せない**。三項演算子の truthy branch で `opts.selectedArticle` が non-null に narrow されても、内側の `(a) => ... opts.selectedArticle.id` arrow function の中では再度 `Article | undefined` 型に戻る。これは TypeScript 仕様 (variable は closure 内で再代入される可能性ありと安全側 default 評価)。

```typescript
// アンチパターン 1: closure 内で narrowing 失効 → ! が必要 (型エラー回避の見かけ上の妥協)
const idx = opts.selectedArticle
  ? list.findIndex((a) => a.id === opts.selectedArticle!.id) // ← closure 内で narrowing 失効、! で誤魔化す
  : -1;

// アンチパターン 2: closure 内の opts.selectedArticle が undefined になりうると判定 → TS error
const idx = opts.selectedArticle
  ? list.findIndex((a) => a.id === opts.selectedArticle.id) // TS error: Object is possibly 'undefined'
  : -1;

// 修正パターン: narrowed const 束縛で closure 内に narrowing 結果を持ち越す
const sel = opts.selectedArticle;
const idx = sel ? list.findIndex((a) => a.id === sel.id) : -1;
// ↑ sel は const で再代入不能 → closure 内でも narrowing 維持 → ! 不要 + 型安全
```

**TS 仕様の根拠**:

- **let / var**: closure 外で narrow されても、closure 内では再代入可能性のため最広型 (例: `Article | undefined`) に戻る
- **const + 即時呼出 closure** (array callback `.findIndex((a) => ...)` / `.map()` 等、**その場で同期実行される** closure): 再代入不能 + 呼出タイミングが narrowing 直後に確定するため、narrowing 結果が維持される (control flow 解析が `const` 束縛を信頼) → `!` 不要
- **const + 巻き上げ named function declaration** (`function resolve() { ... }` のように **定義後に複数回・遅延して呼ばれ得る** 関数): const でも narrowing が**失効する**。関数が narrowing 前後どのタイミングで呼ばれるか静的確定不能なため TS は安全側評価する → `!` non-null assertion が**必須**で、削除すると `TS18047: possibly null` になる。この場合は `!` が冗長でなく正当な型ガード (narrowed const 束縛への書き換えでも解決不能、関数を呼出元 scope 内のインライン arrow に変えない限り `!` が必要)
- **object property access** (`opts.selectedArticle.id`): property が getter 等で動的変化する可能性のため closure 内で narrowing 失効、`const sel = opts.selectedArticle` で値コピーすれば property access の動的性を排除

**How to apply**: `obj.prop ? closure(obj.prop) : ...` のような三項 + closure の組合せで TS narrowing 失効に直面したら (`!` で誤魔化す vs narrowed const 束縛で型安全 + 規範遵守の選択、後者が canonical):

1. **truthy branch の closure 内で `obj.prop` を参照しているか** を確認
2. 参照しているなら **closure 直前で `const x = obj.prop;` で束縛**
3. 三項 + closure を `const x = obj.prop; x ? closure(x) : null` の形に書き換え
4. **`!` 削除可能性 + typecheck pass** を verify
5. 既存 `! .id` 等の non-null assertion を `coding-conventions.md § 禁止事項` / `typescript-conventions.md § strict` 観点で sweep する際は本派生 pattern を canonical 解として推奨

**反例 (本派生 pattern 不要なケース)**:

- **closure を使わず直接 access** (`if (obj.prop) { use(obj.prop) }`) → 同一 scope で narrowing 維持、`!` 不要
- **object property でなく primitive 直接** (`if (x) { closure(x) }` で x が string 等) → narrowing 維持される (closure 内 const-like 扱い)
- **closure 内で別 property を参照** (closure 内で `obj.differentProp` 等を見る) → そもそも narrowing 対象外、`!` 不要

**agent 誤判定への注意**: code review / type safety agent は表面的に「const + early return で narrowed 済 → `!` は冗長」と判定するが、**(1) closure context での narrowing 失効**、および **(2) 巻き上げ named function declaration では const でも narrowing 失効** までは sometimes 認識しない。`feedback_subagent_verification.md` 規範通り、`!` 削除提案は **実コード Read で「closure 内か / hoisted function 内か」確認 + typecheck pass で verify** が必須 (agent 提案を verify 中に closure narrowing 失効を発見して `const sel = ...` 束縛に変更で対応した実例、および hoisted `function resolve()` 内の `base!` 削除を typecheck `TS18047` で「実は必須」と判明して却下した実例の両方あり)。**特に「hoisted function 内の const narrowing は維持される」と誤読しやすい** ので、`!` 削除は必ず typecheck で実証してから採用する。

主な使用箇所: `src/hooks/useKeyboardNav.ts:77` — `opts.selectedArticle ? list.findIndex(a => a.id === opts.selectedArticle.id) : -1` で TS error → `const sel = opts.selectedArticle; sel ? list.findIndex(a => a.id === sel.id) : -1` に修正、`!` 削除 + 型安全達成 (本サイクル commit `008cc092`)

## 三項演算子 chain で同 tag を repeat すると DOM 再利用が壊れて flash する

React reconciler は **同 position + 同 tag の element** は DOM を再利用する (`<div>` → `<div>` で innerHTML 差し替えのみ) が、**三項演算子 chain で異なる branch に同 tag を書いた場合** は **異なる position の element** として扱われ、unmount → mount → DOM 全置換が発生する。子要素を含む大きい `<div dangerouslySetInnerHTML>` 等で発生すると視覚的「フラッシュ」(本文が一瞬消えて再描画) として観測される。

```tsx
// アンチパターン: 三項演算子 chain で <div> を repeat → branch 切替で re-mount
{
  htmlSourceA ? (
    <div ref={contentRef} className="article-content" dangerouslySetInnerHTML={{ __html: htmlA }} />
  ) : htmlSourceB ? (
    <div ref={contentRef} className="article-content" dangerouslySetInnerHTML={{ __html: htmlB }} />
  ) : htmlSourceC ? (
    <p className="article-content">{plainText}</p>
  ) : null;
}
// → 同じ <div> ref={contentRef} でも、React は「異なる branch position」と扱い、
//   htmlSourceA → htmlSourceB 切替時に <div> unmount → 新 <div> mount → DOM 全置換 → flash 発生

// 修正パターン: html 計算を useMemo に集約 + 単一 <div> で render
const articleBodyHtml = useMemo<string | null>(() => {
  if (htmlSourceA) return htmlA;
  if (htmlSourceB) return htmlB;
  return null;
}, [htmlSourceA, htmlSourceB, htmlA, htmlB]);

{
  articleBodyHtml !== null ? (
    <div
      ref={contentRef}
      className="article-content"
      dangerouslySetInnerHTML={{ __html: articleBodyHtml }}
    />
  ) : htmlSourceC ? (
    <p className="article-content">{plainText}</p>
  ) : null;
}
// → 同一 position + 同 tag <div> で React が DOM を再利用、innerHTML 直接書き換えで完了 → flash 抑止
```

**判定軸: re-mount で flash が起きうるケース**:

| 構造                                                                             | 判定                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 三項演算子 chain で同 tag を repeat (`A ? <div/> : B ? <div/> : ...`)            | **re-mount リスク** → useMemo で 1 つに集約推奨                           |
| 同 branch 内で `__html` 値だけ変わる (`<div ...html={memo}/>` 同 element 内更新) | **DOM 再利用** (innerHTML 直接書き換え)、flash 抑止済                     |
| 異なる tag の切替 (`<div/>` ↔ `<p/>`)                                            | **必ず re-mount** (element type 違い)、回避には tag 統一が必要            |
| 同 tag + key 同一 (`<div key="content" .../>` 統一)                              | **DOM 再利用**、key で reconciler に「同 element」と明示                  |
| portal (`createPortal`) 経由                                                     | portal 内は通常 reconciler 適用、portal 自体の mount/unmount は外側で判定 |

**How to apply**: 三項演算子 chain で **同 tag (`<div>` / `<span>` / `<p>` 等) を 2 回以上 repeat** している箇所を見たら以下を判定 (re-mount による flash は DOM 全置換 + 子要素 unmount/remount + 子 effect 再実行 + scroll position 喪失 + focus 喪失等の副作用 大、構造的に防ぐのが canonical):

1. **三項演算子 chain で同 tag が 2+ 回出現** している場合は flash リスクあり
2. **2+ branch の `__html` (or children) 計算を 1 つの useMemo に集約**:
   ```tsx
   const html = useMemo(() => {
     if (sourceA) return htmlA;
     if (sourceB) return htmlB;
     return null;
   }, [sourceA, sourceB, htmlA, htmlB]);
   ```
3. **単一 element で render** + `html !== null ? <div ...html={html}/> : ...` で分岐
4. **`<p>` ↔ `<div>` のような tag type 切替** は同様の flash 原因だが、tag 統一 (例: 全て `<div>` で `whitespace-pre-wrap` で text 改行保持) または key 明示で対処
5. **子 hook が ref に依存** (`useContentLinkPreviews(contentRef, ...)` 等) する場合は **DOM 再利用** で `contentRef.current` が一貫することが重要 (re-mount すると ref が null になる瞬間が発生して副作用乱れる)

**該当する典型 flash トリガー**:

| 状況                               | 観測される flash                                                      |
| ---------------------------------- | --------------------------------------------------------------------- |
| RSS 本文 → 全文取得後 content 切替 | 三項演算子 chain で `processedContent` ↔ `hasArticleContentHtml` 切替 |
| Gallery view で記事カード切替      | 同 ArticleContentBody でも record 切替で content branch 切替          |
| AI 要約完了で要約タブと本文の切替  | `contentTab === "translate"` 等の branch 切替で同 tag re-mount        |
| Modal の open/close で内部 content | Modal portal 内の content branch 切替                                 |

**反例 (本パターン適用不要なケース)**:

- **branch が 1 つだけ** (`{html ? <div/> : null}`) → re-mount リスクなし、useMemo 不要
- **branch tag が全て異なる** (`<div/>` ↔ `<p/>` ↔ `<section/>`) → element type 違いで必ず re-mount、tag 統一が真の解
- **flash が UX 上問題ない短時間 transition** (例: error toast の表示) → 既存ユーザーが慣れている挙動なら統合不要

主な使用箇所: `ArticleContentBody.tsx` の content 描画 (commit `b0ac3219`) — `processedContent` / `hasArticleContentHtml` / `article.summary` の 3 branch のうち前 2 branch を `articleBodyHtml` useMemo + 単一 `<div ref={contentRef}>` に統合、全文取得完了 / gallery 切替時の re-mount 起因 flash を抑止。Phase 2 (OGP / link preview 遅延 reflow + `<p>` summary との element 切替) は `#817` で別 Issue 起票

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

## `usePortalMenu` の backdrop-dismiss で `setOpen(false)` と `btnRef.current?.focus()` はペアで呼ぶ

`usePortalMenu` hook は `open / setOpen / toggle / pos / btnRef` を expose する。backdrop (`fixed inset-0`) の `onPointerDown` で外側タップを検知して `setOpen(false)` を呼ぶとき、**`btnRef.current?.focus()` を忘れると WCAG 2.4.3 (Focus Order) 違反** になる。フォーカスがどこへも復元されず、キーボードユーザーが文書の先頭に飛ばされるため。

```tsx
// アンチパターン: setOpen だけで focus 復元なし
<div
  className="fixed inset-0 z-[49]"
  onPointerDown={(e) => {
    if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    // ← フォーカスがどこへも戻らない
  }}
/>

// 修正パターン: setOpen + btnRef.current?.focus() のペア
<div
  className="fixed inset-0 z-[49]"
  onPointerDown={(e) => {
    if (!menuRef.current?.contains(e.target as Node)) {
      setOpen(false);
      btnRef.current?.focus(); // ← WCAG 2.4.3: focus をトリガーボタンへ戻す
    }
  }}
/>
```

**SnoozeMenu / FilterMenu が canonical 実装**。新規に `usePortalMenu` を使うコンポーネントを追加するとき、既存の SnoozeMenu / FilterMenu の backdrop 部分をテンプレートとして使う。

**How to apply**: `usePortalMenu` を用いた portal dropdown を実装するときに以下を確認 (backdrop の `onPointerDown` で `setOpen(false)` だけを書いて focus 復元を忘れるパターンが ShareMenu / CollectionDropdown で実際に発生、canonical パターンを持つ SnoozeMenu / FilterMenu と視覚的に diff してから commit):

1. **backdrop の `onPointerDown` handler に `btnRef.current?.focus()`** が含まれているか確認
2. 含まれていなければ `setOpen(false)` の直後に追加
3. `usePortalMenu` を返す `btnRef` は `useRef<HTMLButtonElement>` 型で、ボタン要素の `ref={btnRef}` に binding 済であることを確認
4. `Escape` キー close は `useMenuKeyboard` が担保するため backdrop handler への追記は不要

**反例 (focus 復元が不要なケース)**:

- ドロップダウンが **keyboard 操作されない想定の純粋マウス UI** — 本プロジェクトではすべてキーボードサポートが必要なため非該当
- `usePortalMenu` を使わず **独立した focus trap** で開閉する modal — `useModalFocusTrap` が focus 復元を内包するため別途不要

主な使用箇所: `ShareMenu.tsx` / `CollectionDropdown.tsx` — backdrop `onPointerDown` で `setOpen(false)` のみ → `btnRef.current?.focus()` 追加で WCAG 2.4.3 準拠 (closes #1035)

## React useEffect 副作用パターン

→ `.claude/rules/react-effect-patterns.md` を参照 (#733 Step で分割)

含まれるセクション:

- ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する
- AbortController.abort() の伝播範囲を限定する (派生: 子→親 effect 発火順で stale な abort を防ぐ)
- モード OFF 時に進行中の副作用を停止する
- 時刻境界 (midnight / 月跨ぎ等) で再 render する hook pattern
- ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く
