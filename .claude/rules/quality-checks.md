---
description: コード修正後の品質チェック・テスト手順（バグ修正・ロジック変更後に必ず実行）
paths: "**/*.ts,**/*.tsx"
---

# 修正後の必須テスト手順

**バグ修正・ロジック変更を行った場合は、コミット前に必ず動作を検証すること。**

## ロジック単体テスト（node スクリプト）

サーバー不要で検証できる関数（正規表現・パーサー・ユーティリティ等）は `node -e` でインラインスクリプトを書いて動作確認する。

```bash
# 例: 正規表現の修正前後を比較
node -e "
const html = '<article><p>段落1</p><article>inner</article><p>段落2</p></article>';
const result = html.match(/<article\b[^>]*>([\s\S]*)<\/article>/i);
console.log(result?.[1]);
console.log('段落2が含まれるか:', result?.[1].includes('段落2'));
"
```

### 確認観点

- 修正した条件分岐・正規表現が期待通りに動作するか
- 修正前に再現する入力で、修正後は正しく動作するか（before/after 比較）
- エッジケース（空文字・ネスト・複数要素）で意図しない挙動がないか

## 品質チェックは常に実行

```bash
pnpm run check        # Oxlint + Oxfmt + tsgo（高速）
pnpm run typecheck    # tsc — Next.js plugin 込みの完全な型チェック
```

## E2E テスト

バグ修正・新機能追加後は Playwright E2E テストも実行する。

```bash
pnpm run test:e2e                        # 全テスト実行
npx playwright test e2e/xxx.spec.ts     # 特定ファイルのみ
ppnpm run test:e2e:ui                     # UI モードでデバッグ
```

| ファイル                         | 対象                                       |
| -------------------------------- | ------------------------------------------ |
| `e2e/landing.spec.ts`            | 未ログイン時のランディングページ           |
| `e2e/api-health.spec.ts`         | API エンドポイントの基本動作・認証ガード   |
| `e2e/content-extraction.spec.ts` | 全文取得 `extractMainContent` の回帰テスト |

新しいバグ修正を行った場合は、そのバグを再現するテストケースを `e2e/` に追加してから修正すること。
