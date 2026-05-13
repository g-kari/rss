---
description: TypeScript / Next.js / React コーディング規約・hook / 命名規則・派生ケース集
paths: "src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts"
---

# コーディング規約

## TypeScript

→ `.claude/rules/typescript-conventions.md` を参照 (#733 Step 1 で分割)

## Next.js App Router / Route Handler / 認証ヘルパー / R2 / RSS / Cron

→ `.claude/rules/nextjs-server-patterns.md` を参照 (#733 案 A-1 Step 5 で分割)

含まれるセクション:

- Next.js App Router 基本ルール (`'use client'` / `force-dynamic` 等)
- Route Handler パターン (`withSession` / `withJsonBody`)
- 環境変数アクセス (process.env vs getCloudflareContext)
- 認証ヘルパー (`requireSession` / `applyRefreshedTokens` / `isBetaAllowed`)
- R2 ヘルパー (`r2Get` / `r2Put` / `sha256Hex` / shared-feed.ts 使用指針)
- RSS パーサー (`fast-xml-parser` / `stripHtmlWithBreaks` 使用方針)
- Cron (`FetchEnv` 型 / `fetchAllUsers` / `fetchArticles`)
- React データ取得パターン (hooks / `r.json() as Promise<T>`)
- 読み取り状態のマージ戦略 (ローカル優先 / スヌーズ / ノート例外)

## React

- 関数コンポーネントのみ。クラスコンポーネントは使わない
- `export default function ComponentName(...)` 形式
- Props は `interface Props { ... }` で定義し、同ファイル内に書く
- `useState` / `useEffect` / `useMemo` / `useCallback` のみ。複雑な状態管理ライブラリは使わない
- データ取得ロジックは custom hooks (`src/hooks/`) に分離
- コンポーネントは API を呼ばない (FeedSidebar の add/delete は例外)

### クライアントサイドフィルタリング

```typescript
const filtered = useMemo(() => {
  let list = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
  if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
  return list;
}, [articles, feedId, readIds, unreadOnly]);
```

## React Context パターン

→ `.claude/rules/react-patterns.md` を参照

## 命名規則

| 対象                   | 規則                      | 例                                 |
| ---------------------- | ------------------------- | ---------------------------------- |
| 型・インターフェース   | PascalCase                | `Feed`, `Article`, `AuthSession`   |
| React コンポーネント   | PascalCase                | `FeedSidebar`, `ArticleList`       |
| 関数・変数             | camelCase                 | `markRead`, `selectedFeedId`       |
| JSON フィールド        | camelCase                 | `feedId`, `publishedAt`, `siteUrl` |
| Route Handler ファイル | `route.ts` (Next.js 規約) | `app/api/feeds/route.ts`           |

**注意**: DB (D1) を使っていた時代の snake_case (`published_at`, `feed_id`) は完全に廃止済み。
JSON データは全て camelCase。

## Helper drift 防止 + 既存依存の流用判断

→ `.claude/rules/helper-drift.md` を参照 (#733 案 A-1 Step 1 で分割)

含まれるセクション:

- 新規 Route Handler / hook を書くときの既存 lib helpers grep 順序 (`validation.ts` / `r2.ts` / `api-error.ts`)
- 派生ケース: helper drift 解消で「同じエンドポイントの既存 error code 契約」を変更してはならない
- 派生ケース: 新規 dev dependency 追加前に既存 devDeps の流用可能性を grep 確認する
- 派生ケース: 同名 enum / type の重複は canonical の `type X = Y` alias に統合する

## stale closure 回避パターン (`useSyncedRef`) / hook 循環依存

→ `.claude/rules/react-hook-patterns.md` を参照 (#733 案 A-1 Step 6 で分割)

含まれるセクション:

- `useSyncedRef` で stale closure を回避するパターン
- 派生ケース: `useSyncedRef` を deps 配列に入れてはいけない
- hook 循環依存を ref で解消するパターン

## URL 比較 / gh api 上流調査 / デバッグ / 自動生成 / 読み上げ整合性 / 同症状別経路

→ `.claude/rules/dev-investigation.md` を参照 (#733 案 A-1 Step 9 で分割)

## 大きいコンポーネントの機能別分割パターン

→ `.claude/rules/react-component-split.md` を参照

## shared resource を変更する API は「認証 + 所有権チェック」を二段で行う

→ `.claude/rules/api-security.md` を参照 (派生ケース: shared cache TTL 短縮 / dev/e2e ガード も同ファイル)

## React state / ref / useEffect パターン

→ `.claude/rules/react-state-ref.md` (state / ref / vi.fakeTimers 関連) / `.claude/rules/react-effect-patterns.md` (useEffect 副作用) を参照

## 同一プロパティ名で意味の異なる派生値を使い分けない

→ `.claude/rules/fallback-derivation.md` を参照 (派生ケース: fallback 伝播 / sibling fallback chain 統一 / 派生 boolean origin 導出 も同ファイル)

## 既存設定 UI を流用して新要件を満たす（新規 UI を増やさない判断軸）

→ `.claude/rules/ui-judgment.md` を参照 (派生ケース: 抑制機能 default OFF / N 段階セグメント統合 / 自動操作の一時停止 UX も同ファイル)

## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する

→ `.claude/rules/react-effect-patterns.md` を参照

## AbortController.abort() の伝播範囲を限定する

→ `.claude/rules/react-effect-patterns.md` を参照

## UI 描画分岐 / N 件以上条件

→ `.claude/rules/ui-rendering.md` を参照 (#733 案 A-1 Step 7 で分割)

含まれるセクション:

- UI 描画分岐の入れ子三項は「ソース選択」純粋関数で平坦化する
- UI 表示条件の「N 件以上」マジックナンバーを慎重に扱う
- デフォルト引数値は「内部上限」と一致させる
- デザイントークンは「機能別の専用トークン」を作る判断軸

## useEffect 依存キーの slice() は「N+1 件目以降の変化を検知不能」にする罠

→ `.claude/rules/react-effect-patterns.md` を参照

## モード OFF 時に進行中の副作用を停止する

→ `.claude/rules/react-effect-patterns.md` を参照

## ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く

→ `.claude/rules/react-effect-patterns.md` を参照

## 上流 API プロキシのヘッダ欠落補完

→ `.claude/rules/browser-platform.md` を参照

## 読み取り状態のマージ戦略 (`useReadState`)

→ `.claude/rules/nextjs-server-patterns.md` を参照 (#733 案 A-1 Step 5 で分割)

## テスト (TDD)

→ `.claude/rules/testing-and-workflow.md` を参照 (#733 案 A-1 Step 8 で分割)

## 依存管理 — Dependabot / pnpm.overrides

→ `.claude/rules/testing-and-workflow.md` を参照 (#733 案 A-1 Step 8 で分割)

## silent fallback の禁止 — `try/catch → null` には必ず `devError` を添える

→ `.claude/rules/browser-platform.md` を参照 (`availability()` 派生ケースも同ファイルへ移動)

## ブラウザ仕様の最低バージョン定数を 1 箇所に集約する

→ `.claude/rules/browser-platform.md` を参照

## 早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる

→ `.claude/rules/react-patterns.md` を参照

## デフォルト引数値・デザイントークン

→ `.claude/rules/ui-rendering.md` を参照 (#733 案 A-1 Step 7 で分割)

## 子コンポーネントの「自己判断で hidden になる UI」は親で「全件 hidden」を検知して fallback する

→ `.claude/rules/react-patterns.md` を参照

## HTML 後処理 pipeline (冪等 transform / 属性欠落 fallback / SVG sprite / JSON-LD / 画像 DOM 走査)

→ `.claude/rules/html-pipeline.md` を参照 (#733 Step 3 で分割)

## 大きい retrospective Issue は「技術スタック別フォローアップ Issue」に分割してクローズする

→ `.claude/rules/testing-and-workflow.md` を参照 (#733 案 A-1 Step 8 で分割)

## コード監査エージェント並行派遣 + 連続修正 / 部分達成 / ローテーション運用

→ `.claude/rules/audit-workflow.md` を参照 (#733 Step 2 で分割)

## 本番環境のデバッグは「localStorage gate + 専用 debug ヘルパー」で出す

→ `.claude/rules/browser-platform.md` を参照 (AbortController/Ref 派生ケースも同ファイルへ移動)

## 永続化された state を「リロード時に自動復元」するときは TTL と防御チェックを必ず入れる

→ `.claude/rules/browser-platform.md` を参照

## 禁止事項

- D1 / DO の追加 (シンプルさを保つ。KV は `RATE_LIMIT` で導入済み)
- 外部 CSS ライブラリ (Tailwind のみ)
- 外部アイコンライブラリ (インライン SVG のみ)
- 16進数カラーのハードコード
- Hono の `c.json<T>()` パターン (Next.js Route Handlers では使えない)
- `r.json<T>()` (ブラウザ fetch には型引数なし。`r.json() as Promise<T>` を使う)
- モジュールレベルのキャッシュ変数 (Edge Runtime では各リクエストで再実行される)

`any` 型禁止は本ファイル冒頭「TypeScript の strict 設定」(`strict: true` 前提) で扱う。`noImplicitAny` で機械強制済 — explicit `: any` も冒頭ルールで禁止。
