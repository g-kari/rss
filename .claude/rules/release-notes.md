# リリースノート運用ルール

コードを変更して master にマージしたら、**必ず** リリースノートを更新すること。

## architecture.md の同期必須

新規 API エンドポイント（`app/api/**/route.ts`）・hooks（`src/hooks/*.ts`）・lib（`src/lib/*.ts`）・components（`src/components/**/*.tsx`）を追加した際は、**同じ PR 内で** `.claude/rules/architecture.md` のディレクトリ構造セクションにも 1 行の責務記述を追記すること。
型定義（`src/types.ts`）で R2 に保存されるインターフェース（`ReadState` / `UserSubscription` / `SharedFeedMeta` / `FeedGroup` 等）にプロパティを追加した場合も、`## R2 データ構造` セクションの該当行を更新する。

## 更新対象ファイル（2 ファイル同時更新）

| ファイル                        | 用途                                            |
| ------------------------------- | ----------------------------------------------- |
| `RELEASE_NOTES.md`              | リポジトリ直下のマークダウン（人間向け）        |
| `src/lib/release-notes-data.ts` | Workers バンドル用定数 `RELEASE_NOTES_MARKDOWN` |

> Workers 環境では `fs` が使えないため、両ファイルを常に同期すること。

## フォーマット

```markdown
## YYYY-MM-DD

### 新機能

- **機能名** — 説明

### リファクタリング

- `対象` を〇〇に変更

### バグ修正

- 〇〇の問題を修正

### セキュリティ

- 〇〇脆弱性を修正
```

## カテゴリ判断基準

- `feature/`, `feat/` → **新機能**
- `refactor/` → **リファクタリング**
- `fix/` → **バグ修正**
- `security/` → **セキュリティ**
- `docs/` → **ドキュメント整備**

同一日付に複数マージがある場合は同じ `## YYYY-MM-DD` セクションに追記する。
