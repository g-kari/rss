# API エンドポイント仕様

優先度「高」のエンドポイントを中心に、リクエスト/レスポンス/エラーコードを記載する。
認証が必要な全エンドポイントは Cookie (`access_token` または `session_id`) が必須。

## 共通エラー形式

```json
{ "error": "エラーメッセージ", "code": "ERROR_CODE" }
```

未認証の場合は `401` を返す（`withSession` / `withJsonBody` が自動処理）。

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

- `@cf/meta/llama-3.1-8b-instruct`（デフォルト、60秒 20回まで）
- `@cf/meta/llama-3.2-3b-instruct`（高速軽量、60秒 20回まで）
- `@cf/meta/llama-3.1-70b-instruct`（高精度、60秒 3回まで）
- `@cf/google/gemma-3-27b-it`（多言語・日本語向き、60秒 20回まで）
- `@cf/qwen/qwen2.5-coder-1.5b-instruct`（コード記事向き、60秒 20回まで）

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

---

## PATCH /api/feeds/:id

フィードの属性（タイトル・フィルター・NSFW・優先度・カテゴリ・グループ・ミュート・ビュー・ダイジスト上限）を部分更新する。

### パスパラメータ

| パラメータ | 型     | 説明                             |
| ---------- | ------ | -------------------------------- |
| `id`       | string | feedHash（16 文字の hex 文字列） |

### リクエスト

すべてのフィールドはオプション。指定したフィールドのみ更新される。

```json
{
  "title": "string", // カスタムタイトル（1〜200 文字）
  "filter": {
    // キーワードフィルター（null で削除）
    "include": ["keyword"],
    "exclude": ["keyword"]
  },
  "nsfw": true, // NSFW フラグ（boolean）
  "priority": "high", // 優先度（"high" または null）
  "category": "string", // カテゴリ（最大 50 文字、null で削除）
  "groupId": "string", // フィードグループ ID（null で解除）
  "mutedUntil": "2024-12-01T09:00:00Z", // ミュート期限 ISO 8601（null で解除）
  "view": "articles", // ビューモード（"articles" | "pictures" | "videos" | "social" | null）
  "digestLimit": 10 // 1フィードの最大表示件数（0〜100 の整数、null で無制限）
}
```

### 成功レスポンス

```json
// 200 OK — 更新後の Feed オブジェクトを返す
{ "feedHash": "...", "url": "...", "title": "...", ... }
```

### エラー一覧

| ステータス | code                   | 説明                                        |
| ---------- | ---------------------- | ------------------------------------------- |
| `400`      | `INVALID_TITLE`        | タイトルが空または 200 文字超               |
| `400`      | `INVALID_FILTER`       | フィルターの形式不正                        |
| `400`      | `INVALID_NSFW`         | nsfw が boolean でない                      |
| `400`      | `INVALID_PRIORITY`     | priority が "high" でも null でもない       |
| `400`      | `INVALID_CATEGORY`     | category が string でない、または 50 文字超 |
| `400`      | `INVALID_GROUP_ID`     | groupId が string でない                    |
| `400`      | `INVALID_MUTED_UNTIL`  | mutedUntil が ISO 8601 文字列でない         |
| `400`      | `INVALID_VIEW`         | view が許可された値でない                   |
| `400`      | `INVALID_DIGEST_LIMIT` | digestLimit が 0〜100 の整数でない          |
| `404`      | `FEED_NOT_FOUND`       | 指定した feedHash が購読一覧にない          |
| `404`      | `FEED_GROUP_NOT_FOUND` | 指定した groupId が存在しない               |

---

## POST /api/feeds/:id/refresh

単体フィードを手動でリフレッシュする。30 秒クールダウンあり。

### パスパラメータ

| パラメータ | 型     | 説明                             |
| ---------- | ------ | -------------------------------- |
| `id`       | string | feedHash（16 文字の hex 文字列） |

### 成功レスポンス

```json
// 200 OK — 更新後の SharedFeedMeta を返す
{ "feedHash": "...", "url": "...", "title": "...", "lastFetchedAt": "...", ... }
```

### エラー一覧

| ステータス | code             | 説明                         |
| ---------- | ---------------- | ---------------------------- |
| `400`      | `INVALID_FEED`   | feedHash の形式が不正        |
| `404`      | `FEED_NOT_FOUND` | 指定したフィードが存在しない |
| `429`      | `COOLDOWN`       | 30 秒クールダウン中          |

---

## GET /api/engagement

ユーザーのエンゲージメントログ（記事操作履歴）を取得する。

### 成功レスポンス

```json
// 200 OK
{
  "entries": [
    {
      "articleId": "string",
      "feedHash": "string",
      "action": "fetch_full", // fetch_full | open_original | reading_list | bookmark | like | ai_feedback
      "timestamp": "2024-11-01T00:00:00Z",
      "value": "good:summary" // ai_feedback の場合のみ: "{good|neutral|bad}:{summary|translate}"
    }
  ]
}
```

---

## POST /api/engagement

エンゲージメントイベントを記録する。1 秒クールダウンあり。最大 `MAX_ENGAGEMENT_ENTRIES` 件を保持し、超過分は古い順に削除される。

### リクエスト

