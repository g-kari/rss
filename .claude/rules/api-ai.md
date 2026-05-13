---
globs: "app/api/ai/**"
---

# API 仕様: AI 機能 (要約・翻訳)

## POST /api/ai/summarize

記事 URL の本文を取得して AI で要約する。R2 キャッシュあり。

### リクエスト

```json
{
  "url": "string", // 必須: 記事の http(s) URL
  "articleId": "string", // オプション: R2 キャッシュキー
  "model": "string" // オプション: 使用モデル (下記参照)
}
```

### 利用可能なモデル

| model                | 備考       |
| -------------------- | ---------- |
| `llama-3.1-8b`       | デフォルト |
| `llama-3.2-3b`       |            |
| `llama-3.1-70b`      |            |
| `gemma-3-27b`        |            |
| `qwen2.5-coder-1.5b` |            |

### キャッシュ

- R2 キー: `ai-cache/summary/{articleId}`
- `articleId` が省略された場合はキャッシュなし

### 成功レスポンス

```json
// 200 OK
{ "result": "要約テキスト..." }
```

### エラー一覧

| ステータス | code                   | 説明                                         |
| ---------- | ---------------------- | -------------------------------------------- |
| `400`      | `INVALID_URL`          | URL が空または http(s) 以外                  |
| `401`      | `UNAUTHORIZED`         | 未認証 (Workers AI 認証エラー含む)           |
| `429`      | `RATE_LIMITED`         | レートリミット超過 (KV 障害時は fail-closed) |
| `502`      | `CONTENT_FETCH_FAILED` | 外部コンテンツ取得失敗                       |
| `502`      | `AI_ERROR`             | Workers AI 処理エラー (汎用)                 |
| `503`      | `SERVICE_UNAVAILABLE`  | Workers AI 一時障害                          |

---

## POST /api/ai/translate

記事 URL の本文を取得して AI で翻訳する。仕様は `/api/ai/summarize` と同じ。

### リクエスト

```json
{
  "url": "string", // 必須: 記事の http(s) URL
  "articleId": "string", // オプション: R2 キャッシュキー
  "model": "string" // オプション: 使用モデル (summarize と同じ一覧)
}
```

### キャッシュ

- R2 キー: `ai-cache/translation/{articleId}`

### 成功レスポンス

```json
// 200 OK
{ "result": "翻訳テキスト..." }
```

### エラー一覧

`POST /api/ai/summarize` と同じ。
