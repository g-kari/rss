---
globs: "app/api/articles/**,app/api/read-state/**,app/api/content/**,app/api/clip/**"
description: 記事 / 既読状態 / 全文コンテンツ / クリップの API 仕様 — /api/{articles,read-state,content,clip} のリクエスト・マージ戦略・エラー一覧 (UPSTREAM_FETCH_FAILED 502 / FETCH_FAILED 等)
---

# API 仕様: 記事・既読状態・コンテンツ・クリップ

## GET /api/articles

認証済みユーザーのフィード記事一覧を返す。

### クエリパラメータ

| パラメータ | 型     | 説明                                                                    |
| ---------- | ------ | ----------------------------------------------------------------------- |
| `feed`     | string | feedHash でフィルタ (16 文字 hex)                                       |
| `since`    | number | ms タイムスタンプ (これより新しい記事、数字以外は 400)                  |
| `page`     | number | 1〜`MAX_PAGES` (feed パラメータ指定時のみ有効、`shared-feed.ts` で定義) |

### 成功レスポンス

```json
// 200 OK
[{ "id": "...", "feedHash": "...", "title": "...", "link": "...", ... }]
```

### エラー一覧

| ステータス | code             | 説明                                             |
| ---------- | ---------------- | ------------------------------------------------ |
| `400`      | `INVALID_SINCE`  | since が数字以外の文字列                         |
| `400`      | `INVALID_FEED`   | feedHash の形式が不正 (16 文字 hex でない)       |
| `400`      | `INVALID_PAGE`   | page が整数でない / 範囲外 (1 〜 `MAX_PAGES`)    |
| `401`      | —                | 未認証                                           |
| `404`      | `FEED_NOT_FOUND` | feed 指定で購読していない / 共有メタが存在しない |

---

## GET /api/read-state

認証済みユーザーの ReadState オブジェクト全体を返す。

### 成功レスポンス

