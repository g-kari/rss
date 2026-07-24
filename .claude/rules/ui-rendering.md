---
description: UI 描画分岐の純粋関数化・N 件条件・デフォルト引数・デザイントークンのパターン
paths: "src/components/**/*.tsx,src/lib/**/*.ts"
---

# UI レンダリングパターン

## UI 描画分岐の入れ子三項は「ソース選択」純粋関数で平坦化する

複数の props (prefetched / fallback / error 等) の組み合わせで「何を描画するか」を決める入れ子三項は、**条件の組み合わせの抜けに気付きにくい**。組み合わせの判定を `select<X>(args): { value, source }` 形式の純粋関数に切り出して UI と分離する。

```tsx
// アンチパターン: 入れ子三項で組み合わせが暗黙
{
  hasMultipleImages ? (
    <BodyImages images={prefetched} minPx={minPx} />
  ) : isFetchFailed ? (
    <FailedUI thumb={thumb} />
  ) : thumb ? (
    <ThumbFallback thumb={thumb} />
  ) : (
    <NoImagePlaceholder />
  );
}
// ↑ prefetched=[] (空) と prefetched=undefined (未取得) の挙動差が暗黙
// ↑ thumb と prefetched の優先順位がコードから読み取りにくい
// ↑ 「prefetched=空 + thumb=set」の組み合わせがどこで処理されるか追跡が必要

// 修正パターン: ソース選択を純粋関数化
export function selectGalleryImages(
  prefetched: string[] | undefined,
  thumb: string | undefined,
): { images: string[]; source: "prefetched" | "thumb" | "none" } {
  if (prefetched && prefetched.length > 0) return { images: prefetched, source: "prefetched" };
  if (thumb) return { images: [thumb], source: "thumb" };
  return { images: [], source: "none" };
}

// UI: source の値で 1 段の switch にする
const { images, source } = selectGalleryImages(prefetched, thumb);
{
  isFetchFailed ? (
    <FailedUI thumb={thumb} />
  ) : source !== "none" ? (
    <ImageList images={images} useFilter={source === "prefetched"} />
  ) : (
    <NoImagePlaceholder />
  );
}
```

**How to apply**: 3 段以上の入れ子三項を書きそうになったら、まず「どの値を選ぶか」を `select<X>` 純粋関数に切り出す:

1. **入力**: 描画判定に使う props 全部 (boolean / 配列 / null 含む)
2. **出力**: `{ value, source }` 形式 — `source` は `"a" | "b" | "none"` のような **判別可能な enum**
3. **テスト**: 全分岐 + edge case (空配列 / null / 空文字列) を spec で網羅
4. **UI**: `source` で switch (1 段の三項 or `match`) — 入れ子は最大 1 段に抑える

純粋関数化のメリット: ① 全組み合わせの spec カバレッジ、② UI 側のロジックが 1 行で読める、③ 後で「動画 fallback も追加」のような拡張で `source` enum を増やすだけで済む。

主な使用箇所: `src/lib/gallery-display.ts#selectGalleryImages` / `src/lib/auto-read.ts#shouldStartAutoSpeak`

## UI 表示条件の「N 件以上」マジックナンバーを慎重に扱う

「複数件あるときだけ UI を出す」のような条件 (`length >= 2` / `> 1` 等) は、**「1 件しかない場合のユーザーニーズ」を見落としやすい**。設計時は「複数のとき集約 UI を出す」意図でも、ユーザー視点では「1 件でもその UI が欲しい」ケースがほとんど。

```tsx
// アンチパターン: 「複数枚あるときだけ一括保存ボタン」
{
  images.length >= 2 && <button>一括保存 ({images.length}枚)</button>;
}
// → 1 枚しかない記事では「保存」できなくなる

// 修正パターン: 1 件でも表示してラベルを動的化
{
  images.length >= 1 && (
    <button>{images.length === 1 ? "保存" : `一括保存 (${images.length}枚)`}</button>
  );
}
```

**How to apply**: UI 条件で「N 件以上」を書くときは:

1. **0 件と 1 件以上で分ければ十分か** を最初に検討（`> 0` / `>= 1`）
2. **本当に「複数件」を要求する根拠**（DL ファイル名衝突回避など）があるかチェック。なければ `>= 1` に緩和
3. ラベルや動作が件数で変わるなら **動的に切り替える**（「保存」 vs 「一括保存 (N 枚)」）
4. 「集約系 UI」と「単発 UI」が冗長に併存する場合 (例: thumb の「保存」と本文の「一括保存」) は問題ない。両方選べる方がユーザー親切

## デフォルト引数値は「内部上限」と一致させる

`Options` 型のデフォルト値を **内部上限よりも小さい安全値** に設定すると、**呼び出し元が値を渡さなかった場合に静かに小さい上限が適用される** バグの温床になる。

```typescript
// アンチパターン: cap=200 だが default=20 で不整合
interface Options {
  /** 先頭から何件まで先行取得するか — 既定 20 */
  maxPrefetch?: number;
}
function usePrefetch({ maxPrefetch = 20 }: Options) {
  const lim = Math.min(isFinite(maxPrefetch) ? maxPrefetch : 200, 200);
  // ↑ cap は 200 だが default は 20 → 呼び出し元が省略すると 20 で固定される
  const targets = articles.slice(0, lim);
}

// 修正パターン: default を cap と一致させる
function usePrefetch({ maxPrefetch = 200 }: Options) {
  const lim = Math.min(isFinite(maxPrefetch) ? maxPrefetch : 200, 200);
  // ↑ default 200 = cap 200。呼び出し元が省略すれば全 visible 対象
}
```

