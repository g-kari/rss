---
description: REST API エンドポイント仕様 (リクエスト/レスポンス/エラーコード) — Route Handler 編集時に参照
paths: "app/api/**/route.ts"
---

# API エンドポイント仕様

優先度「高」のエンドポイントを中心に、リクエスト/レスポンス/エラーコードを記載する。
通常の認証が必要なエンドポイントは Cookie (`access_token` または `session_id`) が必須。opt-inの`/mcp`は専用OAuth Bearerのみ。Cookie/0g0 token/clip tokenへのfallbackは不可。

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
| `api-push.md`            | `/api/push/*` (vapid-key / status / subscribe / unsubscribe / test / config / recommendations/dismissals)                                                                                          |
| `api-collections.md`     | `/api/collections/*` / `/api/feed-groups/*`                                                                                                                                                        |
| `api-recommendations.md` | `/api/recommendations/*` (GET / dismiss / refresh)                                                                                                                                                 |
| `api-misc.md`            | `/api/engagement` / `/api/stats` / `/api/ogp` / `/api/image-proxy` / `/api/video-proxy` / `/api/health` / `/api/release-notes` / `/api/test/seed` / `/api/piper-voice/[file]` / `/api/wasm/[file]` |
| `api-security.md`        | 横断規範 — 認証 + 所有権チェック二段 / shared cache TTL 短縮で poisoning 影響限定 / dev・e2e endpoint の NODE_ENV + bypass 二重ガード (endpoint 別仕様でなく Route Handler 実装時に参照)           |

## 読み取り専用MCP (2026-10-05)

- defaultは無効。`RSS_MCP_ENABLED=true`と専用`OAUTH_KV` binding、canonical HTTPS APP_BASE_URLの全部が必要。未有効MCP/auth routeは503、metadataは404。通常APIを変更しない。
- `/mcp`: stateless Streamable HTTP POST。専用resource-bound `rss:read` OAuth Bearer、各要求で本人/expiry/scope/R2連携revisionを検証。JSON-RPC body16KiB。modern2026と2025stateless互換。legacy GET/DELETE sessionは405。toolsは`list_subscriptions({limit?,cursor?})`、`list_articles({feedId,limit?,cursor?,createdSince?})`、`get_article({feedId,articleRef,cursor?})`のみ。objectはstrict、limit default20/max100、本文16KiB継続。最新保持window最大500件だけで全archive/編集差分ではない。
- `/.well-known/oauth-protected-resource/mcp`（root aliasあり）と`/.well-known/oauth-authorization-server`: exactissuer/resource、S256/CIMD、scope広告。DCRなし。全応答private/no-store。
- `GET/POST /api/mcp/authorize`: 既存本人session、browser-bound10分state、scope/account/revision確認。同意POSTは同一Origin、formはhandle/decisionのみ4KiB。未ログインは既存0g0 loginを安全に再開して最終account同意へ戻す。拒否/期限切れ/再利用/アカウント変更/不正scope/resourceは拒否。
- `/api/mcp/token`: OAuth provider所有code/refresh/revoke。フォーム16KiB。access15分、refresh初期/非活動期限30日、自動rotation。上流0g0 credentialは渡さない。
- `GET /api/mcp/connection`: 本人Cookie認証、`{active,scope,updatedAt,accessTokenLifetimeSeconds,refreshIdleLifetimeSeconds,disconnectScope,limitation}`のみ。secret/grant/tokenは返さない。
- `DELETE /api/mcp/connection`: 本人Cookie+同一Origin+`X-RSS-Account-Id`=本人session subject、R2の新disabled revisionを先にCAS保存してKV cleanup。200 `{active:false,updatedAt,cleanupComplete}`。account変更409。scopeは本人の全MCP接続。
- `GET/POST /api/mcp/settings`: 本人向けHTML管理画面/同意付き解除。scriptなし、同一Origin/現在account確認。ChatGPT側disconnectだけや処理中readの即時取消は保証しない。
- 3 toolsは購読/記事のpure readだけ。既存GET feedsのlastAccessedAt/repair更新を呼ばず、notes/readstate/savedclip/requestCookie/guid/arbitrarymetadata/credential-bearingURLを返さない。記事の命令文はprovenance/warning付きuntrusteddata。
- data errorsはINVALID_ARGUMENT/INVALID_CURSOR/STALE_CURSOR/NOT_SUBSCRIBED/FEED_UNAVAILABLE/ARTICLE_UNAVAILABLE/CORRUPT_STORAGE/STORAGE_UNAVAILABLE/BUDGET_EXCEEDED。transportはHost/Origin403、query400、body413、無認証/期限/解除401、scope403、authstorage503、best-effort limiter429。raw credentials/storage errorsをecho/logしない。詳細`docs/mcp.md`。

## SingleFile (2026-09-30)

- `POST /api/clip`: `Authorization: Bearer <clip_v1 token>`、`multipart/form-data`の`html` Fileと`url`文字列。既存の同一origin Cookie + JSON `{html,url}`も維持。成功200/201 `{ok:true,url,article}`。本文と画像の私有R2保存を待って応答する。
- 入力は5MiB HTML + 最大64KiBのmultipart overhead、画像128種類、送信60秒間隔。非対応ZIP/画像415 (`UNSUPPORTED_CLIP_FORMAT`/`UNSUPPORTED_CLIP_IMAGE`)、入力400 (`INVALID_CLIP_PAYLOAD`)、過大413 (`PAYLOAD_TOO_LARGE`)、抽出不可422 (`INVALID_CLIP_CONTENT`)、保存500件超422 (`SAVED_LIMIT_REACHED`)、CAS競合409 (`SAVED_ARTICLE_CONFLICT`)、無効token401 (`INVALID_CLIP_TOKEN`)、保存障害503 (`CLIP_UNAVAILABLE`)、rate limit429。
- `OPTIONS /api/clip`: 204、POST/OPTIONSとAuthorization/Content-Typeのみ許可。`Access-Control-Allow-Credentials`は設定しない。CookieだけのPOSTは引き続き同一origin必須。
- `GET /api/clip/token`: session認証、`{token:null|{id,createdAt,expiresAt}}`。
- `POST /api/clip/token`: session+CSRF認証、bodyなし、明示的発行/再発行、201 `{token,id,createdAt,expiresAt}`。生tokenはこの応答だけ。scope/lifetime/userIdの上書き不可。
- `DELETE /api/clip/token`: session+CSRF認証、失効tombstoneをCAS保存、200 `{ok:true}`。
- token管理は任意の`X-RSS-Account-Id`を照合し、違えば409 `ACCOUNT_CHANGED`。競合409 `CLIP_TOKEN_CONFLICT`、障害503 `CLIP_TOKEN_UNAVAILABLE`。全応答`no-store`。
- `GET /api/clip/images/{id}`: session認証、idは64hex、本人の画像だけ返す。401/404、成功は検証済みraster MIMEとnosniff/CORP same-origin/private no-store。保存用Bearerに読取権限はない。
- `GET /api/content`: 本人の永続クリップを共有Cacheより優先し、`X-Cache-Source:saved-clip`、private no-storeで返す。Cache API消失・POP変更でも保存本文は残る。
