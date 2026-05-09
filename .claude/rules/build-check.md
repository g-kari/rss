---
description: rss プロジェクト固有のビルドチェックコマンド
paths: "backend/repositories/rss/**/*.ts,backend/repositories/rss/**/*.tsx"
---

# rss プロジェクトのビルドチェックコマンド

**重要**: dokodemo-claude ルートの `.claude/rules/build-check.md` には `npm run check-all` / `npm run type-check` / `npm run lint` 等の指示があるが、**rss プロジェクトでは存在しない**。実体は以下:

| 目的                 | 実コマンド          | 内容                      |
| -------------------- | ------------------- | ------------------------- |
| Lint + 整形チェック  | `npm run check`     | `vp check` (oxlint+oxfmt) |
| Lint + 整形 自動修正 | `npm run check:fix` | `vp check --fix`          |
| 型チェック           | `npm run typecheck` | `tsc --noEmit`            |
| E2E テスト           | `npm run test:e2e`  | Playwright                |
| ビルド               | `npm run build`     | `next build`              |

**Why**: dokodemo-claude ルートの build-check.md にある `npm run check-all` は rss プロジェクトに存在しないため、このファイルが TS/TSX 編集時にロードされてルート指示を上書きする。

## コミット前フロー

```bash
npm run check       # フォーマット・lint チェック
npm run typecheck   # 型チェック
# 必要に応じて npm run test:e2e で関連 spec を実行
git commit
```

pre-commit hook (`oxlint + oxfmt (auto-fix)`, `tsc --noEmit`, `playwright e2e`) が走るため、`check:fix` を手動で走らせる必要はない。pre-commit が auto-fix した内容はコミットに自動的に含まれる。
