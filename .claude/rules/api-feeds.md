---
globs: app/api/feeds/**
---

# Feeds API 仕様

フィードの追加・一覧・更新・削除・リフレッシュ・インポート/エクスポート・LLM 再推論・キャッシュパージのエンドポイント仕様。

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

| ステータス | code                   | 説明                                                                         |
| ---------- | ---------------------- | ---------------------------------------------------------------------------- |
| `400`      | `INVALID_TITLE`        | タイトルが空または 200 文字超                                                |
| `400`      | `INVALID_FILTER`       | フィルターの形式不正                                                         |
| `400`      | `INVALID_NSFW`         | nsfw が boolean でない                                                       |
| `400`      | `INVALID_PRIORITY`     | priority が "high" でも null でもない                                        |
| `400`      | `INVALID_CATEGORY`     | category が string でない、または 50 文字超                                  |
| `400`      | `INVALID_GROUP_ID`     | groupId が string でない                                                     |
| `400`      | `INVALID_MUTED_UNTIL`  | mutedUntil が ISO 8601 文字列でない                                          |
| `400`      | `INVALID_VIEW`         | view が許可された値でない                                                    |
| `400`      | `INVALID_DIGEST_LIMIT` | digestLimit が 0〜100 の整数でない                                           |
| `404`      | `FEED_NOT_FOUND`       | 指定した feedHash が購読一覧にない、または共有フィードメタが R2 に存在しない |
| `404`      | `FEED_GROUP_NOT_FOUND` | 指定した groupId が存在しない                                                |

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