**How to apply**: cap 値 (`Math.min(x, MAX)`) を持つ Option では:

1. **default = cap** が最も自然 (「明示しなければ最大限活用」)
2. **default < cap が必要なら** その理由を JSDoc に明記し、cap との差を意図的に保つ
3. リファクタで cap だけ引き上げて default を放置するのは禁止 (整合性検査をテストに追加するか、 `MAX_X` 定数を 1 箇所に集約してデフォルトもそれを参照する)

該当パターン: `usePrefetchGalleryContents` の `maxPrefetch`（cap=200 / default=20 → 200 へ修正）

## デザイントークンは「機能別の専用トークン」を作る判断軸

似た役割の既存トークン (`--color-surface-subtle` 等) を流用したくなる場面でも、**ユーザー視点で「目立たせたい強度が違う」なら専用トークンを作る** 方が後の調整が楽になる。

```css
/* アンチパターン: 検索ハイライトと TTS ハイライトを共通トークンで表現 */
.search-highlight,
.tts-active-sentence {
  background: var(--color-surface-subtle); /* どっちも控えめ */
}
/* → ユーザー「TTS は弱すぎる」要望で `--color-surface-subtle` を強くすると、
     検索ハイライトも一緒に変わって他の UI が崩れる */

/* 修正パターン: 機能別の専用トークン */
:root {
  --color-highlight: #fef3c7; /* amber-100: 検索 */
  --color-tts-highlight: #fde68a; /* amber-200: TTS (より目立たせる) */
}
```

**How to apply**: 新しいハイライト・選択状態・強調 UI を追加するとき:

1. 既存トークンと **見た目が完全に同じ** で、**ユーザーが将来「どちらか片方だけ強くしたい」と言わない自信がある** なら流用
2. それ以外は **`--color-{機能名}-highlight`** のような機能別トークンを新設
3. ライト / ダーク両テーマで定義する。コントラスト比 (WCAG AA) も併記すると後で楽
4. テキスト色も別トークン (`--color-{機能名}-highlight-text`) で揃えると、背景色変更時に文字読みやすさが崩れない

該当パターン: `--color-tts-highlight` / `--color-tts-highlight-text`

## WAI-ARIA role override は semantic HTML を一致させる (`<ul role="listbox">` の罠)

`<ul role="listbox">` のように semantic HTML element の `role` を ARIA で **override** するパターンは、**HTML5 content model 制約と ARIA role の要求が矛盾** することがあり、validity 違反 + 一部スクリーンリーダーで accessibility tree 解釈失敗を引き起こす。代表例:

- `<ul>` の HTML5 content model = `<li>` 0 個以上のみ
- `role="listbox"` の WAI-ARIA 要求 = direct child は `role="option"`
- `<ul role="listbox"><li><button role="option">...</button></li></ul>` 構造は **listitem が間に入って ownership chain 切れ** + HTML 仕様外 (ul に button 直配置も同様 validity 違反)

```tsx
// アンチパターン: ul + li wrapper で listbox option を 2 段 nest
<ul role="listbox" aria-label="候補">
  {items.map((opt) => (
    <li key={opt.id}>
      <button role="option" aria-selected={...}>{opt.label}</button>
    </li>
  ))}
</ul>
// → 1. WAI-ARIA: listitem が間に入って listbox → option の ownership 切れ
//    JAWS / NVDA で aria-activedescendant が accessibility tree で解決できず announce 失敗
// → 2. HTML5: <ul> content model に <button> 直配置は仕様外 (li only)

// 修正パターン: <div role="listbox"> + <button role="option"> 直配置
<div role="listbox" aria-label="候補" className="overflow-y-auto py-1">
  {items.map((opt) => (
    <button key={opt.id} role="option" aria-selected={...}>{opt.label}</button>
  ))}
</div>
// ↑ semantic HTML (div) + ARIA role (listbox) が直交、content model 制約なし
//   listbox → option の ownership chain も直接親子で確立、aria-activedescendant 正常 announce
```

**判定軸: semantic HTML override が必要なケース vs unsafe なケース**:

| 構造                                                     | 判定                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `<ul role="listbox">` + `<li role="option">` 妥協        | HTML validity OK + ARIA option 親子確立可、ただし button focus 管理が複雑     |
| `<ul role="listbox">` + `<button role="option">` 直配置  | **validity 違反** (ul の content model 違反)                                  |
| `<div role="listbox">` + `<button role="option">` 直配置 | **canonical** (semantic + ARIA 整合、最も clean)                              |
| `<nav role="navigation">` (semantic 重複)                | role 削除推奨 (nav は既に navigation role を持つ、explicit ARIA は redundant) |
| `<button>` + `role="link"` 等の reinterpret              | アクセシビリティ低下要因、native element 切替推奨 (`<a>` に変更)              |

**How to apply**: `<element role="...">` で semantic HTML を role で override しようとするとき (WAI-ARIA 仕様準拠 + HTML5 content model 両立を担保しないと、スクリーンリーダー解釈失敗 / validity 違反 / focus 管理混乱の 3 種類のリスクが累積する):

1. **対象要素の HTML5 content model を MDN で確認** (`<ul>` → `<li>` only, `<dl>` → `<dt>/<dd>`, `<table>` → `<thead>/<tbody>` 等)
2. **対象 ARIA role の WAI-ARIA 仕様 (required parent / required children)** を MDN で確認 (`listbox` → option, `tree` → treeitem, `grid` → row/gridcell)
3. **content model と ARIA 要求が一致しない場合は `<div role="...">`** で semantic を中立化、ARIA role 単独で意味付け
4. **role override が必要な特殊ケース** (legacy HTML 構造維持 / SEO で `<ul>` が必須 等) は **`<ul role="listbox"><li role="option">` 妥協案** で content model + ownership 両立 (ただし button focus 管理は別途配線要)
5. **lint 検出**: oxlint / eslint-plugin-jsx-a11y の `no-redundant-roles` / `role-supports-aria-props` を活用、structural violation は手動 review

