---
paths: "app/api/ai/**"
description: AI 機能 (要約・翻訳) の API 仕様 — /api/ai/{summarize,translate} のリクエスト・レスポンス・利用可能モデル・R2 キャッシュキー・エラー一覧
---

# API 仕様: AI 機能 (要約・翻訳)

## POST /api/ai/summarize

記事 URL の本文を取得して AI で要約する。R2 キャッシュあり。

### リクエスト

```json
{
  "url": "string", // 必須: 記事の http(s) URL
  "model": "string" // オプション: 使用モデル (下記参照)
}
```

### 利用可能なモデル

| model                                  | 備考                      |
| -------------------------------------- | ------------------------- |
| `@cf/meta/llama-3.1-8b-instruct`       | 既存デフォルトを維持      |
| `@cf/meta/llama-3.2-3b-instruct`       |                           |
| `@cf/meta/llama-3.1-70b-instruct`      | 高コスト、5 回/分         |
| `@cf/google/gemma-3-27b-it`            |                           |
| `@cf/qwen/qwen2.5-coder-1.5b-instruct` |                           |
| `@cf/qwen/qwen3.8-27b`                 | 高コスト、5 回/分         |
| `@cf/google/gemma-4-26b-a4b-it`        |                           |
| `@cf/zai-org/glm-5.3`                  | 有料アクセス必須、5 回/分 |

2026-09-30 に公式モデルページと Workers 型定義で確認。新しい 3 モデルは `max_completion_tokens` と `choices[0].message.content` に対応し、内部推論テキストを結果として返さない。モデル省略時のみ既定値を使い、明示した未対応モデルは 400 とする。通常モデルは 20 回/分、課金 API のため KV 障害時は fail-closed。

### ブラウザ側の実行先

- 自動（既存ユーザーの既定値）: Chrome 内蔵 AI を優先し、利用不可なら選択した Workers AI モデルを使う
- Chrome 内蔵 AI のみ: 利用不可・失敗時はエラー。クラウドへ自動切替しない
- クラウド: Chrome 内蔵 AI を呼ばず、この API と選択モデルを使う
- 設定はブラウザ内のユーザー別キーに保存。既存のモデル選択は初期値として保持する
- 記事 LRU はユーザー・実行先・モデル・記事 ID・URL ごとに分離。変更時は処理中リクエストを中断し、古い結果を破棄する
- 従来の「自動処理は端末のみ」設定は自動モード時に適用。明示的なクラウド指定を妨げない

### キャッシュ

- R2 キー: `ai-cache/summary/model-url-{SHA-256(JSON.stringify([model, url]))}`
- 常時 cache 有効、`url` と `model` が同一なら user 間で cache 共有。モデル不明の旧 URL-only キャッシュは再利用しない

### 成功レスポンス

```json
// 200 OK
{ "result": "要約テキスト..." }
```

### エラー一覧

| ステータス | code                   | 説明                                         |
| ---------- | ---------------------- | -------------------------------------------- |
| `400`      | `INVALID_MODEL`        | 明示されたモデルが許可リストにない           |
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
  "model": "string" // オプション: 使用モデル (summarize と同じ一覧)
}
```

### キャッシュ

- R2 キー: `ai-cache/translation/model-url-{SHA-256(JSON.stringify([model, url]))}`

### 成功レスポンス

```json
// 200 OK
{ "result": "翻訳テキスト..." }
```

### エラー一覧

`POST /api/ai/summarize` と同じ。
