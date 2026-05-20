---
paths: "app/api/recommendations/**"
description: フィード推薦 API 仕様 — /api/recommendations の GET / dismiss / refresh、Workers AI 生成のキャッシュ 204 / 同期再生成 / 5 分クールダウン
---

# API 仕様: フィード推薦

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

## POST /api/recommendations/dismiss

推薦フィードを非表示にする。非表示リストが上限を超えた場合は古いものから FIFO で削除される。

### リクエスト

```json
{
  "id": "string" // 必須: 推薦 ID
}
```

### 成功レスポンス

```json
// 200 OK
{ "ok": true }
```

### エラー一覧

| ステータス | code              | 説明      |
| ---------- | ----------------- | --------- |
| `400`      | `INVALID_PAYLOAD` | id が欠損 |
| `401`      | —                 | 未認証    |

---

## POST /api/recommendations/refresh

推薦キャッシュをクリアして **同期再生成して結果を返す**。5 分クールダウンあり。クライアントの再 GET を省略できる。

### 成功レスポンス

```json
// 200 OK — 生成後のキャッシュ (GET /api/recommendations と同形式)
{
  "recommendations": [{ "id": "...", "url": "...", "title": "...", "description": "..." }],
  "generatedAt": "2024-11-01T00:00:00Z",
  "topics": ["技術", "AI"]
}

// 200 OK — キャッシュが空のとき (生成は成功したが結果が空)
{ "ok": true }
```

### エラー一覧

| ステータス | code       | 説明                           |
| ---------- | ---------- | ------------------------------ |
| `401`      | —          | 未認証                         |
| `429`      | `COOLDOWN` | 5 分クールダウン中             |
| `500`      | —          | `generateRecommendations` 失敗 |
