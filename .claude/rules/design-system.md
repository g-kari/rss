---
description: フラットミニマル design system — カラートークン / タイポグラフィ / 3 ペインレイアウト / コンポーネントパターン / アイコン
paths: "src/components/**/*.tsx,app/globals.css"
---

# デザインシステム

フラットミニマル。Oksskolten ライク。ライト/ダーク切り替え対応。

## カラーシステム

### セマンティックカラートークン (`app/globals.css` の `@theme` + `[data-theme="dark"]`)

コンポーネントでは **セマンティックトークン** を使う。石版色やzinc値を直接書かない。

| トークン               | ライト (stone)     | ダーク (zinc)      | 用途                                                                |
| ---------------------- | ------------------ | ------------------ | ------------------------------------------------------------------- |
| `surface-base`         | stone-50           | zinc-950           | メイン背景                                                          |
| `surface-elevated`     | white              | zinc-900           | サイドバー・カード                                                  |
| `surface-subtle`       | stone-100          | zinc-800           | 選択済みアイテム                                                    |
| `surface-hover`        | stone-50           | zinc-800/50        | ホバー状態                                                          |
| `border-default`       | stone-200          | zinc-800           | 主ボーダー                                                          |
| `border-subtle`        | stone-100          | zinc-800/50        | 薄ボーダー                                                          |
| `text-strong`          | stone-800          | zinc-200           | 見出し・選択中                                                      |
| `text-default`         | stone-600          | zinc-300           | 通常テキスト                                                        |
| `text-soft`            | stone-500          | zinc-400           | 本文                                                                |
| `text-muted`           | stone-500          | zinc-400           | バッジ数字・ラベル                                                  |
| `text-faint`           | stone-500          | zinc-400           | タイムスタンプ・空状態 (WCAG AA: ~4.6:1 / ~5.75:1 (WCAG AA))        |
| `status-error`         | rose-600 (#e11d48) | rose-400 (#fb7185) | エラー状態                                                          |
| `ink`                  | stone-800          | zinc-200           | 主アクション背景                                                    |
| `ink-hover`            | stone-700          | zinc-300           | 主アクションホバー                                                  |
| `ink-text`             | white              | zinc-950           | 主アクション上のテキスト                                            |
| `accent-dot`           | rose-400           | indigo-500         | 未読ドット                                                          |
| `error`                | rose-600           | rose-400           | エラーテキスト (WCAG AA: 4.7:1 / 5.4:1)                             |
| `bookmark`             | amber-400          | amber-400          | ブックマーク                                                        |
| `toast-success`        | emerald-500        | emerald-500        | ToastContainer success icon (#1169 Phase 1)                         |
| `toast-error`          | rose-500           | rose-500           | ToastContainer error icon (#1169 Phase 1)                           |
| `toast-undo`           | amber-500          | amber-500          | ToastContainer undo icon + progress bar (#1169 Phase 1)             |
| `memo`                 | amber-400          | amber-400          | NoteIcon メモあり indicator (#1169 Phase 2、bookmark と別 semantic) |
| `like`                 | rose-400           | rose-400           | EngagementSegmentButton いいね active 背景 (#1169 Phase 2)          |
| `action-danger`        | rose-500 (#f43f5e) | rose-500 (#f43f5e) | 破壊的アクション button 背景 (ConfirmModal danger、#1169 Phase 3)   |
| `action-danger-hover`  | rose-600 (#e11d48) | rose-600 (#e11d48) | 同 hover (#1169 Phase 3)                                            |
| `border-error`         | rose-400 (#fb7185) | rose-400 (#fb7185) | 入力バリデーションエラーの border (#1169 Phase 3)                   |
| `feed-star`            | amber-400          | amber-400          | スター付き (priority high) active (#1169 Phase 4)                   |
| `feed-star-hover`      | amber-300          | amber-300          | 同 hover (#1169 Phase 4)                                            |
| `feed-mute`            | amber-500          | amber-500          | ミュート中 active (#1169 Phase 4)                                   |
| `feed-mute-hover`      | amber-400          | amber-400          | 同 hover (#1169 Phase 4)                                            |
| `error-hover`          | rose-300           | rose-300           | error 系アイコンの hover (nsfw / fetchError、#1169 Phase 4)         |
| `collection-indicator` | indigo-400         | indigo-400         | コレクション所属あり indicator (#1169 Phase 4)                      |

**使用例**: `bg-surface-base`, `text-text-strong`, `border-border-default`, `bg-ink`, `text-ink-text`, `text-error`

### 非セマンティック (変更不要な固定色)

| 用途             | クラス                                             |
| ---------------- | -------------------------------------------------- |
| ブックマーク済み | `text-bookmark` (= `text-[var(--color-bookmark)]`) |

**禁止**: 16進数カラー (`#...`) をコンポーネントにハードコードしない。`app/globals.css` 内の CSS 変数定義のみ例外。

**例外: テーマ非依存の装飾イラスト**

全画面オーバーレイ上に描く装飾 SVG イラストのように、**自前の背景を持ちテーマ切替の影響を受けない**
図版は、内部パレットを semantic token 化しない。イラストとしての色の同一性 (虹彩の色・瞳孔の黒など) は
テーマではなく図版そのものの属性であり、token 化すると 1 component 専用 token が増えるだけで
再利用性も生まれないため。

該当時はコンポーネント側 JSDoc に「テーマ非依存の装飾イラストのため raw hex を意図的に使用」と
明記して、監査 sweep で規範違反として再検出されないようにする。

現行の該当箇所: `src/components/NSFWEyeAnimation.tsx` (`bg-black` 固定オーバーレイ上の目のアニメーション)

## テーマ切り替え

- `document.documentElement.dataset.theme = 'dark' | 'light'` で切り替え
- `localStorage('rss-theme')` で永続化
- 初回アクセス時は `prefers-color-scheme` に従う
- `FeedSidebar` のフッターに太陽/月アイコンボタン

## タイポグラフィ

| 用途                       | クラス                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| UI フォント・記事本文      | `font-sans` (Reddit Sans + IBM Plex Sans JP)                                      |
| 記事タイトル (ArticleView) | `text-[22px] font-light text-text-strong tracking-[0.02em]`                       |
| 未読記事タイトル           | `text-[13px] font-medium text-text-strong`                                        |
| 既読記事タイトル           | `text-[13px] font-normal text-text-muted`                                         |
| 記事本文                   | `text-[16px] leading-[1.9] tracking-[0.02em] text-text-soft` (`.article-content`) |
| メタ情報                   | `text-[11px] text-text-muted`                                                     |
| フィード名                 | `text-[13px]`                                                                     |
| セクションヘッダー         | `text-[10px] font-medium tracking-[0.25em] uppercase text-text-muted`             |

## レイアウト

### 3ペイン CSS Grid

```tsx
<div
  className="grid h-screen font-sans antialiased bg-surface-base text-text-strong"
  style={{ gridTemplateColumns: '200px 360px 1fr', gridTemplateRows: '100%' }}
>
```

- グリッド直下の各カラムは `overflow-hidden` を持つ
- スクロール可能な内部リストには `flex-1 min-h-0 overflow-y-auto` を使う
- `min-h-0` が flex コンテナ内でのスクロールを有効にするために必須

### スクロール対応パターン

```tsx
// NG: min-h-0 なし
<div className="flex-1 overflow-y-auto">

// OK: min-h-0 あり
<section className="flex flex-col min-h-0 overflow-hidden">
  <div className="flex-1 min-h-0 overflow-y-auto">
```

### カスタムスクロールバー (`app/globals.css`)

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-text-faint);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
```

## コンポーネントパターン

### 選択状態の切り替え

```tsx
className={`... ${isSelected ? 'bg-surface-subtle text-text-strong' : 'hover:bg-surface-hover text-text-muted hover:text-text-strong'}`}
```

### 選択記事のインジケーター (ArticleList)

```tsx
isSelected
  ? "bg-surface-elevated shadow-[inset_2px_0_0_0_var(--color-text-strong)]"
  : "hover:bg-surface-hover";
```

### 未読バッジ (ドット)

```tsx
{
  !isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-dot flex-shrink-0" />;
}
```

### 未読カウント数字

```tsx
{
  count > 0 && (
    <span className="text-[11px] text-text-muted tabular-nums">{count > 99 ? "99+" : count}</span>
  );
}
```

### 主アクションボタン (インク系)

```tsx
className = "bg-ink hover:bg-ink-hover text-ink-text rounded-lg transition-all duration-200";
```

### ホバーで表示するアクションボタン

```tsx
<div className="group ...">
  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
    <button>...</button>
  </span>
</div>
```

## アイコン

インラインSVG のみ使用。外部アイコンライブラリは導入しない。
`stroke="currentColor"` + `strokeWidth={1.5}` が標準。
