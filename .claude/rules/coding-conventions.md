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

## stale closure 回避パターン (`useSyncedRef`)

`useEffect` / `useCallback` のクロージャが古い値を参照する問題を `useSyncedRef` で回避する。
レンダーごとに `ref.current` を自動更新するため、常に最新値を参照できる。

```typescript
// Before: useRef + 手動更新（ミスしやすい）
const callbackRef = useRef(onUpdate);
callbackRef.current = onUpdate;
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);

// After: useSyncedRef（レンダーごとに自動更新）
const callbackRef = useSyncedRef(onUpdate);
useEffect(() => {
  socket.on("data", (v) => callbackRef.current(v));
}, []);
```

主な使用箇所: `useReadState`, `useFilteredArticles`, `useKeyboardNav`

### 派生ケース: `useSyncedRef` を `useMemo` / `useEffect` の **deps 配列** に入れてはいけない

`useSyncedRef` の戻り値は「ref オブジェクト自体」が安定 reference (`useRef` と同じ identity 不変)。これを useMemo / useCallback / useEffect の **deps 配列に入れると、ref.current が変わってもメモが再計算されず、effect も再発火しない**。「ref 経由で最新値が読めるから deps 不要」という直感は **キャッシュ無効化** を引き起こす。

```typescript
// アンチパターン: deps に ref を入れて「ref で最新値を参照するから deps 不要」のつもり
const readIdsRef = useSyncedRef(readIds);
const result = useMemo(() => {
  // ref.current は最新だが、useMemo はそもそも再実行されない
  for (const a of articles) {
    if (!isArticleRead(a, readIdsRef.current, ...)) { /* ... */ }
  }
  return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref で deps 不要 ← 嘘
}, [articles, readIdsRef]); // ← readIdsRef は永久に同 identity → readIds 変化が無視される

// 修正パターン: 値を直接 deps に渡す
const result = useMemo(() => {
  for (const a of articles) {
    if (!isArticleRead(a, readIds, ...)) { /* ... */ }
  }
  return result;
}, [articles, readIds, readBeforeTimestamp]); // ← 値の identity 変化で再計算される
```

**How to apply**: `useSyncedRef` を使うときは以下の判定:

1. **`useEffect(() => { ... }, [])` の中で参照** (subscription / 1 度だけのセットアップ) → ✅ ref で OK
2. **`useEffect(() => { ... }, [deps])` の deps 配列** → ❌ ref を deps に入れない / 値を直接 deps に渡す
3. **`useMemo(() => { ... }, [deps])` の deps 配列** → ❌ ref を deps に入れない / 値を直接 deps に渡す
4. 「perf 最適化のため ref に逃がす」のは罠。**まず素直に値を deps に渡し、計測して問題があれば別の最適化** (例: 構造的等価性ガード) を検討
5. `eslint-disable-next-line react-hooks/exhaustive-deps` を書きたくなったら、本当に正しい設計か疑う。多くは間違ったパターンの言い訳

**lint warning との関係**: `useSyncedRef` 化で `react-hooks/exhaustive-deps` warning が増える (lint が「ref を deps に追加すべき」と誤検知する) ことがある。これは lint が `useSyncedRef` 規範を完全認識できないため発生する **既知の false positive**。**規範通りなら warning 件数増は許容**、`// eslint-disable-next-line` も追加しない (上記ステップ 5 の延長)。warning 件数だけで「修正失敗?」と判断せず、規範整合 (`useEffect` の `[]` deps で 1 度だけセットアップ + ref で最新値を読む) を優先する。実際、既存の `useReadingProgress` / `useReadState` 等、`useSyncedRef` を採用済みの hook はすべて同 warning を許容している。

主な使用箇所: `useSidebarFeeds.ts` (前は `readIdsRef` を deps に入れて未読カウント永続的にキャッシュされる重大バグが発生 → 直接 `readIds` deps に修正)

## hook の循環依存を ref で解消する

Hook A の出力 (state) を Hook B の入力に渡し、かつ Hook B の出力 (callback) を Hook A の内部処理 (例: `speak` 内の boundary handler) に注入したいとき、宣言順だけでは解決できない循環が発生する。**callback 用の ref を「Hook A 呼び出し前」に作って両方に渡す** と解決する。

```typescript
// アンチパターン: useTts の handleTtsToggle が useHighlight.handleBoundary を呼びたいが
// useHighlight は useTts の isPlaying を必要とするので宣言順を入れ替えられない
const tts = useTts(article); // ← speak 内で onBoundary を呼びたい
const highlight = useHighlight(sentences, tts.isPlaying); // ← isPlaying が必要
// tts.handleTtsToggle が highlight.handleBoundary を呼びたいが、ここでは tts は既に確定済み

// 修正パターン: ref を 1 つ前で作って両方に渡す
const onBoundaryRef = useRef<((idx: number) => void) | null>(null);
const tts = useTts(article, onBoundaryRef); // 内部で onBoundaryRef.current?.(idx) を呼ぶ
const highlight = useHighlight(sentences, tts.isPlaying);
onBoundaryRef.current = highlight.handleBoundary; // 後付けで assign
```

**How to apply**: hook 同士で「片方の output が他方の input、その output 先が更にもう片方の internal 処理を呼ぶ」三角関係を見つけたら、callback 用 ref を 1 つ前に作って両 hook に渡す。Hook A 内部では `ref.current?.(...)` で安全に呼び出し (null チェック必須)、Hook B から取得した callback を効果的に **後付け assign** する。assign は render 中で OK (ref はマウント前から不変)。

