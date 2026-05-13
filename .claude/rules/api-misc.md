---
globs: "app/api/engagement/**,app/api/stats/**,app/api/ogp/**,app/api/image-proxy/**,app/api/health/**,app/api/release-notes/**,app/api/test/**"
---

# API 仕様: エンゲージメント・統計・ユーティリティ

## GET /api/engagement

ユーザーのエンゲージメント履歴を返す。

### 成功レスポンス

```json
// 200 OK
[
  {
    "articleId": "...",
    "feedHash": "...",
    "action": "read",
    "timestamp": "2024-11-01T00:00:00Z",
    "value": null
  }
]
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/engagement

エンゲージメントイベントを記録する。1 秒クールダウンあり。

### リクエスト

```json
{
  "articleId": "string", // 必須
  "feedHash": "string", // 必須
  "action": "string", // 必須: "read" | "like" | "bookmark" 等
  "value": null // オプション
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code              | 説明                           |
| ---------- | ----------------- | ------------------------------ |
| `400`      | `INVALID_PAYLOAD` | 必須フィールド欠損または型不正 |
| `401`      | —                 | 未認証                         |
| `429`      | `COOLDOWN`        | 1 秒クールダウン中             |

---

## GET /api/stats

読書統計を返す。

### 成功レスポンス

```json
// 200 OK
{
  "dailyReadCounts": { "2024-11-01": 5 },
  "yearlyHeatmap": { "2024": { "1": 30 } },
  "topFeeds": [{ "feedHash": "...", "count": 42 }],
  "weeklyTotal": 15,
  "allTimeTotal": 1234,
  "currentStreak": 7
}
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## GET /api/ogp

URL から OGP 画像・タイトル・説明を取得する。Cloudflare Cache API（30日・負例は 1日）でキャッシュされる。60 秒あたり最大 30 件のスライディングウィンドウ制限あり。

### クエリパラメータ

| パラメータ | 型     | 説明                     |
| ---------- | ------ | ------------------------ |
| `url`      | string | 必須: 記事の http(s) URL |

### 成功レスポンス

```json
// 200 OK
{ "image": "https://...", "title": "ページタイトル", "description": "..." }
```

OGP 画像がない場合は `image: ""` を返す（エラーにはならない）。

### エラー一覧

| ステータス | 説明               |
| ---------- | ------------------ |
| `401`      | 未認証             |
| `429`      | レートリミット超過 |

---

## GET /api/image-proxy

外部画像を取得してプロキシする。Cloudflare Cache API（30日）でキャッシュされる。同一オリジンからのリクエスト（`Sec-Fetch-Site: same-origin` または `Referer` 一致）のみ受け付ける。MIME タイプ検証あり。

### クエリパラメータ

| パラメータ | 型     | 説明                   |
| ---------- | ------ | ---------------------- |
| `url`      | string | 必須: 画像の HTTPS URL |

### 成功レスポンス

```
200 OK
Content-Type: image/jpeg （または png / gif / webp / svg+xml 等）
```

### エラー一覧

| ステータス | 説明                             |
| ---------- | -------------------------------- |
| `400`      | URL が欠損または SSRF 対策で拒否 |
| `401`      | 未認証                           |
| `403`      | 同一オリジン以外からのリクエスト |

---

## GET /api/health

サービスのヘルスチェック。認証不要。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "timestamp": "2024-11-01T00:00:00.000Z" }
```

---

## GET /api/release-notes

リリースノートを日付セクション単位でページネーションして返す。

### クエリパラメータ

| パラメータ | 型     | 説明                                                            |
| ---------- | ------ | --------------------------------------------------------------- |
| `offset`   | number | スキップするセクション数（デフォルト 0）                        |
| `limit`    | number | 取得セクション数（デフォルト 10、上限 MAX_RELEASE_NOTES_LIMIT） |

### 成功レスポンス

```json
// 200 OK
{
  "content": "## 2025-01-01\n...",
  "total": 42,
  "offset": 0,
  "limit": 10,
  "hasMore": true
}
```

### エラー一覧

| ステータス | 説明   |
| ---------- | ------ |
| `401`      | 未認証 |

---

## POST /api/test/seed

e2e テスト専用の R2 シード API。**dev / e2e 環境のみ動作**: `process.env.NODE_ENV !== "production"` かつ `DEV_AUTH_BYPASS_USER_ID` がセット済みのときのみ実 endpoint として機能する。**本番では 404** を返す。

### リクエスト

```json
{
  "subscriptions": [{ "feedHash": "string", "url": "string" }],
  "articles": { "feedHashA": [] },
  "readState": { "readIds": [] },
  "feedGroups": [],
  "collections": []
}
```

すべてのフィールドはオプション。指定したフィールドのみ書き込まれる。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "userId": "e2e-test-user", "wrote": { "subscriptions": 5, "articles": 12 } }
```

### エラー一覧

| ステータス | code              | 説明                                    |
| ---------- | ----------------- | --------------------------------------- |
| `400`      | `INVALID_PAYLOAD` | リクエストボディが期待する型と異なる    |
| `404`      | —                 | 本番環境 (NODE_ENV === "production" 等) |

---

## DELETE /api/test/seed

e2e テスト専用の R2 全削除 API。`POST /api/test/seed` と同じ環境ガードで動作。test 用ユーザーの `users/{userId}/*` 配下を全削除する。**本番では 404** を返す。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "userId": "e2e-test-user", "deleted": 12 }
```

### エラー一覧

| ステータス | code | 説明                                    |
| ---------- | ---- | --------------------------------------- |
| `404`      | —    | 本番環境 (NODE_ENV === "production" 等) |
