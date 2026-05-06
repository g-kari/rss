# API エンドポイント仕様

優先度「高」のエンドポイントを中心に、リクエスト/レスポンス/エラーコードを記載する。
認証が必要な全エンドポイントは Cookie (`access_token` または `session_id`) が必須。

## 共通エラー形式

```json
{ "error": "エラーメッセージ", "code": "ERROR_CODE" }
```

未認証の場合は `401` を返す（`withSession` / `withJsonBody` が自動処理）。

---

## POST /api/feeds

フィードを追加する。最大 `MAX_FEEDS_PER_USER`（現在 20）件まで登録可能。

### リクエスト

```json
{
  "url": "string", // 必須: http(s) の URL
  "cookie": "string", // オプション: サイト閲覧に必要な Cookie ヘッダー値（最大 2000 文字）
  "cssSelector": "string", // オプション: 手動 CSS セレクタ（1〜500 文字）
  "useRsshub": true // オプション: RSSHub 変換を使用するか（デフォルト true）
}
```

### 成功レスポンス

```json
// 201 Created
{ "feedHash": "...", "url": "...", "title": "...", ... }  // Feed オブジェクト
```

### エラー一覧

| ステータス | code                 | 説明                                                       |
| ---------- | -------------------- | ---------------------------------------------------------- |
| `400`      | `INVALID_URL`        | URL が空または http(s) 以外                                |
| `400`      | `INVALID_COOKIE`     | Cookie ヘッダー値が不正（CRLF・制御文字・2000 文字超など） |
| `400`      | `INVALID_SELECTOR`   | CSS セレクタが不正または 500 文字超                        |
| `409`      | `FEED_EXISTS`        | 同一フィードが既に登録済み                                 |
| `422`      | `NO_FEED_FOUND`      | RSS フィードが見つからず LLM 推論も失敗                    |
| `422`      | `FEED_LIMIT_REACHED` | フィード上限 (20件) に達している                           |
| `429`      | `COOLDOWN`           | 30 秒クールダウン中                                        |

### 処理フロー

1. クールダウン確認（30 秒）
2. URL バリデーション → RSSHub 変換（`useRsshub: true` の場合）
3. Cookie バリデーション（指定時のみ）
4. RSS 自動探索 → 失敗時: 手動 CSS セレクタ → LLM CSS セレクタ推論
5. `feeds/{feedHash}/meta.json` 生成（共有フィード）
6. `users/{userId}/subscriptions.json` に追記
7. バックグラウンドで初回記事フェッチ

---

## GET /api/read-state

ユーザーの既読・ブックマーク・後で読む・スヌーズなどの状態を取得する。

### 成功レスポンス

```json
// 200 OK
{
  "readIds": ["articleId1", ...],          // 既読記事 ID（最大 100,000）
  "bookmarkIds": ["articleId1", ...],      // ブックマーク済み記事 ID（最大 10,000）
  "readingListIds": ["articleId1", ...],   // 後で読む記事 ID（最大 10,000）
  "likeIds": ["articleId1", ...],          // いいね済み記事 ID（最大 10,000）
  "snoozedUntil": { "articleId": "2024-12-01T09:00:00Z" },  // スヌーズ（最大 500件）
  "notes": { "articleId": "メモテキスト" },                 // 記事メモ（最大 1,000件）
  "tagIds": { "articleId": ["tagName", ...] },               // タグ（最大 2,000記事）
  "globalFilter": null,                    // グローバルキーワードフィルター
  "readBeforeTimestamp": null,             // この日時以前を一括既読扱い（ISO 8601）
  "ttlDays": null                          // 記事 TTL 日数（null=無制限、0=無制限、1〜365）
}
```

---

## POST /api/read-state

既読状態をサーバーに保存・マージする。クライアントがローカルの変更をフラッシュする際に使用。

### リクエスト

```json
{
  "readIds": ["articleId1", ...],
  "bookmarkIds": ["articleId1", ...],
  "readingListIds": ["articleId1", ...],
  "likeIds": ["articleId1", ...],
  "removedIds": {
    "readIds": ["articleId1", ...],
    "bookmarkIds": ["articleId1", ...],
    "readingListIds": ["articleId1", ...],
    "likeIds": ["articleId1", ...],
    "tagIds": ["articleId1", ...]
  },
  "snoozedUntil": { "articleId": "2024-12-01T09:00:00Z" },
  "notes": { "articleId": "メモテキスト" },
  "tagIds": { "articleId": ["tagName"] },
  "globalFilter": null,
  "readBeforeTimestamp": "2024-11-01T00:00:00Z",
  "ttlDays": 30
}
```

