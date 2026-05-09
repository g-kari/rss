# API エンドポイント仕様

優先度「高」のエンドポイントを中心に、リクエスト/レスポンス/エラーコードを記載する。
認証が必要な全エンドポイントは Cookie (`access_token` または `session_id`) が必須。

## 共通エラー形式

```json
{ "error": "エラーメッセージ", "code": "ERROR_CODE" }
```

未認証の場合は `401` を返す（`withSession` / `withJsonBody` が自動処理）。

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

| パラメータ | 型     | 説明                                                                       |
| ---------- | ------ | -------------------------------------------------------------------------- |
| `feed`     | string | 特定フィードの feedHash（省略時は購読中全フィード）                        |
| `since`    | number | この日時以降の記事を返す（ミリ秒 Unix タイムスタンプ、ページネーション用） |
| `page`     | number | ページ番号（1〜MAX_PAGES=5、デフォルト 1。`feed` 指定時のみ有効）          |

### エラー一覧

| ステータス | code           | 説明                                |
| ---------- | -------------- | ----------------------------------- |
| `400`      | `INVALID_FEED` | `feed` が feedHash 形式でない       |
| `400`      | `INVALID_PAGE` | `page` が 1〜MAX_PAGES の整数でない |

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

| ステータス | code                   | 説明                                                                                          |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `400`      | `INVALID_OPML`         | OPML 形式が不正                                                                               |
| `415`      | `INVALID_CONTENT_TYPE` | Content-Type が text/xml・application/xml・text/plain・application/x-www-form-urlencoded 以外 |
| `422`      | `FEED_LIMIT_REACHED`   | フィード上限に達している                                                                      |
| `429`      | `COOLDOWN`             | インポートクールダウン中                                                                      |

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

## POST /api/feeds/refresh

購読中の全フィードを手動で一括リフレッシュする。2 分クールダウンあり。

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code       | 説明               |
| ---------- | ---------- | ------------------ |
| `401`      | —          | 未認証             |
| `429`      | `COOLDOWN` | 2 分クールダウン中 |

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

## POST /api/feeds/:id/purge-content-cache

フィード（feedHash）に紐づく全記事の Cloudflare Cache (content + clip) を削除する。CLI 経由で `curl -X POST` から呼ぶ想定。

