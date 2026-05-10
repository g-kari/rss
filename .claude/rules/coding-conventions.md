# コーディング規約

## TypeScript

- `strict: true` 前提。`any` は使わない
- 型は `interface` で定義 (`src/types.ts` に集約)
- Cloudflare バインディングは `src/cloudflare-env.d.ts` の `CloudflareEnv` インターフェースで拡張
  ```typescript
  // src/cloudflare-env.d.ts
  interface CloudflareEnv {
    RSS_DATA: R2Bucket;
    AI: Ai;
  }
  ```
- `tsconfig.json` の `types` に `"@cloudflare/workers-types"` を含める
- `tsconfig.json` の `lib` に `"DOM"` と `"DOM.Iterable"` を含める (Workers + React 共存)

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

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 3 で分割):

- React Context パターン (`src/contexts/`) — Provider + useXxx hook 設計
- 派生ケース: 内部 state を持つ hook を複数 consumer で共有したいときは Provider 化必須

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

**Why**: helper drift は dead code 監査 (production caller 0 grep) で検出できないため、コードレビュー / リファクタ監査エージェントの確認まで発見されにくい。重複定義を放置すると:

1. **仕様変更時の同期修正リスク** — 例: 「UUID v4 バリアントビット検証を厳格化」が必要になったとき、4 箇所同時修正を忘れて drift 永続化
2. **実装スタイルの不統一** — ある場所では `const UUID_RE` 定数、別の場所ではインライン正規表現、で grep 困難
3. **同種データを扱う新規コードを書くとき「どの helper を使うか」が不明** — 重複定義が増えて選択肢爆発

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

**Why**: `useSyncedRef` の本来用途は **「effect 内で stale closure 回避」** のみ (subscription / timer callback など、effect が `[]` deps で 1 度だけ走る場面)。useMemo / useCallback の deps に入れると「ref はオブジェクト identity 不変 → React が変化なしと判定 → 再実行されず → ref から得る値も古いまま使われる」という錯覚バグになる。新しい `Set(prev)` のように値の reference が変わるパターンでは、**直接 deps に入れた方が正確に再計算される**。perf 影響を懸念して ref に「最適化」したくなるが、O(n) 単純ループなら直接 deps が正解。

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

**Why**: `useState` ベースで宣言順を変えるのは難しく、`useState`/`setState` を hoist すると役割が混ざる。`useRef` はレンダー位置に依存しない安定参照なので、「Hook A 作成時点では callback がまだ無いが、Hook A が `ref.current?.(...)` を **遅延呼び出し** する形で耐える」設計が成立する。

**How to apply**: hook 同士で「片方の output が他方の input、その output 先が更にもう片方の internal 処理を呼ぶ」三角関係を見つけたら、callback 用 ref を 1 つ前に作って両 hook に渡す。Hook A 内部では `ref.current?.(...)` で安全に呼び出し (null チェック必須)、Hook B から取得した callback を効果的に **後付け assign** する。assign は render 中で OK (ref はマウント前から不変)。

主な使用箇所: `useArticleViewTts` ↔ `useTtsHighlight` の boundary 配線 (#672)

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

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 2 で分割):

- 大きいコンポーネントの機能別分割パターン (基本指針 / 使用箇所 / いつ分割しないか)
- Step 内のさらなる最小スコープ化
- 派生ケース: 巨大コンポーネントの hook 抽出は 1 hook ずつ別 commit
- 派生ケース: 新機能は「Phase 1: 純粋関数 + TDD」「Phase 2: UI 統合」分離
- 派生ケース: 既存実装の差し替え基盤は「Phase 0: 型抽象化のみ」先行
- 派生ケース: 機能別分割後の「逆方向の集約」(共通 wrapper 抽出)

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

