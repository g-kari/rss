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