主な使用箇所: `useArticleViewTts` ↔ `useTtsHighlight` の boundary 配線

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

- **テスト駆動開発**: 新機能・バグ修正は **Red → Green → Refactor** の順で実装する
  1. テストを書く → `npx playwright test e2e/{name}.spec.ts` で **失敗 (Red)** を確認
  2. 実装する → テストが **通る (Green)** ことを確認
  3. リファクタ → テストが **Green のまま** なことを確認
- テストファイルは `e2e/` に `*.spec.ts` として配置（Playwright テストランナー使用）
- 純粋関数（パーサー・変換・バリデーション）はファイルを直接 import してユニットテスト
- Cloudflare バインディングに依存するコードは E2E テスト（dev サーバー起動が必要）でカバー
- テスト名は日本語可: `test('空のHTMLをMarkdown変換すると空文字を返す', ...)`
- **テスト名・コメントは実装の意図と用語を整合させる**: 例えば `crypto.randomUUID()` で生成される値の検証で「UUID v4」と書くと v4 固有のバリアントビット制約まで含意してしまう。実際の正規表現が UUID 一般形式なら「UUID 形式」と書く。テスト名と実装の用語齟齬は、後続の開発者が仕様を読み誤る原因になる
- 共通ファクトリは `e2e/helpers/` に配置（例: `makeArticle()`, `makeFeed()`）

```typescript
// ユニットテストの例（Cloudflare バインディングなし）
import { test, expect } from "@playwright/test";
import { myPureFunction } from "../src/lib/my-module";

test("正常ケース", () => {
  expect(myPureFunction("input")).toBe("expected");
});
```

## 依存管理 — Dependabot / pnpm.overrides

### Dependabot alerts の確認タイミング

- `gh api repos/.../dependabot/alerts` の結果は **キャッシュ遅延**があるため、push 前のチェックでは新規脆弱性を見逃すことがある
- **master push 後の `git push` レスポンスメッセージ**（"GitHub found N vulnerabilities ..."）も必ず確認する
- 検出された場合は `--severity high` から優先対応

### transitive dependency の強制更新（`pnpm.overrides`）

直接依存していない transitive dep に脆弱性が出た場合、`package.json` の `pnpm.overrides` で強制更新する：

```json
{
  "pnpm": {
    "overrides": {
      "fast-xml-builder": ">=1.1.7"
    }
  }
}
```

`pnpm install` 実行で resolved version が更新される。`pnpm-lock.yaml` の変更を確認後、関連 e2e テストで動作確認してからコミット。

主な使用箇所: `fast-xml-parser` の依存である `fast-xml-builder`（GHSA-2025-attribute-bypass / comment-regex）

## silent fallback の禁止 — `try/catch → null` には必ず `devError` を添える

→ `.claude/rules/browser-platform.md` を参照 (`availability()` 派生ケースも同ファイルへ移動)

## ブラウザ仕様の最低バージョン定数を 1 箇所に集約する

→ `.claude/rules/browser-platform.md` を参照

## 早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる

→ `.claude/rules/react-patterns.md` を参照

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

## 子コンポーネントの「自己判断で hidden になる UI」は親で「全件 hidden」を検知して fallback する

→ `.claude/rules/react-patterns.md` を参照

## HTML 後処理 pipeline (冪等 transform / 属性欠落 fallback / SVG sprite / JSON-LD / 画像 DOM 走査)

→ `.claude/rules/html-pipeline.md` を参照 (#733 Step 3 で分割)

## 大きい retrospective Issue は「技術スタック別フォローアップ Issue」に分割してクローズする

「複数のバグ修正に後追いテストをまとめて追加する」のような **横断的 retrospective Issue** は、進捗管理としては意義があるが **個別 PR の単位として扱いづらい**。残作業の技術スタックが分かれてくると、

- どのバグはどの infra (e2e / unit / RTL / network mock) で扱うか不明瞭
- PR が膨らむ / レビュー困難
- 部分達成しても Issue がクローズできず、open のまま放置

これを避けるため、**部分達成した時点で残作業を「技術スタック別の小さい Issue」に分割して元 Issue をクローズ** するパターンを採用する。

```
元 Issue (6 件のバグに後追いテスト)
  ├─ 達成 (2/6): 純粋関数化できたバグの再現テスト
  └─ 残 (4/6) → 技術スタック別に分割:
      ├─ フォローアップ A: React Testing Library 導入 + React 動作テスト要のバグ
      └─ フォローアップ B: e2e UI テスト拡張 + network mock 要のバグ
  → 元 Issue はクローズ + フォローアップへのリンクをコメントに残す
```

**How to apply**:

1. 横断的 retrospective Issue で 50% 以上達成したら、残作業を技術スタック別に分類できないか検討
2. 分類できる場合、各分類について **完結する独立 Issue** を新規起票 (タイトルに「テスト infrastructure: ...」等の prefix で由来明示)
3. 各フォローアップには:
   - 元 Issue へのリンク
   - 該当する残作業の個別バグ commit と内容
   - 推奨技術スタック (npm パッケージ / 設定ファイル / 既存 infra)
   - 必要なテストケース (具体的な assert 内容)
   - ブロッカー / 留意点
4. 元 Issue にクローズコメントとして達成済み + フォローアップ Issue リンクを残す
5. 各フォローアップに関連 label (`testing` / `infra` 等) を付ける

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
