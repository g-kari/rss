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
| `surface-subtle`       | stone-100          | zinc-800           | 中立の補助面                                                        |
| `surface-hover`        | stone-50           | zinc-800/50        | ホバー状態                                                          |
| `selection-surface`    | teal-50 (#f0fdfa)  | #102c2b            | フィード・記事・タブの現在位置の背景                                |
| `selection-accent`     | teal-700 (#0f766e) | teal-300 (#5eead4) | 現在位置の側線・下線・ナビ文字 (選択背景上 5.25:1 / 10.02:1)        |
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
- `FeedSidebar` のフッター「その他のメニュー」からライト/ダークを切り替え

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

### interaction state の共通ルール

- current / selected: `selection-current` の薄い専用背景 + 3px 側線。ナビゲーションの文字には `text-selection-accent` を付ける
- active tab: `selection-tab-current` + `text-selection-accent`。背景に加えて 3px 下線を常時表示し、drag-over の ring と両立する
- unread: `accent-dot` の丸いドットとタイトルの `font-medium`。現在位置とは独立したコンテンツ状態
- read: `text-text-muted` + `font-normal`。選択中でも既読・未読の表現を残す
- hover: 非選択時だけ中立の `surface-hover`。現在位置の側線・下線は変えない
- focus-visible: 既存の `ring-2 ring-ink` を維持。現在位置は box-shadow を使わないため focus / 一括選択 ring と競合しない
- disabled: native `disabled` + opacity / cursor 表現。メニュー矢印ナビゲーションでは飛ばす。通知切替のように処理中も focus を保つ項目は `aria-disabled` + callback guard を使う

`selection-current` / `selection-tab-current` の側線・下線は border 疑似要素で描画し、余白を動かさない。色だけに依存せず、forced-colors でも現在位置を示せる。定義は `app/globals.css` に集約する。

```tsx
// フィード / 特殊ビュー / タグ / コレクション
isSelected
  ? "selection-current text-selection-accent"
  : "text-text-muted hover:text-text-strong hover:bg-surface-hover";

// 記事一覧 (compact / list / card / magazine / gallery 共通)
isSelected ? "selection-current" : "hover:bg-surface-hover";
```

現在位置の ARIA 表現はナビゲーションに `aria-current="page"`、記事に `aria-current="true"`、タブに `aria-selected` を使う。「すべて」はフィード / グループ / タグ / コレクションのいずれも選択されていない場合だけ current にする。

### サイドバーの階層

高頻度のフィード追加・検索・ビュー切替と主要ナビゲーションを常時表示する。フッターはプロフィール / 設定 / その他に絞り、統計・通知・テーマ・Help・入出力・Feed Health・リリースノート・ログアウトは「その他のメニュー」から到達できるようにする。

メニューは portal で sidebar の overflow clipping を避け、画面内の高さに収まるスクロール領域と 44px の操作行を確保する。Escape / 外側タップ / resize で閉じ、モーダルを開くアクションの前にトリガーへ focus を戻す。

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
