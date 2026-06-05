---
paths: "app/api/collections/**,app/api/feed-groups/**"
description: コレクション (記事のお気に入りグループ) とフィードグループ (フィード分類) の API 仕様 — /api/{collections,feed-groups} の CRUD + reorder + 記事追加削除
---

# API 仕様: コレクション・フィードグループ

## GET /api/collections

コレクション一覧を order 昇順で返す。

### 成功レスポンス

```json
// 200 OK
[{ "id": "uuid", "name": "後で読む", "order": 0, "articleIds": ["..."] }]
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/collections

コレクションを作成する。ユーザーあたり最大 50 件。

### リクエスト

```json
{
  "name": "string" // 必須
}
```

### 成功レスポンス

```json
// 201 Created
{ "id": "uuid", "name": "お気に入り", "order": 0, "articleIds": [] }
```

### エラー一覧

| ステータス | code                        | 説明                         |
| ---------- | --------------------------- | ---------------------------- |
| `400`      | `INVALID_NAME`              | name が空または長すぎる      |
| `401`      | —                           | 未認証                       |
| `409`      | `DUPLICATE_NAME`            | 同名のコレクションが既に存在 |
| `409`      | `COLLECTION_LIMIT_EXCEEDED` | 上限 (50 件) に達している    |

---

## PATCH /api/collections/:id

コレクションを更新する。name・order の変更と記事の追加・削除ができる。

### パスパラメータ

| パラメータ | 型     | 説明            |
| ---------- | ------ | --------------- |
| `id`       | string | コレクション ID |

### リクエスト

```json
{
  "name": "string", // オプション: 新しい名前
  "order": 0, // オプション: 表示順
  "addArticleIds": ["..."], // オプション: 追加する記事 ID 配列
  "removeArticleIds": ["..."] // オプション: 削除する記事 ID 配列
}
```

### 成功レスポンス

```json
// 200 OK — 更新後のコレクションを返す
{ "id": "uuid", "name": "...", "order": 0, "articleIds": ["..."] }
```

### エラー一覧

| ステータス | code                               | 説明                                                |
| ---------- | ---------------------------------- | --------------------------------------------------- |
| `400`      | `INVALID_ID`                       | コレクション ID が不正                              |
| `400`      | `INVALID_NAME`                     | name が空または長すぎる                             |
| `400`      | `INVALID_ORDER`                    | order が整数でない / 範囲外                         |
| `400`      | `INVALID_ARTICLE_IDS`              | addArticleIds / removeArticleIds が文字列配列でない |
| `401`      | —                                  | 未認証                                              |
| `404`      | `COLLECTION_NOT_FOUND`             | コレクションが存在しない                            |
| `409`      | `DUPLICATE_NAME`                   | 同名のコレクションが既に存在                        |
| `422`      | `COLLECTION_ARTICLE_LIMIT_REACHED` | コレクション内記事数が上限に達している              |

---

## DELETE /api/collections/:id

コレクションを削除する。

### パスパラメータ

| パラメータ | 型     | 説明            |
| ---------- | ------ | --------------- |
| `id`       | string | コレクション ID |

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                   | 説明                     |
| ---------- | ---------------------- | ------------------------ |
| `400`      | `INVALID_ID`           | コレクション ID が不正   |
| `401`      | —                      | 未認証                   |
| `404`      | `COLLECTION_NOT_FOUND` | コレクションが存在しない |

---

## GET /api/feed-groups

フィードグループ一覧を order 昇順で返す。

### 成功レスポンス

```json
// 200 OK
[
  {
    "id": "uuid",
    "name": "技術系",
    "order": 0,
    "collapsed": false,
    "muted": false
  }
]
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/feed-groups

フィードグループを作成する。ユーザーあたり最大 100 件。

### リクエスト

```json
{
  "name": "string" // 必須
}
```

### 成功レスポンス

```json
// 201 Created
{ "id": "uuid", "name": "ニュース", "order": 0, "collapsed": false, "muted": false }
```

### エラー一覧

| ステータス | code                        | 説明                             |
| ---------- | --------------------------- | -------------------------------- |
| `400`      | `INVALID_NAME`              | name が空または長すぎる          |
| `401`      | —                           | 未認証                           |
| `409`      | `DUPLICATE_NAME`            | 同名のフィードグループが既に存在 |
| `409`      | `FEED_GROUP_LIMIT_EXCEEDED` | 上限 (100 件) に達している       |

---

## PATCH /api/feed-groups/:id

フィードグループを更新する。

### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| `id`       | string | フィードグループ ID |

### リクエスト

```json
{
  "name": "string", // オプション
  "order": 0, // オプション
  "collapsed": false, // オプション
  "muted": false // オプション
}
```

### 成功レスポンス

```json
// 200 OK — 更新後のフィードグループを返す
{ "id": "uuid", "name": "...", "order": 0, "collapsed": false, "muted": false }
```

### エラー一覧

| ステータス | code                   | 説明                             |
| ---------- | ---------------------- | -------------------------------- |
| `400`      | `INVALID_ID`           | フィードグループ ID が不正       |
| `400`      | `INVALID_NAME`         | name が空または長すぎる          |
| `400`      | `INVALID_ORDER`        | order が整数でない / 範囲外      |
| `400`      | `INVALID_COLLAPSED`    | collapsed が boolean でない      |
| `400`      | `INVALID_MUTED`        | muted が boolean でない          |
| `401`      | —                      | 未認証                           |
| `404`      | `FEED_GROUP_NOT_FOUND` | フィードグループが存在しない     |
| `409`      | `DUPLICATE_NAME`       | 同名のフィードグループが既に存在 |

---

## DELETE /api/feed-groups/:id

フィードグループを削除する。配下の購読フィードの `groupId` は null にリセットされる。

### パスパラメータ

| パラメータ | 型     | 説明                |
| ---------- | ------ | ------------------- |
| `id`       | string | フィードグループ ID |

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                   | 説明                         |
| ---------- | ---------------------- | ---------------------------- |
| `400`      | `INVALID_ID`           | フィードグループ ID が不正   |
| `401`      | —                      | 未認証                       |
| `404`      | `FEED_GROUP_NOT_FOUND` | フィードグループが存在しない |

---

## POST /api/feed-groups/reorder

フィードグループの並び順を一括更新する。全グループ ID を含む配列を渡す必要がある。

### リクエスト

```json
{
  "orderedIds": ["uuid1", "uuid2", "uuid3"] // 必須: 全グループ ID を新しい順序で並べた配列
}
```

### 成功レスポンス

```json
// 200 OK — 更新後の FeedGroup[] を order 昇順で返す
[
  { "id": "uuid1", "name": "技術系", "order": 0 },
  { "id": "uuid2", "name": "ニュース", "order": 1 }
]
```

### エラー一覧

| ステータス | code                  | 説明                                                    |
| ---------- | --------------------- | ------------------------------------------------------- |
| `400`      | `INVALID_ORDERED_IDS` | 文字列配列でない、全グループ ID と一致しない、未知の ID |
| `401`      | —                     | 未認証                                                  |
