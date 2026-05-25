---
description: Next.js App Router / Route Handler / 認証ヘルパー / R2 / RSS パーサー / Cron のサーバーサイドパターン
paths: "app/**/*.ts,app/**/*.tsx,src/lib/**/*.ts,src/cron/**/*.ts"
---

# Next.js サーバーサイドパターン

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
- `fetchAllFeeds(env: FetchEnv)` → R2 の全フィードを buildFeedUserMap で集約して RSS 取得・更新
- `fetchArticles(env: FetchEnv, userId: string)` → 特定ユーザーの RSS 取得

## React データ取得パターン (hooks)

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