**反例 (semantic 維持が canonical なケース)**:

- `<nav>` / `<main>` / `<aside>` / `<header>` / `<footer>` / `<button>` / `<a>` 等 **既に implicit role を持つ semantic element** → ARIA role 不要 (`role="navigation"` 等は redundant)
- `<div>` で role override せず元のまま (= `role="generic"`) → ARIA tree node として無視される、interactive content であれば semantic element に変更

主な使用箇所: `FeedQuickSwitchModal.tsx:189-235` — 旧 `<ul role="listbox"><li><button role="option">` 構造を `<div role="listbox"><button role="option">` 直配置に変更、WAI-ARIA ownership chain + HTML5 content model 両立、listRef 型も HTMLUListElement → HTMLDivElement に同期

## `role="menuitem"` 内の装飾的 SVG には `aria-hidden="true"` を付ける

`role="menuitem"` を持つ要素 (コンテキストメニューの各行) にインライン SVG アイコンを配置するとき、SVG が **装飾的 (ラベルの補足アイコン)** の場合は `aria-hidden="true"` を必ず付ける。付けないとスクリーンリーダーが SVG の内容 (path data 等) を menuitem のラベルと誤って読み上げる、または「グラフィック」を余分にアナウンスする。

```tsx
// アンチパターン: SVG に aria-hidden なし → スクリーンリーダーが余分にアナウンス
<button role="menuitem" onClick={...}>
  <svg viewBox="0 0 16 16" fill="currentColor">
    <path d="..." />
  </svg>
  保存
</button>

// 修正パターン: 装飾的 SVG に aria-hidden="true"
<button role="menuitem" onClick={...}>
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="..." />
  </svg>
  保存
</button>
```

**ArticleContextMenu が canonical 実装**。新規にコンテキストメニューを追加するとき (GalleryContextMenu / FeedContextMenu 等)、`ArticleContextMenu.tsx` の各 `role="menuitem"` 要素を参照してすべての SVG に `aria-hidden="true"` が付いているか確認する。

**How to apply**: コンテキストメニューコンポーネントに `role="menuitem"` を持つ要素を実装するとき (SVG への `aria-hidden` 追加漏れはスクリーンリーダーで UX 劣化、lint では自動検出されないため explicit sweep が必要):

1. **同 component 内で `role="menuitem"` を grep** して全件を列挙
2. 各 menuitem 内の `<svg>` タグに `aria-hidden="true"` があるか確認
3. 未付与なら追加 — `aria-label` / `title` を持つ **意味的 SVG** は例外 (スクリーンリーダーに読み上げさせる意図がある)
4. **canonical sweep コマンド**:
   ```bash
   grep -nE "role=\"menuitem\"" src/components/<ContextMenu>.tsx | head -5
   # 各 menuitem 内の <svg> を確認
   grep -n "aria-hidden" src/components/<ContextMenu>.tsx | wc -l
   ```
5. **sibling コンポーネントへの横展開**: 同じパターンを持つ sibling (例: ArticleContextMenu → GalleryContextMenu) にも適用。一方に追加したら他方も sweep する。

**反例 (`aria-hidden` が不要なケース)**:

- SVG が **`aria-label` または `<title>` を持ち、意味的な情報を提供している** (例: スクリーンリーダーに図形の説明を読ませたいアイコン) → `aria-hidden` 不要
- SVG が **button / link の唯一のコンテンツ** で、ラベルテキストがない → `aria-label` を button 側に付けた上でアイコン SVG には `aria-hidden` 付与

主な使用箇所: `GalleryContextMenu.tsx` — 5 件の `role="menuitem"` 内 SVG に `aria-hidden="true"` 追加 (`ArticleContextMenu.tsx` canonical パターンの横展開)

### 派生ケース: `icon` プロパティとして JSX を返す `buildXxxActions` 系関数の SVG も `aria-hidden` が必要

`buildFeedActions` / `buildArticleActions` 等の **アクション配列ビルダー関数** では `icon: <svg ...>` として JSX を直接返す設計がある。これらの SVG は後で `role="menuitem"` ボタン内の `{action.icon}` として描画されるため、ビルダー関数の icon 定義時点で `aria-hidden="true"` を付ける必要がある。

```typescript
// アンチパターン: ビルダー関数で aria-hidden なし SVG を icon に渡す
function buildFeedActions(props) {
  return [
    {
      key: "detail",
      label: "詳細を見る",
      icon: (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
          {/* aria-hidden="true" なし → role="menuitem" ボタン内で余分に読み上げ */}
          <circle cx="5" cy="5" r="4" />
        </svg>
      ),
    },
  ];
}

// 修正パターン: ビルダー関数でも aria-hidden="true" を付ける
function buildFeedActions(props) {
  return [
    {
      key: "detail",
      label: "詳細を見る",
      icon: (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
          aria-hidden="true">
          <circle cx="5" cy="5" r="4" />
        </svg>
      ),
    },
  ];
}
```

**How to apply**: `action.icon` / `item.icon` のような JSX を返すプロパティを持つアクション配列ビルダーを編集するとき (icon の SVG は最終的に `role="menuitem"` ボタン内で `{action.icon}` として展開されるため、ビルダー側で `aria-hidden` を付けるのが責務が明確):