```json
// 200 OK
{
  "readIds": ["..."],
  "bookmarkIds": ["..."],
  "readingListIds": ["..."],
  "likeIds": ["..."],
  "snoozedUntil": null,
  "notes": {},
  "tagIds": {},
  "globalFilter": null,
  "readBeforeTimestamp": null,
  "ttlDays": null
}
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/read-state

クライアントの ReadState を受け取り、サーバー側とマージして保存する。すべてのフィールドはオプション。

### リクエスト

削除対象 ID は `removedIds: { readIds, bookmarkIds, readingListIds, likeIds, tagIds }` でネスト構造に集約する (top-level の `removed*Ids` ではない)。

```json
{
  "readIds": ["..."],
  "bookmarkIds": ["..."],
  "readingListIds": ["..."],
  "likeIds": ["..."],
  "removedIds": {
    "readIds": ["..."],
    "bookmarkIds": ["..."],
    "readingListIds": ["..."],
    "likeIds": ["..."],
    "tagIds": ["..."]
  },
  "snoozedUntil": null,
  "notes": {},
  "tagIds": {},
  "globalFilter": null,
  "readBeforeTimestamp": null,
  "ttlDays": null
}
```

### マージ戦略

| フィールド         | マージルール                              |
| ------------------ | ----------------------------------------- |
| `*Ids` (Set 系)    | local ∪ server; `removedIds.*` で明示削除 |
| `snoozedUntil`     | 後の日時を優先 (later wins)               |
| `notes` / `tagIds` | サーバー優先 (server wins)                |
| `globalFilter` 等  | クライアント送信値でそのまま上書き        |

### 成功レスポンス

```json
// 200 OK — マージ後の ReadState を返す
{ "readIds": [...], ... }
```

### エラー一覧

| ステータス | code                | 説明                                    |
| ---------- | ------------------- | --------------------------------------- |
| `401`      | —                   | 未認証                                  |
| `413`      | `PAYLOAD_TOO_LARGE` | ID 配列が `MAX_READ_IDS` 等の上限を超過 |

---

## POST /api/articles/save

URL から記事メタデータ（OGP タイトル・画像）を取得して保存する。同一 URL は決定論的 ID を持ち、既存レコードがある場合はそのまま返す。5 秒クールダウンあり。上限は `MAX_SAVED_ARTICLES` 件。

### リクエスト

```json
{
  "url": "string" // 必須: http(s) URL
}
```

### 成功レスポンス

```json
// 201 Created（新規保存）または 200 OK（既存）
{
  "id": "abc123...",
  "feedHash": "__saved__",
  "guid": "https://...",
  "title": "記事タイトル",
  "link": "https://...",
  "summary": "",
  "ogImage": "https://...",
  "publishedAt": null,
  "createdAt": "2024-11-01T00:00:00Z"
}
```

### エラー一覧

| ステータス | code                  | 説明                        |
| ---------- | --------------------- | --------------------------- |
| `400`      | `INVALID_URL`         | URL が空または http(s) 以外 |
| `401`      | —                     | 未認証                      |
| `422`      | `SAVED_LIMIT_REACHED` | 保存記事の上限に達している  |
| `429`      | `COOLDOWN`            | 5 秒クールダウン中          |

---

## GET /api/content

記事の全文コンテンツを取得するプロキシ。Cloudflare Cache API（7日）でキャッシュされる。ユーザーがクリップした HTML がある場合はキャッシュより優先して返す。1 分間スライディングウィンドウのレートリミットあり（キャッシュミス時のみ適用）。

### クエリパラメータ

| パラメータ | 型     | 説明                     |
| ---------- | ------ | ------------------------ |
| `url`      | string | 必須: 記事の http(s) URL |

### 成功レスポンス

```json
// 200 OK
{ "content": "<article>...</article>" }
```

`X-Cache: HIT/MISS` ヘッダーで取得元を識別できる。`X-Cache-Source: clip` の場合はユーザーのクリップから返却。

### エラー一覧

| ステータス | code                    | 説明                                                                                      |
| ---------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `400`      | `INVALID_URL`           | URL が空または http(s) 以外                                                               |
| `401`      | —                       | 未認証                                                                                    |
| `429`      | `RATE_LIMITED`          | レートリミット超過                                                                        |
| `502`      | `UPSTREAM_FETCH_FAILED` | 上流 fetch が 4xx / 5xx で失敗 (response body に `upstreamStatus: <status>` を含む、#804) |
| `502`      | `FETCH_FAILED`          | 自社 fetch がネットワークエラー / タイムアウト等で失敗 (network / DNS / abort、retryable) |

---

## DELETE /api/content

自分の clip cache を削除する。`POST /api/clip` で SingleFile 拡張から保存した HTML を消したい場合に使う。共有 cache は削除しない（フィード全体を一括クリアしたい場合は `POST /api/feeds/:id/purge-content-cache` を使うこと）。

### クエリパラメータ

| パラメータ | 型     | 説明                     |
| ---------- | ------ | ------------------------ |
| `url`      | string | 必須: 記事の http(s) URL |

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "deleted": { "clip": true } }
```

`deleted.clip` は cache に該当 entry が存在して削除に成功したかを示す boolean。entry がそもそも無かった場合も `false` で返り 200 を返す (冪等)。

### エラー一覧

| ステータス | code          | 説明                        |
| ---------- | ------------- | --------------------------- |
| `400`      | `INVALID_URL` | URL が空または http(s) 以外 |
| `401`      | —             | 未認証                      |

---

## POST /api/clip

SingleFile ブラウザ拡張から送信されたページ全体の HTML を受け取り、本文を抽出して Cloudflare Cache API に保存する。保存されたコンテンツは `GET /api/content?url=` で優先的に返却される。1 分クールダウンあり。

### リクエスト

```json
{
  "html": "string", // 必須: ページ全体の HTML（SingleFile 形式）
  "url": "string" // 必須: 元の記事 URL
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "url": "https://..." }
```

### エラー一覧

| ステータス | code                   | 説明                         |
| ---------- | ---------------------- | ---------------------------- |
| `400`      | `INVALID_CLIP_PAYLOAD` | html または url が欠損・不正 |
| `401`      | —                      | 未認証                       |
| `429`      | `COOLDOWN`             | 1 分クールダウン中           |