**Why**: shared resource (Cloudflare Cache / 共有 R2 オブジェクト) は **複数ユーザーで共有される** ため、1 人の操作が他全ユーザーに影響する。認証だけ通せば誰でも他人のデータを破壊・無効化できる状態は、`cache busting DoS` / `cross-user state corruption` 等の攻撃ベクトルになる。「認証 = 自分のリソースに何でもできる」と「認証 = ログイン済」を混同しないこと。

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

主な使用箇所: `POST /api/feeds/{feedHash}/purge-content-cache` の購読チェック (#691) — 認証だけで cache busting DoS が成立していた脆弱性を修正

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

**Why**: shared cache は **複数ユーザー横断で共有** されるため、攻撃者が 1 度 cache 注入に成功すると、TTL 期間中ずっと **継続的な攻撃を維持しなくても** 全ユーザーに被害が拡散する。完全な input sanitization (例: 画像 URL のホワイトリスト検証) はトレードオフが大きい (合法 image を弾く / fallback fetcher の意義が失われる) ため、「**TTL 短縮で攻撃の経済性を変える**」アプローチが現実的:

1. **攻撃者が攻撃 input を継続維持しないと** poisoning が持続不可になる (例: tweet を削除すると次回 fetch で失効)
2. **通常ユーザー UX への影響が極小** (fallback 経路は usage 頻度が低い)
3. **既存 negative cache TTL を再利用できる** ことが多い (新定数不要)

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

主な使用箇所: `src/lib/ogp-cache-ttl.ts#computeOgpCacheTtl` (#706 — Twitter fallback 経路の TTL を 30 日 → 1 日に短縮して poisoning 影響範囲を限定)

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

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 1 で分割):

- state 更新前に「構造的等価性ガード」を入れて reference を安定化する
- ref vs state の使い分け（同期チェック vs useEffect 再実行）
- trigger counter で「同じ依存値」でも useEffect を強制再実行する
- ref の論理リセットポイントを忘れない (+ 派生ケース: 実行済み ID ref)

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

**Why**: 同名の派生 boolean が UI 用と判定用で意味がブレると、片方の用途で「既に十分」と判定されて他方の処理（fetch トリガーなど）がスキップされる連鎖バグが起きる。

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

**Why**: 描画用の fallback 結果（サマリ等）がそのまま判定関数に伝播すると、「本来 fetch されるべきタイミング」がバイパスされて本文未取得のまま下流処理（TTS / 既読判定など）が走ってしまう。

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
// → publishedAt: null + createdAt 古い記事の readId が永久に残る (#635 A1 半減)

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

**Why**: 同じデータ (例: `Article`) に対して動作する複数の sibling 関数が存在するとき、判定軸の「fallback chain」が揃っていないと、片方の関数が「対象に含む」と判定したものを他方が「対象外」とする乖離が発生する。これが起きると **データの不整合 (readIds の永久蓄積等) が time に応じて累積** する潜在バグになる。1 関数だけ見てバグレビューしても気付けず、ペアで読まないと発見できないため厄介。

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

**Why**: 派生 boolean の「名前」を正しくしても、その派生元が fallback 込みの中間値だと、fallback がトリガーされた瞬間に boolean が誤って true になる。`processedContent` のような **「複数ソースを ?? で混ぜた値」を経由した派生 boolean は、必ず origin (storedContent / article.content) のどちらから来たかを区別する**。

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

**Why**: 同じ値（例: 30/60/180 日）を意味重複する 2 箇所で設定させると、ユーザーが両方設定して齟齬が発生する / 片方しか設定せず期待と動作がズレる、などの混乱を招く。

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

**Why**: 「抑制機能」要望は **要望者の特殊事情** (例: Workers AI コスト懸念 / フォールバックの挙動変化を嫌う) に基づくことが多く、全ユーザーに当てはまるわけではない。default OFF にしておけば、要望者だけが恩恵を受け、他ユーザーへの影響を最小化できる。

**How to apply**: 「便利機能」と「抑制機能」を実装時に判定:

| 種別                      | default        | 例                                           |
| ------------------------- | -------------- | -------------------------------------------- |
| 便利機能 (新たな価値追加) | ON が妥当      | 自動翻訳・自動要約・自動既読                 |
| 抑制機能 (既存挙動の抑制) | **OFF が原則** | フォールバック禁止 / 自動再生禁止 / 通知禁止 |

抑制機能の判定キーワード: 「〜しないようにしたい」「〜を防ぎたい」「〜を発動させたくない」。これらが要望文にあれば、抑制機能として default OFF で実装する。

主な使用箇所: `autoAiBrowserOnly` 設定 (#700) — 「Workers AI フォールバックを発動させたくない」要望に default OFF で対応

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

**Why**: 同カテゴリ機能を別 toggle にすると、ユーザーは「どっちを ON にすべきか」「両方 ON で何が起きるか」を考える必要がある。N 段階セグメントなら **1 つの軸で連続的に強度を選ぶ** だけでよく、離散ジャンプ (slideshow) は「最強モード」として位置づけられる。

**How to apply**: 「機能 A」と「機能 B」を実装するとき:

1. **機能 A と B が同カテゴリか** (例: 自動進行 / 通知頻度 / プライバシーレベル) を判定
2. 同カテゴリなら **「A の強度を上げていくと B になる」** 順序で並べられるか検討
3. 並べられるなら N 段階 SegmentGroup に統合 (既存「設定 UI を流用」原則の延長)
4. 並べられないなら別 toggle (例: 「自動翻訳」と「自動要約」は別概念なので別 toggle)

主な使用箇所: `galleryAutoScrollSpeed` (#690 案 D) — 連続スクロール 3 段階 + slideshow 1 段階を 1 軸に統合

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

**Why**: 動画プレイヤーは「再生中もユーザーは画面を見ている」前提。一方、自動スクロール / ポーリング系は **「裏で動いてほしいが、ユーザー操作したら譲る」** 用途が多い。手動操作 (wheel / touchstart / click 等) を一時停止トリガーにすれば、UI 数を減らしつつ自然な操作感を実現できる。

**How to apply**: 自動進行系機能を実装するとき:

1. **「ユーザーが手動操作したらどうなるべきか」** を最初に考える
2. 「手動操作で停止」が自然なら ▶/⏸ ボタンは不要、`onUserInterrupt` callback で speed/enabled を OFF に
3. 「手動操作と並行して自動進行を続けたい」(例: 動画再生中の seek) なら ▶/⏸ ボタンが必要
4. UserSettings の速度選択 = on/off の役割を兼ねるなら、専用 toggle ボタンは削減可能

主な使用箇所: `useGalleryAutoScroll` の `onUserInterrupt` (#690) — wheel/touchstart で speed を "off" に戻す

## ResizeObserver で絶対座標仮想化レイアウトの末端高さを監視する

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 4 で分割)

## AbortController.abort() の伝播範囲を限定する

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 4 で分割)

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

**Why**: 入れ子三項は「フォールバックの順序」と「組み合わせの網羅」が暗黙のまま蓄積する。新しい状態 (例: `prefetched=[]` で「明示的に空」を表現) を追加したとき、既存ブランチで意図しない動作になる確率が高い。純粋関数で「何が選ばれたか」(`source`) と「何を描画するか」(`images`) を **明示的に分離** すれば、TDD で全組み合わせをテスト可能。

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

**Why**: 「複数枚向けの集約 UI」を `>= 2` で隠すと、1 枚しかない記事でその UI が利用できず、ユーザーは関連機能（保存・選択など）を実行できなくなる。内部処理（`downloadAllImages` 等）は 1 件配列でも正常動作することがほとんど。

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

**Why**: CI は `pnpm install` 直後に lint / typecheck を実行するため `prebuild` が起動しない。ローカル開発では `predev` / `prebuild` で生成されるため気付きにくく、CI だけで TS2307 エラーになる。

**How to apply**: 自動生成ファイルを参照するスクリプトを追加するときは、想定される実行コマンド (`build` / `dev` / `typecheck` / `check` / `test:e2e` 等) **すべてに pre-script を設置** する。スクリプトが軽量 (数十 ms 以下) なら頻繁に走っても性能影響なし。重いなら以下を検討:

- 出力ファイルの存在チェックでスキップする idempotent な実装にする
- CI でのみ明示的に実行するステップを追加する

代替策: 自動生成ファイルを `.gitignore` から外して commit する（trade-off: PR diff が増える、人間が手で編集してしまうリスク）。

## useEffect 依存キーの slice() は「N+1 件目以降の変化を検知不能」にする罠

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 4 で分割)

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

**Why**: TTS / 字幕系 UI は「視覚的な進行 = 聴覚的な進行」が UX の本質。**source の同期が崩れた瞬間に体験が破綻する**。fallback chain (`source = summaryText ?? translatedText ?? processedContent ?? summary`) を speak 側に入れると、ハイライト側も同じ chain で sentence を抽出する必要があるが、HTML から sentence span を生成するコストが大きく、複数 source 化は段階対応になりがち。最小実装は「**別 source 読み上げ中はハイライトを完全に止める**」(空 sentence で抑制)。

**How to apply**: 読み上げ系 / 字幕系 hook を実装するとき:

1. `speak(text)` に渡る text の **真の source** (どの fallback chain の枝か) を判定するフラグを保持 (`isReadingX`)
2. ハイライト sentences は **同じ source の HTML から派生** したものかチェック
3. 異なる source なら、以下の選択肢:
   - **最小**: ハイライト全停止 (空 sentences で activeIndex = -1 維持)
   - **中規模**: 別 source の sentence span を生成 (要約 UI に span ラッパー導入)
   - **大規模**: 全 source で sentence 化 (parser を speak/highlight 共通化)
4. **最小実装でも違和感は解消** されるので、Phase 1 として最小、Phase 2 で機能拡張パターンが安全
5. **空 sentences の安定 reference** (`const EMPTY_SENTENCES: Sentence[] = []`) をモジュールレベルで宣言。条件で `[]` を毎 render 作ると useMemo / useEffect 依存キーが invalidate される

主な使用箇所: `useArticleViewState` の `isReadingSummary` / `effectiveTtsSentences` (#703 — オートモード + 自動要約で要約読み上げ中の wrong-source ハイライト抑制)

## 同症状でも別経路の可能性を疑う

「ギャラリーが止まる」「TTS が止まる」のような **同じ症状の連続バグ報告** は、修正後も別経路で再発する可能性が高い。1 つ修正しただけで「同症状の Issue は全部解決」と思い込まないこと。

**Why**: 同症状で別経路のバグは「前の修正で直したつもり」が認知バイアスとして働き、新規調査を怠りがち。実例として「ギャラリー停止」系で「全 worker abort」と「先頭 N 件キー固定」の 2 経路が連続発生したケースがある。

**How to apply**:

- 「同症状の Issue を再起票された」ら、**前回修正のコミット diff** を読み直して「自分が直したのは本当に唯一の原因か」を疑う
- 「修正したのに直らない」「修正したのにまた起きた」のキーワードがコメントに出たら、必ず別経路を疑って再調査
- バグ修正のコミットメッセージには **「真因 = 〇〇」** を明記して、別経路調査時の参照点にする

## モード OFF 時に進行中の副作用を停止する

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 4 で分割)

## ブラウザ API の遅延通知に備えて初期取得 + イベント購読をペアで書く

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 4 で分割)