1. **ビルダー関数内のすべての `icon: (<svg ...)` 定義を grep** — `grep -n "icon:.*<svg" src/components/<feature>/xxxActions.tsx`
2. 各 SVG タグに `aria-hidden="true"` があるか確認
3. 未付与なら追加

**反例 (`aria-hidden` が不要なケース)**:

- icon が **SVG でなくテキスト / emoji** の場合 → テキストは自動的にスクリーンリーダーで読まれる (意図的な場合はそのまま)
- icon SVG が **`<title>` や `aria-label` を持ち意味的情報を提供している** 場合 → `aria-hidden` 付与すると情報が消える

主な使用箇所: `feedActions.tsx` — `buildFeedActions` 内の全 icon SVG に `aria-hidden="true"` 追加、`SidebarFooter.tsx` — `role="menuitem"` 内の装飾 SVG に `aria-hidden="true"` 追加

## アイコン専用ボタンの SVG には `aria-hidden="true"` を付ける

`role="menuitem"` に限らず、**`aria-label` を持つボタン (`<button aria-label="...">`) の唯一コンテンツがインライン SVG の場合**も `aria-hidden="true"` が必要。付けないとスクリーンリーダーが `aria-label` に加えて SVG の内容 (path data / group 等) を重複して読み上げたり「グラフィック」を余分にアナウンスしたりする。

```tsx
// アンチパターン: aria-label あるのに SVG に aria-hidden なし → 重複読み上げ
<button
  aria-label="現在: 新しい順 — 古い順に切り替え (s)"
>
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor">
    <path d="M6 1v10M2 7l4 4 4-4" />
  </svg>
</button>

// 修正パターン: aria-hidden="true" でスクリーンリーダーから SVG を隠す
<button
  aria-label="現在: 新しい順 — 古い順に切り替え (s)"
>
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
    aria-hidden="true">
    <path d="M6 1v10M2 7l4 4 4-4" />
  </svg>
</button>
```

`role="menuitem"` 内 SVG のルール (`ui-rendering.md § role="menuitem" 内の装飾的 SVG...`) と合わせて、**「ボタンのラベルは `aria-label` または可視テキストが担う → SVG は装飾に徹する」** が原則。

**How to apply**: `aria-label` を持つボタンにインライン SVG を配置するとき (`aria-label` がスクリーンリーダーに伝えるラベルと SVG の implicit label が二重になるため `aria-hidden` で SVG を明示除外する):

1. **ボタンに `aria-label` または `aria-labelledby` があるか確認** — ある場合、内部 SVG はすべて装飾扱い
2. 各 `<svg>` タグに `aria-hidden="true"` を追加
3. **例外**: SVG が `<title>` や `aria-label` で固有の意味を持ち、ボタン全体のラベルと異なる補足情報を提供する場合は `aria-hidden` 不要 (ただし本プロジェクトでそのケースは稀)
4. **canonical sweep**:
   ```bash
   grep -rEn 'aria-label=' src/components/ | grep '<button\|<a ' | grep -v 'aria-hidden' | head -10
   # 各 hit のインライン SVG が aria-hidden を持つか確認
   ```

**反例 (`aria-hidden` が不要なケース)**:

- ボタンに可視テキストラベルがあり SVG はその視覚的補完 (例: `<button>保存 <svg .../></button>`) → `aria-hidden` 推奨だが省略しても major issue でない
- SVG 自体に `<title>` または `aria-label` があり、ボタン外から参照される図形説明として機能する → `aria-hidden` 付けると情報が消える

主な使用箇所: `SortButton.tsx` — `aria-label` を持つ sort 切替ボタンの 3 種類の SVG アイコンに `aria-hidden="true"` 追加

## combobox input には WAI-ARIA APG の 5 属性セットを揃える

`<input type="text">` を検索サジェスト・クイック切替の combobox として機能させるとき、WAI-ARIA APG (Authoring Practices Guide) の **combobox pattern** に従って 5 属性を揃える。1 つでも欠けるとスクリーンリーダーが listbox との関連を解釈できない。

```tsx
// アンチパターン: role="combobox" だけ宣言して他が不完全
<input
  role="combobox"
  aria-expanded={open}
  // aria-haspopup・aria-controls・aria-autocomplete・aria-activedescendant が欠落
/>

// 修正パターン: 5 属性フルセット
<input
  role="combobox"
  aria-autocomplete="list"
  aria-expanded={open}
  aria-haspopup="listbox"
  aria-controls={open ? "listbox-id" : undefined}
  aria-activedescendant={highlightedItem ? `option-${highlightedIndex}` : undefined}
/>
// 対応する listbox:
<div
  id="listbox-id"
  role="listbox"
  aria-label="候補"
>
  {items.map((item, i) => (
    <button
      key={item.id}
      id={`option-${i}`}
      role="option"
      aria-selected={i === cursor}
    >
      {item.label}
    </button>
  ))}
</div>
```

**5 属性の意味**:

| 属性                    | 値例                             | 役割                                               |
| ----------------------- | -------------------------------- | -------------------------------------------------- |
| `role="combobox"`       | (固定)                           | input が combobox であることを宣言                 |
| `aria-autocomplete`     | `"list"`                         | 候補リストが表示される補完方式を宣言               |
| `aria-expanded`         | `{open}`                         | listbox が開いているか (boolean state)             |
| `aria-haspopup`         | `"listbox"`                      | 開くポップアップの role を宣言 (WAI-ARIA 1.2 必須) |
| `aria-controls`         | `{open ? "listbox-id" : undef}`  | 関連 listbox の id を指定                          |
| `aria-activedescendant` | `{option-${index} or undefined}` | 現在キーボードでハイライト中の option id           |

