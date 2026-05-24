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
