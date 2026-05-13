---
globs: "app/api/push/**"
---

# API 仕様: プッシュ通知

## GET /api/push/vapid-key

Web Push の VAPID 公開鍵を返す。認証不要。

### 成功レスポンス

```json
// 200 OK
{ "publicKey": "BNwT..." }
```

---

## GET /api/push/status

現在のプッシュ購読数を返す。

### 成功レスポンス

```json
// 200 OK
{ "subscriptionCount": 2 }
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/push/subscribe

Web Push エンドポイントを登録する。ユーザーあたり最大 20 件。5 秒クールダウンあり。

### リクエスト

```json
{
  "endpoint": "https://...",
  "expirationTime": null,
  "keys": {
    "p256dh": "BNwT...",
    "auth": "abc..."
  }
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code               | 説明                      |
| ---------- | ------------------ | ------------------------- |
| `400`      | `INVALID_PAYLOAD`  | 必須フィールド欠損        |
| `401`      | —                  | 未認証                    |
| `422`      | `SUBSCRIPTION_MAX` | 上限 (20 件) に達している |
| `429`      | `COOLDOWN`         | 5 秒クールダウン中        |

---

## POST /api/push/unsubscribe

Web Push エンドポイントの登録を解除する。5 秒クールダウンあり。

### リクエスト

```json
{
  "endpoint": "https://..." // 必須
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code              | 説明               |
| ---------- | ----------------- | ------------------ |
| `400`      | `INVALID_PAYLOAD` | endpoint 欠損      |
| `401`      | —                 | 未認証             |
| `429`      | `COOLDOWN`        | 5 秒クールダウン中 |

---

## POST /api/push/test

登録済みエンドポイントにテスト通知を送信する。期限切れエンドポイントは自動削除される。

### 成功レスポンス

```json
// 200 OK
{ "sent": 1, "expired": 0, "remaining": 1 }
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## GET /api/push/config

プッシュ通知の設定を取得する。

### 成功レスポンス

```json
// 200 OK
{
  "disabledFeeds": ["feedHash1", "feedHash2"],
  "silentStart": "22:00",
  "silentEnd": "08:00",
  "timezone": "Asia/Tokyo"
}
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## PUT /api/push/config

プッシュ通知の設定を更新する。

### リクエスト

```json
{
  "disabledFeeds": ["feedHash1"],
  "silentStart": "22:00",
  "silentEnd": "08:00",
  "timezone": "Asia/Tokyo"
}
```

すべてのフィールドはオプション。省略したフィールドは現在値を維持する。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code              | 説明                    |
| ---------- | ----------------- | ----------------------- |
| `400`      | `INVALID_PAYLOAD` | 型不正 / 不正な時間形式 |
| `401`      | —                 | 未認証                  |