`aria-haspopup="listbox"` は WAI-ARIA 1.2 で combobox に対して明示が求められており、省略すると古い仕様の `aria-haspopup="true"` (= menu を連想させる) と混同され NVDA / JAWS 等で誤った role アナウンスが起きる。

**How to apply**: `<input>` に `role="combobox"` を付けるとき (5 属性の 1 つでも欠けると AT が listbox との関連を解釈できずキーボードナビが機能しない):

1. **`role="combobox"` を付ける** — これだけで他の 4 属性の追加義務が発生すると認識する
2. **`aria-haspopup="listbox"` を確認** — `"menu"` / `"true"` ではなく `"listbox"` を明示
3. **`aria-controls`** に listbox の `id` を渡す — listbox が非表示のとき `undefined` に戻す
4. **listbox 側の `id`** と `aria-controls` の値が一致することを確認
5. **option 側の `id`** フォーマット (例: `option-${i}`) が `aria-activedescendant` のフォーマットと一致することを確認

**canonical 実装**: `FeedQuickSwitchModal.tsx` (feed-quick-option-${i} / feed-quick-listbox) および `SearchBar.tsx` (search-suggestion-listbox)。

**反例 (5 属性フルセットが不要なケース)**:

- `<input>` に `role="combobox"` を付けない純粋な検索フォーム → combobox pattern 適用外
- native `<select>` → ブラウザが暗黙に処理するため ARIA 属性不要
- `aria-expanded` を常時 `true` に固定するケース (例: 常時表示 listbox) → `aria-controls` のみで OK だが `aria-haspopup` は記述すべき

主な使用箇所: `FeedQuickSwitchModal.tsx:148` と `SearchBar.tsx:174` — combobox input に `aria-haspopup="listbox"` を含む 5 属性を追加し WAI-ARIA APG combobox pattern に準拠

## モバイル 44px / デスクトップ 24px のタッチターゲット二重指定

**WCAG 2.5.8 (Target Size Minimum)** に従い、モバイルでは 44px、デスクトップでは 24px のタッチターゲット最小寸法を確保する。Tailwind のブレークポイントで `max-md:` (モバイル) と `lg:` (デスクトップ) を組み合わせて両端末に対応する。

```tsx
// アンチパターン: モバイルのみ 44px でデスクトップ指定なし → デスクトップで 0px になりうる
<button className="max-md:min-w-[44px] max-md:min-h-[44px] ...">

// アンチパターン: デスクトップのみ指定 → モバイルでタッチターゲット不足
<button className="lg:min-w-[24px] lg:min-h-[24px] ...">

// 修正パターン: 両方を明示して全端末をカバー
<button className="max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px] ...">
```

**サイズ根拠**:

| 端末                    | 最小タッチターゲット | 規準                                          |
| ----------------------- | -------------------- | --------------------------------------------- |
| モバイル (< 768px)      | 44 × 44 px           | WCAG 2.5.5 推奨 / Apple HIG / Material Design |
| デスクトップ (≥ 1024px) | 24 × 24 px           | WCAG 2.5.8 Minimum / Pointer Accuracy を考慮  |

デスクトップ 24px 指定は **ボタン寸法を 24px に強制する** のではなく、**クリックヒット領域の最小値を宣言する**もの。実際のビジュアルサイズ (SVG アイコン 12px 等) はコンテナの `flex items-center justify-center` で中央配置し、24px のクリック領域内に収める。

**How to apply**: ヘッダー / ツールバー / セグメントボタン等の小さいアイコンボタンを実装するとき (モバイル 44px はタッチ精度確保、デスクトップ 24px は過剰な空白を防ぎながら WCAG 2.5.8 を満たす最小クリック領域):

1. **ボタンが小さいアイコン (SVG 12-16px 程度) を単体で表示するか確認**
2. Yes なら `max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px]` を className に追加
3. **`flex items-center justify-center`** をセットで付けて内部アイコンを中央配置
4. **モバイル専用 / デスクトップ専用の片方だけ追加するのは NG** — 両ブレークポイントをセットで管理する

**反例 (二重指定が不要なケース)**:

- ボタンに可視テキストラベルがあり元々のサイズが 24px 以上確保されている → 自然にターゲットを満たす
- `padding` で十分なクリック領域がある (例: `py-2 px-4` で高さ 40px 確保) → min-h/w の追加は不要

主な使用箇所: `EngagementSegmentButton.tsx` — 後で読む / ブックマーク / いいね 3 連トグルに `max-md:min-w-[44px] max-md:min-h-[44px] lg:min-w-[24px] lg:min-h-[24px]` を追加

## 折りたたみボタン (WAI-ARIA Disclosure) には aria-expanded + aria-controls + コンテンツ id の三点セットを揃える

`<button>` で折りたたみ / 展開 UI を実装するとき、**WAI-ARIA Disclosure Pattern** に従って 3 属性を揃える。`aria-expanded` だけでは AT (スクリーンリーダー) がどのコンテンツを制御しているか特定できず、仮想カーソルナビゲーションで折りたたみと展開先が切り離されて見える。

