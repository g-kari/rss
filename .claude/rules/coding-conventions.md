# コーディング規約

## TypeScript

- `strict: true` 前提。`any` は使わない
- 型は `interface` で定義 (`src/types.ts` に集約)
- Workers の環境変数は `Env` インターフェースで型付け
  ```typescript
  export interface Env {
    GITHUB_TOKEN: string;
    GITHUB_OWNER: string;
    GITHUB_REPO: string;
    GITHUB_BRANCH: string;
  }
  ```
- `tsconfig.json` の `lib` に `"DOM"` と `"DOM.Iterable"` を含める (Workers + React 共存)

## React

- 関数コンポーネントのみ。クラスコンポーネントは使わない
- `export default function ComponentName(...)` 形式
- Props は `interface Props { ... }` で定義し、同ファイル内に書く
- `useState` / `useEffect` / `useMemo` のみ。複雑な状態管理ライブラリは使わない
- データ取得は `App.tsx` で一括、子コンポーネントへは props で渡す
- コンポーネントは API を呼ばない (FeedSidebar の add/delete は例外)

### ファイル取得パターン

```typescript
// App.tsx での初期データ取得
useEffect(() => {
  fetch('/data/feeds.json')
    .then((r) => r.json<Feed[]>())
    .then(setFeeds)
    .catch(console.error);
}, []);
```

### クライアントサイドフィルタリング

```typescript
const filtered = useMemo(() => {
  let list = feedId ? articles.filter((a) => a.feedId === feedId) : articles;
  if (unreadOnly) list = list.filter((a) => !readIds.has(a.id));
  return list;
}, [articles, feedId, readIds, unreadOnly]);
```

## Hono (Workers API)

```typescript
// src/worker.ts
const app = new Hono<{ Bindings: Env }>();
app.use('/api/*', cors());
app.route('/api/feeds', feedsRoutes);
export default { fetch: app.fetch };
```

- ルートは `src/routes/` に分割
- `c.json(data)` / `c.json({ error: msg }, status)` で統一
- エラーハンドリングは `app.onError` で一括

### GitHub Contents API パターン

```typescript
// Unicode-safe base64
const base64 = btoa(
  String.fromCharCode(...new TextEncoder().encode(JSON.stringify(data, null, 2)))
);

// ファイル読み込み
const res = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/contents/path/to/file`,
  { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'rss-reader' } }
);
const { content, sha } = await res.json();
const decoded = JSON.parse(atob(content.replace(/\n/g, '')));
```

## RSS パーサー (`src/lib/xml-parser.ts`)

- `fast-xml-parser` のみ使用 (Workers 互換、pure JS)
- RSS 2.0 + Atom 両対応
- `toArray()` ヘルパーで配列正規化 (単一要素が object になる挙動を吸収)
- `stripHtml()` でサマリーからタグを除去

## scripts/fetch.mjs

- `"type": "module"` が `package.json` に必須 (`@cloudflare/vite-plugin` が ESM only)
- Node.js 20 前提
- 最大 2000 件、`publishedAt` 降順ソート
- 既存記事は `guid` でデduplication

## 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| 型・インターフェース | PascalCase | `Feed`, `Article`, `Env` |
| React コンポーネント | PascalCase | `FeedSidebar`, `ArticleList` |
| 関数・変数 | camelCase | `markRead`, `selectedFeedId` |
| JSONフィールド | camelCase | `feedId`, `publishedAt`, `siteUrl` |
| GitHub Actions ファイル | kebab-case | `fetch.yml`, `deploy.yml` |

**注意**: DB (D1) を使っていた時代の snake_case (`published_at`, `feed_id`) は完全に廃止済み。
JSON データは全て camelCase。

## 禁止事項

- D1 / KV / DO の追加 (シンプルさを保つ)
- 外部 CSS ライブラリ (Tailwind のみ)
- 外部アイコンライブラリ (インライン SVG のみ)
- `any` 型の使用
- 16進数カラーのハードコード
