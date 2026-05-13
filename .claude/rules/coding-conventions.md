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

## URL 比較は decodeURI で正規化してから

URL の `pathname` を文字列で直接比較すると、**percent-encoding の大文字小文字差異**で意図しない不一致を引き起こす。`%E5` と `%e5` は同じ文字を表すが、ブラウザは仕様上正規化しない。

```typescript
// NG: 大文字 %E5 と小文字 %e5 で不一致になる
if (curUrl.pathname === nextUrl.pathname) { ... }

// OK: decodeURI で正規化してから比較
function normalizePathname(p: string): string {
  try {
    return decodeURI(p);
  } catch {
    return p.toLowerCase(); // 不正シーケンスは lowercase fallback
  }
}
const curPath = normalizePathname(curUrl.pathname);
const nextPath = normalizePathname(nextUrl.pathname);
if (curPath === nextPath) { ... }
```

**いつ発生するか**: WordPress / canonical URL / RSSHub などで動的生成されたリンクは、入力時点の URL とは異なる percent-encoding 形式を持つことがある。ユーザーがブラウザに直接入力した URL は大文字、HTML 内のリンクは小文字、のような不一致が頻発。

**主な使用箇所**: `src/lib/content.ts#isPaginatedVariant`（everia.club 等のページング検出）

## 上流連携サービスの実装確認は `gh api search/code` で効率化する

外部依存 (例: `id.0g0.xyz` の JWT 発行ロジック / OEmbed provider 各社のレスポンス形式) の実装を確認したいとき、ローカル clone なしで **GitHub API 経由でリモートリポジトリのソースコードを直接調査** できる。Issue で「上流の修正状況を確認して」のような依頼を受けたら、以下 4 ステップで完結する。

```bash
# Step 1: ディレクトリ構造把握 (top-level dirs)
gh api repos/{owner}/{repo}/git/trees/master --jq '.tree[] | select(.type == "tree") | .path'

# Step 2: keyword で symbol 検索 (search/code)
gh api "search/code?q=repo:{owner}/{repo}+{keyword}+language:TypeScript" \
  --jq '.items[].path'

# Step 3: 該当ファイル本文取得 (base64 decode)
gh api repos/{owner}/{repo}/contents/{path} --jq '.content' | base64 -d

# Step 4: caller 横断確認 (path 複数 loop で grep)
for path in path1 path2 path3; do
  echo "===== $path ====="
  gh api "repos/{owner}/{repo}/contents/$path" --jq '.content' | base64 -d \
    | grep -E "{symbol_pattern}"
done
```

**How to apply**: ユーザー指示に「**上流 / 連携サービス / 別リポジトリ を調査して**」が含まれたら以下のフロー:

1. **対象リポジトリ特定**: `gh repo list {owner} --limit 100 --json name,description` で候補列挙
2. **Step 1 でディレクトリ把握** (`workers/` `src/` `packages/` 等のトップレベル構造)
3. **Step 2 で keyword search** (調査対象の関数名 / 型名 / 設定 key)
4. **Step 3 で 1〜3 ファイル本文取得** (search 結果の最も関連深いもの)
5. **Step 4 で caller を横断確認** (規約が全パスで守られているか検証)
6. **調査結果を Issue コメント** で:
   - 該当ファイル `:path:line` への GitHub URL リンク
   - 該当コードの引用 (3-5 行)
   - 「OAuth 経路は必ず X 渡す」のような **横断的な事実** を表として整理

**反例 (gh api でなくローカル clone が必要なケース)**:

- **ビルド・実行が必要** (型チェック / e2e 実行 / wasm ビルド) — gh api は静的読み取りのみ
- **コード生成が複数ファイルに渡る** (新機能を上流側に PR で送りたい等) — その場合 fork + clone
- **diff 比較を 100 ファイル超** で行いたい — gh api は API rate limit に当たる

主な使用箇所: rss-reader → 0g0-id `workers/id/src/utils/token-pair.ts#issueTokenPair` 調査 — `aud = clientId ?? IDP_ORIGIN` 確認 + caller 4 経路 (auth/exchange / token/auth-code / auth/refresh / token/refresh-grant) 横断確認 → 「OAuth 経路は必ず clientId 渡す」を 5 分で検証

## デバッグ: 生 HTML を見る必要があるとき

`WebFetch` は markdown 化された結果を返すため、`<a>` タグの正確な構造や percent-encoding 形式が見えない。**ブラウザを介さず生 HTML を取得**するには：

```bash
node -e "
fetch('URL_HERE', { headers: { 'User-Agent': 'Mozilla/5.0' } })
  .then(r => r.text())
  .then(html => {
    const i = html.indexOf('Pages:');
    if (i >= 0) console.log(html.slice(i, i + 1500));
  });
"
```

特定の HTML フラグメントを `indexOf` で位置探索して周辺を出力する手法が、巨大ページの分析で有効。

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

## 自動生成ファイルは全実行パスで生成フックを設置する

