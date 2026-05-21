---
paths: "app/api/auth/**"
description: 認証フロー (OAuth2 / セッション管理 / DBSC) の API 仕様 — /api/auth/{login,callback,me,logout,dbsc/*} のリクエスト・レスポンス・Cookie 設定・エラー一覧
---

# Auth API 仕様

認証フロー・セッション管理・DBSC エンドポイントの仕様。

---

## POST /api/auth/dbsc/register

DBSC（Device Bound Session Credentials）公開鍵登録スタブ。TPM 鍵バインドの本実装が完了するまで、現在は受け付けるだけのスケルトン。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/auth/dbsc/challenge

DBSC チャレンジ発行・検証スタブ。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## DELETE /api/auth/dbsc/session

DBSC バインド済みデバイスの登録を解除する。`users/{userId}/dbsc-session.json` を R2 から削除する。

### 成功レスポンス

```
204 No Content
```

キーが存在しない場合も 204 を返す（冪等）。

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## GET /api/auth/login

OAuth2 認証フローを開始する。0g0 ID の認証ページにリダイレクトする。認証不要。

### 成功レスポンス

```
302 Found
Location: https://id.0g0.xyz/auth/login?client_id=...&redirect_to=...&state=...
```

CSRF 防止のため `auth_state` Cookie（HttpOnly / Secure / SameSite=Lax / 10分有効）をセットする。

---

## GET /api/auth/callback

OAuth2 認証コードを access_token・refresh_token と交換し、Cookie をセットする。認証不要。

### クエリパラメータ

| パラメータ | 型     | 説明                               |
| ---------- | ------ | ---------------------------------- |
| `code`     | string | 認可コード                         |
| `state`    | string | CSRF 検証用 state（cookie と照合） |

### 成功レスポンス

```
302 Found
Location: /
Set-Cookie: access_token=...; session_id=...; token_exp=...
```

### エラー一覧

| ステータス | 説明                                          |
| ---------- | --------------------------------------------- |
| `400`      | state 不一致・code 欠損・トークン交換失敗など |
| `403`      | ベータ制限（未許可ユーザー）                  |

---

## GET /api/auth/me

現在のセッション状態を確認する。access_token Cookie が有効な場合はユーザー情報を返す。期限切れの場合は session_id Cookie を使って自動リフレッシュを試みる。5 秒クールダウンあり。

### 成功レスポンス

```json
// 200 OK — 認証済み
{ "user": { "id": "...", "sub": "...", "email": "...", "name": "...", "picture": "..." } }

// 200 OK — 未認証
{ "user": null }

// 200 OK — ベータ制限
{ "user": null, "betaRestricted": true }
```

### エラー一覧

| ステータス | 説明                                                            |
| ---------- | --------------------------------------------------------------- |
| `429`      | 5 秒クールダウン中                                              |
| `503`      | 上流認証サーバーの一時障害（`{ user: null, transient: true }`） |

---

## POST /api/auth/logout

セッションを終了する。refresh_token を失効させ、R2 のサーバーサイドセッションを削除し、Cookie をクリアする。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

Cookie `access_token` / `session_id` / `token_exp` が削除される。

### エラー一覧

| ステータス | 説明                          |
| ---------- | ----------------------------- |
| `403`      | Origin ヘッダー不一致（CSRF） |
