---
globs: "app/api/engagement/**,app/api/stats/**,app/api/ogp/**,app/api/image-proxy/**,app/api/video-proxy/**,app/api/health/**,app/api/release-notes/**,app/api/test/**,app/api/piper-voice/**,app/api/wasm/**"
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

## GET /api/video-proxy

外部動画を取得してプロキシする。`/api/image-proxy` と同じく `handleBinaryProxy` 共通 handler 経由で動作し、Cloudflare Cache API（30 日）でキャッシュされる。同一オリジンからのリクエスト（`Sec-Fetch-Site: same-origin` または `Referer` 一致）のみ受け付ける。MIME タイプ検証あり。

### クエリパラメータ

| パラメータ | 型     | 説明                   |
| ---------- | ------ | ---------------------- |
| `url`      | string | 必須: 動画の HTTPS URL |

### サイズ上限

- Content-Length あり: `MAX_VIDEO_BYTES`（`src/lib/validation.ts` で定義）
- Content-Length なし: 10MB

### 成功レスポンス

```
200 OK
Content-Type: video/mp4 （または webm / ogg / hls 等の許可された動画 MIME）
Cache-Control: public, max-age=2592000
```

### エラー一覧

エラー時は body が `null` のレスポンスを返し、`X-Video-Proxy-Error` ヘッダーで詳細を識別できる（`src/lib/video-error-placeholder.ts`）。

| ステータス | code                    | 説明                                                 |
| ---------- | ----------------------- | ---------------------------------------------------- |
| `400`      | —                       | URL が欠損または SSRF 対策で拒否                     |
| `401`      | —                       | 未認証                                               |
| `403`      | —                       | 同一オリジン以外からのリクエスト                     |
| `404`      | `not_found`             | 上流が 404                                           |
| `403/502`  | `bot_blocked`           | 上流が bot 判定で拒否                                |
| `415`      | `mime_rejected`         | 許可された動画 MIME 以外                             |
| `415`      | `content_type_mismatch` | declared Content-Type と magic byte 検出結果が不一致 |
| `413`      | `too_large`             | サイズ上限超過                                       |
| `413`      | `size_unknown`          | Content-Length なし + サイズ判定不能                 |
| `502`      | `network`               | 上流 fetch 失敗                                      |
| `502`      | `unavailable`           | その他の上流エラー                                   |

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

---

## GET /api/piper-voice/[file]

Piper TTS engine 用の voice モデル (`.onnx`) と config (`.onnx.json`) を R2 から配信する。voice ファイルは数十 MB のため bundle に含めず R2 セルフホスト。`ALLOWED_FILES` allowlist で任意 R2 オブジェクト参照を防ぐ。詳細は `app/api/piper-voice/[file]/route.ts` 参照。

### パスパラメータ

| パラメータ | 型     | 説明                                              |
| ---------- | ------ | ------------------------------------------------- |
| `file`     | string | 必須: `ALLOWED_FILES` に含まれる voice ファイル名 |

現在の許可リスト: `tsukuyomi.onnx` / `tsukuyomi.onnx.json`。

### 成功レスポンス

```
200 OK
Content-Type: application/octet-stream（.onnx）または application/json（.onnx.json）
Cache-Control: public, max-age=31536000, immutable
```

### エラー一覧

| ステータス | code        | 説明                                                             |
| ---------- | ----------- | ---------------------------------------------------------------- |
| `401`      | —           | 未認証                                                           |
| `404`      | `NOT_FOUND` | `ALLOWED_FILES` 未収載のファイル名、または R2 にオブジェクト無し |

---

## GET /api/wasm/[file]

Piper TTS の `onnxruntime-web` peer-dep wasm および piper-plus phonemizer wasm を R2 から配信する。Cloudflare Workers の単一 asset 25 MiB 上限を回避するため bundle 外で配置。`ALLOWED_FILES` allowlist で厳格に絞る。詳細は `app/api/wasm/[file]/route.ts` 参照。

### パスパラメータ

| パラメータ | 型     | 説明                                                      |
| ---------- | ------ | --------------------------------------------------------- |
| `file`     | string | 必須: `ALLOWED_FILES` に含まれる wasm / loader ファイル名 |

現在の許可リスト (10 件):

- `ort-wasm-simd-threaded.wasm` / `.jsep.wasm` / `.asyncify.wasm` / `.jspi.wasm`
- `ort-wasm-simd-threaded.mjs` / `.jsep.mjs` / `.asyncify.mjs` / `.jspi.mjs`
- `piper_plus_wasm.js` / `piper_plus_wasm_bg.wasm`

### 成功レスポンス

```
200 OK
Content-Type: application/wasm（.wasm）または application/javascript（.js / .mjs）
Cache-Control: public, max-age=31536000, immutable
```

### エラー一覧

| ステータス | code        | 説明                                                             |
| ---------- | ----------- | ---------------------------------------------------------------- |
| `401`      | —           | 未認証                                                           |
| `404`      | `NOT_FOUND` | `ALLOWED_FILES` 未収載のファイル名、または R2 にオブジェクト無し |
