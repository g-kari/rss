---
description: フラットミニマル design system — カラートークン / タイポグラフィ / 3 ペインレイアウト / コンポーネントパターン / アイコン
paths: "src/components/**/*.tsx,app/globals.css"
---

# デザインシステム

フラットミニマル。Oksskolten ライク。ライト/ダーク切り替え対応。

## カラーシステム

### セマンティックカラートークン (`app/globals.css` の `@theme` + `[data-theme="dark"]`)

コンポーネントでは **セマンティックトークン** を使う。石版色やzinc値を直接書かない。

| トークン               | ライト (stone)     | ダーク (zinc)      | 用途                                                                                |
| ---------------------- | ------------------ | ------------------ | ----------------------------------------------------------------------------------- |
| `surface-base`         | stone-50           | zinc-950           | メイン背景                                                                          |
| `surface-elevated`     | white              | zinc-900           | サイドバー・カード                                                                  |
| `surface-subtle`       | stone-100          | zinc-800           | 中立の補助面                                                                        |
| `surface-hover`        | stone-50           | zinc-800/50        | ホバー状態                                                                          |
| `selection-surface`    | teal-50 (#f0fdfa)  | #102c2b            | フィード・記事・タブの現在位置の背景                                                |
| `selection-accent`     | teal-700 (#0f766e) | teal-300 (#5eead4) | 現在位置の側線・下線・ナビ文字 (選択背景上 5.25:1 / 10.02:1)。`accent` の別名       |
| `surface-nav`          | stone-100          | zinc-950           | サイドバー面。List (`surface-base`) < Reader (`surface-elevated`) の段階 (#1382)    |
| `accent`               | teal-700           | teal-300           | UI accent (#1386): 現在位置 / アクティブタブ / 主 CTA の背景 / focus の補助表現だけ |
| `accent-hover`         | teal-800           | teal-200           | 主 CTA の hover                                                                     |
| `accent-subtle`        | teal-50            | #102c2b            | 選択背景 (`selection-surface` の実体)                                               |
| `accent-contrast`      | white              | zinc-950           | `accent` 背景上のテキスト                                                           |
| `border-default`       | stone-200          | zinc-800           | 主ボーダー                                                                          |
| `border-subtle`        | stone-100          | zinc-800/50        | 薄ボーダー                                                                          |
| `text-strong`          | stone-800          | zinc-200           | 見出し・選択中                                                                      |
| `text-default`         | stone-600          | zinc-300           | 通常テキスト                                                                        |
| `text-soft`            | stone-500          | zinc-400           | 本文                                                                                |
| `text-muted`           | stone-500          | zinc-400           | バッジ数字・ラベル                                                                  |
| `text-faint`           | stone-500          | zinc-400           | タイムスタンプ・空状態 (WCAG AA: ~4.6:1 / ~5.75:1 (WCAG AA))                        |
| `status-error`         | rose-600 (#e11d48) | rose-400 (#fb7185) | エラー状態                                                                          |
| `ink`                  | stone-800          | zinc-200           | 主アクション背景                                                                    |
| `ink-hover`            | stone-700          | zinc-300           | 主アクションホバー                                                                  |
| `ink-text`             | white              | zinc-950           | 主アクション上のテキスト                                                            |
| `accent-dot`           | rose-400           | indigo-500         | 未読ドット                                                                          |
| `error`                | rose-600           | rose-400           | エラーテキスト (WCAG AA: 4.7:1 / 5.4:1)                                             |
| `bookmark`             | amber-400          | amber-400          | ブックマーク                                                                        |
| `toast-success`        | emerald-500        | emerald-500        | ToastContainer success icon (#1169 Phase 1)                                         |
| `toast-error`          | rose-500           | rose-500           | ToastContainer error icon (#1169 Phase 1)                                           |
| `toast-undo`           | amber-500          | amber-500          | ToastContainer undo icon + progress bar (#1169 Phase 1)                             |
| `memo`                 | amber-400          | amber-400          | NoteIcon メモあり indicator (#1169 Phase 2、bookmark と別 semantic)                 |
| `like`                 | rose-400           | rose-400           | EngagementSegmentButton いいね active 背景 (#1169 Phase 2)                          |
| `action-danger`        | rose-500 (#f43f5e) | rose-500 (#f43f5e) | 破壊的アクション button 背景 (ConfirmModal danger、#1169 Phase 3)                   |
| `action-danger-hover`  | rose-600 (#e11d48) | rose-600 (#e11d48) | 同 hover (#1169 Phase 3)                                                            |
| `border-error`         | rose-400 (#fb7185) | rose-400 (#fb7185) | 入力バリデーションエラーの border (#1169 Phase 3)                                   |
| `feed-star`            | amber-400          | amber-400          | スター付き (priority high) active (#1169 Phase 4)                                   |
| `feed-star-hover`      | amber-300          | amber-300          | 同 hover (#1169 Phase 4)                                                            |
| `feed-mute`            | amber-500          | amber-500          | ミュート中 active (#1169 Phase 4)                                                   |
| `feed-mute-hover`      | amber-400          | amber-400          | 同 hover (#1169 Phase 4)                                                            |
| `error-hover`          | rose-300           | rose-300           | error 系アイコンの hover (nsfw / fetchError、#1169 Phase 4)                         |
| `collection-indicator` | indigo-400         | indigo-400         | コレクション所属あり indicator (#1169 Phase 4)                                      |

**accent と意味色の分離 (#1386)**: `accent` 系は「いま選んでいる / 押すべき主操作」だけを表す。`bookmark` / `like` / `memo` / `error` / `status-*` / `feed-star` / `feed-mute` / `accent-dot` (未読) は意味色なので accent に統合・流用しない。破壊的操作は `action-danger`。主 CTA は `bg-accent hover:bg-accent-hover text-accent-contrast`、確認ダイアログなど中立の操作は従来の `bg-ink`。新しい色を足すときは raw palette 値を直書きせず `@theme` にトークンを追加する。

**3 ペインの面 (#1382)**: Sidebar `bg-surface-nav` → List `bg-surface-base` → Reader `bg-surface-elevated`。Reader を最も明るく静かな面にする。`surface-nav` 上の補助ボタンの hover は `surface-hover` (`surface-subtle` は面と同色になる)。

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

Navigation / tab label は `text-xs leading-4`（デフォルト 12px / 16px）以上を最小値にする。主要な FeedViewTabs の「記事・画像・動画・SNS」はこの組み合わせを使い、`whitespace-nowrap` でラベルを一行に保つ。アイコンはラベルの上に置き、150px のリサイズ最小幅 / 200px の既定幅 / 220px のサイドバー / 320px のモバイルで収める。light / dark、44px の操作高（200px 以上は幅も 44px 以上）を production CSS の native fixture で確認する。150px では従来の 4 列を保ち、操作幅は 24px 以上を確認する。これは #1384 の主要ビュータブだけの段階対応で、他の navigation / control / metadata / Reader title の全体 scale は別途評価する。

| 用途                       | クラス                                                                            |
| -------------------------- | --------------------------------------------------------------------------------- |
| UI フォント・記事本文      | `font-sans` (Reddit Sans + IBM Plex Sans JP)                                      |
| 記事タイトル (ArticleView) | `reader-title font-medium text-text-strong tracking-[0.02em]` (24 / 28 / 32px)    |
| 未読記事タイトル           | `text-[13px] font-medium text-text-strong`                                        |
| 既読記事タイトル           | `text-[13px] font-normal text-text-muted`                                         |
| 記事本文                   | `text-[16px] leading-[1.9] tracking-[0.02em] text-text-soft` (`.article-content`) |
| メタ情報                   | `text-meta text-text-muted`                                                       |
| フィード名                 | `text-[13px]`                                                                     |
| セクションヘッダー         | `text-meta font-medium tracking-[0.25em] uppercase text-text-muted`               |

### Type scale (#1384)

`app/globals.css` の `@theme` に用途別の font-size token を定義している。`text-[10px]` / `text-[11px]` / `text-[12px]` を新規に直書きせず、次を使う。

| クラス              | サイズ   | 用途                                                      |
| ------------------- | -------- | --------------------------------------------------------- |
| `text-badge`        | 10px     | バッジ・カウンタ・キー表記だけ (文章・ラベルには使わない) |
| `text-meta`         | 11px     | 副次メタ情報 (時刻・フィード名・件数)、セクション見出し   |
| `text-control`      | 12px     | ナビ / タブ / コントロールラベルの下限                    |
| `text-ui`           | 13px     | サイドバー・一覧の標準文字                                |
| `text-primary`      | 14px     | 主要コントロール                                          |
| `text-reader-title` | 24〜32px | Reader の記事タイトルの viewport 基準 fallback token      |

Reader の記事タイトルと本文は管理 UI とは別の階層として扱う。

Reader title は `.reader-title` の semantic role を使う。タイトルだけの `.reader-typography` を named inline-size container とし、利用できる文字幅が35rem未満なら1.5rem、35rem以上なら1.75rem、40rem以上なら2rem（既定24 / 28 / 32px）。viewport 基準の `text-reader-title` token は本文ペインのリサイズ幅と一致しないため、Reader の見出しでは container 幅で上書きする。`font-medium`、既存の3行clamp / em基準の予約高、`text-text-strong`を維持し、`overflow-wrap: anywhere`で長い英単語を収める。root remに従ってブラウザーの既定文字拡大も反映する。header / popup / bodyをcontainerへ含めない。

## Motion (#1387)

時間と easing は `app/globals.css` の `--motion-*` / `--ease-*` に集約する。

| 用途     | 時間  | Tailwind       | 例                                                   |
| -------- | ----- | -------------- | ---------------------------------------------------- |
| fast     | 150ms | `duration-150` | hover / press / 色・opacity                          |
| standard | 200ms | `duration-200` | menu / tab / ヘッダー表示切替 / 一覧の小さな状態変化 |
| slow     | 300ms | `duration-300` | pane / modal / ギャラリー再配置などの構造遷移        |

easing は `--ease-interaction` (往復する変化) / `--ease-entrance` (出現: `animate-fade-up` / `animate-slide-up` / `animate-slide-in-right`) / `--ease-exit` (退場: `animate-fade-out`) の 3 種だけ。fade は出現・退場の opacity、slide は画面端から現れる面、scale は退場時の `animate-fade-out` だけに使う。進行状況バー・Undo の残り時間・読み上げなど時計として働く時間は scale に含めない。`prefers-reduced-motion: reduce` では transition / animation を即時化し、`animate-fade-up` / `animate-slide-up` / `animate-slide-in-right` の移動は止める。状態理解に必要な `animate-spin` は残す。

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

### 操作の階層 (declutter ルール)

1 つの面 (ヘッダー・カード・バー) に同格のアイコンを並べない。操作は次の 3 段階に分け、新しい操作を足すときはまず「常時」に入れてよいかを問う。

| 段階 | 基準                                       | 置き場所                                       |
| ---- | ------------------------------------------ | ---------------------------------------------- |
| 常時 | その面の主目的で、1 セッションに何度も使う | 面に直接置く (リーダーは 11 操作以内)          |
| 副次 | ときどき使う、または状態を切り替えるだけ   | 同じ面の disclosure (`aria-expanded`) の中     |
| まれ | 設定・入出力・管理                         | サイドバーの「その他のメニュー」/ 設定モーダル |

- **リーダーヘッダー**: 常時 = 読書設定 / 要約 / 翻訳 / 読み上げ / 共有 / 後で読む / ブックマーク / いいね / メモ / コレクション / 「その他の操作」。副次 = 画像保存 / オートモード / 読み上げ速度・音量 / フィルター / 全体フィルター / 印刷 / フォーカスモード。「その他の操作」は `aria-expanded` を持つ disclosure で、オートモード・読み上げ中・フォーカスモードが有効なときは `bg-accent` のドットで状態を示す。キーボードショートカットは disclosure に依存しない。
- **記事一覧ヘッダー**: 1 行目 = 件数 + 表示切替、2 行目 = 常用フィルター (未読 / ★ / 後で / ♥ / メモ) + 並び替え + 全既読 + 「詳細フィルター」。副次 (ダイジェスト / 日付 / 読了時間 / カテゴリ / 全体キーワード) は「詳細フィルター」の中。副次が 1 つでも適用中なら disclosure は閉じられず常に表示する (隠れたフィルターで一覧が減って見える状態を作らない)。操作帯は横スクロールで隠さず、折り返す。
- **おすすめ**: 記事 1 件の補助は 1 行 (理由テキスト + 「理由」+「興味なし」)。説明文は折りたたみ内の 1 か所だけに置く。サイドバーのフィード提案は既定で閉じ、件数だけ出す。エラー時だけ自動で開く。
- **ラベルとアクセシブル名**: 表示ラベルを短くしても、`aria-label` は表示ラベルを含める (例: 表示「理由」/ 名前「…をおすすめした理由」)。

### 操作サイズ

| 環境                       | 高さ × 幅      | 備考                                                             |
| -------------------------- | -------------- | ---------------------------------------------------------------- |
| タッチ (`pointer: coarse`) | 44 × 40px 以上 | 横並びのピルは幅 40px まで。高さは 44px を維持                   |
| 細かいポインター (`fine`)  | 32 × 32px 以上 | フィルターピル・表示切替・おすすめ操作。アイコン単体は 24px 以上 |

`@media (pointer: fine)` は Tailwind の `[@media(pointer:fine)]:` で書く。FeedViewTabs の主要ビュータブだけは従来どおり 44px を保つ。

### 単独 HTML ページ (MCP 同意 / 連携設定)

Tailwind が使えない単独 HTML ページは `renderMcpPage` (`src/lib/mcp-auth-ui.ts`) を使う。色は本ドキュメントの semantic token の値を `:root` の CSS 変数に写し、`prefers-color-scheme` でダークに切り替える (CSP が `style-src 'unsafe-inline'` のみのため、このページ内に閉じて持つ。`app/globals.css` 以外で 16 進を許すのはこのページだけ)。主操作 (許可) は `accent`、副 (拒否) は枠、破壊的 (解除) は `danger`。判断に必要な情報を先に、有効期間などの補足 (`.note`) はボタンの後に置く。

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

記事一覧のホバー操作は `[@media(hover:hover)]:group-focus-within:opacity-100` / `group-focus-within:pointer-events-auto` でも表示する。代わりに隠すメタ情報・状態表示も同じ focus-within 条件で揃え、Tab で記事行から子ボタンへ移っても可視性を保つ。記事行の Enter / Space は `event.target === event.currentTarget` の場合だけ処理し、子の既読・保存・画像再試行ボタンの native activation を奪わない。`ArticleActions` / `GalleryExpandButton` は native DOM で Enter / Space の伝播だけを止め、Next の document-level React delegation と先行する読書ショートカットからボタンの既定動作を守る。Tab・他のショートカットと記事行自体の選択は従来通り。

## アイコン

インラインSVG のみ使用。外部アイコンライブラリは導入しない。
`stroke="currentColor"` + `strokeWidth={1.5}` が標準。
