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

---

## エンドポイント一覧 (per-file に分割済)

各エンドポイントの詳細仕様は以下のファイルに移動した。

| ファイル                 | 対象エンドポイント                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `api-auth.md`            | `/api/auth/*` (login / callback / me / logout / dbsc/\*)                                                                     |
| `api-feeds.md`           | `/api/feeds/*` (CRUD / import / export / refresh / reinfer / purge-content-cache)                                            |
| `api-articles.md`        | `/api/articles/*` / `/api/read-state` / `/api/content` / `/api/clip`                                                         |
| `api-ai.md`              | `/api/ai/summarize` / `/api/ai/translate`                                                                                    |
| `api-push.md`            | `/api/push/*` (vapid-key / status / subscribe / unsubscribe / test / config)                                                 |
| `api-collections.md`     | `/api/collections/*` / `/api/feed-groups/*`                                                                                  |
| `api-recommendations.md` | `/api/recommendations/*` (GET / dismiss / refresh)                                                                           |
| `api-misc.md`            | `/api/engagement` / `/api/stats` / `/api/ogp` / `/api/image-proxy` / `/api/health` / `/api/release-notes` / `/api/test/seed` |