**認証必須 + 購読チェック必須** (#691): リクエストユーザーが対象 feedHash を購読していない場合は 404 を返す。共有 cache の意図的無効化 (cache busting DoS) を防ぐための security-critical な挙動。

### パスパラメータ

| パラメータ | 型     | 説明                             |
| ---------- | ------ | -------------------------------- |
| `id`       | string | feedHash（16 文字の hex 文字列） |

### 成功レスポンス

```json
// 200 OK
{
  "ok": true,
  "feedHash": "abc123...",
  "total": 500, // R2 から読み出した記事総数
  "purged": 498, // Cache 削除に成功した記事数
  "failed": 2 // 削除に失敗した記事数 (例: 既に存在しない)
}
```

### エラー一覧

| ステータス | code             | 説明                                                           |
| ---------- | ---------------- | -------------------------------------------------------------- |
| `400`      | `INVALID_FEED`   | feedHash の形式が不正                                          |
| `404`      | `FEED_NOT_FOUND` | リクエストユーザーが購読していない feedHash、または記事が 0 件 |
| `401`      | —                | 未認証                                                         |

### 関連

- `DELETE /api/content?url=...` (clip cache のみ自分で削除可能)
- `.claude/rules/caching.md` (Cloudflare Cache API の使い方)

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

---

## GET /api/push/vapid-key

Web Push サブスクリプション開始時に必要な VAPID 公開鍵を返す。

### 成功レスポンス

```json
// 200 OK
{ "publicKey": "BNcC..." } // URL-safe base64 エンコードされた VAPID 公開鍵
```

### エラー一覧

| ステータス | code                  | 説明                              |
| ---------- | --------------------- | --------------------------------- |
| `401`      | —                     | 未認証                            |
| `503`      | `PUSH_NOT_CONFIGURED` | VAPID_PUBLIC_KEY 環境変数が未設定 |

---

## GET /api/push/status

現在のユーザーの Push サブスクリプション登録数を返す。

### 成功レスポンス

```json
// 200 OK
{ "subscriptionCount": 2 } // 登録済みサブスクリプション数
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/push/subscribe

Push サブスクリプションを登録する。同一 endpoint が既に登録済みの場合は上書きする。5 秒クールダウンあり。上限は 1 ユーザーあたり 20 件。

### リクエスト

```json
{
  "endpoint": "https://fcm.googleapis.com/...", // 必須: HTTPS URL（SSRF 対策済み）
  "expirationTime": null, // オプション: 有効期限（ミリ秒タイムスタンプ または null）
  "keys": {
    "p256dh": "BCxyz...", // 必須: 非圧縮 P-256 公開鍵（65 bytes、base64url）
    "auth": "AbCd..." // 必須: 認証シークレット（16 bytes、base64url）
  }
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                     | 説明                                                |
| ---------- | ------------------------ | --------------------------------------------------- |
| `400`      | `INVALID_SUBSCRIPTION`   | endpoint / p256dh / auth のいずれかが欠損           |
| `400`      | `INVALID_ENDPOINT`       | endpoint が HTTPS URL でない、またはプライベート IP |
| `400`      | `INVALID_P256DH`         | p256dh が base64url 形式でない、またはサイズ不正    |
| `400`      | `INVALID_AUTH_KEY`       | auth が base64url 形式でない、またはサイズ不正      |
| `401`      | —                        | 未認証                                              |
| `429`      | `TOO_MANY_SUBSCRIPTIONS` | サブスクリプション上限（20 件）に達している         |
| `429`      | `COOLDOWN`               | 5 秒クールダウン中                                  |

---

## POST /api/push/unsubscribe

Push サブスクリプションを解除する。5 秒クールダウンあり。

### リクエスト

```json
{
  "endpoint": "https://fcm.googleapis.com/..." // 必須: 解除する HTTPS URL
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code               | 説明                                   |
| ---------- | ------------------ | -------------------------------------- |
| `400`      | `INVALID_ENDPOINT` | endpoint が空、または HTTPS URL でない |
| `401`      | —                  | 未認証                                 |
| `429`      | `COOLDOWN`         | 5 秒クールダウン中                     |

---

## POST /api/push/test

テスト用 Push 通知を全登録済みサブスクリプションに送信する。期限切れサブスクリプションは送信後に自動削除される。

### 成功レスポンス

```json
// 200 OK
{
  "sent": 3, // 送信試行したサブスクリプション数
  "expired": 1, // 送信後に期限切れと判定されて削除した数
  "remaining": 2 // 有効なサブスクリプション残数
}
```

### エラー一覧

| ステータス | code                   | 説明                                   |
| ---------- | ---------------------- | -------------------------------------- |
| `401`      | —                      | 未認証                                 |
| `404`      | `NO_SUBSCRIPTIONS`     | 登録済みサブスクリプションが存在しない |
| `503`      | `VAPID_NOT_CONFIGURED` | VAPID キーが環境変数に未設定           |

---

## GET /api/collections

ユーザーのコレクション一覧を `order` 昇順で返す。

### 成功レスポンス

```json
// 200 OK
[
  {
    "id": "uuid",
    "name": "お気に入り",
    "articleIds": ["articleId1", "articleId2"],
    "createdAt": "2024-11-01T00:00:00Z",
    "order": 0
  }
]
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/collections

コレクションを新規作成する。上限は 1 ユーザーあたり 50 件、名前は最大 50 文字。

### リクエスト

```json
{
  "name": "string" // 必須: コレクション名（1〜50 文字、重複不可）
}
```

### 成功レスポンス

```json
// 201 Created
{
  "id": "uuid",
  "name": "お気に入り",
  "articleIds": [],
  "createdAt": "2024-11-01T00:00:00Z",
  "order": 0
}
```

### エラー一覧

| ステータス | code                        | 説明                              |
| ---------- | --------------------------- | --------------------------------- |
| `400`      | `INVALID_NAME`              | name が空または 50 文字超         |
| `401`      | —                           | 未認証                            |
| `409`      | `DUPLICATE_NAME`            | 同名のコレクションが既に存在する  |
| `409`      | `COLLECTION_LIMIT_EXCEEDED` | コレクション上限（50 件）に達した |

---

## DELETE /api/collections/:id

コレクションを削除する。

### パスパラメータ

| パラメータ | 型     | 説明                    |
| ---------- | ------ | ----------------------- |
| `id`       | string | コレクション ID（UUID） |

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                   | 説明                                   |
| ---------- | ---------------------- | -------------------------------------- |
| `400`      | `INVALID_ID`           | id が UUID 形式でない                  |
| `401`      | —                      | 未認証                                 |
| `404`      | `COLLECTION_NOT_FOUND` | 指定した ID のコレクションが存在しない |

---

## GET /api/feed-groups

ユーザーのフィードグループ一覧を `order` 昇順で返す。

### 成功レスポンス

```json
// 200 OK
[
  {
    "id": "uuid",
    "name": "技術系",
    "order": 0,
    "createdAt": "2024-11-01T00:00:00Z",
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

フィードグループを新規作成する。上限は 1 ユーザーあたり 100 件、名前は最大 50 文字。

### リクエスト

```json
{
  "name": "string" // 必須: グループ名（1〜50 文字、重複不可）
}
```

### 成功レスポンス

```json
// 201 Created
{
  "id": "uuid",
  "name": "技術系",
  "order": 0,
  "createdAt": "2024-11-01T00:00:00Z"
}
```

### エラー一覧

| ステータス | code                        | 説明                           |
| ---------- | --------------------------- | ------------------------------ |
| `400`      | `INVALID_NAME`              | name が空または 50 文字超      |
| `401`      | —                           | 未認証                         |
| `409`      | `DUPLICATE_NAME`            | 同名のグループが既に存在する   |
| `409`      | `FEED_GROUP_LIMIT_EXCEEDED` | グループ上限（100 件）に達した |

---

## PATCH /api/feed-groups/:id

フィードグループのプロパティ（名前・並び順・折りたたみ・ミュート）を部分更新する。

### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| `id`       | string | フィードグループ ID（UUID） |

### リクエスト

すべてのフィールドはオプション。指定したフィールドのみ更新される。

```json
{
  "name": "string", // グループ名（1〜50 文字、重複不可）
  "order": 0, // 並び順（整数）
  "collapsed": false, // 折りたたみ状態（boolean）
  "muted": false // ミュート状態（boolean）
}
```

### 成功レスポンス

```json
// 200 OK — 更新後の FeedGroup オブジェクトを返す
{
  "id": "uuid",
  "name": "技術系",
  "order": 0,
  "createdAt": "2024-11-01T00:00:00Z",
  "collapsed": false,
  "muted": false
}
```

### エラー一覧

| ステータス | code                   | 説明                               |
| ---------- | ---------------------- | ---------------------------------- |
| `400`      | `INVALID_NAME`         | name が空または 50 文字超          |
| `400`      | `INVALID_ORDER`        | order が整数でない                 |
| `400`      | `INVALID_COLLAPSED`    | collapsed が boolean でない        |
| `400`      | `INVALID_MUTED`        | muted が boolean でない            |
| `401`      | —                      | 未認証                             |
| `404`      | `FEED_GROUP_NOT_FOUND` | 指定した ID のグループが存在しない |
| `409`      | `DUPLICATE_NAME`       | 同名のグループが既に存在する       |

---

## DELETE /api/feed-groups/:id

フィードグループを削除する。削除後、所属していたフィードの `groupId` は自動的にクリアされる。

### パスパラメータ

| パラメータ | 型     | 説明                        |
| ---------- | ------ | --------------------------- |
| `id`       | string | フィードグループ ID（UUID） |

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code                   | 説明                               |
| ---------- | ---------------------- | ---------------------------------- |
| `401`      | —                      | 未認証                             |
| `404`      | `FEED_GROUP_NOT_FOUND` | 指定した ID のグループが存在しない |

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

---

## GET /api/feeds/export

購読フィード一覧を OPML 形式でエクスポートする。フィードグループ情報も含まれる。

### 成功レスポンス

```
// 200 OK
Content-Type: text/xml; charset=utf-8
Content-Disposition: attachment; filename="feeds.opml"

<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>RSS Reader Feeds</title></head>
  <body>
    <outline text="グループ名" ...>
      <outline type="rss" text="フィードタイトル" xmlUrl="https://..." htmlUrl="https://..." />
    </outline>
  </body>
</opml>
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/feeds/:id/reinfer

LLM による CSS セレクタを再推論する。LLM スクレイピングフィード（`cssSelectors` を持つフィード）のみ対象。既存セレクタを失敗履歴に積み上げ、新しいセレクタで記事を再取得する。60 秒クールダウンあり。

### パスパラメータ

| パラメータ | 型     | 説明                             |
| ---------- | ------ | -------------------------------- |
| `id`       | string | feedHash（16 文字の hex 文字列） |

### 成功レスポンス

```json
// 200 OK — 更新後の Feed オブジェクトを返す
{ "feedHash": "...", "url": "...", "title": "...", ... }
```

### エラー一覧

| ステータス | code             | 説明                                             |
| ---------- | ---------------- | ------------------------------------------------ |
| `400`      | `INVALID_FEED`   | feedHash の形式が不正                            |
| `400`      | `NOT_LLM_FEED`   | LLM スクレイピングフィードではない               |
| `401`      | —                | 未認証                                           |
| `404`      | `FEED_NOT_FOUND` | 指定したフィードが購読一覧または R2 に存在しない |
| `422`      | `REINFER_FAILED` | LLM によるセレクタ再推論に失敗                   |
| `429`      | `COOLDOWN`       | 60 秒クールダウン中                              |

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

---

## GET /api/feeds

認証済みユーザーの購読フィード一覧を返す。30 秒 Cloudflare Cache API キャッシュあり（`X-Cache: HIT/MISS` ヘッダーで識別可能）。

### 成功レスポンス

```json
// 200 OK
[
  {
    "feedHash": "abc123...",
    "url": "https://...",
    "title": "フィードタイトル",
    "siteUrl": "https://...",
    "subscribedAt": "2024-11-01T00:00:00Z",
    "lastFetchedAt": "2024-11-01T00:00:00Z",
    "articleCount": 42,
    "nsfw": false,
    "priority": null,
    "category": null,
    "groupId": null
  }
]
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## DELETE /api/feeds/:id

購読フィードを削除する。共有フィードデータは残り、購読一覧からのみ除去する。

### パスパラメータ

| パラメータ | 型     | 説明                             |
| ---------- | ------ | -------------------------------- |
| `id`       | string | feedHash（16 文字の hex 文字列） |

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code             | 説明                  |
| ---------- | ---------------- | --------------------- |
| `400`      | `INVALID_FEED`   | feedHash の形式が不正 |
| `401`      | —                | 未認証                |
| `404`      | `FEED_NOT_FOUND` | 購読一覧に存在しない  |

---

## GET /api/health

サービスのヘルスチェック。認証不要。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "timestamp": "2024-11-01T00:00:00.000Z" }
```

---

## DELETE /api/content

自分の clip cache を削除する。`POST /api/clip` で SingleFile 拡張から保存した HTML を消したい場合に使う。共有 cache (Cloudflare Cache API の content cache、ユーザー横断) は削除しない (#691 で撤廃済み — フィード全体を一括クリアしたい場合は `POST /api/feeds/:id/purge-content-cache` を使うこと)。

### クエリパラメータ

| パラメータ | 型     | 説明                     |
| ---------- | ------ | ------------------------ |
| `url`      | string | 必須: 記事の http(s) URL |

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "deleted": { "clip": true } }
```

`deleted.clip` は cache に該当 entry が存在して削除に成功したかを示す boolean。entry がそもそも無かった場合も `false` で返り 200 を返す (冪等)。

### エラー一覧

| ステータス | code          | 説明                        |
| ---------- | ------------- | --------------------------- |
| `400`      | `INVALID_URL` | URL が空または http(s) 以外 |
| `401`      | —             | 未認証                      |

---

## POST /api/test/seed

e2e テスト専用の R2 シード API。**dev / e2e 環境のみ動作**: `process.env.NODE_ENV !== "production"` かつ `DEV_AUTH_BYPASS_USER_ID` がセット済みのときのみ実 endpoint として機能する。**本番では 404** を返す (Next.js の NODE_ENV inline で dead code 化)。

### リクエスト

```json
{
  "subscriptions": [{ "feedHash": "string", "url": "string", ... }],
  "articles": { "feedHashA": [Article, ...], "feedHashB": [...] },
  "readState": { "readIds": ["..."], "bookmarkIds": ["..."], ... },
  "feedGroups": [...],
  "collections": [...]
}
```

すべてのフィールドはオプション。指定したフィールドのみ書き込まれる。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "userId": "e2e-test-user", "wrote": { "subscriptions": 5, "articles": 12, ... } }
```

### エラー一覧

| ステータス | code              | 説明                                                                           |
| ---------- | ----------------- | ------------------------------------------------------------------------------ |
| `400`      | `INVALID_PAYLOAD` | リクエストボディが期待する型と異なる                                           |
| `404`      | —                 | 本番環境 (`NODE_ENV === "production"` または `DEV_AUTH_BYPASS_USER_ID` 未設定) |

---

## DELETE /api/test/seed

e2e テスト専用の R2 全削除 API。`POST /api/test/seed` と同じ環境ガード (`NODE_ENV !== "production"` + `DEV_AUTH_BYPASS_USER_ID`) で動作。test 用ユーザー (`DEV_AUTH_BYPASS_USER_ID`) の `users/{userId}/*` 配下を全削除する。**本番では 404** を返す。

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "userId": "e2e-test-user", "deleted": 12 }
```

### エラー一覧

| ステータス | code | 説明                                                                           |
| ---------- | ---- | ------------------------------------------------------------------------------ |
| `404`      | —    | 本番環境 (`NODE_ENV === "production"` または `DEV_AUTH_BYPASS_USER_ID` 未設定) |

---

## GET /api/recommendations

フィード推薦一覧を返す。有効なキャッシュが存在しない場合は 204 を返す（クライアントは `POST /api/recommendations/refresh` を呼んで再生成をトリガーすること）。

### 成功レスポンス

```json
// 200 OK — キャッシュあり
{
  "recommendations": [{ "id": "...", "url": "...", "title": "...", "description": "..." }],
  "generatedAt": "2024-11-01T00:00:00Z",
  "topics": ["技術", "AI"]
}

// 204 No Content — キャッシュなし / 期限切れ
```

### エラー一覧

| ステータス | code | 説明   |
| ---------- | ---- | ------ |
| `401`      | —    | 未認証 |

---

## POST /api/articles/save

URL から記事メタデータ（OGP タイトル・画像）を取得して保存する。同一 URL は決定論的 ID を持ち、既存レコードがある場合はそのまま返す。5 秒クールダウンあり。上限は `MAX_SAVED_ARTICLES` 件。

### リクエスト

```json
{
  "url": "string" // 必須: http(s) URL
}
```

### 成功レスポンス

```json
// 201 Created（新規保存）または 200 OK（既存）
{
  "id": "abc123...",
  "feedHash": "__saved__",
  "guid": "https://...",
  "title": "記事タイトル",
  "link": "https://...",
  "summary": "",
  "ogImage": "https://...",
  "publishedAt": null,
  "createdAt": "2024-11-01T00:00:00Z"
}
```

### エラー一覧

| ステータス | code                  | 説明                        |
| ---------- | --------------------- | --------------------------- |
| `400`      | `INVALID_URL`         | URL が空または http(s) 以外 |
| `401`      | —                     | 未認証                      |
| `422`      | `SAVED_LIMIT_REACHED` | 保存記事の上限に達している  |
| `429`      | `COOLDOWN`            | 5 秒クールダウン中          |

---

## GET /api/content

記事の全文コンテンツを取得するプロキシ。Cloudflare Cache API（7日）でキャッシュされる。ユーザーがクリップした HTML がある場合はキャッシュより優先して返す。1 分間スライディングウィンドウのレートリミットあり（キャッシュミス時のみ適用）。

### クエリパラメータ

| パラメータ | 型     | 説明                     |
| ---------- | ------ | ------------------------ |
| `url`      | string | 必須: 記事の http(s) URL |

### 成功レスポンス

```json
// 200 OK
{ "content": "<article>...</article>" }
```

`X-Cache: HIT/MISS` ヘッダーで取得元を識別できる。`X-Cache-Source: clip` の場合はユーザーのクリップから返却。

### エラー一覧

| ステータス | code           | 説明                        |
| ---------- | -------------- | --------------------------- |
| `400`      | `INVALID_URL`  | URL が空または http(s) 以外 |
| `401`      | —              | 未認証                      |
| `429`      | `RATE_LIMITED` | レートリミット超過          |
| `502`      | `FETCH_FAILED` | 外部コンテンツ取得失敗      |

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

## POST /api/clip

SingleFile ブラウザ拡張から送信されたページ全体の HTML を受け取り、本文を抽出して Cloudflare Cache API に保存する。保存されたコンテンツは `GET /api/content?url=` で優先的に返却される。1 分クールダウンあり。

### リクエスト

```json
{
  "html": "string", // 必須: ページ全体の HTML（SingleFile 形式）
  "url": "string" // 必須: 元の記事 URL
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true, "url": "https://..." }
```

### エラー一覧

| ステータス | code                   | 説明                         |
| ---------- | ---------------------- | ---------------------------- |
| `400`      | `INVALID_CLIP_PAYLOAD` | html または url が欠損・不正 |
| `401`      | —                      | 未認証                       |
| `429`      | `COOLDOWN`             | 1 分クールダウン中           |
