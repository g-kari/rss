---
description: テスト (TDD) / 依存管理 (Dependabot / pnpm.overrides) / retrospective Issue 分割パターン
paths: "e2e/**/*.spec.ts,e2e/helpers/**/*.ts"
---

# テストとワークフロー

## テスト (TDD)

- **テスト駆動開発**: 新機能・バグ修正は **Red → Green → Refactor** の順で実装する
  1. テストを書く → `npx playwright test e2e/{name}.spec.ts` で **失敗 (Red)** を確認
  2. 実装する → テストが **通る (Green)** ことを確認
  3. リファクタ → テストが **Green のまま** なことを確認
- テストファイルは `e2e/` に `*.spec.ts` として配置（Playwright テストランナー使用）
- 純粋関数（パーサー・変換・バリデーション）はファイルを直接 import してユニットテスト
- Cloudflare バインディングに依存するコードは E2E テスト（dev サーバー起動が必要）でカバー
- テスト名は日本語可: `test('空のHTMLをMarkdown変換すると空文字を返す', ...)`
- **テスト名・コメントは実装の意図と用語を整合させる**: 例えば `crypto.randomUUID()` で生成される値の検証で「UUID v4」と書くと v4 固有のバリアントビット制約まで含意してしまう。実際の正規表現が UUID 一般形式なら「UUID 形式」と書く。テスト名と実装の用語齟齬は、後続の開発者が仕様を読み誤る原因になる
- 共通ファクトリは `e2e/helpers/` に配置（例: `makeArticle()`, `makeFeed()`）

```typescript
// ユニットテストの例（Cloudflare バインディングなし）
import { test, expect } from "@playwright/test";
import { myPureFunction } from "../src/lib/my-module";

test("正常ケース", () => {
  expect(myPureFunction("input")).toBe("expected");
});
```

## 依存管理 — Dependabot / pnpm.overrides

### Dependabot alerts の確認タイミング

- `gh api repos/.../dependabot/alerts` の結果は **キャッシュ遅延**があるため、push 前のチェックでは新規脆弱性を見逃すことがある
- **master push 後の `git push` レスポンスメッセージ**（"GitHub found N vulnerabilities ..."）も必ず確認する
- 検出された場合は `--severity high` から優先対応

### transitive dependency の強制更新（`pnpm.overrides`）

直接依存していない transitive dep に脆弱性が出た場合、`package.json` の `pnpm.overrides` で強制更新する：

```json
{
  "pnpm": {
    "overrides": {
      "fast-xml-builder": ">=1.1.7"
    }
  }
}
```

`pnpm install` 実行で resolved version が更新される。`pnpm-lock.yaml` の変更を確認後、関連 e2e テストで動作確認してからコミット。

主な使用箇所: `fast-xml-parser` の依存である `fast-xml-builder`（GHSA-2025-attribute-bypass / comment-regex）

### 派生ケース: `pnpm.overrides` 適用時に semver caret range 内の副作用 minor 更新が連鎖する罠

`pnpm install` は overrides 解決時に **lock 全体を refresh** する性質があり、`ws` の override 1 行を追加したつもりでも semver caret range 内の `@playwright/test` / `vite` / `tailwindcss` 等の minor 更新が連鎖して走る。これらの組み合わせで **本来無関係な機能** (modal focus / scroll loadMore / dev-auth-bypass 等) で e2e regression が発生する。

```
パターン: pnpm.overrides 適用時の副作用 minor 更新
  1. package.json の pnpm.overrides に "ws": ">=8.20.1" を追加
  2. pnpm install 実行 → ws override 反映 (audit 0 件) +
     lock 全体 refresh で minor 更新 7 件連鎖
     (fast-xml-parser / @playwright/test / vite / tailwindcss / vite-plus
      / katex / @tailwindcss/postcss)
  3. pre-commit hook の playwright e2e で 21 件 fail
     ↑ 真因は @playwright/test 1.59.1 → 1.60.0 等、ws bump とは無関係の minor 更新
  4. ws の moderate 警告解消の代償として「e2e 21 件 regression」発生
```

**最小 diff を保証する手法 (採用順)**:

