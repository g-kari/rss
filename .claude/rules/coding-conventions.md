---
description: TypeScript / Next.js / React コーディング規約・hook / 命名規則・派生ケース集
paths: "src/**/*.ts,src/**/*.tsx,app/**/*.ts,app/**/*.tsx,src/cron/**/*.ts"
---

# コーディング規約

## TypeScript

→ `.claude/rules/typescript-conventions.md` を参照 (#733 Step 1 で分割)

## Next.js App Router

- Route Handlers は `app/api/**/{route}.ts` に配置
- `export const dynamic = 'force-dynamic'` を SSR ページに付ける (localStorage 使用のため)
- Server Components でブラウザ API (`localStorage` 等) は使わない
- クライアントコンポーネントには `'use client'` ディレクティブを先頭に付ける

### Route Handler パターン

`withSession` を使うのが推奨パターン。認証・env 取得・トークンリフレッシュを一括処理する。

```typescript
// app/api/example/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withSession, withJsonBody } from "@/lib/server-auth";
import { r2Get, r2Put, readStateKey } from "@/lib/r2";

// GET: データ取得（既読状態などユーザー別データは r2Get を直接使う）
export async function GET(request: Request) {
  return withSession(request, async ({ session, env }) => {
    const data = await r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), {
      readIds: [],
      bookmarkIds: [],
      readingListIds: [],
      likeIds: [],
    });
    return NextResponse.json(data);
  });
}

// POST: JSON ボディありの更新（withJsonBody = withSession + parseJsonBody）
export async function POST(req: NextRequest) {
  return withJsonBody<{ url?: unknown }>(req, async ({ body, session, env }) => {
    const { url } = body;
    // ...
    return NextResponse.json({ ok: true });
  });
}
```

- `withSession` が `requireSession()` + `getCloudflareContext()` + `applyRefreshedTokens()` を内包する
- `withJsonBody<T>` が `withSession` + `parseJsonBody<T>` を合成し、`body: T` をハンドラに渡す
- `session.userId` = 0g0 ユーザーID（R2 キーに使用）、`session.sub` = JWT sub（JWT 検証用）
- 成功: `NextResponse.json(data)`
- エラー: `NextResponse.json({ error: msg }, { status: N })`

### 環境変数アクセス

```typescript
// 文字列 vars / シークレット → process.env
const AUTH_BASE_URL = process.env.AUTH_BASE_URL!;

// Cloudflare バインディング (R2, AI) → getCloudflareContext()
const { env } = await getCloudflareContext({ async: true });
env.RSS_DATA.get("key");
```

## React

- 関数コンポーネントのみ。クラスコンポーネントは使わない
- `export default function ComponentName(...)` 形式
- Props は `interface Props { ... }` で定義し、同ファイル内に書く
- `useState` / `useEffect` / `useMemo` / `useCallback` のみ。複雑な状態管理ライブラリは使わない
- データ取得ロジックは custom hooks (`src/hooks/`) に分離
- コンポーネントは API を呼ばない (FeedSidebar の add/delete は例外)

### データ取得パターン (hooks)

```typescript
// src/hooks/useFeeds.ts
useEffect(() => {
  if (!user) return;
  fetch("/api/feeds")
    .then((r) => r.json() as Promise<Feed[]>)
    .then(setFeeds)
    .catch(console.error);
}, [user]);
```

**注意**: `r.json<T>()` は Hono 固有。Next.js では `r.json() as Promise<T>` を使う。

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

## 認証ヘルパー (`src/lib/server-auth.ts`)

```typescript
// セッション取得 (cookie から JWT 検証 + 自動リフレッシュ)
const result = await requireSession();
if ("error" in result) return result.error; // 401 NextResponse
const { session } = result;

// リフレッシュされたトークンをレスポンスに付与
return applyRefreshedTokens(NextResponse.json(data), session);

// ベータアクセス確認 (process.env.BETA_ALLOWED_SUBS)
if (!isBetaAllowed(session.sub)) return NextResponse.redirect("/");
```

## R2 ヘルパー (`src/lib/r2.ts`)

```typescript
// 読み込み（fallback: キーが存在しない場合のデフォルト値）
const state = await r2Get<ReadState>(env.RSS_DATA, readStateKey(session.userId), {
  readIds: [],
  bookmarkIds: [],
  readingListIds: [],
  likeIds: [],
});

// 書き込み
await r2Put(env.RSS_DATA, readStateKey(session.userId), state);

// SHA-256 ハッシュ（キャッシュキー生成用）
const hash = await sha256Hex(url);
```

> **フィードデータへのアクセス**: フィード一覧・記事データは共有フィード構造で管理されるため、
> `r2Get` を直接呼ばず `src/lib/shared-feed.ts` のヘルパー (`getUserFeeds`, `readUserSubscriptions` 等) を使うこと。

## RSS パーサー (`src/lib/xml-parser.ts`)

- `fast-xml-parser` のみ使用 (Workers 互換、pure JS)
- RSS 2.0 + Atom 両対応
- `toArray()` ヘルパーで配列正規化 (単一要素が object になる挙動を吸収)
- **summary には `stripHtmlWithBreaks()` を使う**: `stripHtml()` は `<br>` を空文字列に置換するため `foo<br>bar` → `foobar` の単語連結を起こす。プレビュー用の summary では `<br>` / `<p>` を改行に変換する `stripHtmlWithBreaks()` が正解
- `stripHtml()` は title など改行が不要な単一行テキストにのみ使う

## Cron (`src/cron/fetch.ts`)

- `FetchEnv = Pick<CloudflareEnv, 'RSS_DATA' | 'FINDME_RSS' | 'RATE_LIMIT'>` 型を使う (AI 不要)
- `fetchAllUsers(env: FetchEnv)` → R2 のユーザー一覧を列挙して全員分取得
- `fetchArticles(userId: string, env: FetchEnv)` → 特定ユーザーの RSS 取得

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

## 新規 Route Handler / hook を書くときは既存 lib helpers を先に grep して流用を検討する

新規 Route Handler / hook を実装するとき、`src/lib/validation.ts` / `src/lib/r2.ts` / `src/lib/api-error.ts` 等に **同じ判定ロジック / 同じ helper が既に存在する** ケースが多い。新規にインライン定義すると **「helper drift」** (= dead code でなく、既存 helper を流用し忘れて重複定義された状態) が発生する。

```typescript
// アンチパターン: 既存 isValidSessionId を知らずに新規 UUID 正規表現を定義
// app/api/collections/[id]/route.ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return apiError("Invalid id", 400);
  // ...
}
// → src/lib/validation.ts に isValidSessionId(value: string) が既存 → drift

// 修正パターン: 既存 helper を import して流用
import { isValidSessionId } from "@/lib/validation";
export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!isValidSessionId(id)) return apiError("Invalid id", 400);
  // ...
}
```

**How to apply**: 新規 Route Handler / hook / lib モジュールを書くときに以下を判定:

1. **判定ロジック / バリデーションを書く前に、`src/lib/validation.ts` を grep**:
   ```bash
   grep -nE "isValid|parse|assertValid" src/lib/validation.ts
   ```
2. **R2 アクセス / KV アクセスを書く前に**, `src/lib/r2.ts` の helper を確認:
   ```bash
   grep -nE "^export (async function|function|const)" src/lib/r2.ts
   ```
3. **エラーレスポンスを書く前に** `src/lib/api-error.ts` の `apiError` を使う (素の `NextResponse.json({error}, {status})` は禁止)
4. **同じ pattern (sort / filter / merge) のロジックを 2 ファイルで書きそうになったら**, 共通ユーティリティとして `src/lib/<name>-utils.ts` に切り出す (例: `sort-utils.ts` の `sortByOrder`)
5. **判断時間が惜しいなら** リファクタ監査エージェントに「dead exports + helper drift」観点を渡して定期 sweep

**反例 (新規定義 OK のケース)**:

- 既存 helper が **当該 use case と semantic 的に異なる** (例: `isValidFeedHash` は 16 文字 hex のみで UUID 検証には使えない)
- 既存 helper が **より厳密 / より緩い検証で当該 endpoint の要件と合わない** (例: `isValidPublicUrl` は SSRF 対策込み、内部 fetch には不要すぎる)
- **type guard が必要** で既存 helper が type predicate を返さない場合 (型 narrow のため別途定義)

主な使用箇所: `app/api/collections/[id]/route.ts` / `app/api/auth/dbsc/{challenge,register}/route.ts` の UUID 正規表現 4 箇所重複 → `isValidSessionId` 集約 (リファクタ監査エージェント confidence 92%)

### 派生ケース: 同名 enum / type の重複は canonical の `type X = Y` alias に統合する

別 hook で **canonical 型と同じ意味の独立 enum** が定義されているケース (例: `AiErrorType = "network" | "rate_limit" | "model_error" | "unknown"` と canonical `HttpErrorType = "network" | "rate_limit" | "server_error" | "client_error" | "unknown"`)。consumer が narrow チェック (例: `aiError.type === "rate_limit"`) するだけなら、**`type AiErrorType = HttpErrorType;` の alias 化** で互換性を保ちつつ統合できる。

**判定フロー**:

1. **consumer の narrow チェック箇所を grep**: `grep -rn "<typeName>\|\.type === \"" src/ --include="*.tsx"` で `.type === "X"` のような literal 比較を全件抽出
2. **canonical 型に含まれない literal を参照しているか確認**: 例えば `AiErrorType` の `"model_error"` は canonical `HttpErrorType` (`"server_error"`) に統合可能か → consumer で `"model_error"` を直接参照していなければ OK
3. canonical 型に含まれない literal が consumer で参照されているなら、その literal を canonical 型に追加してから alias 化
4. **canonical 型と完全に同じ意味なら type alias 化**: `export type X = CanonicalType;` で互換性維持

**反例 (alias 化が不適切なケース)**:

- canonical 型に **意図的に存在しない literal** がローカル enum にある場合 → alias 化は別の場所で drift を生む。alias 化せず canonical 型に variant を追加するか、独立を維持
- canonical 型の責務とローカル型の責務が **本質的に異なる** 場合 (例: HTTP 由来の error vs AI モデルロード状態) → alias 化せず独立を維持
- alias 化で **メッセージ文言が canonical と乖離** する場合 → canonical の `formatXxx(type, opts)` を同時に流用すれば文言も統一可能

主な使用箇所: `useArticleAi.ts` の `AiErrorType = HttpErrorType` 統合 — `classifyHttpError` / `getErrorMessage` 重複定義削除 + 429 で Retry-After ヘッダー秒数表示バグも同時修正

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

→ `.claude/rules/react-patterns.md` を参照

## shared resource を変更する API は「認証 + 所有権チェック」を二段で行う

`withSession` は **「認証されたユーザーかどうか」** しか判定しない。共有リソース (shared cache / 共有フィードデータ / 他ユーザーが購読する R2 オブジェクト) を変更する API では、**追加で「リクエストユーザーが対象リソースを所有 / 購読しているか」のチェックが必須**。

```typescript
// アンチパターン: 認証だけで shared resource を操作可能
export async function POST(request, { params }) {
  return withSession(request, async ({ session, env }) => {
    const { id: feedHash } = await params;
    if (!isValidFeedHash(feedHash)) return apiError("Invalid", 400);
    // ↓ 認証されていれば任意の feedHash の shared cache を破棄可能 → DoS 攻撃成立
    await purgeSharedCache(feedHash);
    return NextResponse.json({ ok: true });
  });
}

// 修正パターン: 認証 + 購読チェック (所有権チェック)
export async function POST(request, { params }) {
  return withSession(request, async ({ session, env }) => {
    const { id: feedHash } = await params;
    if (!isValidFeedHash(feedHash)) return apiError("Invalid", 400);
    // ↓ リクエストユーザーが対象 feed を購読していなければ 404
    const subs = await readUserSubscriptions(env.RSS_DATA, session.userId);
    if (!subs.some((s) => s.feedHash === feedHash)) {
      return apiError("Feed not found", 404, { code: "FEED_NOT_FOUND" });
    }
    await purgeSharedCache(feedHash);
    return NextResponse.json({ ok: true });
  });
}
```

**How to apply**: API 設計時に以下のチェックリスト:

1. **このエンドポイントが変更/削除する対象は shared resource か？**
   - shared cache (`Cloudflare Cache API` / `caches.default`) → YES
   - 共有 R2 オブジェクト (`feeds/{feedHash}/...`) → YES
   - ユーザー別 R2 オブジェクト (`users/{userId}/...`) → NO (session.userId と path が一致するなら認証だけで OK)
2. YES なら **所有権/購読チェックを追加**:
   - フィード関連: `subs.some((s) => s.feedHash === feedHash)` で購読確認
   - 記事関連: 該当フィードを購読しているか or 自分の bookmark/savedArticles に含まれるか
   - グループ/コレクション: 自分のユーザー ID と紐付くデータか
3. **チェック失敗時は 404** (`FEED_NOT_FOUND` 等) で返す。403 だと「リソースは存在するが権限なし」を leak するので、未購読フィードは存在しないかのように見せる
4. e2e テストで「他ユーザーの feedHash で操作 → 404」を必ず追加 (テスト infra が整ったら)
5. PR コメントに「shared resource 変更 → 所有権チェック追加」を明示

**反例 (チェック不要なケース)**:

- `GET /api/articles` — 自分の subscriptions と join して返すだけで、他人のデータに副作用なし
- `POST /api/read-state` — `users/{session.userId}/read-state.json` のみ更新で他ユーザーに影響なし

主な使用箇所: `POST /api/feeds/{feedHash}/purge-content-cache` の購読チェック — 認証だけで cache busting DoS が成立していた脆弱性を修正

### 派生ケース: shared cache に「未検証ソース由来のデータ」を注入する経路は TTL を短縮して影響範囲を限定する

shared cache (Cloudflare Cache API / 共有 R2) に「ユーザー入力を起点に外部から fetch した結果」を保存する経路では、**保存内容の検証だけでなく「攻撃者が任意データを注入できた場合の persistence 期間」** を考慮する必要がある。完全な input sanitization が困難なケース (HTML / OGP / fallback fetcher 等の構造的に複雑な入力) では、**TTL 短縮で影響範囲を時間軸で限定** する案が defense in depth として有効。

```typescript
// アンチパターン: 通常成功と「攻撃 vector になりうる経路」を同じ長 TTL で扱う
const ttl = hasContent ? CACHE_TTL_30D : NEGATIVE_TTL_1D;
cachePutAsync(key, response, ctx, "ogp");
// ↑ fallback 経路 (tweet 内リンク先 OGP 抽出) で攻撃者が任意 image 注入可能
//   → 30 日間 shared cache に居座り全ユーザーに拡散

// 修正パターン: 「攻撃 vector になりうる経路」を pure function で識別 + 短 TTL
function computeCacheTtl({ hasContent, isFallback }: Input): number {
  if (isFallback) return NEGATIVE_TTL_1D; // 攻撃影響範囲を 1 日に限定
  if (hasContent) return CACHE_TTL_30D;
  return NEGATIVE_TTL_1D;
}
const ttl = computeCacheTtl({ hasContent, isFallback });
```

**How to apply**: 新しい cache 注入経路 (Route Handler で `cachePutAsync` を呼ぶ箇所) を実装するときに以下を判定:

1. **cache に保存するデータの「ソース」を分類**:
   - **検証済みソース** (自社 API レスポンス / signed URL / static asset) → 長 TTL OK
   - **未検証ソース** (ユーザー入力 URL から fetch した HTML / OGP / fallback chain で別ドメインから取得) → **短 TTL を検討**
2. **fallback 経路** (元 source が空 / エラー時に別の URL を fetch する経路) は **要注意**:
   - 攻撃者が「元 source を空にする」「fallback が別ドメインから fetch する」を悪用可能
   - 例: Twitter OGP fallback / RSS feed link → original site fetch / OEmbed fallback
3. **TTL 算出を pure function に切り出す**: `computeXxxCacheTtl({ ...源由来フラグ })` の形で TDD 可能に
4. **既存 negative cache TTL を再利用**: 多くの場合 1 日 TTL は「失敗 cache」と同じなので、独立定数は不要 (命名だけで意図を表現)
5. **ユーザー UX 影響を測る**: fallback 経路の 1 日 TTL でも cache hit 率が許容範囲か (Cloudflare Analytics / log で確認)

**反例 (短 TTL 不要なケース)**:

- 自社 R2 から取得した article content (検証済みソース) → 7 日 TTL OK
- 検証済み画像 URL (HTTPS only / SSRF check 通過 / MIME 検証済み) → 30 日 TTL OK
- 認証されたユーザー専用 cache (cache key にユーザー ID 含む) → 攻撃影響が単一ユーザーに限定されるので長 TTL OK

主な使用箇所: `src/lib/ogp-cache-ttl.ts#computeOgpCacheTtl` (Twitter fallback 経路の TTL を 30 日 → 1 日に短縮して poisoning 影響範囲を限定)

## dev / e2e 限定エンドポイントの二重ガード

`/api/test/seed` のようなテスト inject 系エンドポイントを本番に絶対漏らさないために、Route Handler の冒頭で **二重ガード** を行う。

```typescript
// app/api/test/seed/route.ts
import { getDevBypassUserId } from "@/lib/dev-auth-bypass";

function notFound() {
  return NextResponse.json({ error: "Not Found" }, { status: 404 });
}

export async function POST(req: NextRequest) {
  // ガード 1: production ビルドでは Next.js が NODE_ENV を inline するため
  // この比較式が `false` 固定となり、以降のコードは tree-shaking で dead code 化される
  if (process.env.NODE_ENV === "production") return notFound();

  // ガード 2: dev でも DEV_AUTH_BYPASS_USER_ID が未設定なら 404
  const userId = getDevBypassUserId();
  if (!userId) return notFound();

  // ... seed ロジック
}
```

**なぜ二重ガード**: ガード 1（NODE_ENV）は production ビルドで dead code 化を保証する。ガード 2（getDevBypassUserId）は staging などの非 production 環境でも誤って公開しないための実行時安全網。

主な使用箇所: `app/api/test/seed/route.ts`（e2e テスト用 R2 シード）

## React state / ref / useEffect パターン

→ `.claude/rules/react-patterns.md` を参照

## 同一プロパティ名で意味の異なる派生値を使い分けない

UI 用と判定ロジック用で意味が違う「派生 boolean」は、**別名で分離する**。同名で意味だけ変えると、片方の意味で正しくても他方では誤判定になる。

```typescript
// アンチパターン: hasContent がサマリ含むかフル本文かで意味がブレる
const hasContent = !!(processedContent || article?.summary);
//   ↑ AI/TTS ボタン表示用には正しい
//   ↑ オートモードの「fetch 不要か」判定には誤り — サマリ fallback で fetch スキップ

// 修正パターン: 用途別に派生値を分ける
const hasContent = !!(processedContent || article?.summary); // UI 用
const hasFullContent = !!processedContent; // 全文取得 gate 用
```

**How to apply**: 派生 boolean / 派生 state を作るときは「どの判定に使うか」を 1 つに絞る。複数の判定で使うなら **判定別に派生値を分ける**。`hasContent` のような汎用名は曖昧なので、`hasFullContent` / `hasSummaryOnly` / `canRender` のように **意図が読み取れる名前** を付ける。

## fallback ロジックの伝播範囲を意識する

`processedContent ?? article.summary ?? ""` のような fallback は、UI 描画では合理的でも、**そのまま判定ロジックに伝播させると意味が変わる**。fallback 結果を渡す境界で「fallback 適用後の値か / 元の値か」を明確に区別する。

```typescript
// アンチパターン: buildTtsText の fallback 結果がそのまま speak gate に伝播
function buildTtsText(article, processedContent) {
  return preprocessTtsText(toPlainText(processedContent ?? article.summary ?? ""));
}
// ↑ ttsText は常にサマリ fallback 込みで非空になる → shouldStartAutoSpeak の hasText 条件が常に true に

// 修正パターン: 判定側で「フル本文有無」を別途渡してゲートする
shouldStartAutoSpeak({
  hasText: !!ttsText.trim(),
  canFetch,
  hasFullContent, // ← fallback 適用前の事実
});
```

**How to apply**: fallback を含む文字列・配列を判定関数に渡すときは、判定側で「fallback されたかどうか」を別 boolean で受け取る。`hasText` のような fallback 後の事実だけでなく、`hasOriginal` のような fallback 前の事実も渡せるよう設計する。

### 派生ケース: 同じデータに対して動作する sibling 純粋関数は fallback chain を完全に揃える

`isArticleRead(article, readIds, readBeforeTimestamp)` と `pruneOldReadIds(readIds, articles, readBeforeTimestamp)` のように、**同じデータ構造の同じフィールドを判定軸にする sibling 純粋関数** を複数持つとき、判定で使う **fallback chain (`A ?? B ?? C`) を完全に揃える** こと。片方が `publishedAt ?? createdAt` でも他方が `publishedAt` だけだと、両関数の挙動が乖離して **「片方は既読扱いするのに他方は削除しない」** のような連鎖バグが起きる。

```typescript
// アンチパターン: isArticleRead は publishedAt ?? createdAt fallback を使うのに
// pruneOldReadIds は publishedAt だけしか見ない → readId が永久蓄積
function isArticleRead(article, readIds, cutoff) {
  const ts = article.publishedAt ?? article.createdAt; // fallback
  return ts && ts < cutoff; // ← cutoff 以前は一括既読扱い
}
function pruneOldReadIds(readIds, articles, cutoff) {
  for (const a of articles) {
    if (!a.publishedAt) continue; // ← createdAt fallback なし!
    if (Date.parse(a.publishedAt) < cutoff && readIds.has(a.id)) {
      removeSet.add(a.id);
    }
  }
}
// → publishedAt: null + createdAt 古い記事の readId が永久に残る

// 修正パターン: 完全に同じ fallback chain
function pruneOldReadIds(readIds, articles, cutoff) {
  for (const a of articles) {
    const tsRaw = a.publishedAt ?? a.createdAt; // ← isArticleRead と完全一致
    if (!tsRaw) continue;
    if (Date.parse(tsRaw) < cutoff && readIds.has(a.id)) {
      removeSet.add(a.id);
    }
  }
}
```

**How to apply**: 同じデータに動作する sibling 関数を作るときは:

1. **「判定で使うフィールド + fallback chain」を 1 箇所に定義** — 例: `getArticleTimestamp(a) = a.publishedAt ?? a.createdAt`
2. 全ての sibling 関数 (`isArticleRead` / `pruneOldReadIds` / `filterExpiredArticles` 等) が **その共通関数を呼ぶ**
3. 共通関数化が難しいなら、**各関数の判定行に `// {他関数名} と fallback chain を揃える` のコメントを置く**
4. 新しい sibling 関数を追加するときは既存の fallback chain を確認してから書く
5. **TDD で「fallback 適用ケース」を網羅** (例: `publishedAt: null` + `createdAt 古い` → 削除されるか)

主な使用箇所: `isArticleRead` (`article-filter.ts`) ↔ `pruneOldReadIds` (`read-state-prune.ts`) — `publishedAt ?? createdAt` fallback chain を統一 (`feedHash: "__saved__"` の手動保存記事や RSS で publishedAt 抜けの記事の readId が永久蓄積するバグ修正)

### 派生ケース: 派生 boolean は fallback 混入後の値ではなく、fallback **前の origin** から導出する

派生 boolean を「正しい用途名」で分離した (例: `hasContent` → `hasFullContent`) としても、**その派生元が fallback 込みの値**だと依然として誤判定が起きる。

```typescript
// アンチパターン: hasFullContent は名前は正しいが、processedContent が fallback 込み
const rawContent = storedContent ?? article?.content ?? null;
//                              ↑ ここで fallback が混入
const processedContent = rawContent ? processContent(rawContent) : null;
const hasFullContent = !!processedContent;
//                     ↑ article.content (RSS 本文) があれば fetch 前でも true → speak 早期発火

// 修正パターン: fallback 前の origin (storedContent) から直接導出
const hasFullContent = !!storedContent || !canFetch;
//                     ↑ fetch 完了済 OR fetch 不要のときだけ true
```

**How to apply**: 派生 boolean を作るとき:

1. **派生元を辿る**: `derived = !!middleValue` と書きたくなったら、`middleValue` の定義を見て fallback (`A ?? B ?? C`) が含まれていないか確認
2. **fallback 込みなら origin から再構築**: 「fetch 済か」を判定したいなら `!!storedContent`、「fetch 不要か」を判定したいなら `!canFetch`。両方なら `!!storedContent || !canFetch`
3. **テストで検証**: 「fallback 元 (article.content) があるが fetch 前」のケースで boolean が false になるか、ユニットテストで明示

## 既存設定 UI を流用して新要件を満たす（新規 UI を増やさない判断軸）

ユーザーから「設定可能化したい」要望が来たとき、**意味的に重なる既存 UI があれば、それを流用して内部ロジックだけ拡張**する選択肢を最初に検討する。

```typescript
// アンチパターン: 同じ「N 日」値を 2 箇所で設定させる
// UI: 記事保持期間 (30/60/180 日) ← 既存
// UI: 既読自動削除 N 日 (30/60/180 日) ← 新規 ← ユーザーが両方設定して齟齬発生

// 修正パターン: 既存 UI の値を内部で複数の用途に再利用
// UI: 記事保持期間 (30/60/180 日) ← そのまま
// 内部: ttlDays から effective cutoff を算出して prune にも適用
```

**How to apply**: 「設定可能化」要望には次の順で検討:

1. **意味が重なる既存設定があるか** → あれば流用（純粋関数で複数用途に値を変換）
2. 流用すると挙動が予期しない方向に変わるユーザーがいるか → RELEASE_NOTES で告知
3. 完全に独立した概念なら新規 UI を追加

新規追加した場合、必ず「既存設定との優先順位」を明示する（max / min / 最後の更新優先など）。

### 派生ケース: ユーザー要望ベースの「抑制 / 制限機能」は default OFF が原則

「既存挙動 X を抑制したい」「自動 Y を発動させたくない」型の要望を受けて新設定を追加するとき、**default を ON にすると既存ユーザーが意図せず挙動変化を被る**回帰になる。要望者本人 (= 抑制したい人) は ON にしてくれるが、他のユーザーは「便利な自動機能が突然動かなくなった」と混乱する。

```
アンチパターン: default ON で実装
  - 既存ユーザー全員が抑制機能の影響を受ける (回帰)
  - 「便利機能が突然動かなくなった」報告が他ユーザーから来る
  - リリース後に default 戻し → 設定値マイグレーションが面倒

修正パターン: default OFF + ユーザー判断で ON
  - 要望者本人だけが ON にして恩恵を受ける
  - 既存ユーザーへの影響ゼロ (回帰なし)
  - 後で default 変更したくなったら判断材料を集めてから決定
```

**How to apply**: 「便利機能」と「抑制機能」を実装時に判定:

| 種別                      | default        | 例                                           |
| ------------------------- | -------------- | -------------------------------------------- |
| 便利機能 (新たな価値追加) | ON が妥当      | 自動翻訳・自動要約・自動既読                 |
| 抑制機能 (既存挙動の抑制) | **OFF が原則** | フォールバック禁止 / 自動再生禁止 / 通知禁止 |

抑制機能の判定キーワード: 「〜しないようにしたい」「〜を防ぎたい」「〜を発動させたくない」。これらが要望文にあれば、抑制機能として default OFF で実装する。

主な使用箇所: `autoAiBrowserOnly` 設定 — 「Workers AI フォールバックを発動させたくない」要望に default OFF で対応

### 派生ケース: 「同カテゴリ機能 (連続値 + 離散ジャンプ)」は N 段階セグメントに統合する

「自動スクロール」と「スライドショー」のように、**同じカテゴリ (= 自動進行)** で異なる挙動の機能を別 toggle にすると UX が複雑化する。**1 SegmentGroup の段階的選択** に統合すると認知負荷が下がる。

```typescript
// アンチパターン: 2 つの独立 toggle
<Toggle label="自動スクロール" value={autoScrollEnabled} />
<Toggle label="スライドショー" value={slideshowEnabled} />
// → 「両方 ON にしたらどうなる?」「どっちが優先?」で混乱

// 修正パターン: 1 SegmentGroup で N 段階
<SegmentGroup
  options={["off", "slow", "medium", "fast", "slideshow"]}
  value={galleryAutoScrollSpeed}
/>
// → 「速さを上げていくと最終的にスライドショー」と直感的
```

**How to apply**: 「機能 A」と「機能 B」を実装するとき:

1. **機能 A と B が同カテゴリか** (例: 自動進行 / 通知頻度 / プライバシーレベル) を判定
2. 同カテゴリなら **「A の強度を上げていくと B になる」** 順序で並べられるか検討
3. 並べられるなら N 段階 SegmentGroup に統合 (既存「設定 UI を流用」原則の延長)
4. 並べられないなら別 toggle (例: 「自動翻訳」と「自動要約」は別概念なので別 toggle)

主な使用箇所: `galleryAutoScrollSpeed` — 連続スクロール 3 段階 + slideshow 1 段階を 1 軸に統合

### 派生ケース: 自動操作中の手動操作で自動的に OFF (一時停止 UX)

自動再生・自動進行系機能で「再生 / 一時停止」を ▶/⏸ ボタンで明示する設計は動画プレイヤーの慣習。だが軽量な自動進行 (自動スクロール、ポーリング、自動同期等) では **「ユーザーが手動操作したら自然に停止」** が直感的。専用ボタンを増やさず、`onUserInterrupt` callback で speed を OFF に戻すだけで一時停止を実現できる。

```tsx
// アンチパターン: ▶/⏸ ボタンを別 UI として配置
<button onClick={togglePlayback}>{isPlaying ? "⏸" : "▶"}</button>;

// 修正パターン: 手動操作で OFF に戻す
useGalleryAutoScroll({
  scrollEl,
  speed,
  onUserInterrupt: () => onChangeSpeed("off"), // wheel/touch で即停止
});
```

**How to apply**: 自動進行系機能を実装するとき:

1. **「ユーザーが手動操作したらどうなるべきか」** を最初に考える
2. 「手動操作で停止」が自然なら ▶/⏸ ボタンは不要、`onUserInterrupt` callback で speed/enabled を OFF に
3. 「手動操作と並行して自動進行を続けたい」(例: 動画再生中の seek) なら ▶/⏸ ボタンが必要
4. UserSettings の速度選択 = on/off の役割を兼ねるなら、専用 toggle ボタンは削減可能

主な使用箇所: `useGalleryAutoScroll` の `onUserInterrupt` — wheel/touchstart で speed を "off" に戻す

## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する

→ `.claude/rules/react-patterns.md` を参照

## AbortController.abort() の伝播範囲を限定する

→ `.claude/rules/react-patterns.md` を参照

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

→ `.claude/rules/react-patterns.md` を参照

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

→ `.claude/rules/react-patterns.md` を参照

## ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く

→ `.claude/rules/react-patterns.md` を参照

## 上流 API プロキシのヘッダ欠落補完

→ `.claude/rules/browser-platform.md` を参照

## 読み取り状態のマージ戦略 (`useReadState`)

R2 サーバーデータとローカル `localStorage` のマージは **ローカル優先 (local ∪ server)**。
一度クライアントで既読にした記事はサーバーに未読状態が残っていても既読扱いになる。

```typescript
// ローカル ∪ サーバー（ローカル優先）
const merged = new Set([...serverSet, ...localSet]);
```

例外:

- **スヌーズ期限はより遅い方を採用**（サーバーの期限が未来の場合を優先）。
- **ノート（notes）は同一キーではサーバー優先**（`{ ...prev, ...serverNotes }`）。ノートはテキスト編集コンテンツのため、クロスデバイス同期で別デバイスで書いた最新版をサーバーから上書きするのが正しい挙動。

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

## HTML 後処理で属性に依存する装飾は「属性欠落」のフォールバックを runtime に置く

`fixImageDimensions` のように **HTML 属性 (`width` / `height` / `alt` 等) が前提** の後処理は、属性が無いフィードでは何もしない。CSS 側がその後処理結果に依存している場合 (例: `width: 100%` + per-image inline `max-width`)、属性欠落時に **CSS の意図しない挙動** (小さい画像も画面いっぱい引き伸ばし) が発生する。

```typescript
// アンチパターン: HTML 属性 width/height が無いと max-width が付かない
function fixImageDimensions(html: string): string {
  return html.replace(/<img\b([^>]*)>/g, (m, attrs) => {
    const w = parseWidthAttr(attrs);
    const h = parseHeightAttr(attrs);
    if (w >= 16 && h >= 16) {
      return `<img${attrs} style="max-width: ${w}px">`;
    }
    return m; // ← 属性欠落時は max-width 無し → CSS width: 100% で引き伸ばし
  });
}

// 修正パターン: runtime 補完 hook で naturalWidth から max-width を後付け
export function useArticleImageMaxWidth(contentRef, contentKey) {
  useEffect(() => {
    const imgs = contentRef.current?.querySelectorAll<HTMLImageElement>("img");
    imgs?.forEach((img) => {
      if (img.style.maxWidth) return; // 既存 inline は尊重
      const apply = () => {
        if (img.naturalWidth > 0 && !img.style.maxWidth) {
          img.style.maxWidth = `${img.naturalWidth}px`;
        }
      };
      if (img.complete) apply();
      else img.addEventListener("load", apply, { once: true });
    });
  }, [contentRef, contentKey]);
}
```

**How to apply**: HTML 後処理が「属性に依存した装飾」を出力する場合 (CSS 一律変更は副作用大、runtime で `naturalWidth` 補完が安全):

1. 属性が無い場合の挙動を最初に確認 (CSS が想定外の動きをしないか)
2. 必要なら **runtime hook** で属性の代替情報 (naturalWidth / naturalHeight / textContent) を読んで補完
3. 既存 inline スタイルがある場合は **上書きしない** ガードを必ず入れる
4. cleanup (`removeEventListener`) を忘れない

主な使用箇所: `useArticleImageMaxWidth` — `fixImageDimensions` で max-width が付かない画像を runtime で補完

## 冪等な HTML transform は複数 pipeline 経路で重複呼出して安全網にする

`postProcess` (Readability 経由) / `applyCorePipeline` (xml-parser RSS 経由) のように **同じ output 形態を最終的に作る複数の pipeline 経路** がある場合、ある transform を 1 経路でしか呼ばないと、もう片方の経路で「変換漏れ」が発生する。

`transformSpeakerDeckScriptEmbeds` / `transformSlideShareEmbedLinks` / `transformZennLinkEmbeds` のように **冪等な (= 同入力に同出力 / 二度実行しても結果が変わらない) transform** は、**両経路で呼んで重複実行する** のが安全網パターン。

```typescript
// アンチパターン: extractMainContent (Readability 前変換) でのみ呼ぶ
function extractMainContent(html, pageUrl) {
  let preprocessed = transformSpeakerDeckScriptEmbeds(html); // ← Readability 用に script を iframe 化
  // ... Readability 抽出
  return postProcess(content, pageUrl); // ← postProcess は transform を呼ばない
}
function postProcess(content, pageUrl) {
  return applyCorePipeline(content, pageUrl); // ← sanitize 前に transform 呼んでいない
}
// → xml-parser → applyCorePipeline 経路 (RSS content 直流入) で script が
//   sanitize で除去される → ユーザーは「全文取得しないと iframe 出ない」状態

// 修正パターン: applyCorePipeline (両経路共通最終 stage) でも transform を呼ぶ
function applyCorePipeline(html, pageUrl) {
  let h = fixImageDimensions(html, pageUrl);
  h = rewriteImageUrls(h);
  h = fixExternalLinks(h, pageUrl);
  h = transformSpeakerDeckScriptEmbeds(h); // ← 冪等。Readability 経由でも二度実行 OK
  h = transformSlideShareEmbedLinks(h);
  h = wrapTables(h);
  return sanitizeHtml(h);
}
// extractMainContent 側の Readability 前変換は **依然必須** (Readability が script を
// 除去するため preClean 前に iframe 化しないと data-id が消失)。両方で呼ぶことで
// RSS 直流入 / Readability 経由の双方をカバー。
```

### 冪等判定軸

transform が冪等か判定する `f(f(x)) === f(x)` テスト:

| transform                                      | 冪等?       | 理由                                                                          |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------- |
| `transformSpeakerDeckScriptEmbeds`             | ✅ Yes      | 既に iframe 化済の HTML には script が無く no-op                              |
| `transformSlideShareEmbedLinks`                | ✅ Yes      | 既に iframe 化済の HTML には対象 `<a>` が無く no-op                           |
| `transformZennLinkEmbeds`                      | ✅ Yes      | 既に外部リンク化済の HTML には対象 span が無く no-op                          |
| `sanitizeHtml`                                 | ✅ Yes      | 一度 sanitize 済の HTML を再 sanitize しても安全 (denylist 経路全 match なし) |
| `rewriteImageUrls` (`/api/image-proxy` 経由化) | ❌ No       | 既にプロキシ化済の URL を再度プロキシで包む → 二重 encoded で壊れる           |
| `fixExternalLinks` (rel/target 付与)           | ⚠️ ほぼ Yes | rel/target 既存属性は上書きしないガードあれば冪等                             |

`rewriteImageUrls` のような **非冪等な transform** は 1 経路でのみ呼ぶ。冪等な transform だけが「重複呼出 OK」。

**How to apply**: HTML transform 関数を pipeline に組み込むときに以下を判定 (冪等な transform を複数経路で呼ぶことで、新規 pipeline 経路追加時の「変換漏れ」を未然に防げる):

1. **transform は冪等か?** TDD で `f(f(x)) === f(x)` を 1 ケース追加して確認
2. **冪等 + 全経路で必要** なら → 共通最終 stage (`applyCorePipeline` 等) に組み込む
3. **冪等 + Readability 前など特定タイミング必須** なら → 専用経路でも呼びつつ、共通 stage でも呼ぶ (二度実行で no-op)
4. **非冪等** なら → 1 経路でのみ呼ぶ。pipeline のコメントで「ここで 1 度だけ実行」を明示
5. 既存 transform の冪等性をリファクタで損なわないよう、spec に冪等性テストを追加するか jsdoc に「冪等」を明記

主な使用箇所: `applyCorePipeline` で `transformSpeakerDeckScriptEmbeds` / `transformSlideShareEmbedLinks` を Zenn と同パターンで重複呼出 — xml-parser → applyCorePipeline 経路 (RSS 直流入) で全文取得を待たずスライドが表示される

## SVG sprite パターンの本文抽出: `<use href="#fragment">` 孤立参照は除去する

ページ本体に `<svg style="display:none"><symbol id="i-twitter">...</symbol></svg>` で SVG sprite を定義し、本文中に `<svg><use href="#i-twitter">` で参照する設計は普及しているが、**Readability で本文だけ切り出すと sprite 定義が失われ参照だけが残る**。

```html
<!-- 元ページ -->
<body>
  <div style="display:none">
    <svg><symbol id="i-twitter"><path d="..."/></symbol></svg>
  </div>
  <article>
    <a><svg><use href="#i-twitter"></svg></a>  ← Readability に拾われる
  </article>
</body>

<!-- Readability 抽出後 -->
<a><svg><use href="#i-twitter"></svg></a>  ← symbol 定義が無いので空
```

問題: SVG 要素は HTML5 仕様で **デフォルトサイズ 300×150px** を持つ。未定義参照の空 `<svg>` は icon 1 個ごとに 300×150 の **謎の空白領域** として描画され、記事内に 10〜15 個並ぶと「ガタつき」「謎の空白」状態になる。

修正パターン: 本文後処理で「`<use>` のみで構成された `<svg>`」を識別して除去する純粋関数を入れる。

```typescript
export function removeOrphanedIconSvgs(html: string): string {
  return processNestedBlocks(html, ["svg"], null, (openTag, inner) => {
    const stripped = inner
      .replace(/<use\b[^>]*\/?>(?:[\s\S]*?<\/use\s*>)?/gi, "")
      .replace(/<svg\b[^>]*>\s*<\/svg\s*>/gi, "") // ネストした空 svg も除去
      .trim();
    if (stripped === "") return ""; // 孤立 icon 参照 → 除去
    return `${openTag}${inner}</svg>`; // 実コンテンツあり → openTag (属性) 保持
  });
}
```

**How to apply**: HTML 後処理で `<use>` のみの `<svg>` を識別して除去する純粋関数 + TDD (孤立 use / href 形式 / 複数 use / 実コンテンツ保持 / 親 a 残し / 属性保持 / ネスト) を入れる。`removeNoise` パイプラインの末尾に追加するのが安全な配置。

主な使用箇所: `removeOrphanedIconSvgs` (`html-noise-removal.ts`) — Twitter 系 / Skebetter 等 SVG sprite ページの「謎の空白」防止

## 画像主体ページは JSON-LD `image` を抽出して Readability の取りこぼしを補完する

Readability は **テキスト密度ベース** で本文を判定するため、テキストが少ない画像主体ページでは `「推薦」「関連記事」` 等を本文と誤判定して **記事固有の主要画像を取りこぼす** ことがある。

```
症状例 (Skebetter author/manga 個別ページ):
- 元 HTML に <img> 130 個、うち主要漫画画像 2 枚を含む
- Readability 抽出結果: profile_images だけ 54 個 (推薦セクションを「本文」と誤判定)
- 主要画像 0 枚 → ユーザー報告「2 枚あるはずなのに取れない」
```

既存の「画像損失 fallback」(`srcImgCount >= 8 && rcImgCount * 5 < srcImgCount`) は、`rcImgCount` (= 推薦の profile_images 54 個) が膨らんで条件が成立せず機能しない。

修正パターン: **JSON-LD `<script type="application/ld+json">` の `Article` 型 `image` フィールド** を主要画像の信頼ソースとして使う純粋関数を追加し、抽出結果に不足する画像を `<div hidden>` で末尾補完する。

```typescript
// 1. JSON-LD から記事主要画像を抽出
export function extractJsonLdImages(html: string): string[] {
  // <script type="application/ld+json"> を全て JSON.parse
  // @type が Article / NewsArticle / BlogPosting 等の image を採用
  // image は string / array / ImageObject ({ url } / { contentUrl }) 形式に対応
}

// 2. 抽出結果に含まれない画像のみ <div hidden> で補完
export function appendMissingJsonLdImages(content: string, urls: string[]): string {
  const missing = urls.filter((u) => !content.includes(u));
  if (missing.length === 0) return content;
  return content + `<div hidden>${missing.map((u) => `<img src="${u}" />`).join("")}</div>`;
}

// 3. extractMainContent の全パスに適用
const jsonLdImages = extractJsonLdImages(preprocessed);
const augment = (c: string) => appendMissingJsonLdImages(c, jsonLdImages);
return { content: augment(extractedContent) + buildGallery(), source: "..." };
```

**How to apply**:

1. テキスト密度ベースの本文抽出ツール (Readability 等) を使うとき、画像主体ページの fallback として JSON-LD を採取する
2. `@type` は `Article` / `NewsArticle` / `BlogPosting` / `TechArticle` 等の **article 系の型** を全て認識
3. `image` フィールドは `string` / `array` / `ImageObject ({ url } / { contentUrl })` の **3 形式** に対応
4. 入れ子オブジェクト (`BreadcrumbList` 内の関連 image など) を再帰探索して取りこぼさない
5. http(s) URL のみ採用 (data: / 相対 / javascript: 除外)
6. **抽出結果に既に含まれていれば追加しない** (重複排除)
7. `<div hidden>` 形式で末尾追加 (ImageGallery 互換、本文表示への影響なし)

主な使用箇所: `extractJsonLdImages` / `appendMissingJsonLdImages` (`json-ld-images.ts`) — `extractMainContent` の 3 抽出パス全てに `augmentWithJsonLd` を適用

## 画像 DOM 走査では `<img>` 単体でなく `<a href>` のフル解像度画像も拾う

画像系サイト (wallhaven / WordPress 系の写真記事 / pixiv 等) では `<a href="フル解像度.jpg"><img src="サムネ.jpg"></a>` 構造が一般的。`<img>` 要素だけ走査するロジックは:

1. **サムネ URL を取得** (= `<img src>` のサイズフィルタで除外されることが多い)
2. **フル解像度 URL を取りこぼす** (= `<a href>` の中にある)

結果として「画像 DL ボタンを押しても OGP 画像 (= 1 枚) しか保存されない」体感に直結する。`<a href>` 走査を追加することで、サムネが除外されてもフル解像度を確実に拾える。

```typescript
// アンチパターン: <img> 単体走査 — wallhaven 等で thumb 除外 → OGP のみ DL
export function collectImageUrls(container: Element): string[] {
  const result: string[] = [];
  for (const img of container.querySelectorAll("img")) {
    const src = img.currentSrc || img.getAttribute("src") || "";
    if (img.naturalWidth < MIN_IMAGE_SIZE_PX) continue; // ← サムネは除外
    result.push(src);
  }
  return result;
}

// 修正パターン: <a href> を先に拾ってフル解像度を確保
export function collectImageUrls(container: Element): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // 先に <a href="image-url"> を走査
  for (const a of container.querySelectorAll("a[href]")) {
    const href = (a as HTMLAnchorElement).getAttribute("href") ?? "";
    if (!isImageHref(href)) continue; // .jpg / .png / .webp / .avif / .gif / .svg
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
  }

  // 次に <img> を走査 (サムネが除外されてもフル解像度は確保済み)
  for (const img of container.querySelectorAll("img")) {
    /* 既存ロジック */
  }
  return result;
}
```

**How to apply**: 画像 DL / 画像コレクション系の DOM 走査ロジックを書くとき (画像系サイトはサムネがサイズフィルタで除外されてフル解像度が `<a href>` にしか存在しないことが多い):

1. **`<img>` 単体走査だけで十分か** を最初に検討
2. ターゲットサイトに以下のいずれかが該当するなら **`<a href>` 走査も追加**:
   - 画像系サイト (写真共有 / 壁紙 / pixiv 等)
   - WordPress 系 (写真記事は thumb→full の anchor 構造が一般的)
   - 「サムネクリックで拡大表示」UX を持つサイト
3. **拡張子判定ヘルパー** を切り出す: `isImageHref(href): boolean` で `.jpg/.jpeg/.png/.gif/.webp/.avif/.svg` + クエリ文字列・大文字小文字対応
4. **`/api/image-proxy?url=...` 経由の URL** も対応 (内部の `url` パラメータをデコードして拡張子判定)
5. **走査順序**: `<a href>` を先に拾って seen set に登録 → 次に `<img>` を走査。これで href と img src が同 URL のときも自動的に重複排除される
6. TDD 必須: 「a href が画像 / 内部 img が小サイズで除外でも href は残る / 拡張子なしは無視 / 大文字小文字 / クエリ文字列 / 重複排除 / data: 相対 URL は無視 / proxy URL」を網羅

**反例 (やらない方が良いケース)**:

- **記事本文系サイト** (Qiita / Zenn / 技術ブログ等) — `<a href="画像">` で画像にリンクすることは少なく、anchor href は記事内リンク。誤検知は少ないが過剰実装になる可能性あり (拡張子チェックで弾かれるので実害なし)
- **広告画像が a タグで囲まれている UI** — 通常は広告自体が削除済み (`removeNoise` パイプライン) なので残らない

主な使用箇所: `collectImageUrls` / `collectImageUrlsFromHtml` (`image-extractor.ts`) — wallhaven 等の thumb→full 構造で OGP のみ DL されるバグ修正

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

## コード監査は専門エージェント並行派遣 → 高信頼指摘を選別 Issue 化

「issue が無いときに監査して新規 Issue 起票」を依頼されたら、**観点別の専門エージェントを並行派遣**して、各エージェントから 1-3 件の高信頼指摘を集める。1 つの汎用エージェントに「全観点を見て」と依頼すると深さが足りない。

```
並行派遣テンプレート (3 体並列が最適点):
  ├─ feature-dev:code-reviewer (perf 観点)     ← React re-render hotspots / 重い計算の重複 / R2 アクセスパターン
  ├─ feature-dev:code-reviewer (UX/a11y 観点)  ← フォーカストラップ / ARIA / pattern drift
  └─ feature-dev:code-reviewer (simplify 観点) ← 重複 helper 化 / dead code / 過度な複雑性
                                                (security は脆弱性疑い時のみ追加)
```

**3 体並列が最適な理由**:

- 1-2 体: 観点が偏る or 取れる指摘数が少ない (1 サイクルの作業量に届かない)
- 3 体: 各観点で 1-3 件 × 3 観点 = 4-9 件の指摘 → 同サイクルで 5-7 件適用 + 1-2 件 Issue 化が現実的
- 4 体以上 (**監査のみ**): 観点が被って同じ箇所を複数エージェントが指摘するリスク + 消化不能な件数

ただし「**監査 3 体 + 既存 Issue の独立調査 1 体 = 計 4 体**」のミックス並列は OK (観点が完全分離されるため衝突なし、調査結果は別の Issue コメントに転載されるので消化不要)。`react-patterns.md` の「Phase 1 実装中はライブラリ調査エージェントを並列派遣」パターンの拡張として、**監査ローテーション中も別 Issue の Phase 進行に必要な調査を並列で進める** ことで、サイクルあたりの actionable backlog 確保量を最大化できる。

観点を非重複に分離することが重要 (perf エージェントが a11y を見ない、a11y が simplify を見ない)。プロンプトで「focus areas」を明示して観点境界を強制する。

各エージェントへのプロンプトに **必ず含める要素**:

1. **「Find 1-3 high-confidence issues that are genuinely impactful」** — 件数上限 (1-3) + confidence 縛り
2. **Skip if** 節 — 「purely theoretical」「fix complexity > gain」「already addressed」を明示
3. **Report format** — file path + line number / observation / impact / fix の 4 項目
4. **「Use serena tools」** — find_symbol / search_for_pattern で効率的に navigate
5. **語数制限** — 「Report under 400 words」で出力肥大化防止

**How to apply**: 監査依頼 → エージェント結果集約 → 各指摘を:

1. **実コード Read で再現確認** (`サブエージェント調査結果は該当コードで検証してから採用` ルール参照)
2. **高信頼性 (confidence 80+) のみ Issue 化** — ラベル (`performance` / `bug` / `accessibility` 等) + `🤖 AI 起票` バナー必須
3. **Issue 本文に**: 「状況」「影響」「修正方針案 (案 A/B/C)」「推奨」「必要な対応箇所」「関連 (元コメント / 関連実装)」のテンプレート従う
4. **同サイクルで 1 件は対応する** — 監査だけで Issue を量産すると消化不良。最も impact が大きい 1 件をそのサイクルで完結する流れを基本にする

主な使用箇所:

- perf / UX 監査 2 体並行 → 4 件起票 → 1 件同サイクル対応
- perf / UX-a11y / simplify 監査 3 体並行 → 8 件指摘 → 7 件同サイクル一括適用 + 1 件 Issue 化
- perf / UX-a11y / simplify 監査 3 体並行 → 9 件指摘 → 8 件同サイクル一括適用 (a11y 3 + simplify 3 + perf 2) + 1 件 Issue 化の最大消化サイクル更新

### 派生ケース: 監査エージェントに既存規範遵守チェックも依頼すると pattern drift が早期発見される

監査エージェントへのプロンプトに「**既存規範ファイル (`.claude/rules/*.md`) と照合して違反がないか**」を明示すると、**「規範を codify した直後は守られていたが、その後の新規追加コードで drift した」** ケースを早期検出できる。本来 codify 時に「主な使用箇所」コメント + grep 検出パターン (`rule-maintenance.md` 派生ケース 5) で自動 sweep する設計だが、grep で表現しにくい規範 (例: `try/catch → null` に必ず `devError` を併記) は人間判断要のため監査エージェント観点に組み込むのが効率的。

```
プロンプト例 (simplify エージェントへ):
「Focus area の `simplify` に加えて、`browser-platform.md` / `react-patterns.md` 等の
 既存規範ファイルへの違反を 1 件含めても良い。**規範違反は同種コンポーネントの canonical
 pattern と照合 (例: browser-summarizer.ts vs browser-translator.ts) して報告する」
```

**How to apply**: 観点別監査エージェントへのプロンプトに以下を追加 (grep で機械検出できない判断要素を含む規範は canonical pattern との照合で初めて検出可能):

1. **既存規範ファイル (`.claude/rules/*.md`) を読んで、focus area に関連するルールを認識**
2. **canonical pattern を実装している既存ファイル** (例: browser-summarizer.ts / Modal.tsx / read-state-merge.ts) を **対比対象として明示**
3. **「同種コンポーネントを比較 (similar components compare)」で新規ファイルの規範違反を検出**
4. 検出された規範違反は report に **「規範: <ルール名>」「canonical: <ファイル名>」** を含める形で報告

主な使用箇所: 2026-05-10 32th サイクル — simplify エージェントが `browser-translator.ts` の silent `catch { return null }` を発見 (規範: browser-platform.md「silent fallback の禁止 — `try/catch → null` には必ず `devError` を添える」/ canonical: `browser-summarizer.ts`)、即修正で `devError` 追加

### 派生ケース: 高信頼度の独立修正は「Issue 起票せず同サイクルで連続修正」する

監査エージェントの指摘が以下の条件を全て満たす場合、Issue 起票をスキップして **同サイクルで連続修正 → 各 commit を master 反映** が効率的:

1. **修正範囲が 1〜2 ファイルに局所** (cross-cutting でない)
2. **設計判断不要** (ユーザー UX に影響する選択肢がない、または規範実装が既に存在)
3. **TDD 可能 or typecheck/e2e で動作保証可能**
4. **既存修正パターンの複製で済む** (例: `ConfirmModal` の `returnFocusRef` パターンを `FocusModeOverlay` にコピー)

```
アンチパターン (過剰起票):
  監査エージェント 3 体派遣 → 9 件発見
  → 全件 Issue 起票 (起票だけで 30 分)
  → 同サイクルで 1 件のみ対応
  → 残 8 件はユーザー判断待ちで放置

修正パターン (連続修正):
  監査エージェント 3 体派遣 → 9 件発見
  → 高信頼 6 件を実コード検証で確定
  → 6 件を 4 commit にバッチング (関連性で集約) して連続 master 反映
  → 残 3 件 (主観・大規模) のみ Issue 起票してユーザー判断仰ぐ
```

**How to apply**: 監査結果を以下の表で振り分け (Issue は「ユーザー判断が必要なもの」に集中):

| 判定                               | 例                                           | 対応                                              |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| 規範パターン複製 + 1〜2 ファイル   | focus restore 抜け / null check 漏れ / typo  | **同サイクルで修正** (Issue 起票不要)             |
| 既存純粋関数 + TDD 可能な perf bug | useMemo deps 誤り / parse の per-record 実行 | **同サイクルで修正 + spec 追加** (Issue 起票不要) |
| 設計判断要 (案 A/B/C 比較)         | 新機能追加 / 大規模リファクタ / 命名選択     | **Issue 起票** (案提示してユーザー判断仰ぐ)       |
| 主観評価要                         | デザイン色変更 / 配置調整                    | **Issue 起票** (本人視点が必要)                   |

連続修正のときも、各 commit の RELEASE_NOTES 追記 + master 反映 + push は省略しない (デプロイ可能な状態を保つ)。

### 派生ケース: 監査エージェントの提案は実装着手前に「影響範囲 vs 利得」で再評価する

監査エージェントは **「fix の概要」だけ提示** することが多く、実装範囲の見積りが甘い (例: 「2 つの hook を統合」と書いてあるが、実は **Context lift up + 4 ファイル変更** が必要なケース)。連続修正の判定表で「規範パターン複製 + 1〜2 ファイル」に該当しても、実際にコードを Read してみたら 5 ファイル超え/Context 設計要となることがある。

```
パターン: 着手前の再評価ステップ
  1. エージェント提案を読む (例: "useTotalUnreadCount を useSidebarFeeds に統合")
  2. 影響範囲の Read で実装スコープを確認:
     - 削除する hook の caller を grep
     - 統合先 hook の caller を grep (子コンポーネントだけか? Context lift 要か?)
     - state 共有の方向 (parent → child / child → parent / sibling)
  3. 着手判定:
     - 「1〜2 ファイル + 既存パターンの延長」 → そのまま連続修正
     - 「Context 新設 / hook lift up / 3 ファイル超え」 → Issue 起票へ降格
     - 「設計判断必要 (Context vs prop drilling vs callback)」 → Issue 起票
  4. Issue 起票時は **エージェント分析結果 + 案 A/B/C + 推奨案** をテンプレで貼る
```

**How to apply**: 監査エージェント提案を受けたら (短い report は scope を過小評価しがち、着手前の Read 1-2 回で PR 規模を予測):

1. **「変更対象ファイル数」と「新規ファイル数」を Read で見積る** (caller grep, 既存 export grep)
2. **3 ファイル超え or 新 Context/Provider 必要** なら Issue 起票へ降格
3. **既存規範パターン (Modal.tsx の focus trap, ShareMenu の portal menu 等) のコピー** なら 1〜3 ファイルでもそのまま着手 (パターン適用は予測可能)
4. **エージェント分析が含む「partial」「unclear」表現** に注意。「could be merged」「should be extracted」など曖昧な動詞は実装スコープが大きいシグナル
5. Issue 起票時は **エージェントの impact 計算と confidence** を引用しつつ、**案 A/B/C + 必要な対応箇所 (具体ファイル名)** を必ず列挙

主な使用箇所: perf 監査 (useTotalUnreadCount 統合) — エージェント 85% 信頼度だったが Read で Context lift up 必要と判明 → Issue 起票して降格

### 派生ケース: 監査エージェントの提案は「prop 受け口」と「配線」を分離して部分達成できる

「Issue 起票へ降格」の前に、**「prop 受け口の追加 (1 ファイル)」と「配線 wiring (3〜4 ファイル + state lift up 等)」を分離** して **prop 受け口だけ同サイクル commit + 配線は別 Issue 起票** という部分達成パターンを採れることがある。「全部か全くやらないか」の二択でなく、安全な前半だけ commit を進められる。

```
パターン: 受け口と配線を分離
  1. エージェント提案を Read で再評価 → 全体は 3-4 ファイル touch + state lift up
  2. 「目的のコンポーネント側」(例: ArticleListEmptyState) は 1 ファイル touch で
     受け口 prop (onAddFeed?: () => void) + UI 要素 (CTA ボタン) を追加可能
  3. 「呼び出し側」(例: App.tsx) は state lift up + caller chain 全部修正で 3-4 ファイル
  4. 受け口だけ commit、配線は別 Issue で案 A/B/C 提示

判定:
  - 受け口の prop が optional (`?`) で、未配線でも既存挙動を変えないか? → YES なら部分達成 OK
  - 受け口が非 optional / 配線必須なら → 全体まとめて Issue 起票
```

**How to apply**: 監査エージェント提案を Read で再評価したとき:

1. **「受け口」と「配線」を分離可能か** を判定:
   - 受け口 (新 prop / 新 Context value) の追加が **1〜2 ファイル touch + 既存挙動非破壊** で完結するか
   - 配線 (caller chain 修正 / state lift up / Provider 構成変更) は別 PR で完結する規模か
2. **YES なら部分達成パターン採用**:
   - 受け口部分を同サイクル commit (RELEASE_NOTES に「prop 受け口のみ、配線は別 Issue」と明記)
   - 配線 Issue を gh issue create で起票 → 「prop 受け口は commit XXX で既存」を所与として案 A/B/C 提示
3. **NO なら全体まとめて Issue 起票** (従来通り)

**反例 (部分達成 NG)**:

- 受け口 prop が **非 optional** で配線なしだと typecheck error → 全体まとめて Issue
- UI 要素を追加するが配線なしだと **「ボタンが押せるが何も起きない」破綻 UX** → 全体まとめて
- 受け口が **runtime invariant に依存** (例: 「この prop が undefined のときは throw」) → 全体まとめて

主な使用箇所: UX 監査 (空状態 CTA) — `ArticleListEmptyState` + `ArticleList` に `onAddFeed?: () => void` 受け口だけ commit、`App.tsx` の state lift up は別 Issue 起票 (案 A state lift up / 案 B Context expose / 案 C 重複 modal)

### 派生ケース: 監査エージェントの観点はサイクル横断でローテーションする

過去 3-5 サイクルで perf / a11y / simplify 等を連続派遣済なら、次サイクルは **未走査観点** (bug / 新機能 / security narrow scope / docs drift / Dependabot alerts / refactor / dead code) で多様化する。同観点を連続派遣すると以下の問題が発生:

1. **発見の重複**: 同観点エージェントは同じ hot path を Read するため、結果が前回と類似
2. **観点疲弊**: perf 改善の余地は本来限られており (1-2 cycle で大半消化)、連続派遣で発見が枯渇する
3. **未走査観点のバグ累積**: bug / security / docs drift は cross-cutting で、低頻度派遣だと潜在問題が累積する

**ローテーション運用 (3 観点 × 3 サイクルで 1 周)**:

| サイクル   | 観点 1          | 観点 2   | 観点 3                |
| ---------- | --------------- | -------- | --------------------- |
| N          | perf            | a11y     | simplify              |
| N+1        | bug             | 新機能   | docs drift mechanical |
| N+2        | security narrow | refactor | dead code             |
| N+3 (循環) | perf            | a11y     | simplify              |

3-5 サイクル間隔で同観点が戻るので、間に他観点で発見した改修が次回派遣時の「新しい view」になる。

**How to apply**:

1. **サイクル開始時に過去 3 サイクルの派遣観点を確認** (`git log --since="2 weeks ago" --grep="監査エージェント"` 等で履歴抽出)
2. **未走査観点を優先**: 過去 3 サイクル未派遣の観点 (例: bug / security / Dependabot) を本サイクルに投入
3. **機械的に検出可能な観点は subagent 不要**: docs drift / Dependabot alerts / dead code grep は `find + grep + comm` / `gh api` で直接実行可能 → エージェント枠を bug / 新機能 / security 等の判断要観点に確保
4. **新機能監査は special care**: false positive 率が他観点より高いため、agent prompt に「verification grep with command output」を強制 (`coding-conventions.md` の派生ケース「実コード grep で必ず実存確認」と統合)

**反例 (ローテーション不要なケース)**:

- 直前 cycle で大規模 refactor を行ったとき → 同 hot path を perf / a11y 再派遣して新発見を期待可能
- ユーザーが特定観点を明示指示 ("perf 観点だけ深く見て") → ローテーション無視で指示優先

主な使用箇所: 41st (security narrow) → 42nd (e2e regression test) → 43rd (perf / a11y / simplify) → 44th (bug / 新機能 / docs drift / Dependabot) で 1 周完了。各サイクルで 4-9 件発見、消化 4-7 件で安定運用

### 派生ケース: 規範 codify 後の grep sweep を「retrospective 本文に結果引用」+「次サイクル開始時に再 sweep」で二段保証する

`rule-maintenance.md` 派生ケース 5 (規範 codify 後は code drift も機械的に sweep する) と派生ケース 6 (code-quality バグ修正時に同 pattern の grep 検出コマンドを併記 + 後続 sweep を Issue 化) は **「規範 codify 時に検出 grep を併記する」** を要求しているが、それだけでは **「codify 時の grep 結果が 0 件を保証しない」** ため、別ファイルに同種バグが残存していることが後の cycle で判明する。

**二段保証パターン**:

1. **codify 時の grep 結果を retrospective commit message / 規範本文に明示引用**
   - 例: `grep -rEn 'a > b \? a : b|until > prev|publishedAt > [a-z]+\.publishedAt' src/ → 0 件 (適用済 src/lib/read-state-merge.ts / read-state-prune.ts)`
   - 結果が 0 件であることを書くことで「全箇所適用済」を文書で証跡化
2. **次サイクル開始時に再 sweep をルーティン化**
   - bug 監査エージェント派遣時に `Pre-narrowed scope` に「過去 3 cycle で codify した bug pattern の sweep」を含める
   - エージェント prompt 例: `Check if the following codified bug patterns are fully swept across the codebase: 1. ISO 8601 lexicographic comparison (canonical: Date.parse), 2. ...`

**How to apply**:

1. **規範 codify 時**: 検出 grep コマンドを実行 → 0 件であることを retrospective commit message に引用
2. **0 件でない場合**: 残箇所を同 commit で連続修正、または別 Issue 起票で sweep
3. **次サイクル開始時 (or 3 サイクル後)**: bug 監査エージェントの prompt に「**過去 codify した bug pattern を grep sweep**」を含める
4. **発見した場合**: 規範 codify 時に「sweep 漏れがあった」事実を retrospective に追記して保証強化

主な使用箇所: 38th cycle で `isLaterIso` / `pruneOldReadIds` の lexicographic ISO 比較バグを codify したが、`useFilteredArticles.ts:453` 同種バグが 6 cycle 後の 44th bug 監査エージェントで発見 → 二段保証を追加運用ルール化

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
