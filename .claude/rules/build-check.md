---
description: rss プロジェクト固有のビルドチェックコマンド (npm run check / typecheck / build) — 27 行で常時ロード
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

## コミット前フロー

```bash
npm run check       # フォーマット・lint チェック
npm run typecheck   # 型チェック
# 必要に応じて npm run test:e2e で関連 spec を実行
git commit
```

pre-commit hook (`oxlint + oxfmt (auto-fix)`, `tsc --noEmit`, `playwright e2e`) が走るため、`check:fix` を手動で走らせる必要はない。pre-commit が auto-fix した内容はコミットに自動的に含まれる。

## pre-commit hook の wrangler 認証問題は `remoteBindings: false` で根本解決する

**真の root cause**: `next.config.ts` の `initOpenNextCloudflareForDev()` の option `remoteBindings` が default `true` で本番 binding へのリモート接続認証 (`wrangler login`) を要求する。これにより pre-commit hook の playwright e2e (内部で `npm run dev` 起動) が wrangler login 切れ環境で fail する。

**正しい解決**: `cloudflare-constraints.md` 「`initOpenNextCloudflareForDev` の `remoteBindings`」セクション参照。`{ remoteBindings: false }` を渡すと wrangler login 不要 + ローカル miniflare のみで動作 + pre-commit e2e が安定。

**それでも `SKIP=<hook-id>` が必要な場面 (例外的)**

`remoteBindings: false` でも build エラー (例: Emscripten chunk の `require("fs")` Turbopack 解決失敗) で e2e が起動できない場合は **暫定で SKIP** + 根本解決 (`next/dynamic({ssr:false})` 隔離等) を別 Issue で扱う。

```bash
# アンチパターン: 認証問題で fail し続けるのに同じ commit を繰り返す → 進捗 0
git commit -m "..."  # → playwright e2e fail (wrangler 認証問題)
git commit -m "..."  # → 同上

# 修正パターン: SKIP=<hook-id> で当該 hook を skip して commit
SKIP=e2e-test git commit -m "..."  # → e2e-test は Skipped、他 hook は実行
```

**SKIP を使う判定条件**:

1. **typecheck / check / test:unit は pass する** (= コード品質は保証されている)
2. **e2e fail の原因が環境問題** (wrangler 認証 / network / 一時的 service 障害)
3. **コミットメッセージで SKIP 理由を明示** (「wrangler 認証エラーで e2e skip、後追い検証」)

**SKIP を使ってはいけないケース**:

- typecheck / check / test:unit が fail している → コード問題、直してから commit
- e2e fail がコード起因 (新規 e2e spec が誤り / 既存 spec を壊した) → 直してから commit
- 同じ SKIP を繰り返すと「e2e カバレッジが落ちる」リスク → 環境復旧後に必ず e2e で再検証

**hook id 一覧** (`.pre-commit-config.yaml` で定義):

| hook id     | 内容                    | SKIP 適用判断                                               |
| ----------- | ----------------------- | ----------------------------------------------------------- |
| `check-fix` | oxlint + oxfmt 自動修正 | **SKIP 不可** (コード品質直接影響)                          |
| `typecheck` | `tsc --noEmit`          | **SKIP 不可** (型エラーは即修正)                            |
| `unit-test` | vitest unit             | **SKIP 不可** (単体テストは速い + 確実に動くべき)           |
| `e2e-test`  | playwright e2e          | **環境問題のみ SKIP 可** (wrangler 認証 / network 一時障害) |

主な使用箇所: `feat/674-piper-phase2b` / `feat/750-booth-fallback-phase1` (wrangler remote dev session 認証 400 で playwright e2e が web server 起動不能 → SKIP=e2e-test で commit、本番デプロイ後の実機検証で別途確認)

## pre-commit hook の auto-fix 経由で commit が落ちるケースを検知 + 回復する

`check-fix` hook (oxlint + oxfmt auto-fix) は **stash → commit → restore** の 3 段フローで動作するが、auto-fix で format 変更が必要な場合、以下の罠が発生する:

1. 開発者が `git add <files> && git commit -m "..."` を実行
2. pre-commit hook が unstaged ファイル含む全 stash → 各 hook 実行
3. auto-fix が staged ファイルを書き換え → typecheck / unit-test / e2e 全 pass
4. 出力に commit hash 風の表示が出るが、**実際には auto-fix で変更されたファイルが re-staged されないと commit object は作成されない**
5. その後 `git checkout master && git merge --no-ff <branch>` で「Everything up-to-date」 + branch 削除 (= **commit 不在のまま branch 消失**)

```bash
# アンチパターン: commit hash 表示で「成功した」と即決
git commit -m "..."
# 出力: "[branch hash] commit message / 2 files changed"
git checkout master && git merge --no-ff <branch>
# → "Already up to date" + branch 削除 → commit 不在発覚

# 修正パターン: commit 後に必ず確認
git commit -m "..."
git log --oneline -1  # ← 期待 commit hash が HEAD か確認
git status            # ← branch 上の HEAD が更新されているか確認
```

**検知 + 回復フロー** (`git status` で staged ファイル + branch 不在を検知):

```bash
# 検知:
git status
# Output:
#   On branch master   ← branch が master に戻っている
#   Changes to be committed:   ← staged ファイルがある
#       new file:   src/lib/<new-file>.ts
git log --oneline -3   # ← 期待 commit hash が無い

# 回復:
git checkout -b <same-branch-name>   # ← 同名で再作成
git add <staged-files>               # ← format 適用済ファイルを再 stage
git commit -m "..."                  # ← 再 commit
git log --oneline -1                 # ← commit hash 確認
git checkout master
git merge --no-ff <branch>
git push origin master
```

**How to apply**: pre-commit hook auto-fix を伴う commit 後に必ず以下を実行 (commit 落ちは `git status` で検知可能、見逃すと branch 削除で実装ロスト):

1. **commit 直後に `git log --oneline -1` で期待 commit hash を確認** — commit message 出力だけ見て成功と判定しない
2. **master merge 前に `git status` で `On branch <feature-branch>` を確認** — master に戻っていれば commit 落ち
3. **`merge --no-ff` で「Everything up-to-date」が出たら即座に検知** — 想定 diff が無い場合は commit 不在
4. **検知したら branch 再作成 + 再 add + 再 commit で復活** (実装ロストなし、stage 領域に残っている)

**反例 (auto-fix なしで commit が正常完了したケース)**:

- format 既に整っており auto-fix の変更がない → 通常 commit が成功
- pre-commit hook の hooks すべて Passed + 「N files changed」が出力された → commit object 作成済

主な使用箇所: `feat/803-phase1-engagement-aggregator` — `engagement-aggregator.spec.ts` を Write した直後 commit で oxfmt が `makeEntry` の引数を multi-line に整形、その変更が re-staged されず commit 落ち発生 → `git status` で検知 → branch 再作成 + 再 commit で復活