```tsx
// アンチパターン: aria-expanded だけで aria-controls が欠落
<button
  aria-expanded={!isCollapsed}
  aria-label={isCollapsed ? "展開" : "折りたたむ"}
  onClick={onToggle}
>
  <svg aria-hidden="true">...</svg>
  カテゴリ名
</button>
<div hidden={isCollapsed}>
  {/* コンテンツ — id がないため AT から関連付け不能 */}
</div>

// 修正パターン: aria-expanded + aria-controls + コンテンツ id の三点セット
const contentId = `category-${cat}-content`;
<button
  aria-expanded={!isCollapsed}
  aria-controls={contentId}
  aria-label={isCollapsed ? `${cat} を展開` : `${cat} を折りたたむ`}
  onClick={onToggle}
>
  <svg aria-hidden="true">...</svg>
  カテゴリ名
</button>
<div id={contentId} hidden={isCollapsed || undefined}>
  {/* コンテンツ — id でボタンと関連付け可能 */}
</div>
```

**三点セットの意味**:

| 属性 / 属性値                   | 役割                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ |
| `aria-expanded={!isCollapsed}`  | AT に開閉状態を伝える (true = 展開中 / false = 折りたたみ中)             |
| `aria-controls={contentId}`     | 制御するコンテンツ要素の `id` を指定 — AT の仮想カーソルが関連付けを解釈 |
| `id={contentId}` (コンテンツ側) | ボタン側 `aria-controls` と一致する値を設定                              |
| `hidden={isCollapsed}`          | HTML `hidden` 属性で AT に「折りたたみ中は読み上げ対象外」を伝える       |

`aria-controls` の値は **`${area}-${uniqueKey}-content` 形式** でスコープを明確化する (例: `category-news-content` / `group-42-content`)。ページ内に同種コンポーネントが複数並ぶ場合でも id が衝突しないようにする。

`hidden` 属性は `hidden={isCollapsed || undefined}` と書く。`hidden={false}` は HTML の `hidden` 属性を `hidden="false"` に展開してしまう React の罠があり、AT が「非表示」として扱う。`undefined` を渡すと属性自体が省略される。

**canonical 実装**: `FeedAddModal.tsx` (modal の内部 section の開閉)、`CategorySection.tsx` (カテゴリ折りたたみ)、`FeedGroupsSection.tsx` (グループ折りたたみ)。

**How to apply**: `<button>` で折りたたみ / 展開 UI を実装するとき (三点セットのうち一つでも欠けると AT がボタンとコンテンツの関連を解釈できず、キーボードユーザーがどこを制御しているか把握できなくなる):

1. **コンテンツ側に一意な `id` を設定** — 同種コンポーネントが複数並ぶなら `${prefix}-${uniqueKey}-content` 形式
2. **ボタン側に `aria-controls={contentId}`** を追加
3. **`aria-expanded={!isCollapsed}`** を確認 — 展開中が `true`、折りたたみ中が `false`
4. **`hidden` 属性は `hidden={isCollapsed || undefined}`** — `hidden={false}` は `hidden="false"` になる React 罠を回避
5. **ボタン内 SVG には `aria-hidden="true"`** — `aria-label` があれば SVG は装飾扱い (`ui-rendering.md § アイコン専用ボタンの SVG` 参照)

**反例 (三点セットの一部が省略可能なケース)**:

- **`aria-controls` 省略可能 (稀)**: 折りたたみボタンとコンテンツが DOM 上で直接隣接 + WAI-ARIA 1.2 の実装が AT 側で `aria-controls` なしでも推測できる場合。ただし本プロジェクトでは三点セット揃えを canonical とする
- **`hidden` 属性の代替**: `className` で `display:none` の切り替えも AT には同等に機能するが、`hidden` 属性は HTML セマンティクスとしてより明示的

主な使用箇所: `CategorySection.tsx` / `FeedGroupsSection.tsx` — 折りたたみボタンに `aria-controls={catContentId}` / `aria-controls={\`group-${group.id}-content\`}`を追加、対応コンテンツ div に`id`+`hidden` 属性を追加して WAI-ARIA Disclosure pattern に準拠

## dialog タイトルは `<h2 id={titleId}>` で見出し landmark 化する (`<p id={titleId}>` は screen reader rotor / H キーで辿れない)

`role="dialog"` + `aria-labelledby={titleId}` を持つモーダルで、参照先を `<p id={titleId}>` として実装すると WCAG 1.3.1 (Info and Relationships) 違反 + screen reader UX 劣化。**`aria-labelledby` は id 参照で label 自体は読み上げ可能だが、role として heading と認識されず「dialog with paragraph text」に degrade する** + rotor / H キーの見出しナビゲーションが機能しない。

```tsx
// アンチパターン: dialog タイトルが <p> で見出し landmark 不在
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <p id={titleId} className="text-text-strong text-[14px] font-medium mb-2">
    画像をダウンロード
  </p>
  {/* ... */}
</div>

// 修正パターン: <h2 id={titleId}> で見出し化 (ConfirmModal.tsx / Modal.tsx canonical と統一)
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby={titleId}
>
  <h2 id={titleId} className="text-text-strong text-[14px] font-medium mb-2">
    画像をダウンロード
  </h2>
  {/* ... */}
</div>
```

**canonical 実装**:

| file                                                          | title tag                                       | 用途                                         |
| ------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------- |
| `src/components/ConfirmModal.tsx`                             | `<h2 id={titleId} className="text-[13px] ...">` | 確認 dialog canonical (`useId()` で id 生成) |
| `src/components/Modal.tsx`                                    | `<h2 id={titleId} className="text-[13px] ...">` | 汎用 dialog canonical (`useId()` で id 生成) |
| `src/components/article-view/ImageDownloadModal.tsx` (修正前) | `<p id={titleId} ...>` (drift)                  | canonical 逸脱 → `<h2>` に統一               |