`.gitignore` 対象の自動生成ファイル（`scripts/sync-*.mjs` で生成されるなど）は、**ビルドだけでなく lint / typecheck / e2e のすべての実行パス** で生成されるよう pre-script を設置する。

```json
// アンチパターン: prebuild だけ。CI の typecheck で生成漏れ
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "check": "vp check"
  }
}

// 修正パターン: 全 entry に pre-script 設置
{
  "scripts": {
    "prebuild": "node scripts/sync-release-notes.mjs",
    "build": "next build",
    "pretypecheck": "node scripts/sync-release-notes.mjs",
    "typecheck": "tsc --noEmit",
    "precheck": "node scripts/sync-release-notes.mjs",
    "check": "vp check",
    "precheck:fix": "node scripts/sync-release-notes.mjs",
    "check:fix": "vp check --fix"
  }
}
```

**How to apply**: 自動生成ファイルを参照するスクリプトを追加するときは、想定される実行コマンド (`build` / `dev` / `typecheck` / `check` / `test:e2e` 等) **すべてに pre-script を設置** する。スクリプトが軽量 (数十 ms 以下) なら頻繁に走っても性能影響なし。重いなら以下を検討:

- 出力ファイルの存在チェックでスキップする idempotent な実装にする
- CI でのみ明示的に実行するステップを追加する

代替策: 自動生成ファイルを `.gitignore` から外して commit する（trade-off: PR diff が増える、人間が手で編集してしまうリスク）。

## useEffect 依存キーの slice() は「N+1 件目以降の変化を検知不能」にする罠

→ `.claude/rules/react-effect-patterns.md` を参照

## 「読み上げ / 表示 / ハイライト」の source 整合性をペアで担保する

TTS / 字幕 / カラオケ系 UI で「**speak されるテキスト**」と「**ハイライト対象のテキスト**」が **異なる source** から派生していると、「読まれているのと違う場所がハイライトされる」乖離バグが発生する。`useTtsHighlight(sentences, ttsRate, ttsPlaying, ttsSupported)` のような hook は **sentences (=ハイライト対象) と speak text の source を同期**しないと安全でない。

```typescript
// アンチパターン: speak text と ハイライト sentences の source が別
const ttsText = buildTtsText(article, processedContent, translatedText, summaryText);
//   ↑ summaryText (要約) を優先で speak する設計
const ttsSentences = wrapSentencesInHtml(processedContent).sentences;
//   ↑ 常に processedContent (記事本文) から sentence 抽出
//   → 要約読み上げ中は speak text != ハイライト対象 で乖離

const { activeSentenceIndex } = useTtsHighlight(ttsSentences, ttsRate, ttsPlaying, ttsSupported);
// → 100ms 間隔で記事本文の sentence を進む。実際は要約読み上げているのにハイライトは記事本文上を時間ベースで進む

// 修正パターン: 別 source 読み上げ中はハイライト全停止
const isReadingDifferentSource = autoMode && autoSummarize && !!aiResult;
const effectiveSentences = isReadingDifferentSource ? EMPTY_SENTENCES : ttsSentences;
const { activeSentenceIndex } = useTtsHighlight(effectiveSentences, ...);
//   ↑ 空配列 → activeSentenceIndex = -1 維持 → ハイライト発生しない
```

**How to apply**: 読み上げ系 / 字幕系 hook を実装するとき:

1. `speak(text)` に渡る text の **真の source** (どの fallback chain の枝か) を判定するフラグを保持 (`isReadingX`)
2. ハイライト sentences は **同じ source の HTML から派生** したものかチェック
3. 異なる source なら、以下の選択肢:
   - **最小**: ハイライト全停止 (空 sentences で activeIndex = -1 維持)
   - **中規模**: 別 source の sentence span を生成 (要約 UI に span ラッパー導入)
   - **大規模**: 全 source で sentence 化 (parser を speak/highlight 共通化)
4. **最小実装でも違和感は解消** されるので、Phase 1 として最小、Phase 2 で機能拡張パターンが安全
5. **空 sentences の安定 reference** (`const EMPTY_SENTENCES: Sentence[] = []`) をモジュールレベルで宣言。条件で `[]` を毎 render 作ると useMemo / useEffect 依存キーが invalidate される

主な使用箇所: `useArticleViewState` の `isReadingSummary` / `effectiveTtsSentences` (オートモード + 自動要約で要約読み上げ中の wrong-source ハイライト抑制)

## 同症状でも別経路の可能性を疑う

「ギャラリーが止まる」「TTS が止まる」のような **同じ症状の連続バグ報告** は、修正後も別経路で再発する可能性が高い。1 つ修正しただけで「同症状の Issue は全部解決」と思い込まないこと。

**How to apply**:

- 「同症状の Issue を再起票された」ら、**前回修正のコミット diff** を読み直して「自分が直したのは本当に唯一の原因か」を疑う
- 「修正したのに直らない」「修正したのにまた起きた」のキーワードがコメントに出たら、必ず別経路を疑って再調査
- バグ修正のコミットメッセージには **「真因 = 〇〇」** を明記して、別経路調査時の参照点にする

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
