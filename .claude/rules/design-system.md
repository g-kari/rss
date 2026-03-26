# デザインシステム

フラットミニマル。Oksskolten ライク。ライト/ダーク切り替え対応。

## カラーシステム

### セマンティックカラートークン (`src/index.css` の `@theme` + `[data-theme="dark"]`)

コンポーネントでは **セマンティックトークン** を使う。石版色やzinc値を直接書かない。

| トークン           | ライト (stone) | ダーク (zinc) | 用途                     |
| ------------------ | -------------- | ------------- | ------------------------ |
| `surface-base`     | stone-50       | zinc-950      | メイン背景               |
| `surface-elevated` | white          | zinc-900      | サイドバー・カード       |
| `surface-subtle`   | stone-100      | zinc-800      | 選択済みアイテム         |
| `surface-hover`    | stone-50       | zinc-800/50   | ホバー状態               |
| `border-default`   | stone-200      | zinc-800      | 主ボーダー               |
| `border-subtle`    | stone-100      | zinc-800/50   | 薄ボーダー               |
| `text-strong`      | stone-800      | zinc-200      | 見出し・選択中           |
| `text-default`     | stone-600      | zinc-300      | 通常テキスト             |
| `text-soft`        | stone-500      | zinc-400      | 本文                     |
| `text-muted`       | stone-400      | zinc-500      | バッジ数字・ラベル       |
| `text-faint`       | stone-300      | zinc-600      | タイムスタンプ・空状態   |
| `ink`              | stone-800      | zinc-200      | 主アクション背景         |
| `ink-hover`        | stone-700      | zinc-300      | 主アクションホバー       |
| `ink-text`         | white          | zinc-950      | 主アクション上のテキスト |
| `accent-dot`       | rose-400       | indigo-500    | 未読ドット               |
| `bookmark`         | amber-400      | amber-400     | ブックマーク             |

**使用例**: `bg-surface-base`, `text-text-strong`, `border-border-default`, `bg-ink`, `text-ink-text`

### 非セマンティック (変更不要な固定色)

| 用途             | クラス                                             |
| ---------------- | -------------------------------------------------- |
| エラーテキスト   | `text-rose-400`                                    |
| ブックマーク済み | `text-bookmark` (= `text-[var(--color-bookmark)]`) |

**禁止**: 16進数カラー (`#...`) をコンポーネントにハードコードしない。`src/index.css` 内の CSS 変数定義のみ例外。

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

### カスタムスクロールバー (`src/index.css`)

```css
::-webkit-scrollbar {
  width: 3px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-text-faint);
  border-radius: 2px;
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