**How to apply**: `role="dialog"` + `aria-labelledby={titleId}` を書いたら参照先も `<h2 id={titleId}>` で揃える (`<p>` / `<span>` / `<div>` id 参照は AT で「dialog with paragraph text」に degrade、rotor / H キー見出しナビが機能しない、WCAG 1.3.1 違反):

1. **`role="dialog"` を書いたら `aria-labelledby={titleId}` の参照先 tag を必ず `<h2>` にする** — `<p>` / `<span>` / `<div>` は heading role でなく WCAG 1.3.1 違反
2. **`titleId` は `useId()` で生成** — 同 page 内複数 dialog マウント時の id 衝突を回避 (`ConfirmModal.tsx` / `Modal.tsx` canonical に準拠)
3. **`<h2>` の className は既存 `<p>` の className をそのまま流用** — visual style は変えず role のみ変更で機能変化なし
4. **`aria-describedby={titleId + "-desc"}` を使う場合は description 側 tag は `<p>` で OK** (heading と description は別役割)
5. **canonical sweep**:
   ```bash
   grep -rEn 'role="dialog"' src/components/ | while read line; do
     file=$(echo "$line" | cut -d: -f1)
     # 同 file 内 <p id={titleId} / <span id={titleId} / <div id={titleId} を検出
     grep -nE '<(p|span|div) id=\{titleId\}' "$file" && echo "  → DRIFT: $file"
   done
   ```

**反例 (`<h2>` 使用が不適切なケース)**:

- **`role="alertdialog"` の場合も同様に `<h2>` 推奨** (`alertdialog` は `dialog` の subtype、heading landmark 要件は同じ)
- **`role="dialog"` を使わず popover / tooltip として実装** (`role="tooltip"` / `role="menu"`) → heading landmark 不要、`<h2>` 強制しない
- **dialog 内に既に `<h1>` / `<h2>` が存在** して semantic hierarchy が構築済 → 追加の title tag は `<h3>` 以降が適切 (稀ケース、ネスト dialog 等)

主な使用箇所: `src/components/article-view/ImageDownloadModal.tsx:40` — `<p id={titleId} className="text-text-strong text-[14px] font-medium mb-2">` を `<h2 id={titleId} className="text-text-strong text-[14px] font-medium mb-2">` に変更 (className 同じ、tag のみ変更) で ConfirmModal.tsx:64 / Modal.tsx:67 canonical に統一。同 file docstring 明記の「#1064 で ConfirmModal canonical に統一」に整合

## 択一トグル button 群 (rating / segment / like-neutral-bad 3 択) には `aria-pressed` で active state を露出する

`<button>` を「複数選択肢から現在値を 1 つ選ぶ」トグル UI として実装するとき (要約評価: 良い/普通/悪い、翻訳評価、like/neutral/bad セグメント等)、視覚的な選択状態を CSS だけで表現すると screen reader ユーザーが「今どれが選ばれているか」を認識できない。**`aria-pressed={rating === currentRating}`** を各 button に付けて WAI-ARIA Button toggle state を露出する。

```tsx
// アンチパターン: 視覚的 active state のみ (CSS class)、aria-pressed なし
{(["good", "neutral", "bad"] as const).map((rating) => (
  <button
    key={rating}
    aria-label={`要約の評価: ${rating}`}
    className={cn(
      "px-2 py-1",
      summaryRating === rating && "bg-accent text-accent-fg", // 視覚のみ
    )}
    onClick={() => setSummaryRating(rating)}
  >
    {label}
  </button>
))}
// → NVDA / VoiceOver は「ボタン, 要約の評価: 良い」としか読まず、選択済みか判別不可

// 修正パターン: aria-pressed で active state 露出 (canonical: EngagementSegmentButton)
{(["good", "neutral", "bad"] as const).map((rating) => (
  <button
    key={rating}
    aria-label={`要約の評価: ${rating}`}
    aria-pressed={summaryRating === rating}   // ← ラジオ的意味なら "true" / "false"
    className={cn("px-2 py-1", summaryRating === rating && "bg-accent")}
    onClick={() => setSummaryRating(rating)}
  >
    {label}
  </button>
))}
```

**`aria-pressed` vs `aria-selected` vs `role="radio"` の使い分け**:

| UI 種別                                                            | canonical role / attr                                | 選定基準                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------- |
| **択一トグル button 群** (rating 3 択 / segment button)            | `<button aria-pressed={...}>`                        | button role 維持、AT に「toggle button」として announce        |
| **listbox 内 option** (combobox / drop-down suggestion)            | `<button role="option" aria-selected={...}>`         | listbox ownership chain が必要、`aria-activedescendant` と連動 |
| **フォーム的 radio group** (submit 時に値送信、TAB でグループ移動) | `<input type="radio">` or `role="radio" + radiogroup` | keyboard TAB navigation が radiogroup 単位、form 送信意味論     |

**canonical 実装**: `src/components/article-list/EngagementSegmentButton.tsx` — 「後で読む / ブックマーク / いいね」3 連トグルで `aria-pressed` + `max-md:min-w-[44px]` を canonical 化 (WCAG 2.5.5 タッチターゲットと併走)。

**How to apply**: `.map((option) => <button ...>)` で 3+ 択の button group を実装 or 発見したら (択一トグル UI に `aria-pressed` 欠落は WCAG 4.1.2 (Name, Role, Value) 違反 + screen reader で active state 不可視、視覚 CSS class の active style と 1:1 で対応させる):

