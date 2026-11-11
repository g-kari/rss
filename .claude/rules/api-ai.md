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

| model                                          | 備考                      |
| ---------------------------------------------- | ------------------------- |
| `@cf/qwen/qwen3.8-27b`                         | 高コスト、5 回/分         |
| `@cf/google/gemma-4-26b-a4b-it`                | 既定モデル                |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 多言語・要約、max_tokens  |
| `@cf/zai-org/glm-5.3`                          | 有料アクセス必須、5 回/分 |

2026-11-08 に Cloudflare の [5月の廃止告知](https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/) と [11月の廃止告知](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/) を確認。Llama 3.1 8B/70B、Llama 3.2 3B、Qwen3 30B A3B FP8 は選択肢から除外。旧モデルを明示したリクエストは `400 INVALID_MODEL` と `retryable: false` / `replacementModel` を返し、推論前に拒否する。省略時と保存済みの廃止モデル選択は Gemma 4 を使う。保存値は非破壊の読み替えで、旧キャッシュの生成モデルは書き換えない。Gemma 3 27B / Qwen 2.5 Coder 1.5B も現カタログと active model API 検索に存在せず schema GET が404のため利用不能として除外する（退役日未確認）。これらにも保存設定の読み替えと明示指定時の代替案内を適用する。

Gemma 4、Qwen 3.8、GLM 5.3 は `max_completion_tokens` と `choices[0].message.content` に対応し、内部推論テキストを結果として返さない。Gemma 4 は thinking を無効化する。通常モデルは 20 回/分、高コストは5回/分、課金 API のため KV 障害時は fail-closed。詳細と価格・移行仕様は `docs/summary-precompute.md` を参照。

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
