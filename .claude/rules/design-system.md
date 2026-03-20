# デザインシステム

フラットミニマル。Oksskolten ライク。ダーク一択。

## カラーパレット (Tailwind zinc/indigo)

| 用途 | クラス | 備考 |
|---|---|---|
| 背景 (最深) | `bg-zinc-950` | メインコンテンツ背景 |
| 背景 (サイドバー) | `bg-zinc-900` | FeedSidebar |
| 背景 (ホバー・選択) | `bg-zinc-800` | 選択済みアイテム |
| 背景 (薄ホバー) | `bg-zinc-800/50` | 非選択ホバー |
| ボーダー | `border-zinc-800` | 仕切り線 |
| テキスト (主) | `text-zinc-200` | 未読タイトル・選択中 |
| テキスト (副) | `text-zinc-400` | 非選択フィード名 |
| テキスト (補助) | `text-zinc-500` | バッジ数字・ラベル |
| テキスト (弱) | `text-zinc-600` | 既読タイトル・プレースホルダー |
| テキスト (極弱) | `text-zinc-700` | タイムスタンプ・空状態 |
| アクセント (未読ドット) | `bg-indigo-500` | w-1.5 h-1.5 rounded-full |
| アクセント (リンク) | `text-indigo-400` | hover: `text-indigo-300` |
| エラー | `text-red-400` | エラーメッセージ |

**禁止**: 16進数カラー (`#...`) をハードコードしない。必ず Tailwind クラスを使う。

## タイポグラフィ

| 用途 | クラス |
|---|---|
| UI フォント | `font-sans` (Inter) |
| 記事本文 | `font-serif` (Lora) |
| 記事タイトル (ArticleView) | `text-2xl font-bold tracking-tight text-zinc-100` |
| 未読記事タイトル | `text-[13px] font-medium text-zinc-200` |
| 既読記事タイトル | `text-[13px] font-normal text-zinc-600` |
| 記事本文 | `text-[16px] leading-[1.8] tracking-[0.01em] text-zinc-400` |
| メタ情報 | `text-xs text-zinc-600` |
| フィード名 | `text-[13px]` |
| セクションヘッダー | `text-[10px] font-semibold uppercase tracking-widest text-zinc-600` |

## レイアウト

### 3ペイン CSS Grid

```tsx
<div
  className="grid h-screen font-sans antialiased bg-zinc-950 text-zinc-200"
  style={{ gridTemplateColumns: '200px 380px 1fr', gridTemplateRows: '100%' }}
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
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: theme(colors.zinc.700); border-radius: 2px; }
```

## コンポーネントパターン

### 選択状態の切り替え

```tsx
className={`... ${isSelected ? 'bg-zinc-800 text-zinc-200' : 'hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200'}`}
```

### 未読バッジ (ドット)

```tsx
{!isRead && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" />}
```

### 未読カウント数字

```tsx
{count > 0 && <span className="text-xs text-zinc-500">{count > 99 ? '99+' : count}</span>}
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
`stroke="currentColor"` + `strokeWidth={2}` が標準。