1. **button group が「複数選択肢から 1 つ選ぶ」構造か** を確認 — `.map((rating) => <button>)` で render + click で state 更新の pattern
2. **canonical `EngagementSegmentButton.tsx` を確認** して `aria-pressed={value === currentValue}` の 1:1 対応形式を流用
3. **各 button に `aria-pressed={<option value> === <current state>}` を付与** — 視覚 active state (`className` の `bg-accent` 等) と同じ条件式を使う (視覚と AT で乖離させない)
4. **`aria-label` と併用**: `aria-label` は選択肢の名前 (「要約の評価: 良い」)、`aria-pressed` は選択状態 (true/false) で役割分離
5. **canonical sweep**:
   ```bash
   # rating / segment / toggle 系 button group を検出
   grep -rEn '\.map\(\(([a-z]+)\) => \(' src/components/ | grep '<button' | head -10
   # 該当 button に aria-pressed があるか file 単位で確認
   grep -L 'aria-pressed' <hit files>
   ```
6. **sibling コンポーネントへの横展開**: canonical (`EngagementSegmentButton`) → 同種択一トグル (`ArticleAiPanel` 要約評価 / `ArticleContentBody` 翻訳評価 / etc.) を grep で列挙 → aria-pressed 未付与を一括修正

**反例 (`aria-pressed` が不要 / 別 attr が正しいケース)**:

- **`role="option"` を持つ listbox 内 button** → `aria-pressed` でなく `aria-selected` を使う (combobox pattern、`ui-rendering.md § combobox input 5 属性`)
- **択一でない独立トグル (単一 mute button 等)** → `aria-pressed` 適用 OK (WAI-ARIA `button` state)、択一制約なし
- **form の radio group** で `<input type="radio">` を使っている → native radio が role/state 自動提供、`aria-pressed` 追加不要 (重複 announce)
- **視覚的 active state を持たない一時押下 button** (submit / cancel 等) → toggle でない、`aria-pressed` 不要

主な使用箇所:

- canonical: `src/components/article-list/EngagementSegmentButton.tsx` — 3 連トグル (後で読む / ブックマーク / いいね) の aria-pressed 基準実装
- sibling drift 解消例: `src/components/article-view/ArticleAiPanel.tsx:106` (要約評価 3 択) + `src/components/article-view/ArticleContentBody.tsx:386` (翻訳評価 3 択) — 各 3 button (計 6 button) に `aria-pressed={<rating>Rating === rating}` 追加で canonical 統一 + WCAG 4.1.2 準拠

### 派生ケース: code-review agent の「canonical あり + sibling drift 検出」finding は「同種 button group の全 sibling を canonical に横展開」で 1 commit 一括解消する

code-review agent (`copilot-review` / `feature-dev:code-reviewer` 等) が「canonical (`EngagementSegmentButton` の aria-pressed) 存在 + sibling (`ArticleAiPanel` / `ArticleContentBody` の rating button group) に欠落」を finding として提示するとき、finding 単位で 1 button ずつ修正すると commit boundary が薄まる。**同種 UI pattern の全 sibling を grep で列挙 → 1 commit で一括横展開** が canonical。

```
パターン: sibling drift 横展開判定フロー
  1. agent finding: 「X (canonical) に aria-pressed あり、Y (sibling) に欠落」
  2. canonical の実装形式を 1 分で確認 (aria-pressed={value === currentValue} 等)
  3. 同種 pattern (rating / segment / toggle) の全 sibling を grep 列挙:
     grep -rEn '\.map\(.*rating.*=>' src/components/ | grep -v spec
  4. 各 sibling で aria-pressed 有無を確認 (未付与を全列挙)
  5. 1 commit で全 sibling に aria-pressed 追加
  6. commit message に canonical file + sibling drift 対象 file 全件明記
```

**How to apply**: code-review agent の a11y / semantic drift 系 finding を受領したら (finding 単位の逐次修正は commit atomicity 低下、同種 pattern の一括横展開で 1 commit = 1 concern を維持):

1. **finding を単発でなく「同種 pattern の sibling drift」として一般化** — agent が指摘した 1 pattern を全 codebase で grep 列挙
2. **canonical file を確定** — agent finding の「参照 canonical」を Read で 1 分確認、実装形式 (attr 名 / 値式 pattern) を把握
3. **sibling を grep で列挙** — canonical と同種 UI pattern (rating / segment / toggle 等) を含む file を全件抽出
4. **各 sibling で該当 attr 有無を verify** — grep -L で attr 未付与 file を確定
5. **1 commit で全 sibling 一括修正** — `audit-workflow.md § サブパターン「機械的 sweep refactor 例外」` 参照 (touch ≥ 3 file でも一括 OK)
6. **commit message に「canonical: <file> / sibling drift 解消: <files>」明記** — 将来の sweep での重複検出防止 + trace 残す

**反例 (sibling drift 一括横展開が不適用なケース)**:

- **agent finding の canonical が 1 sibling しか持たない** (真の drift でなく 1:1 修正) → 単発 fix で OK
- **各 sibling で attr 値式が semantic に違う** (例: 一部は aria-pressed / 一部は aria-selected が正解) → 一括修正でなく個別判断、agent finding を 2 系統に分けて 2 commit
- **touch ≥ 6 file** (機械的 sweep refactor 例外の許容範囲超) → Phase 分離 (canonical への横展開を UI 群単位で 2-3 commit に分ける)

主な使用箇所: agent finding「EngagementSegmentButton canonical に aria-pressed あり、AI 評価 6 button (ArticleAiPanel 3 + ArticleContentBody 3) に欠落」→ 2 file / 6 button を 1 commit で一括 aria-pressed 追加 + commit message に「canonical: EngagementSegmentButton」明記した実例
