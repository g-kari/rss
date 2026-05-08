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

## React Context パターン (`src/contexts/`)

コンポーネントツリーの深い階層に props を渡す（prop drilling）代わりに、React Context を使用する。
Context ファイルは `src/contexts/` に配置し、`createContext` + Provider + `useXxx` カスタムフックをセットで提供する。

```typescript
// src/contexts/ToastContext.tsx
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ value, children }: ProviderProps) {
  return <ToastContext value={value}>{children}</ToastContext>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

主な使用箇所:

- `SelectedArticleContext` — 選択記事 ID（ArticleItem の不要な re-render 回避）
- `ArticleFilterContext` — 記事フィルター状態の共有
- `ReaderSettingsContext` — リーダー表示設定（フォントサイズ・行間・テーマ等）
- `ToastContext` — トースト通知 API のグローバル提供

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
- **summary には `stripHtmlWithBreaks()` を使う**: `stripHtml()` は `<br>` を空文字列に置換するため `foo<br>bar` → `foobar` の単語連結を起こす。プレビュー用の summary では `<br>` / `<p>` を改行に変換する `stripHtmlWithBreaks()` が正解（#645）
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

## ref vs state の使い分け（同期チェック vs useEffect 再実行）

「外部からの一時的中断 → 自動回復」シナリオ（429 クールダウン後の再開、スリープからの復帰など）では **ref だけでは不十分**。`useRef` は React 再レンダーをトリガーしないため、ref に「期限値」を書き込んでも `useEffect` は再実行されない。

- **ref**: 同期 fetch ループ内の高頻度チェック用（`if (Date.now() < ref.current) return;`）
- **state**: `useEffect` 再実行のトリガー用（依存配列に含める）

両方を併用するパターン:

```typescript
const rateLimitUntilRef = useRef<number>(0);
const [rateLimitedUntil, setRateLimitedUntil] = useState<number>(0);

// クールダウン期限到達 → state リセット → メイン useEffect 再実行
useEffect(() => {
  if (rateLimitedUntil <= 0) return;
  const remaining = rateLimitedUntil - Date.now();
  if (remaining <= 0) {
    setRateLimitedUntil(0);
    return;
  }
  const id = setTimeout(() => setRateLimitedUntil(0), remaining);
  return () => clearTimeout(id);
}, [rateLimitedUntil]);

// メイン useEffect: rateLimitedUntil を依存に入れることで再開がトリガーされる
useEffect(() => {
  if (Date.now() < rateLimitUntilRef.current) return; // ref で同期チェック
  // ... fetch loop
  // 429 受信時:
  // const until = Date.now() + retryAfterMs;
  // rateLimitUntilRef.current = until;
  // setRateLimitedUntil(until);  // ← state にも反映して useEffect 再実行を予約
}, [, /* ... */ rateLimitedUntil]);
```

主な使用箇所: `usePrefetchGalleryContents`（429 クールダウン後の自動リトライ #642）

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

## 禁止事項

- D1 / DO の追加 (シンプルさを保つ。KV は `RATE_LIMIT` で導入済み)
- 外部 CSS ライブラリ (Tailwind のみ)
- 外部アイコンライブラリ (インライン SVG のみ)
- `any` 型の使用
- 16進数カラーのハードコード
- Hono の `c.json<T>()` パターン (Next.js Route Handlers では使えない)
- `r.json<T>()` (ブラウザ fetch には型引数なし。`r.json() as Promise<T>` を使う)
- モジュールレベルのキャッシュ変数 (Edge Runtime では各リクエストで再実行される)