すべてのフィールドはオプション。省略したフィールドはサーバーの既存値をそのまま保持。

### 成功レスポンス

```json
// 200 OK — マージ後のフル ReadState を返す
{ "readIds": [...], ... }
```

### エラー一覧

| ステータス | code                | 説明                    |
| ---------- | ------------------- | ----------------------- |
| `413`      | `PAYLOAD_TOO_LARGE` | ID 配列がサイズ上限超過 |

### マージ戦略

- `readIds` / `bookmarkIds` 等: ローカル ∪ サーバー（ローカル優先）
- `removedIds`: 差分除去（指定 ID をサーバーの Set から削除）
- `snoozedUntil`: より遅い日時を採用（別デバイスの期限を保護）
- `notes`: サーバー優先（別デバイスで書いた最新版を上書きしない）
- `readBeforeTimestamp` / `ttlDays`: リクエスト値を上書き

---

## POST /api/ai/summarize

記事を Workers AI で要約する。ブラウザの Summarizer API が利用可能な場合はクライアント側で処理される（このエンドポイントは呼ばれない）。

### リクエスト

```json
{
  "url": "string", // 必須: 記事 URL
  "articleId": "string", // オプション: R2 キャッシュキー（英数字・`_-` 128文字以内）
  "model": "@cf/meta/llama-3.1-8b-instruct" // オプション: 使用モデル（デフォルト 8B）
}
```

**使用可能なモデル:**

- `@cf/meta/llama-3.1-8b-instruct`（デフォルト、60秒 10回まで）
- `@cf/meta/llama-3.2-3b-instruct`（高速軽量、60秒 10回まで）
- `@cf/meta/llama-3.1-70b-instruct`（高精度、60秒 3回まで）

### 成功レスポンス

```json
// 200 OK
{ "result": "## ポイント\n・...\n\n## まとめ\n..." }
```

### エラー一覧

| ステータス | code                   | 説明                                             |
| ---------- | ---------------------- | ------------------------------------------------ |
| `400`      | `INVALID_URL`          | URL が不正                                       |
| `429`      | `RATE_LIMITED`         | レートリミット超過（60秒 10回または 70B は 3回） |
| `502`      | `CONTENT_FETCH_FAILED` | 記事コンテンツ取得失敗（retryable: true）        |
| `502`      | `AI_ERROR`             | AI 処理エラー（retryable: true）                 |
| `503`      | `SERVICE_UNAVAILABLE`  | Workers AI 過負荷（retryable: true）             |

### キャッシュ動作

- `articleId` が指定されると R2 キャッシュ（`ai-cache/summary/{articleId}`）を確認
- キャッシュヒット時は AI を呼び出さずにキャッシュ結果を返す
- 結果は `ctx.waitUntil` で非同期に R2 へ保存

---

## POST /api/ai/translate

記事を Workers AI で日本語に翻訳する。ブラウザの Translator API が利用可能な場合はクライアント側で処理される（このエンドポイントは呼ばれない）。

リクエスト・レスポンス・エラー・キャッシュ動作は `/api/ai/summarize` と同一。キャッシュは `ai-cache/translation/{articleId}` に保存される。

---

## GET /api/articles

記事一覧を取得する。

### クエリパラメータ

| パラメータ | 型       | 説明                                                   |
| ---------- | -------- | ------------------------------------------------------ |
| `feedHash` | string   | 特定フィードの記事のみ取得（省略時は購読中全フィード） |
| `since`    | ISO 8601 | この日時以降の記事を返す（ページネーション用）         |
| `page`     | number   | ページ番号（1〜、デフォルト 1）                        |

### 成功レスポンス

```json
// 200 OK
[
  {
    "id": "articleId",
    "feedHash": "...",
    "title": "記事タイトル",
    "link": "https://...",
    "summary": "サマリー",
    "publishedAt": "2024-11-01T00:00:00Z",
    "createdAt": "2024-11-01T00:00:00Z"
  }
]
```

---

## POST /api/feeds/import

OPML ファイルから複数フィードを一括インポートする。

### リクエスト

`Content-Type: multipart/form-data` または `application/json`

```json
{ "opml": "<opml xml string>" }
```

### 成功レスポンス

```json
// 200 OK
{ "imported": 5, "skipped": 2, "errors": [] }
```

### エラー一覧

| ステータス | code                 | 説明                     |
| ---------- | -------------------- | ------------------------ |
| `400`      | `INVALID_OPML`       | OPML 形式が不正          |
| `422`      | `FEED_LIMIT_REACHED` | フィード上限に達している |
| `429`      | `COOLDOWN`           | インポートクールダウン中 |