1. **着手前に `pnpm outdated` で minor 更新候補を一覧化** — どの transitive が更新されうるか事前確認
2. **`pnpm install` 直後に `git diff --stat pnpm-lock.yaml` で更新規模確認** — 想定外の lock 変更があれば一旦撤回
3. **副作用 minor 更新を bisect して真因 package を特定 → 別 override で pin** — 1-2 サイクル要、scope 拡大
4. **対応見送り (上流 transitive 更新待ち)** — moderate + devDeps only + 本番 bundle 影響ゼロなら緊急性 low、待機が妥当
5. **副作用 minor 更新を全面許容 → e2e regression を個別修正** — scope 拡大、優先順位次第

**緊急度の判定軸**:

| 状況                                                       | 推奨対応                        |
| ---------------------------------------------------------- | ------------------------------- |
| devDeps only + 本番 bundle 影響ゼロ + Dependabot fixed     | 上流 transitive 更新待ち (案 4) |
| production 影響あり + critical CVE                         | bisect 戦略で pin (案 3)        |
| 副作用 e2e regression が limited scope で修正可能 (1-3 件) | 副作用許容で個別修正 (案 5)     |

**How to apply**: CVE 対応 / `pnpm.overrides` 追加するときは (`pnpm install` は対象 override 解決時に lock 全体を refresh する仕様で、semver caret range 内の minor 更新が連鎖して機能 regression を引き起こすリスクが拡散する):

1. **着手前に `pnpm outdated` 実行** で minor 更新候補を一覧化
2. **`pnpm install` 直後に `git diff --stat pnpm-lock.yaml` で更新規模確認** — 想定外なら一旦撤回 (`git checkout package.json pnpm-lock.yaml` + `pnpm install --frozen-lockfile`)
3. **pre-commit hook の e2e fail を観測したら `build-check.md` 規範「機能問題は SKIP 不可」に従い撤回判断**
4. **撤回時は branch 削除 + Issue に副作用調査結果コメント + `needs-user-decision` ラベル付与で判断仰ぐ**
5. **緊急度判定**: devDeps only + 本番影響ゼロなら案 4 (上流待ち) 推奨

主な使用箇所: `#807` ws bump 自走着手で `pnpm install` 副作用に `@playwright/test 1.60.0` / `vite 8.0.13` 等 7 件 minor 更新連鎖 + e2e 21 件 fail → 撤回 + `needs-user-decision` で判断仰ぐ

## 大きい retrospective Issue は「技術スタック別フォローアップ Issue」に分割してクローズする

「複数のバグ修正に後追いテストをまとめて追加する」のような **横断的 retrospective Issue** は、進捗管理としては意義があるが **個別 PR の単位として扱いづらい**。残作業の技術スタックが分かれてくると、

- どのバグはどの infra (e2e / unit / RTL / network mock) で扱うか不明瞭
- PR が膨らむ / レビュー困難
- 部分達成しても Issue がクローズできず、open のまま放置

これを避けるため、**部分達成した時点で残作業を「技術スタック別の小さい Issue」に分割して元 Issue をクローズ** するパターンを採用する。

```
元 Issue (6 件のバグに後追いテスト)
  ├─ 達成 (2/6): 純粋関数化できたバグの再現テスト
  └─ 残 (4/6) → 技術スタック別に分割:
      ├─ フォローアップ A: React Testing Library 導入 + React 動作テスト要のバグ
      └─ フォローアップ B: e2e UI テスト拡張 + network mock 要のバグ
  → 元 Issue はクローズ + フォローアップへのリンクをコメントに残す
```

**How to apply**:

1. 横断的 retrospective Issue で 50% 以上達成したら、残作業を技術スタック別に分類できないか検討
2. 分類できる場合、各分類について **完結する独立 Issue** を新規起票 (タイトルに「テスト infrastructure: ...」等の prefix で由来明示)
3. 各フォローアップには:
   - 元 Issue へのリンク
   - 該当する残作業の個別バグ commit と内容
   - 推奨技術スタック (npm パッケージ / 設定ファイル / 既存 infra)
   - 必要なテストケース (具体的な assert 内容)
   - ブロッカー / 留意点
4. 元 Issue にクローズコメントとして達成済み + フォローアップ Issue リンクを残す
5. 各フォローアップに関連 label (`testing` / `infra` 等) を付ける