```json
{
  "articleId": "string", // 必須: 記事 ID（最大 128 文字）
  "feedHash": "string", // 必須: feedHash（16 文字の hex 文字列）
  "action": "fetch_full", // 必須: fetch_full | open_original | reading_list | bookmark | like | ai_feedback
  "value": "good:summary" // ai_feedback の場合のみ必須: "{good|neutral|bad}:{summary|translate}"
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code              | 説明                                                           |
| ---------- | ----------------- | -------------------------------------------------------------- |
| `400`      | `INVALID_PAYLOAD` | 必須フィールド欠損・feedHash 不正・action 不正・value 形式不正 |
| `429`      | `COOLDOWN`        | 1 秒クールダウン中                                             |

---

## GET /api/stats

ユーザーの読了統計を取得する。エンゲージメントログ（`fetch_full` / `open_original` アクション）から算出される。

### 成功レスポンス

```json
// 200 OK
{
  "dailyReadCounts": [{ "date": "2024-11-01", "count": 5 }], // 直近 7 日の日別アクション数
  "yearlyHeatmap": [{ "date": "2024-11-01", "count": 5 }], // 過去 365 日のヒートマップ用日別アクション数
  "topFeeds": [{ "feedHash": "...", "score": 42 }], // 最もよく操作したフィード TOP5（ai_feedback を除く全アクション集計）
  "weeklyTotal": 23, // 今週（UTC 月曜〜）の合計アクション数
  "allTimeTotal": 1024, // 全期間の合計アクション数
  "currentStreak": 7 // 連続活動日数（今日または昨日から遡って途切れるまで）
}
```

---

## GET /api/push/config

Push 通知の設定（フィード別無効化・サイレント時間帯・タイムゾーン）を取得する。

### 成功レスポンス

```json
// 200 OK
{
  "disabledFeeds": { "feedHash": true }, // Push 通知を無効にしたフィードの feedHash マップ
  "silentStart": "23:00", // サイレント開始時刻（HH:MM 形式）または null
  "silentEnd": "07:00", // サイレント終了時刻（HH:MM 形式）または null
  "timezone": "Asia/Tokyo" // IANA タイムゾーン文字列または null
}
```

---

## PUT /api/push/config

Push 通知設定を保存する。省略したフィールドはサーバーの既存値をそのまま保持する。

### リクエスト

すべてのフィールドはオプション。

```json
{
  "disabledFeeds": { "feedHash": true }, // フィード別 Push 無効化マップ（全量で上書き）
  "silentStart": "23:00", // サイレント開始時刻（HH:MM 形式、null でクリア）
  "silentEnd": "07:00", // サイレント終了時刻（HH:MM 形式、null でクリア）
  "timezone": "Asia/Tokyo" // IANA タイムゾーン文字列（null でクリア）
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                   | 説明                                      |
| ---------- | ---------------------- | ----------------------------------------- |
| `400`      | `INVALID_SILENT_START` | silentStart が HH:MM 形式でない           |
| `400`      | `INVALID_SILENT_END`   | silentEnd が HH:MM 形式でない             |
| `400`      | `INVALID_TIMEZONE`     | timezone が有効な IANA タイムゾーンでない |

---

## POST /api/recommendations/dismiss

フィード推薦を非表示（dismissed）にする。`dismissedIds` に追加され、次回の推薦一覧から除外される。上限（`MAX_DISMISSED_IDS`）を超えた場合は最古の ID を削除して新しい ID を追加する（FIFO）。

### リクエスト

```json
{
  "id": "string" // 必須: 非表示にする推薦 ID（最大 128 文字）
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code         | 説明                |
| ---------- | ------------ | ------------------- |
| `400`      | `INVALID_ID` | id が空または未指定 |

---

## POST /api/recommendations/refresh

フィード推薦を再生成する。`generatedAt` をクリアして次回 `GET /api/recommendations` 時に再生成をトリガーする。5 分クールダウンあり。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code       | 説明               |
| ---------- | ---------- | ------------------ |
| `429`      | `COOLDOWN` | 5 分クールダウン中 |

---

## PATCH /api/collections/:id

コレクションのプロパティ（名前・並び順・記事追加・記事削除）を部分更新する。

### パスパラメータ

| パラメータ | 型     | 説明                    |
| ---------- | ------ | ----------------------- |
| `id`       | string | コレクション ID（UUID） |

### リクエスト

すべてのフィールドはオプション。指定したフィールドのみ更新される。

```json
{
  "name": "string", // コレクション名（1〜最大文字数、重複不可）
  "order": 0, // 並び順（整数）
  "addArticleIds": ["id1"], // 追加する記事 ID の配列（重複は無視）
  "removeArticleIds": ["id1"] // 削除する記事 ID の配列
}
```

### 成功レスポンス

```json
// 200 OK — 更新後の Collection オブジェクトを返す
{
  "id": "uuid",
  "name": "string",
  "articleIds": ["id1", "id2"],
  "createdAt": "2024-11-01T00:00:00Z",
  "order": 0
}
```

### エラー一覧

| ステータス | code                   | 説明                                                |
| ---------- | ---------------------- | --------------------------------------------------- |
| `400`      | `INVALID_NAME`         | name が空、または最大文字数超え                     |
| `400`      | `INVALID_ORDER`        | order が整数でない                                  |
| `400`      | `INVALID_ARTICLE_IDS`  | addArticleIds / removeArticleIds が文字列配列でない |
| `404`      | `COLLECTION_NOT_FOUND` | 指定した ID のコレクションが存在しない              |
| `409`      | `DUPLICATE_NAME`       | 同名のコレクションが既に存在する                    |
