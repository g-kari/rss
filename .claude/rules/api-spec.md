---
description: REST API エンドポイント仕様 (リクエスト/レスポンス/エラーコード) — Route Handler 編集時に参照
paths: "app/api/**/route.ts"
---

# API エンドポイント仕様

優先度「高」のエンドポイントを中心に、リクエスト/レスポンス/エラーコードを記載する。
認証が必要な全エンドポイントは Cookie (`access_token` または `session_id`) が必須。

## 共通エラー形式

```json
{ "error": "エラーメッセージ", "code": "ERROR_CODE" }
```

未認証の場合は `401` を返す（`withSession` / `withJsonBody` が自動処理）。

### 共通エラーコード (shared middleware 由来)

以下は `withSession` / `withJsonBody` / `requireSession` / `assertSameOrigin` 等の共有ミドルウェアが返す横断的なエラーコード。各エンドポイントの「エラー一覧」では原則省略する（このセクションを参照）。

| ステータス | code                      | 説明                                                                   |
| ---------- | ------------------------- | ---------------------------------------------------------------------- |
| `400`      | `INVALID_JSON`            | リクエストボディが不正な JSON (`withJsonBody`)                         |
| `401`      | —                         | 未認証 (`withSession` / `requireSession`)                              |
| `401`      | `DBSC_CHALLENGE_REQUIRED` | DBSC セッションチャレンジが必要（バインド済みデバイスの再検証）        |
| `401`      | `TOKEN_ROTATED`           | アクセストークンがローテーションされた（新トークン発行済、リトライ要） |
| `403`      | `CSRF_ORIGIN_MISMATCH`    | Origin ヘッダーが許可オリジンと不一致（POST/PUT/DELETE の CSRF 検証）  |
| `500`      | `INTERNAL_ERROR`          | サーバー内部エラー（`incident` ID 付きで返る）                         |

---

## エンドポイント一覧 (per-file に分割済)

各エンドポイントの詳細仕様は以下のファイルに移動した。

| ファイル                 | 対象エンドポイント                                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api-auth.md`            | `/api/auth/*` (login / callback / me / logout / dbsc/\*)                                                                                                                                           |
| `api-feeds.md`           | `/api/feeds/*` (CRUD / import / export / refresh / reinfer / purge-content-cache)                                                                                                                  |
| `api-articles.md`        | `/api/articles/*` / `/api/read-state` / `/api/content` / `/api/clip`                                                                                                                               |
| `api-ai.md`              | `/api/ai/summarize` / `/api/ai/translate`                                                                                                                                                          |
| `api-push.md`            | `/api/push/*` (vapid-key / status / subscribe / unsubscribe / test / config)                                                                                                                       |
| `api-collections.md`     | `/api/collections/*` / `/api/feed-groups/*`                                                                                                                                                        |
| `api-recommendations.md` | `/api/recommendations/*` (GET / dismiss / refresh)                                                                                                                                                 |
| `api-misc.md`            | `/api/engagement` / `/api/stats` / `/api/ogp` / `/api/image-proxy` / `/api/video-proxy` / `/api/health` / `/api/release-notes` / `/api/test/seed` / `/api/piper-voice/[file]` / `/api/wasm/[file]` |
| `api-security.md`        | 横断規範 — 認証 + 所有権チェック二段 / shared cache TTL 短縮で poisoning 影響限定 / dev・e2e endpoint の NODE_ENV + bypass 二重ガード (endpoint 別仕様でなく Route Handler 実装時に参照)           |