## 上流 API プロキシのヘッダ欠落補完

→ `.claude/rules/browser-platform.md` を参照 (#694 Step 5 で分割)

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

→ `.claude/rules/browser-platform.md` を参照 (#694 Step 5 で分割。`availability()` 派生ケースも同ファイルへ移動)

## ブラウザ仕様の最低バージョン定数を 1 箇所に集約する

→ `.claude/rules/browser-platform.md` を参照 (#694 Step 5 で分割)

## 早期 return をコンポーネント / 関数に切り出すと TypeScript narrowing が失われる

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 3 で分割)

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

**Why**: default を「保守的に小さく」設定すると、ドキュメント上の cap (200) と実際の挙動が乖離する。呼び出し元はライブラリ作者の意図 (「cap まで使ってよい」) を読み取れず、デフォルト 20 で運用してバグ報告が来る。たとえばプリフェッチ系では 21 件目以降が永遠に処理されない症状になる。

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

**Why**: 「同じ濃度で十分」と判断して共通トークンを使うと、片方だけ調整したい要望が来たときに他の UI を巻き込んで変えてしまう。最初から **「この強度はこの機能のために存在する」** と意図を込めた専用トークンにすると、後の単独チューニングが安全。

**How to apply**: 新しいハイライト・選択状態・強調 UI を追加するとき:

1. 既存トークンと **見た目が完全に同じ** で、**ユーザーが将来「どちらか片方だけ強くしたい」と言わない自信がある** なら流用
2. それ以外は **`--color-{機能名}-highlight`** のような機能別トークンを新設
3. ライト / ダーク両テーマで定義する。コントラスト比 (WCAG AA) も併記すると後で楽
4. テキスト色も別トークン (`--color-{機能名}-highlight-text`) で揃えると、背景色変更時に文字読みやすさが崩れない

該当パターン: `--color-tts-highlight` / `--color-tts-highlight-text` (#659)

## 子コンポーネントの「自己判断で hidden になる UI」は親で「全件 hidden」を検知して fallback する

→ `.claude/rules/react-patterns.md` を参照 (#694 Step 3 で分割)

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

**Why**: HTML 後処理は「属性がある場合の最適化」止まりで、属性が無いケースまで責務を伸ばすと正規表現が複雑化する。runtime で `naturalWidth` を読めば確実に補完できる。CSS だけで `width: 100%` を `max-width: 100%` に変えると、属性ありの大きい画像が container 幅まで広がらなくなる副作用があるため、CSS 一律変更は避ける。

**How to apply**: HTML 後処理が「属性に依存した装飾」を出力する場合:

1. 属性が無い場合の挙動を最初に確認 (CSS が想定外の動きをしないか)
2. 必要なら **runtime hook** で属性の代替情報 (naturalWidth / naturalHeight / textContent) を読んで補完
3. 既存 inline スタイルがある場合は **上書きしない** ガードを必ず入れる
4. cleanup (`removeEventListener`) を忘れない

主な使用箇所: `useArticleImageMaxWidth` (#680) — `fixImageDimensions` で max-width が付かない画像を runtime で補完

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

**Why**: SVG sprite は CSS / アクセシビリティ的には正しい設計だが、Readability のような「本文ブロック切り出し」型ツールとは相性が悪い。元ページで「不可視」だった sprite 定義が、本文だけ切り出した瞬間に「必要な参照先が消える」状態になる。

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

**Why**: JSON-LD の `Article.image` は schema.org 標準で、サイトが「この記事の主要画像」と公式に宣言したもの。Readability の本文判定が外しても、JSON-LD 由来の URL は確実に「正しい画像」として信頼できる。`<div hidden>` で補完すれば、本文と重複表示せず、クライアント側 `ImageGallery` がギャラリーとして拾える。

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

**Why**: 画像系サイトは「リンク先 = フル解像度 / 表示画像 = サムネ」という UX 設計が標準。サムネは「**サイズフィルタの対象**」(170px 未満で除外される閾値帯に入る) だが、フル解像度は「**`<a href>` にしか存在しない**」(クリックで遷移する想定)。`<img>` 単体走査では「ユーザーがクリックして見たかったフル解像度」を完全に取り逃がす。OGP 画像が 1 枚あれば「DL は動いている」ように見えるため、症状が「**1 枚しか DL されない**」と表面化するまで気付かれにくい潜在バグ。

**How to apply**: 画像 DL / 画像コレクション系の DOM 走査ロジックを書くとき:

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

主な使用箇所: `collectImageUrls` / `collectImageUrlsFromHtml` (`image-extractor.ts`) — wallhaven 等の thumb→full 構造で OGP のみ DL されるバグ修正 (#667)

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

**Why**:

1. **スコープの明確化**: 「RTL infra 整備」と「network mock infra 整備」は別タスク (担当者・PR・依存ライブラリも別)。元 Issue でまとめると並行進行が困難
2. **クローズの心理的効果**: 部分達成でも Issue を閉じられると、次セッションで「ここまでは終わった」という安心感が得られ、残作業に集中できる
3. **infra 投資の見える化**: フォローアップ Issue でそれぞれ「pnpm add -D vitest @testing-library/react」「Playwright page.route 拡張」のような投資が明示されると、優先度判断がしやすい

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
- 4 体以上: 観点が被って同じ箇所を複数エージェントが指摘するリスク + 消化不能な件数

観点を非重複に分離することが重要 (perf エージェントが a11y を見ない、a11y が simplify を見ない)。プロンプトで「focus areas」を明示して観点境界を強制する。

各エージェントへのプロンプトに **必ず含める要素**:

1. **「Find 1-3 high-confidence issues that are genuinely impactful」** — 件数上限 (1-3) + confidence 縛り
2. **Skip if** 節 — 「purely theoretical」「fix complexity > gain」「already addressed」を明示
3. **Report format** — file path + line number / observation / impact / fix の 4 項目
4. **「Use serena tools」** — find_symbol / search_for_pattern で効率的に navigate
5. **語数制限** — 「Report under 400 words」で出力肥大化防止

**Why**: 漠然とした「コードレビューして」依頼だと、エージェントは「気になった点全部」を 30 件レポートしてきて、95% は theoretical / minor。`Skip if` + 件数上限 + confidence 縛りで強制的に「真に対応すべき指摘だけ」を絞り込ませる。

**How to apply**: 監査依頼 → エージェント結果集約 → 各指摘を:

1. **実コード Read で再現確認** (`サブエージェント調査結果は該当コードで検証してから採用` ルール参照)
2. **高信頼性 (confidence 80+) のみ Issue 化** — ラベル (`performance` / `bug` / `accessibility` 等) + `🤖 AI 起票` バナー必須
3. **Issue 本文に**: 「状況」「影響」「修正方針案 (案 A/B/C)」「推奨」「必要な対応箇所」「関連 (元コメント / 関連実装)」のテンプレート従う
4. **同サイクルで 1 件は対応する** — 監査だけで Issue を量産すると消化不良。最も impact が大きい 1 件をそのサイクルで完結する流れを基本にする

主な使用箇所:

- perf / UX 監査 2 体並行 → 4 件起票 → 1 件同サイクル対応
- perf / UX-a11y / simplify 監査 3 体並行 → 8 件指摘 → 7 件同サイクル一括適用 + 1 件 Issue 化 (#701)
- perf / UX-a11y / simplify 監査 3 体並行 → 9 件指摘 → 8 件同サイクル一括適用 (a11y 3 + simplify 3 + perf 2) + 1 件 Issue 化 (#719) の最大消化サイクル更新

### 派生ケース: 監査エージェントに既存規範遵守チェックも依頼すると pattern drift が早期発見される

監査エージェントへのプロンプトに「**既存規範ファイル (`.claude/rules/*.md`) と照合して違反がないか**」を明示すると、**「規範を codify した直後は守られていたが、その後の新規追加コードで drift した」** ケースを早期検出できる。本来 codify 時に「主な使用箇所」コメント + grep 検出パターン (`rule-maintenance.md` 派生ケース 5) で自動 sweep する設計だが、grep で表現しにくい規範 (例: `try/catch → null` に必ず `devError` を併記) は人間判断要のため監査エージェント観点に組み込むのが効率的。

```
プロンプト例 (simplify エージェントへ):
「Focus area の `simplify` に加えて、`browser-platform.md` / `react-patterns.md` 等の
 既存規範ファイルへの違反を 1 件含めても良い。**規範違反は同種コンポーネントの canonical
 pattern と照合 (例: browser-summarizer.ts vs browser-translator.ts) して報告する」
```

**Why**: codify した規範は「全コードへの即時適用」までは保証されない。新規 PR で「同種コンポーネントを書くとき canonical pattern からコピペで始めなかった」場合に drift が発生する。grep で機械検出可能な規範 (例: `Set<string>` sentinel の `Object.freeze` 化) は `rule-maintenance.md` の派生ケース 5 で sweep 可能だが、判断要素を含む規範 (例: `try/catch → null` で `devError` を「いつ」「どのレベルで」併記すべきか) は人間 (or AI) の judgment 要のため、監査エージェントが既存 canonical pattern と照合する形でないと detect できない。

**How to apply**: 観点別監査エージェントへのプロンプトに以下を追加:

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

**Why**: バグ修正 / a11y 修正 / perf 修正は **「起票して議論」より「修正して reverted されたら戻す」** の方が早いことが多い。特に規範実装 (Modal.tsx の returnFocusRef 等) が既にあるパターンは、起票時のテンプレート埋めコストの方が修正コストより大きい。Issue は **「ユーザーが判断する必要がある」もの** に集中させる。

**How to apply**: 監査結果を以下の表で振り分け:

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

**Why**: エージェント分析は「短い report 制約」で表面しか書けない。「統合」「集約」「helper 化」のキーワードに飛びつくと、実装着手後に「思ったより大きい」と気付いて中途半端な commit を作るリスク。**着手前の Read 1-2 回で最終 PR の規模を予測** すれば、適切に Issue 化に降格できる。「同サイクルで修正できないなら Issue 化」は逃げではなく、**1 PR = 1 関心事を保つ品質判断**。

**How to apply**: 監査エージェント提案を受けたら:

1. **「変更対象ファイル数」と「新規ファイル数」を Read で見積る** (caller grep, 既存 export grep)
2. **3 ファイル超え or 新 Context/Provider 必要** なら Issue 起票へ降格
3. **既存規範パターン (Modal.tsx の focus trap, ShareMenu の portal menu 等) のコピー** なら 1〜3 ファイルでもそのまま着手 (パターン適用は予測可能)
4. **エージェント分析が含む「partial」「unclear」表現** に注意。「could be merged」「should be extracted」など曖昧な動詞は実装スコープが大きいシグナル
5. Issue 起票時は **エージェントの impact 計算と confidence** を引用しつつ、**案 A/B/C + 必要な対応箇所 (具体ファイル名)** を必ず列挙

主な使用箇所: 2026-05-10 サイクルの perf #1 (useTotalUnreadCount 統合) — エージェント 85% 信頼度だったが Read で Context lift up 必要と判明 → Issue #702 起票して降格

## 本番環境のデバッグは「localStorage gate + 専用 debug ヘルパー」で出す

→ `.claude/rules/browser-platform.md` を参照 (#694 Step 5 で分割。AbortController/Ref 派生ケースも同ファイルへ移動)

## 永続化された state を「リロード時に自動復元」するときは TTL と防御チェックを必ず入れる

→ `.claude/rules/browser-platform.md` を参照 (#694 Step 5 で分割)

## 禁止事項

- D1 / DO の追加 (シンプルさを保つ。KV は `RATE_LIMIT` で導入済み)
- 外部 CSS ライブラリ (Tailwind のみ)
- 外部アイコンライブラリ (インライン SVG のみ)
- `any` 型の使用
- 16進数カラーのハードコード
- Hono の `c.json<T>()` パターン (Next.js Route Handlers では使えない)
- `r.json<T>()` (ブラウザ fetch には型引数なし。`r.json() as Promise<T>` を使う)
- モジュールレベルのキャッシュ変数 (Edge Runtime では各リクエストで再実行される)
